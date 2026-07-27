<?php
declare(strict_types=1);
// /public_html/api/score_home/saveDeclaredCorrections.php
//
// Thin persistence only. Takes whatever corrected dbPlayers_Scores JSON the
// browser already computed (via MA.resolveDeclaredIndices — the one true
// declare-resolution logic, run client-side) and writes it back per player.
// Contains no declare-logic of its own, on purpose — this endpoint should
// never need to change when the declare rules change; only declare_logic.js
// should.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ma_respond(405, ['ok' => false, 'message' => 'Method not allowed.']);
}

$in = ma_json_in();
$ggid = trim((string)($in['ggid'] ?? ''));
$updates = is_array($in['updates'] ?? null) ? $in['updates'] : [];

if ($ggid === '') {
    ma_respond(400, ['ok' => false, 'message' => 'ggid required.']);
}
if (!$updates) {
    ma_respond(200, ['ok' => true, 'updated' => 0]);
}

$updatedCount = 0;
$errors = [];

try {
    foreach ($updates as $update) {
        if (!is_array($update)) continue;

        $ghin = trim((string)($update['ghin'] ?? ''));
        $scoresJson = $update['scoresJson'] ?? null;
        if ($ghin === '' || $scoresJson === null) continue;

        $result = ServiceDbPlayers::updateGamePlayerFields($ggid, $ghin, [
            'dbPlayers_Scores' => is_array($scoresJson) ? json_encode($scoresJson) : (string)$scoresJson,
        ]);

        if ($result) {
            $updatedCount++;
        } else {
            $errors[] = "No matching player for GHIN {$ghin}.";
        }
    }

    ma_respond(200, ['ok' => true, 'updated' => $updatedCount, 'errors' => $errors]);

} catch (Throwable $e) {
    Logger::error('SAVE_DECLARED_CORRECTIONS_FAIL', ['ggid' => $ggid, 'err' => $e->getMessage()]);
    ma_respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
