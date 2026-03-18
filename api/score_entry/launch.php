<?php
declare(strict_types=1);
// /public_html/api/score_entry/launch.php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_ScoreEntry.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';

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
    $playerKey = strtoupper(trim((string)($body['playerKey'] ?? '')));
    $requestedHole = intval($body['holeNumber'] ?? 0);
    $holeNumber = $requestedHole > 0 ? $requestedHole : 1;

    if ($playerKey === '') {
        respond(400, ['ok' => false, 'message' => 'ScoreCard ID is required.']);
    }

    // Step 1: pull all players in the scoring pod by shared ScoreCard ID
    $groupPlayers = ServiceDbPlayers::getPlayersByPlayerKey($playerKey);
    if (!$groupPlayers || count($groupPlayers) === 0) {
        respond(404, ['ok' => false, 'message' => 'ScoreCard ID not found.']);
    }

    // Step 2: use first player row as launch anchor
    $launchedPlayer = $groupPlayers[0];
    $ggid = (int)($launchedPlayer['dbPlayers_GGID'] ?? 0);
    if ($ggid <= 0) {
        respond(404, ['ok' => false, 'message' => 'Game not found for ScoreCard ID.']);
    }

    // Step 3: hydrate session GGID so existing game context service can be reused
    ServiceContextGame::setGameContext($ggid);
    $gc = ServiceContextGame::getGameContext();
    $gameRow = $gc['game'] ?? null;

    if (!$gameRow) {
        respond(404, ['ok' => false, 'message' => 'Game context not found.']);
    }

    $payload = ServiceScoreEntry::buildLaunchPayload($gameRow, $groupPlayers, $holeNumber);
    $payload['launchContext'] = [
        'playerKey' => $playerKey,
        'groupLoadRule' => 'PlayerKey',
        'launchedPlayerId' => (string)($launchedPlayer['_id'] ?? ''),
        'ggid' => (string)$ggid,
    ];

    respond(200, ['ok' => true, 'payload' => $payload]);
} catch (Throwable $e) {
    respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
