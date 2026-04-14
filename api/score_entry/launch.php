<?php
declare(strict_types=1);
// /public_html/api/score_entry/launch.php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_ScoreEntry.php';
require_once MA_SERVICES . '/scoring/service_ScoreRotation.php';
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

    // Step 1: Pull baseline scoring pod by shared ScoreCard ID
    $groupPlayers = ServiceDbPlayers::getPlayersByPlayerKey($playerKey);
    if (!$groupPlayers || count($groupPlayers) === 0) {
        respond(404, ['ok' => false, 'message' => 'ScoreCard ID not found.']);
    }

    // Step 2: Use first player row as launch anchor
    $launchedPlayer = $groupPlayers[0];
    $ggid = (int)($launchedPlayer['dbPlayers_GGID'] ?? 0);
    if ($ggid <= 0) {
        respond(404, ['ok' => false, 'message' => 'Game not found for ScoreCard ID.']);
    }

    // Step 3: Hydrate session GGID so existing game context service can be reused
    ServiceContextGame::setGameContext($ggid);
    ServiceScoreEntry::setScoringPodGGID($ggid);
    ServiceScoreEntry::setScorecardKey($playerKey);

    $gc = ServiceContextGame::getGameContext();
    $gameRow = $gc['game'] ?? null;

    if (!$gameRow) {
        respond(404, ['ok' => false, 'message' => 'Game context not found.']);
    }

    // Step 4: Build the baseline payload exactly as score entry expects today
    $baselinePayload = ServiceScoreEntry::buildLaunchPayload($gameRow, $groupPlayers, $holeNumber, $playerKey);

    // Step 5: Normalize baseline into virtual contexts (pass-through for non-spin games)
    $seatOverrides = method_exists('ServiceScoreEntry', 'getSeatOverrides')
        ? ServiceScoreEntry::getSeatOverrides()
        : [];

    $rotationContext = ServiceScoreRotation::buildNormalizedContexts(
        $gameRow,
        $groupPlayers,
        $holeNumber,
        $seatOverrides
    );

    // Step 6a: Rewrite payload.players to the active normalized working array
    $baselinePayload['players'] = ServiceScoreEntry::applyActiveContextToLaunchPlayers(
        $baselinePayload['players'] ?? [],
        $rotationContext['activeContext']['players'] ?? []
    );
    // Step 6b: Resolve declarations only after active context has been merged
    ServiceScoreEntry::resolveDeclaredScores(
        $gameRow,
        $baselinePayload['players'],
        $holeNumber
    );

    // Step 7: Attach normalized rotation context to the hydration payload
    $baselinePayload['rotation'] = $rotationContext;
    $baselinePayload['isRotationAware'] = !empty($rotationContext['isRotationAware']);
    $baselinePayload['virtualContexts'] = $rotationContext['virtualContexts'] ?? [];
    $baselinePayload['activeContext'] = $rotationContext['activeContext'] ?? null;
    $baselinePayload['baselineContext'] = $rotationContext['baseline'] ?? null;

    respond(200, ['ok' => true, 'payload' => $baselinePayload]);

} catch (Throwable $e) {
    respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}