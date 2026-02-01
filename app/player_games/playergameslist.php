<?php
// /public_html/app/player_games/playergameslist.php
declare(strict_types=1);

session_start();
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";

$_SESSION["SessionPortal"] = "PLAYER PORTAL";

$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

header("Content-Type: text/html; charset=utf-8");
?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>MatchAid - Player Portal</title>
</head>
<body style="font-family: Montserrat, Arial, sans-serif; padding: 16px;">
  <h2>Player Portal (Placeholder)</h2>
  <p>Coming Soon!. You are logged in.</p>
  <p><a href="/">Return Home</a></p>
</body>
</html>
