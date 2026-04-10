
text/x-generic login.php ( PHP script, ASCII text, with CRLF line terminators )
<?php
// /public_html/api/auth/login.php
declare(strict_types=1);

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
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
  respond(200, ["ok" => false, "message" => "Please enter Email/GHIN and Password."]);
  exit;
}

try {
  $result = ServiceLogin::processLogin($userId, $pass, $config);
  respond(200, $result);
} catch (Throwable $e) {
  // Catch any unexpected exceptions from the service layer
  error_log("[login.php] UNEXPECTED_ERROR: " . $e->getMessage() . " Trace: " . $e->getTraceAsString());
  respond(500, ["ok" => false, "message" => "An unexpected server error occurred during login."]);
}