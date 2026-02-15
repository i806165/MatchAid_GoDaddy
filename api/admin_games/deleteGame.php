<?php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SVC_DB . '/service_dbGames.php';

session_start();
ma_api_require_auth();

$input = ma_json_in();
// Allow payload wrapper or direct input
$data = $input['payload'] ?? $input;
$ggid = (int)($data['ggid'] ?? 0);

if ($ggid <= 0) {
    ma_respond(400, ['ok' => false, 'message' => 'Invalid GGID']);
}

try {
    $deleted = ServiceDbGames::deleteGame($ggid);
    if ($deleted) {
        ma_respond(200, ['ok' => true, 'message' => 'Game deleted successfully']);
    } else {
        ma_respond(404, ['ok' => false, 'message' => 'Game not found or could not be deleted']);
    }
} catch (Throwable $e) {
    error_log("[API deleteGame] " . $e->getMessage());
    ma_respond(500, ['ok' => false, 'message' => 'Server error deleting game']);
}