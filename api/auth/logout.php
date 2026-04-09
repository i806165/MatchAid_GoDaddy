
text/x-generic logout.php ( PHP script, ASCII text, with CRLF line terminators )
<?php
declare(strict_types=1);

session_start();
header("Content-Type: application/json");

$_SESSION = [];
if (ini_get("session.use_cookies")) {
  $p = session_get_cookie_params();
  setcookie(session_name(), "", time() - 42000, $p["path"], $p["domain"], $p["secure"], $p["httponly"]);
}
session_destroy();

echo json_encode(["ok" => true]);