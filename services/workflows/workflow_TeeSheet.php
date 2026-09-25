<?php
declare(strict_types=1);
// /public_html/services/workflows/workflow_TeeSheet.php
//
// Tee sheet workflows. The file is named for the SUBJECT; each action is
// one function inside it:
//   - exportGameTeeSheet()   Excel export of one game's tee sheet (today)
//   - exportEventTeeSheet()  consolidated tee sheet across an event's rounds (future)
//   - other future actions (email attachment, HTML view, PDF) go here too,
//     each built on ServiceGameRosterViews::buildGameTeeSheetView().
//
// Template: templates/excel/MatchAid_GameTeeSheet_Template.xlsx (its
// "Template Config" sheet explains the layout; removed from the download).
//
// Template contract (fixed capacity): every band/row up to capacity is
// pre-built and pre-styled in the workbook. This code only writes values
// into named cells, hides unused bands/rows and unneeded columns, and sets
// the print area. It never inserts or copies rows. Headings (rows 1-4) are
// frozen panes + print titles in the template, so every app repeats them.
//
// No HTTP concerns here — see api/shared/sharedapi_exportGameTeeSheet.php.

require_once MA_SVC_DB . '/service_dbGames.php';
require_once MA_SVC_DB . '/service_dbEvents.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_SERVICES . '/roster/service_GameRosterViews.php';
require_once MA_API_LIB . '/ExcelTemplate.php';
require_once MA_API_LIB . '/Logger.php';

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

const MA_GAME_TEE_SHEET_TEMPLATE = 'MatchAid_GameTeeSheet_Template.xlsx';
const MA_GAME_TEE_SHEET_TAB_GROUP = 'By Playing Group';
const MA_GAME_TEE_SHEET_TAB_INDIVIDUAL = 'By Individual';
const MA_GAME_TEE_SHEET_TAB_CONFIG = 'Template Config';

/**
 * exportGameTeeSheet(ggid)
 *
 * Builds the Game Tee Sheet workbook (tabs "By Playing Group" and
 * "By Individual") for one game. Available at every stage of game setup;
 * an incomplete game carries the "*Partial Tee Sheet" label in its heading.
 *
 * @throws RuntimeException with a user-facing message when the game has no
 *         players, exceeds the template's capacity, or the template is
 *         missing/invalid.
 */
function exportGameTeeSheet(string $ggid): Spreadsheet
{
  $ggidInt = (int)$ggid;
  $gameRow = $ggidInt > 0 ? ServiceDbGames::getGameByGGID($ggidInt) : null;
  if (!$gameRow) {
    throw new RuntimeException('Game not found.');
  }
  $game = ServiceContextGame::hydrateForUi($gameRow);

  $players = ServiceDbPlayers::getGamePlayers((string)$ggidInt);
  if (!$players) {
    throw new RuntimeException('No players are enrolled in this game.');
  }

  // isDimensionActive()'s 3rd param must be the db_Events row (or null),
  // not the game row — same as initPlayerNotifications.php.
  $eid           = (int)($gameRow['dbGames_EID'] ?? 0);
  $eventRow      = $eid > 0 ? ServiceDbEvents::getEventByEID($eid) : null;
  $teamsActive   = ServiceDbEvents::isDimensionActive('team',   $gameRow, $eventRow);
  $flightsActive = ServiceDbEvents::isDimensionActive('flight', $gameRow, $eventRow);

  $view = ServiceGameRosterViews::buildGameTeeSheetView($players, $game, $teamsActive, $flightsActive);

  $templatePath = MA_EXCEL_TEMPLATES . '/' . MA_GAME_TEE_SHEET_TEMPLATE;
  if (!is_file($templatePath)) {
    throw new RuntimeException('Tee sheet template was not found: ' . MA_GAME_TEE_SHEET_TEMPLATE);
  }

  $spreadsheet = IOFactory::load($templatePath);
  $groupSheet  = gameTeeSheetRequireTab($spreadsheet, MA_GAME_TEE_SHEET_TAB_GROUP);
  $indSheet    = gameTeeSheetRequireTab($spreadsheet, MA_GAME_TEE_SHEET_TAB_INDIVIDUAL);
  $cfgSheet    = gameTeeSheetRequireTab($spreadsheet, MA_GAME_TEE_SHEET_TAB_CONFIG);

  $emptyValue = trim((string)ExcelTemplate::getNamedValue($spreadsheet, $cfgSheet, 'Cfg_EmptyValue'));
  if ($emptyValue === '') $emptyValue = '—';

  $subLine = composeGameTeeSheetSubLine($view);

  fillGameTeeSheetGroupTab($spreadsheet, $groupSheet, $view, $subLine, $ggid);
  fillGameTeeSheetIndividualTab($spreadsheet, $indSheet, $view, $subLine, $emptyValue);

  $spreadsheet->removeSheetByIndex($spreadsheet->getIndex($cfgSheet));
  $spreadsheet->setActiveSheetIndex($spreadsheet->getIndex($groupSheet));

  return $spreadsheet;
}

/** "[*Partial Tee Sheet • ]{course} • {date} • {start info}" — empty parts are skipped. */
function composeGameTeeSheetSubLine(array $view): string
{
  $parts = array_values(array_filter([
    $view['course'] ?? '',
    $view['playDateDisplay'] ?? '',
    $view['startInfo'] ?? '',
  ], fn($s) => trim((string)$s) !== ''));

  $line = implode(' • ', $parts);
  if (!empty($view['isPartial'])) {
    $line = $line !== '' ? '*Partial Tee Sheet • ' . $line : '*Partial Tee Sheet';
  }
  return $line;
}

function gameTeeSheetRequireTab(Spreadsheet $spreadsheet, string $title): Worksheet
{
  $sheet = $spreadsheet->getSheetByName($title);
  if (!$sheet) {
    throw new RuntimeException("Tee sheet template is missing the \"{$title}\" worksheet.");
  }
  return $sheet;
}

/**
 * By Playing Group: two groups per band, 4 player lines per group.
 * Band k occupies GroupBand's rows + (bandHeight × k). Cell positions come
 * from the Band_* names on band 1.
 */
function fillGameTeeSheetGroupTab(Spreadsheet $spreadsheet, Worksheet $sheet, array $view, string $subLine, string $ggid): void
{
  ExcelTemplate::setNamedValue($spreadsheet, $sheet, 'Hdr_Title', $view['title'] ?? '');
  ExcelTemplate::setNamedValue($spreadsheet, $sheet, 'Hdr_SubLine', $subLine);

  $band       = ExcelTemplate::bounds($spreadsheet, $sheet, 'GroupBand');
  $all        = ExcelTemplate::bounds($spreadsheet, $sheet, 'GroupBands');
  $bandTop    = $band['rowFrom'];
  $bandHeight = $band['rowTo'] - $band['rowFrom'] + 1;
  $capacity   = intdiv($all['rowTo'] - $all['rowFrom'] + 1, $bandHeight);

  $groups      = $view['groups'] ?? [];
  $bandsNeeded = (int)ceil(count($groups) / 2);
  if ($bandsNeeded > $capacity) {
    throw new RuntimeException(sprintf(
      'This game has %d playing groups; the tee sheet template holds %d.',
      count($groups), $capacity * 2
    ));
  }

  // Cell map per side: field => [col, row offset within the band]
  $fields = ['Time', 'Hole'];
  for ($i = 1; $i <= 4; $i++) { $fields[] = "Player{$i}"; $fields[] = "Cart{$i}"; }

  $cells = [];
  $halfSpan = [];   // side => [firstCol, lastCol] of that half, for blanking an unused right half
  foreach (['L', 'R'] as $side) {
    foreach ($fields as $field) {
      $b = ExcelTemplate::bounds($spreadsheet, $sheet, "Band_{$side}_{$field}");
      $cells[$side][$field] = [$b['colFrom'], $b['rowFrom'] - $bandTop];
    }
    $cols = array_map(fn($c) => $c[0], $cells[$side]);
    $halfSpan[$side] = [min($cols), max($cols)];

    // Write-in columns (e.g. Bag #) carry no data but belong to the half.
    if (ExcelTemplate::hasName($spreadsheet, $sheet, "Col_{$side}_Bag")) {
      $bag = ExcelTemplate::bounds($spreadsheet, $sheet, "Col_{$side}_Bag");
      $halfSpan[$side] = [min($halfSpan[$side][0], $bag['colFrom']), max($halfSpan[$side][1], $bag['colTo'])];
    }
  }

  for ($k = 0; $k < $bandsNeeded; $k++) {
    $rowBase = $bandTop + $k * $bandHeight;

    foreach (['L' => 0, 'R' => 1] as $side => $offset) {
      $group = $groups[2 * $k + $offset] ?? null;

      if ($group === null) {
        // Odd group count: blank right half with no borders, so it reads as empty space.
        foreach ($cells[$side] as [$col, $rowOff]) {
          ExcelTemplate::setValueAt($sheet, $col, $rowBase + $rowOff, null);
        }
        ExcelTemplate::clearBorders($sheet, $halfSpan[$side][0], $rowBase, $halfSpan[$side][1], $rowBase + $bandHeight - 1);
        continue;
      }

      $members = $group['players'] ?? [];
      if (count($members) > 4) {
        // Slotting enforces a max of 4 — defensive only.
        Logger::warn('GAME_TEE_SHEET_GROUP_OVER_4', [
          'ggid'      => $ggid,
          'playerKey' => $group['playerKey'] ?? '',
          'count'     => count($members),
        ]);
      }

      [$col, $rowOff] = $cells[$side]['Time'];
      ExcelTemplate::setValueAt($sheet, $col, $rowBase + $rowOff, $group['teeTime'] ?? '');
      [$col, $rowOff] = $cells[$side]['Hole'];
      ExcelTemplate::setValueAt($sheet, $col, $rowBase + $rowOff, $group['hole'] ?? '');

      for ($i = 1; $i <= 4; $i++) {
        $member = $members[$i - 1] ?? null;
        [$col, $rowOff] = $cells[$side]["Player{$i}"];
        ExcelTemplate::setValueAt($sheet, $col, $rowBase + $rowOff, $member['display'] ?? null);
        [$col, $rowOff] = $cells[$side]["Cart{$i}"];
        ExcelTemplate::setValueAt($sheet, $col, $rowBase + $rowOff, $member['cart'] ?? null);
      }
    }
  }

  // Hide the unused pre-built bands.
  if ($bandsNeeded < $capacity) {
    ExcelTemplate::hideRows($sheet, $bandTop + $bandsNeeded * $bandHeight, $all['rowTo']);
  }

  if (!empty($view['isShotgun'])) {
    ExcelTemplate::hideNamedColumns($spreadsheet, $sheet, 'Col_L_Time');
    ExcelTemplate::hideNamedColumns($spreadsheet, $sheet, 'Col_R_Time');
  }
  // Cart # and Bag # are write-in columns on this tab: never hidden. Cart #
  // is filled when cart data exists (showCart); otherwise left blank to type in.

  // Print area ends at the last used band (heading only when there are no
  // groups). The template's page breaks stay; any past the print area have
  // no effect.
  $lastRow = $bandsNeeded > 0 ? $bandTop + $bandsNeeded * $bandHeight - 1 : $bandTop - 1;
  ExcelTemplate::setPrintArea($sheet, $all['colTo'], $lastRow);
}

/**
 * By Individual: one row per player (everyone, including unslotted),
 * written at DetailRow + i. Column positions come from the Det_* names.
 */
function fillGameTeeSheetIndividualTab(Spreadsheet $spreadsheet, Worksheet $sheet, array $view, string $subLine, string $emptyValue): void
{
  ExcelTemplate::setNamedValue($spreadsheet, $sheet, 'Hdr_Title', $view['title'] ?? '');
  ExcelTemplate::setNamedValue($spreadsheet, $sheet, 'Hdr_SubLine', $subLine);

  $first    = ExcelTemplate::bounds($spreadsheet, $sheet, 'DetailRow');
  $all      = ExcelTemplate::bounds($spreadsheet, $sheet, 'DetailRows');
  $topRow   = $first['rowFrom'];
  $capacity = $all['rowTo'] - $all['rowFrom'] + 1;

  $rows = $view['individuals'] ?? [];
  if (count($rows) > $capacity) {
    throw new RuntimeException(sprintf(
      'This game has %d players; the tee sheet template holds %d.',
      count($rows), $capacity
    ));
  }

  // view field => template name
  $columns = [
    'display'      => 'Det_Player',
    'teeTime'      => 'Det_TeeTime',
    'hole'         => 'Det_Hole',
    'tee'          => 'Det_Tee',
    'cart'         => 'Det_Cart',
    'flight'       => 'Det_Flight',
    'otherPlayers' => 'Det_OtherPlayers',
  ];
  $colOf = [];
  foreach ($columns as $field => $name) {
    $colOf[$field] = ExcelTemplate::bounds($spreadsheet, $sheet, $name)['colFrom'];
  }

  foreach (array_values($rows) as $i => $r) {
    $row = $topRow + $i;
    foreach ($colOf as $field => $col) {
      $value = (string)($r[$field] ?? '');
      if (($field === 'teeTime' || $field === 'hole') && $value === '') {
        $value = $emptyValue;   // unslotted
      }
      ExcelTemplate::setValueAt($sheet, $col, $row, $value);
    }
  }

  if (count($rows) < $capacity) {
    ExcelTemplate::hideRows($sheet, $topRow + count($rows), $all['rowTo']);
  }

  if (empty($view['showCart'])) {
    ExcelTemplate::hideNamedColumns($spreadsheet, $sheet, 'Col_Cart');
  }
  if (empty($view['showFlight'])) {
    ExcelTemplate::hideNamedColumns($spreadsheet, $sheet, 'Col_Flight');
  }

  ExcelTemplate::setPrintArea($sheet, $all['colTo'], $topRow + max(count($rows), 1) - 1);
}
