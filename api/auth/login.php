<?php

declare(strict_types=1);

// /public_html/api/auth/login.php

ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
  'lifetime' => 0,
  'path'     => '/',
  'secure'   => $secure,
  'httponly' => true,
  'samesite' => 'Lax',
]);

session_start();
header("Content-Type: application/json");

require_once __DIR__ . "/../../bootstrap.php";
$config = ma_config();
require_once MA_SERVICES . "/context/service_Login.php"; // New service


function json_in(): array {
  $raw = file_get_contents("php://input");
  $data = json_decode($raw ?: "{}", true);
  return is_array($data) ? $data : [];
}

function respond(int $code, array $body): void {
  http_response_code($code);
  echo json_encode($body);
  exit;
}

$in = json_in();
$userId = trim((string)($in["userId"] ?? ""));
$pass   = (string)($in["password"] ?? "");

if ($userId === "" || $pass === "") {
  respond(400, ["ok" => false, "message" => "Please enter Email/GHIN and Password."]); // Use 400 Bad Request
  exit;
}

try {
  $result = ServiceLogin::processLogin($userId, $pass, $config);

  if (!empty($result["ok"])) {
    respond(200, $result);
  }

  respond(401, $result);
} catch (Throwable $e) {
  error_log("[login.php] UNEXPECTED_ERROR: " . $e->getMessage() . " Trace: " . $e->getTraceAsString());
  respond(500, ["ok" => false, "message" => "An unexpected server error occurred during login."]);
}

// If ServiceLogin::processLogin returns ok:false, it's an authentication failure
if (!$result['ok']) {
  respond(401, $result); // Use 401 Unauthorized for login failures
}