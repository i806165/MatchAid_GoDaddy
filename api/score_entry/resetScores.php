<?php
declare(strict_types=1);
// /public_html/api/score_entry/resetScores.php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_ScoreEntry.php';

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        respond(405, ['ok' => false, 'message' => 'Method not allowed']);
    }

    /*
     * ma_api_require_auth() rather than the plain sign-in check
     * saveScoresBatch.php/saveScores.php use — this rewrites already
     * -recorded scores for a whole scoring group with no scorer session
     * behind it, the same authority level as refreshHandicaps.php /
     * calcPHSO.php, which this is meant to run alongside. Flagging this
     * choice: confirm it matches wherever this ends up being called
     * from.
     */
    $auth = ma_api_require_auth();

    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $playerKey = trim((string)($body['playerKey'] ?? ''));

    if ($playerKey === '') {
        respond(400, ['ok' => false, 'message' => 'ScoreCard ID is required.']);
    }

    $result = ServiceScoreEntry::resetScoresForGroup($playerKey);

    if (!empty($result['ok'])) {
        respond(200, $result);
    }

    respond(400, $result);

} catch (Throwable $e) {
    respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
