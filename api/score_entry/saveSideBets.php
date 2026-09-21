<?php
declare(strict_types=1);
// /public_html/api/score_entry/saveSideBets.php
//
// Saves side-bet claims (db_Players.dbPlayers_CustomScores) for the players on
// the current scorecard. Same access posture as saveScores.php: the session
// scorecard key is the authority; all logic lives in ServiceSideBets.

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_SideBets.php';

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(405, ['ok' => false, 'message' => 'Method not allowed']);
    }

    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $result = ServiceSideBets::persistClaims($body);

    $status = (int)($result['status'] ?? (!empty($result['ok']) ? 200 : (!empty($result['conflict']) ? 409 : 400)));
    unset($result['status']);

    respond($status, $result);
} catch (Throwable $e) {
    Logger::error('SAVE_SIDE_BETS_FAIL', ['error' => $e->getMessage()]);
    respond(500, ['ok' => false, 'message' => 'Unable to save side bets.']);
}
