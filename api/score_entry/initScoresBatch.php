<?php
declare(strict_types=1);
// /public_html/api/score_entry/initScoresBatch.php

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

    // Signed-in session required — same bar as the score_home.js scorecard
    // switcher. Guests are barred; playerKey alone is not treated as
    // sufficient access proof.
    $sessionGhin = $_SESSION['SessionGHINLogonID'] ?? '';
    if ($sessionGhin === '') {
        respond(401, ['ok' => false, 'message' => 'Sign in required.']);
    }

    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $playerKey = strtoupper(trim((string)($body['playerKey'] ?? '')));

    if ($playerKey === '') {
        respond(400, ['ok' => false, 'message' => 'ScoreCard ID is required.']);
    }

    $result = ServiceScoreEntry::buildScoresBatchPayload($playerKey);

    if (!empty($result['gated'])) {
        respond(200, $result);
    }

    if (empty($result['ok'])) {
        respond(404, $result);
    }

    respond(200, $result);

} catch (Throwable $e) {
    respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
