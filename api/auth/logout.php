<?php
declare(strict_types=1);
// /public_html/api/auth/logout.php
session_start();
header("Content-Type: application/json");

$_SESSION = [];
if (ini_get("session.use_cookies")) {
  $p = session_get_cookie_params();
  setcookie(session_name(), "", time() - 42000, $p["path"], $p["domain"], $p["secure"], $p["httponly"]);
}
session_destroy();

echo json_encode(["ok" => true]);
exit;