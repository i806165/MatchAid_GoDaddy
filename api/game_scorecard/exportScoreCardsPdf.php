<?php
// /public_html/api/game_scorecard/exportScoreCardsPdf.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once __DIR__ . '/../../vendor/autoload.php'; // composer: tecnickcom/tcpdf
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_API . '/game_scorecard/initScoreCard.php';

// ==========================================================================
// WHY THIS EXISTS
//
// The on-screen scorecard (game_scorecards.js) renders HTML/CSS and relies
// on window.print() + browser print-dialog settings for page size/orientation.
// That's unreliable across browsers/OSes. Rather than translating that HTML
// through an HTML->PDF converter (still CSS-dependent), this endpoint draws
// the scorecard directly with TCPDF -- same philosophy as
// exportPointScorecards.php using PhpSpreadsheet: explicit layout in code,
// nothing left to a rendering engine's CSS interpretation.
//
// Screen rendering in game_scorecards.js is NOT touched by this file.
// ==========================================================================

// ==========================================================================
// Layout constants (Letter, landscape, points)
// ==========================================================================
const PDF_PAGE_W   = 792.0;  // 11in
const PDF_PAGE_H   = 612.0;  // 8.5in
const PDF_MARGIN   = 24.0;
const PDF_LABEL_W  = 130.0;  // "HOLE" / player-name column width
const PDF_META_W   = 30.0;   // Out / In / Tot column width

// ==========================================================================
// Request handling
// ==========================================================================
header('Content-Type: application/json; charset=utf-8'); // overwritten on success

try {
    $ggid   = (string)($_GET['ggid'] ?? ($_SESSION['SessionStoredGGID'] ?? ''));
    $layout = (string)($_GET['layout'] ?? '2up'); // '1up' | '2up'
    $layout = in_array($layout, ['1up', '2up'], true) ? $layout : '2up';

    // Reuse the exact same data path the screen already trusts -- do NOT
    // accept posted/client HTML. This keeps the PDF endpoint pulling from
    // the same authoritative payload as initScoreCard.php's JSON response,
    // and avoids any question of trusting client-supplied markup.
    $init = initBlankScoreCard($ggid, []);
    if (empty($init['ok'])) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => $init['error'] ?? 'init_failed']);
        exit;
    }

    $game       = $init['game'];
    $scorecards = $init['scorecards'] ?? [];
    $rows       = is_array($scorecards['rows'] ?? null) ? $scorecards['rows'] : [];

    if (!$rows) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'no_scorecard_rows']);
        exit;
    }

    $pdf = maBuildScoreCardsPdf($game, $rows, $layout);

    $ggidLabel = (string)($game['dbGames_GGID'] ?? $game['dbGames_GGIDnum'] ?? 'game');
    $filename  = "MatchAid_ScoreCards_{$ggidLabel}_{$layout}.pdf";

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('X-MA-ScoreCard-Layout: ' . $layout);
    echo $pdf->Output($filename, 'S');

} catch (Throwable $e) {
    Logger::error('SCORECARD_PDF_EXPORT_FAIL', [
        'err'   => $e->getMessage(),
        'trace' => $e->getTraceAsString(),
    ]);
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'server_error']);
}

// ==========================================================================
// PDF builder
// ==========================================================================
function maBuildScoreCardsPdf(array $game, array $rows, string $layout): TCPDF {
    $pdf = new TCPDF('L', 'pt', [PDF_PAGE_W, PDF_PAGE_H], true, 'UTF-8', false);
    $pdf->SetCreator('MatchAid');
    $pdf->SetAuthor('MatchAid');
    $pdf->setPrintHeader(false);
    $pdf->setPrintFooter(false);
    $pdf->SetMargins(PDF_MARGIN, PDF_MARGIN, PDF_MARGIN);
    $pdf->SetAutoPageBreak(false);
    $pdf->setCellPaddings(2, 2, 2, 2);

    $groupsPerPage = ($layout === '1up') ? 1 : 2;
    $usableH       = PDF_PAGE_H - (2 * PDF_MARGIN);
    $groupH        = $usableH / $groupsPerPage;

    foreach (array_chunk($rows, $groupsPerPage) as $chunk) {
        $pdf->AddPage();
        foreach ($chunk as $i => $group) {
            $yTop = PDF_MARGIN + ($i * $groupH);
            maDrawScoreCardGroup($pdf, $game, $group, $yTop, $groupH);
            if ($groupsPerPage === 2 && $i === 0) {
                // divider between top/bottom groups
                $pdf->SetLineStyle(['width' => 0.75, 'color' => [180, 180, 180]]);
                $pdf->Line(PDF_MARGIN, $yTop + $groupH - 4, PDF_PAGE_W - PDF_MARGIN, $yTop + $groupH - 4);
            }
        }
    }

    return $pdf;
}

/**
 * Draws one group (one scorecard) inside the vertical band [$yTop, $yTop+$maxH].
 * Mirrors the section structure of renderGroup()/renderTable()/renderFooter()
 * in game_scorecards.js, translated into direct TCPDF drawing calls.
 */
function maDrawScoreCardGroup(TCPDF $pdf, array $game, array $group, float $yTop, float $maxH): void {
    $gh = $group['gameHeader'] ?? [];
    $x  = PDF_MARGIN;
    $w  = PDF_PAGE_W - (2 * PDF_MARGIN);
    $y  = $yTop;

    // ---- Header block ----------------------------------------------------
    $pdf->SetXY($x, $y);
    $pdf->SetFont('helvetica', 'B', 13);
    $pdf->Cell($w * 0.7, 16, (string)($gh['gameTitle'] ?? 'Game'), 0, 0, 'L');

    $scoreCardId = trim((string)($gh['playerKey'] ?? ''));
    $pdf->SetFont('helvetica', '', 9);
    $pdf->Cell($w * 0.3, 16, $scoreCardId ? "ScoreCard-ID: {$scoreCardId}" : '', 0, 1, 'R');

    $subLine = maBuildSubLine($game, $gh, $group);
    $pdf->SetX($x);
    $pdf->SetFont('helvetica', '', 9);
    $pdf->Cell($w, 12, $subLine, 0, 1, 'L');

    $y = $pdf->GetY() + 4;

    // ---- Table --------------------------------------------------------
    $courseRows = is_array($group['courseInfo'] ?? null) ? $group['courseInfo'] : [];
    $players    = is_array($group['players'] ?? null) ? $group['players'] : [];
    $isMatchPlay = strtolower((string)($group['competition'] ?? '')) === 'pairpair';

    $holeColW = ($w - PDF_LABEL_W - (2 * PDF_META_W)) / 18;

    $pdf->SetXY($x, $y);
    $pdf->SetFont('helvetica', 'B', 8);
    $pdf->SetFillColor(235, 235, 235);

    // header row: HOLE | 1..9 | Out | 10..18 | In | Tot
    $pdf->Cell(PDF_LABEL_W, 14, 'HOLE', 1, 0, 'C', true);
    for ($h = 1; $h <= 9; $h++) $pdf->Cell($holeColW, 14, (string)$h, 1, 0, 'C', true);
    $pdf->Cell(PDF_META_W, 14, 'Out', 1, 0, 'C', true);
    for ($h = 10; $h <= 18; $h++) $pdf->Cell($holeColW, 14, (string)$h, 1, 0, 'C', true);
    $pdf->Cell(PDF_META_W, 14, 'In', 1, 0, 'C', true);
    $pdf->Cell(PDF_META_W, 14, 'Tot', 1, 1, 'C', true);

    // course info rows (Par, HCP, Yardage, ...)
    $pdf->SetFont('helvetica', '', 8);
    foreach ($courseRows as $r) {
        $pdf->SetX($x);
        $label = (string)($r['label'] ?? '');
        $pdf->Cell(PDF_LABEL_W, 12, $label, 1, 0, 'L');
        for ($h = 1; $h <= 9; $h++) $pdf->Cell($holeColW, 12, (string)($r['h' . $h] ?? ''), 1, 0, 'C');
        $pdf->Cell(PDF_META_W, 12, (string)($r['9a'] ?? ''), 1, 0, 'C');
        for ($h = 10; $h <= 18; $h++) $pdf->Cell($holeColW, 12, (string)($r['h' . $h] ?? ''), 1, 0, 'C');
        $pdf->Cell(PDF_META_W, 12, (string)($r['9b'] ?? ''), 1, 0, 'C');
        $pdf->Cell(PDF_META_W, 12, (string)($r['9c'] ?? ''), 1, 1, 'C');
    }

    // player rows (blank score boxes with small stroke-mark numerals)
    $rowH = 20;
    $slots = $isMatchPlay
        ? [$players[0] ?? null, $players[1] ?? null, null, $players[2] ?? null, $players[3] ?? null, null]
        : array_pad(array_slice($players, 0, 4), 6, null);

    foreach ($slots as $p) {
        $rowY = $pdf->GetY();
        $pdf->SetX($x);
        $name = $p ? (string)($p['playerName'] ?? '') : '';
        $hc   = $p && is_numeric($p['playerHC'] ?? null) ? " ({$p['playerHC']})" : '';
        $pdf->Cell(PDF_LABEL_W, $rowH, $name . $hc, 1, 0, 'L');

        $cx = $pdf->GetX();
        for ($h = 1; $h <= 9; $h++) {
            $pdf->Cell($holeColW, $rowH, '', 1, 0, 'C');
            if ($p) maDrawStrokeMark($pdf, $cx, $rowY, $holeColW, $p['strokes']['h' . $h] ?? null);
            $cx += $holeColW;
        }
        $pdf->Cell(PDF_META_W, $rowH, '', 1, 0, 'C');
        $cx = $pdf->GetX();
        for ($h = 10; $h <= 18; $h++) {
            $pdf->Cell($holeColW, $rowH, '', 1, 0, 'C');
            if ($p) maDrawStrokeMark($pdf, $cx, $rowY, $holeColW, $p['strokes']['h' . $h] ?? null);
            $cx += $holeColW;
        }
        $pdf->Cell(PDF_META_W, $rowH, '', 1, 0, 'C');
        $pdf->Cell(PDF_META_W, $rowH, '', 1, 1, 'C');
    }

    // ---- Footer (SCORER / ATTEST lines) -----------------------------------
    $footerY = $pdf->GetY() + 6;
    if ($footerY < $yTop + $maxH - 14) {
        $pdf->SetFont('helvetica', '', 7);
        $pdf->SetXY($x, $footerY);
        $pdf->Cell($w * 0.4, 10, '_____________________  SCORER', 0, 0, 'L');
        $pdf->Cell($w * 0.4, 10, '_____________________  ATTEST', 0, 0, 'L');
        $ggidLabel = $gh['GGID'] ?? '';
        $pdf->Cell($w * 0.2, 10, $ggidLabel ? "Game {$ggidLabel}" : '', 0, 1, 'R');
    }
}

/** Small superscript-style numeral in the top-right corner of a score cell. */
function maDrawStrokeMark(TCPDF $pdf, float $cellX, float $cellY, float $cellW, $n): void {
    $num = is_numeric($n) ? (float)$n : 0.0;
    if ($num === 0.0) return;
    $text = ($num < 0 ? '-' : '') . abs((int)$num);
    $pdf->SetFont('helvetica', '', 6);
    $pdf->SetXY($cellX + $cellW - 10, $cellY + 1);
    $pdf->Cell(9, 8, $text, 0, 0, 'R');
}

/** Mirrors the subLine construction in renderGroup() (course • date • tee time • start hole). */
function maBuildSubLine(array $game, array $gh, array $group): string {
    $parts = [];
    if (!empty($gh['courseName'])) $parts[] = (string)$gh['courseName'];
    if (!empty($gh['playDate']))   $parts[] = maFormatPdfDate((string)$gh['playDate']);
    if (!empty($group['teeTime'])) $parts[] = (string)$group['teeTime'];
    if (!empty($group['startHole'])) {
        $suffix = (string)($group['startHoleSuffix'] ?? '');
        $parts[] = "Start: Hole {$group['startHole']}{$suffix}";
    }
    return implode('  •  ', $parts);
}

function maFormatPdfDate(string $s): string {
    $d = DateTime::createFromFormat('Y-m-d', $s) ?: (new DateTime($s));
    return $d ? $d->format('D m/d/y') : $s;
}
