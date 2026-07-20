<?php
// /public_html/api/game_scorecard/exportPointScorecards.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_API . '/game_scorecard/initScoreCard.php';

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\DefinedName;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

// ==========================================================================
// Game / Hole Mode Helpers
//
// NOTE: ServiceScoreCard::holesForGame() (and every other dbGames_Holes read
// in service_ScoreCard.php) only special-cases "F9" and "B9" and falls back
// to 18 holes for anything else, including its own documented default of
// "All 18" (a space, not a hyphen). We deliberately mirror that lenient
// convention here rather than throwing on an exact-match allowlist, so a
// normal 18-hole game can never break this export because of a string that
// doesn't match a hyphenated "All-18" literal.
// ==========================================================================

function maResolveHoleMode(array $game): string
{
    $mode = trim((string)($game['dbGames_Holes'] ?? ''));
    if ($mode === 'F9') {
        return 'F9';
    }
    if ($mode === 'B9') {
        return 'B9';
    }
    return 'ALL18';
}

function maResolveHoleCount(array $game): int
{
    return maResolveHoleMode($game) === 'ALL18' ? 18 : 9;
}

// ==========================================================================
// Player Display Helpers
// ==========================================================================

function maBuildPlayerDisplayName(array $player): string
{
    $name = trim((string)($player['dbPlayers_Name'] ?? ''));
    $ph = trim((string)($player['dbPlayers_PH'] ?? ''));

    if ($name === '') {
        return '';
    }
    if ($ph === '') {
        return $name;
    }

    return $name . ' (' . $ph . ')';
}

function maCalculateQuota(array $game, array $player): float|int
{
    $phRaw = trim((string)($player['dbPlayers_PH'] ?? ''));

    if ($phRaw === '' || !is_numeric($phRaw)) {
        throw new RuntimeException(
            'Missing or invalid Playing Handicap for ' .
            (string)($player['dbPlayers_Name'] ?? 'player') .
            '.'
        );
    }

    $quota = (maResolveHoleCount($game) * 2) - (float)$phRaw;

    return floor($quota) == $quota ? (int)$quota : $quota;
}

// ==========================================================================
// Sheet Title Helper
// ==========================================================================

function maSafeSheetTitle(string $title, array &$usedTitles): string
{
    $title = preg_replace('/[\\\\\/\?\*\[\]:]/', '-', trim($title));
    $title = ($title === null || $title === '') ? 'Group' : $title;
    $title = mb_substr($title, 0, 31);

    $base = $title;
    $suffix = 2;

    while (isset($usedTitles[$title])) {
        $tail = '-' . $suffix++;
        $title = mb_substr($base, 0, 31 - mb_strlen($tail)) . $tail;
    }

    $usedTitles[$title] = true;

    return $title;
}

// ==========================================================================
// Worksheet-Scoped Named Range Helpers
//
// Defined names in PhpSpreadsheet live on the Spreadsheet, not the
// Worksheet, and Worksheet::__clone() (verified against PhpSpreadsheet
// 5.9.0 source) does not touch them at all. So every worksheet-scoped name
// on "Group Template" has to be recreated by hand for each cloned group
// sheet before that sheet can be populated.
// ==========================================================================

function maCloneLocalNames(Spreadsheet $spreadsheet, Worksheet $templateSheet, Worksheet $clonedSheet): void
{
    // Snapshot first: addDefinedName() below mutates the same array we'd be
    // iterating, so we collect the template's names before adding any clones.
    $toClone = [];
    foreach ($spreadsheet->getDefinedNames() as $definedName) {
        if ($definedName->getScope() === $templateSheet) {
            $toClone[] = $definedName;
        }
    }

    foreach ($toClone as $definedName) {
        $range = maNormalizeRangeAddress($definedName->getValue(), $templateSheet);

        $spreadsheet->addDefinedName(
            DefinedName::createInstance(
                $definedName->getName(),
                $clonedSheet,
                $range,
                true
            )
        );
    }
}

function maFindLocalName(Spreadsheet $spreadsheet, Worksheet $sheet, string $name): DefinedName
{
    foreach ($spreadsheet->getDefinedNames() as $candidate) {
        if ($candidate->getName() === $name && $candidate->getScope() === $sheet) {
            return $candidate;
        }
    }

    throw new RuntimeException(
        "Missing named range {$name} on " . $sheet->getTitle()
    );
}

function maNormalizeRangeAddress(string $range, Worksheet $sheet): string
{
    $range = preg_replace(
        "/^'?" . preg_quote($sheet->getTitle(), '/') . "'?!/",
        '',
        $range
    );

    return str_replace('$', '', (string)$range);
}

function maSetLocalNamedValue(Spreadsheet $spreadsheet, Worksheet $sheet, string $name, mixed $value): void
{
    $definedName = maFindLocalName($spreadsheet, $sheet, $name);
    $range = maNormalizeRangeAddress($definedName->getValue(), $sheet);
    $sheet->getCell($range)->setValue($value);
}

/**
 * Blanks every cell in a local named range and hides the rows it occupies,
 * without deleting rows (deleting would shift/break named-range addresses,
 * borders, merges, row heights, and print settings elsewhere on the sheet).
 */
function maClearAndHideLocalRange(Spreadsheet $spreadsheet, Worksheet $sheet, string $name): void
{
    $definedName = maFindLocalName($spreadsheet, $sheet, $name);
    $address = maNormalizeRangeAddress($definedName->getValue(), $sheet);

    foreach (Coordinate::extractAllCellReferencesInRange($address) as $cellRef) {
        $sheet->getCell($cellRef)->setValue(null);
    }

    [$start, $end] = Coordinate::rangeBoundaries($address);
    for ($row = $start[1]; $row <= $end[1]; $row++) {
        $sheet->getRowDimension($row)->setVisible(false);
    }
}

// ==========================================================================
// Player Slot Population
// ==========================================================================

function maClearPlayerSlot(Spreadsheet $spreadsheet, Worksheet $sheet, string $tablePrefix, int $slot): void
{
    foreach (['PairingPos', 'DisplayName', 'Quota'] as $suffix) {
        maSetLocalNamedValue($spreadsheet, $sheet, "{$tablePrefix}_Player{$slot}_{$suffix}", null);
    }
}

/**
 * @param array<int, array<string, mixed>> $sourcePlayers Players in existing
 *        scorecard order. Each entry is the same normalized player object
 *        ServiceScoreCard::buildPlayersArray() returns for the HTML
 *        scorecard: raw dbPlayers_* fields are preserved on it via
 *        array_merge($player, [...]), so no separate "source record" lookup
 *        is needed.
 */
function maPopulateTablePlayers(
    Spreadsheet $spreadsheet,
    Worksheet $sheet,
    string $tablePrefix,
    array $sourcePlayers,
    array $game
): void {
    for ($slot = 1; $slot <= 4; $slot++) {
        $player = $sourcePlayers[$slot - 1] ?? null;

        if (!is_array($player)) {
            maClearPlayerSlot($spreadsheet, $sheet, $tablePrefix, $slot);
            continue;
        }

        maSetLocalNamedValue(
            $spreadsheet,
            $sheet,
            "{$tablePrefix}_Player{$slot}_PairingPos",
            $player['dbPlayers_PairingPos'] ?? null
        );

        maSetLocalNamedValue(
            $spreadsheet,
            $sheet,
            "{$tablePrefix}_Player{$slot}_DisplayName",
            maBuildPlayerDisplayName($player)
        );

        maSetLocalNamedValue(
            $spreadsheet,
            $sheet,
            "{$tablePrefix}_Player{$slot}_Quota",
            maCalculateQuota($game, $player)
        );
    }
}

function maPopulateHoleHeadings(Spreadsheet $spreadsheet, Worksheet $sheet, string $tablePrefix, int $startHole, int $holeCount = 9): void
{
    for ($i = 0; $i < $holeCount; $i++) {
        $col = str_pad((string)($i + 1), 2, '0', STR_PAD_LEFT);
        maSetLocalNamedValue($spreadsheet, $sheet, "{$tablePrefix}_Hole{$col}", $startHole + $i);
    }
}

// ==========================================================================
// Tee Set Name Population — Player1-4 tee set names shown once in the
// summary/legend block at the bottom of the sheet. Table1 holds the
// group's 4 players once; Table2/Table3 (3x6) or Table2 (2x9) are just the
// same players' later hole segments, so tee set (unlike per-segment score)
// only needs to be sourced from Table1 and written once per group sheet.
// ==========================================================================

function maPopulateTeeSetNames(Spreadsheet $spreadsheet, Worksheet $sheet, array $sourcePlayers): void
{
    for ($slot = 1; $slot <= 4; $slot++) {
        $player = $sourcePlayers[$slot - 1] ?? null;

        maSetLocalNamedValue(
            $spreadsheet,
            $sheet,
            "Table1_Player{$slot}_TeeSetName",
            is_array($player) ? trim((string)($player['dbPlayers_TeeSetName'] ?? '')) : null
        );
    }
}

// ==========================================================================
// Group Sheet Population — 2x9 layout (holes 1-9 / 10-18, or a single
// 9-hole table for F9/B9 games)
// ==========================================================================

function maPopulateGroupSheet2x9(Spreadsheet $spreadsheet, Worksheet $sheet, array $game, array $group): void
{
    // Existing scorecard order is preserved as-is; do not resort here.
    $groupPlayers = $group['players'] ?? [];
    $sourcePlayers = array_values(array_filter(
        is_array($groupPlayers) ? $groupPlayers : [],
        'is_array'
    ));

    $firstPlayer = $sourcePlayers[0] ?? [];
    maSetLocalNamedValue(
        $spreadsheet,
        $sheet,
        'Group_PlayerKey',
        $firstPlayer['dbPlayers_PlayerKey'] ?? ''
    );
    maSetLocalNamedValue(
        $spreadsheet,
        $sheet,
        'Group_TeeTime',
        (string)($group['teeTime'] ?? '')
    );

    $holeMode = maResolveHoleMode($game);

    maPopulateHoleHeadings($spreadsheet, $sheet, 'Table1', $holeMode === 'B9' ? 10 : 1, 9);
    maPopulateTablePlayers($spreadsheet, $sheet, 'Table1', $sourcePlayers, $game);

    if ($holeMode === 'ALL18') {
        maPopulateHoleHeadings($spreadsheet, $sheet, 'Table2', 10, 9);
        maPopulateTablePlayers($spreadsheet, $sheet, 'Table2', $sourcePlayers, $game);
    } else {
        // F9 / B9: Table 2's range covers its own hole-heading row too
        // (A13:Q22), so clearing it wipes the headings and the player rows
        // in a single pass.
        maClearAndHideLocalRange($spreadsheet, $sheet, 'Table2');
    }

    maPopulateTeeSetNames($spreadsheet, $sheet, $sourcePlayers);
}

// ==========================================================================
// Group Sheet Population — 3x6 layout (holes 1-6 / 7-12 / 13-18)
//
// Only valid for full 18-hole games. The caller (main endpoint flow below)
// is responsible for falling back to the 2x9 layout for F9/B9 games before
// this function is ever invoked — it assumes an 18-hole game unconditionally
// and always populates all three tables.
// ==========================================================================

function maPopulateGroupSheet3x6(Spreadsheet $spreadsheet, Worksheet $sheet, array $game, array $group): void
{
    $groupPlayers = $group['players'] ?? [];
    $sourcePlayers = array_values(array_filter(
        is_array($groupPlayers) ? $groupPlayers : [],
        'is_array'
    ));

    $firstPlayer = $sourcePlayers[0] ?? [];
    maSetLocalNamedValue(
        $spreadsheet,
        $sheet,
        'Group_PlayerKey',
        $firstPlayer['dbPlayers_PlayerKey'] ?? ''
    );
    maSetLocalNamedValue(
        $spreadsheet,
        $sheet,
        'Group_TeeTime',
        (string)($group['teeTime'] ?? '')
    );

    $segments = ['Table1' => 1, 'Table2' => 7, 'Table3' => 13];

    foreach ($segments as $tablePrefix => $startHole) {
        maPopulateHoleHeadings($spreadsheet, $sheet, $tablePrefix, $startHole, 6);
        maPopulateTablePlayers($spreadsheet, $sheet, $tablePrefix, $sourcePlayers, $game);
    }

    maPopulateTeeSetNames($spreadsheet, $sheet, $sourcePlayers);
}

// ==========================================================================
// Endpoint
// ==========================================================================

try {
    $ctx = ma_api_require_auth();

    $ggid = ServiceContextGame::getStoredGGID();
    if (!$ggid) {
        throw new RuntimeException('No game selected.');
    }

    $init = initBlankScoreCard((string)$ggid, $ctx);
    if (empty($init['ok'])) {
        throw new RuntimeException(
            (string)($init['error'] ?? 'Scorecard initialization failed.')
        );
    }

    $game = $init['game'] ?? [];
    $groups = $init['scorecards']['rows'] ?? [];

    if (!$groups) {
        throw new RuntimeException('No scorecard groups are available for this game.');
    }

    // --------------------------------------------------------------------
    // Layout selection. The person chooses 2x9 or 3x6 from the Actions
    // menu; 3x6 only makes sense for a full 18-hole game (three 6-hole
    // segments = 18 holes), so an F9/B9 game silently falls back to 2x9.
    // The frontend is told about the fallback via a response header so it
    // can surface a status message rather than the download just quietly
    // not being what the person asked for.
    // --------------------------------------------------------------------
    $requestedLayout = strtolower(trim((string)($_GET['layout'] ?? '2x9')));
    if (!in_array($requestedLayout, ['2x9', '3x6'], true)) {
        throw new RuntimeException("Unsupported point scorecard layout: {$requestedLayout}");
    }

    $layout = $requestedLayout;
    $layoutSwitchedFrom3x6 = false;

    if ($layout === '3x6' && maResolveHoleMode($game) !== 'ALL18') {
        $layout = '2x9';
        $layoutSwitchedFrom3x6 = true;
    }

    $templateFile = $layout === '3x6'
        ? 'MatchAid_PointScoring_3x6_Template.xlsx'
        : 'MatchAid_PointScoring_2x9_Template.xlsx';

    $templatePath = MA_EXCEL_TEMPLATES . '/' . $templateFile;
    if (!is_file($templatePath)) {
        throw new RuntimeException("Point scorecard template was not found: {$templateFile}");
    }

    if (!class_exists(IOFactory::class)) {
        throw new RuntimeException('PhpSpreadsheet is not installed.');
    }

    $spreadsheet = IOFactory::load($templatePath);
    $templateSheet = $spreadsheet->getSheetByName('Group Template');
    if (!$templateSheet) {
        throw new RuntimeException('Group Template worksheet was not found.');
    }

    $usedTitles = [];

    foreach ($groups as $index => $group) {
        $groupSheet = clone $templateSheet;
        $groupSheet->setTitle(maSafeSheetTitle('Group ' . ($index + 1), $usedTitles));

        // Must be attached before we can address it as a defined-name scope.
        $spreadsheet->addSheet($groupSheet);

        maCloneLocalNames($spreadsheet, $templateSheet, $groupSheet);

        if ($layout === '3x6') {
            maPopulateGroupSheet3x6($spreadsheet, $groupSheet, $game, is_array($group) ? $group : []);
        } else {
            maPopulateGroupSheet2x9($spreadsheet, $groupSheet, $game, is_array($group) ? $group : []);
        }
    }

    $spreadsheet->removeSheetByIndex($spreadsheet->getIndex($templateSheet));
    $spreadsheet->setActiveSheetIndex(0);

    $safeGgid = preg_replace('/[^0-9A-Za-z_-]/', '', (string)$ggid) ?: 'game';
    $filename = "MatchAid_PointScorecards_{$safeGgid}_{$layout}.xlsx";

    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('X-MA-Point-Scorecard-Layout: ' . $layout);
    header('X-MA-Point-Scorecard-Layout-Switched: ' . ($layoutSwitchedFrom3x6 ? '1' : '0'));

    $writer = new Xlsx($spreadsheet);
    $writer->save('php://output');
    exit;

} catch (Throwable $e) {
    Logger::error('POINT_SCORECARD_EXPORT_FAIL', [
        'err'   => $e->getMessage(),
        'trace' => $e->getTraceAsString(),
        'ghin'  => $_SESSION['SessionGHINLogonID'] ?? '',
        'ggid'  => $_SESSION['SessionStoredGGID'] ?? '',
        'uri'   => $_SERVER['REQUEST_URI'] ?? '',
    ]);

    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }

    echo json_encode([
        'ok'      => false,
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_SLASHES);

    exit;
}
