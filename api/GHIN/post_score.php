<?php
declare(strict_types=1);
/* /api/GHIN/post_score.php */

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/GHIN/GHIN_API_Scores.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');

// Retrieve authentication from session to prevent client-side token exposure
$userToken = (string)($_SESSION['SessionUserToken'] ?? '');
$userGHIN  = (string)($_SESSION['SessionGHINLogonID'] ?? '');

if ($userToken === '' || $userGHIN === '') {
    echo json_encode(['ok' => false, 'message' => 'GHIN authentication required. Please log in again.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$ggid = (int)($input['ggid'] ?? 0);

if ($ggid <= 0) {
    echo json_encode(['ok' => false, 'message' => 'Missing game identity.']);
    exit;
}

// playerGHIN is authoritatively determined from session by the service
$playerGHIN = $userGHIN;

$result = ServiceGHINScores::postScoreToGHIN($ggid, $playerGHIN, $userToken);
echo json_encode($result);