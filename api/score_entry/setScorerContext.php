<?php
declare(strict_types=1);
// /public_html/api/session/setScorerContext.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_UserContext.php";

$input = json_decode(file_get_contents('php://input'), true);
$ghin = (string)($input['ghin'] ?? '');

if ($ghin !== "") {
    ServiceUserContext::setScorerContext($ghin);
    echo json_encode(['ok' => true]);
} else {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'GHIN required']);
}
exit;