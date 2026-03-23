<?php
declare(strict_types=1);
// /public_html/api/score_entry/saveScores.php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_ScoreEntry.php';

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
    $result = ServiceScoreEntry::saveScoresForGroup($body);

    if (!empty($result['ok'])) {
        respond(200, $result);
    }

    if (!empty($result['conflict'])) {
        respond(409, $result);
    }

    respond(400, $result);
} catch (Throwable $e) {
    respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}