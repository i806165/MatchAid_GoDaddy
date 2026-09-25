<?php
// /public_html/api/shared/sharedapi_exportGameTeeSheet.php
declare(strict_types=1);
//
// Game Tee Sheet export — streams MatchAid_TeeSheet_{GGID}.xlsx for the
// session game. Called by assets/modules/module_exportGameTeeSheet.js
// (MA.exportGameTeeSheet()).
//
// api/shared/ holds APIs behind modules called from multiple pages; files
// here use the sharedapi_ prefix. This file is a thin HTTP wrapper — all
// logic lives in services/workflows/workflow_TeeSheet.php.
//
// Not gated on game completeness: an incomplete game still exports, with
// "*Partial Tee Sheet" in its heading. Available to any signed-in user.
//
// Response: the .xlsx as an attachment, or JSON { ok:false, message } with
// status 500 — same pattern as api/game_scorecard/exportPointScorecards.php.

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_SERVICES . '/workflows/workflow_TeeSheet.php';

use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

try {
    ma_api_require_auth();

    $ggid = ServiceContextGame::getStoredGGID();
    if (!$ggid) {
        throw new RuntimeException('No game selected.');
    }

    $spreadsheet = exportGameTeeSheet((string)$ggid);

    $safeGgid = preg_replace('/[^0-9A-Za-z_-]/', '', (string)$ggid) ?: 'game';
    $filename = "MatchAid_TeeSheet_{$safeGgid}.xlsx";

    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');

    $writer = new Xlsx($spreadsheet);
    $writer->save('php://output');
    exit;

} catch (Throwable $e) {
    Logger::error('GAME_TEE_SHEET_EXPORT_FAIL', [
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
