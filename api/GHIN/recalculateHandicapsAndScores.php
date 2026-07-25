<?php
declare(strict_types=1);
// /public_html/api/GHIN/recalculateHandicapsAndScores.php
//
// Single endpoint replacing the previous two-request chain
// (refreshHandicaps.php + calcPHSO.php) called sequentially from the
// front end. See workflow_recalculateHandicapsScores.php for the actual
// four-pass logic.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/workflows/workflow_recalculateHandicapsScores.php";

$auth = ma_api_require_auth();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ma_respond(405, ['ok' => false, 'message' => 'Method not allowed.']);
}

$in = ma_json_in();
$payload = $in['payload'] ?? $in;

try {
    $gc   = ServiceContextGame::getGameContext();
    $game = $gc['game'] ?? null;
    $ggid = (string)($gc['ggid'] ?? '');

    if (!$game || $ggid === '') {
        ma_respond(400, ['ok' => false, 'message' => 'No active game.']);
    }

    // scope: "game" (default) or "playerKey". playerKey required when scope
    // is "playerKey" — see spec Section 4 for which trigger uses which.
    $scope     = trim((string)($payload['scope'] ?? 'game'));
    $playerKey = trim((string)($payload['playerKey'] ?? ''));

    if ($scope === 'playerKey' && $playerKey === '') {
        ma_respond(400, ['ok' => false, 'message' => 'playerKey required for playerKey-scoped refresh.']);
    }

    $result = be_recalculateHandicapsAndScores($ggid, $scope, $playerKey, (string)($auth['adminToken'] ?? ''));

    ma_respond(200, $result);

} catch (Throwable $e) {
    ma_respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
