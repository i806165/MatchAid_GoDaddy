<?php
declare(strict_types=1);
// /public_html/api/score_entry/launch.php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../services/scoring/service_ScoreEntry.php';
// TODO: require bootstrap / db helpers / getGameContext service in your app

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

    // TODO: replace with canonical db/service calls
    $launchedPlayer = null; // e.g. ServiceDbPlayers::findByPlayerKey($playerKey)
    $gameRow = null;        // e.g. getGameContext($launchedPlayer['dbPlayers_GGID'])
    $groupPlayers = [];     // e.g. ServiceDbPlayers::loadGroupPlayers(...)

    if (!$launchedPlayer || !$gameRow) {
        respond(404, ['ok' => false, 'message' => 'ScoreCard ID not found.']);
    }

    $payload = ServiceScoreEntry::buildLaunchPayload($gameRow, $groupPlayers, $holeNumber);
    $payload['launchContext'] = [
        'playerKey' => $playerKey,
        'groupLoadRule' => ServiceScoreEntry::resolveGroupLoadMode($gameRow, $launchedPlayer),
        'launchedPlayerId' => (string)($launchedPlayer['_id'] ?? ''),
    ];

    respond(200, ['ok' => true, 'payload' => $payload]);
} catch (Throwable $e) {
    respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
