<?php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

$_SESSION["SessionPortal"] = "ADMIN PORTAL";
$_SESSION["SessionFavLaunchMode"] = "registrations";
$_SESSION["SessionFavReturnAction"] = "roster";
$_SESSION["SessionFavPlayerGHIN"] = "";

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"];
  $ggid = $gc["ggid"];

  $initPayload = [
    "ok" => true,
    "ggid" => $ggid,
    "game" => $game,
    "context" => [
      "userState" => (string)($_SESSION["SessionUserState"] ?? ""),
      "userGHIN" => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
      "userName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
    ]
  ];
} catch (Throwable $e) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

$paths = [
  "routerApi" => MA_ROUTE_API_ROUTER,
  "gamePlayersGet" => "/api/game_players/getGamePlayers.php",
  "gamePlayersUpsert" => "/api/game_players/upsertGamePlayers.php",
  "gamePlayersDelete" => "/api/game_players/deleteGamePlayers.php",
  "favPlayersInit" => "/api/favorite_players/initFavPlayers.php",
  "ghinPlayerSearch" => "/api/GHIN/searchPlayers.php",
  "ghinGetTeeSets" => "/api/GHIN/getTeeSets.php",
];

$maChromeLogoUrl = "/assets/images/MatchAidLogoSquare.jpeg";
$maChromeTitleLine1 = "Game Players";
$maChromeTitleLine2 = "GGID " . (string)$ggid;
$maChromeTitleLine3 = "";
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MatchAid • Game Players</title>
  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/game_players.css?v=1">
</head>
<body>
<?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

<div class="maControlArea gpControlsBand" id="gpControlsBand">
  <div id="gpTabStrip" class="gpTabs" role="tablist" aria-label="Player registration tabs"></div>
  <div id="gpTabControls" class="gpTabControls"></div>
</div>

<main class="maPage" role="main">
  <?php include __DIR__ . "/gameplayers_view.php"; ?>
</main>

<?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

<script>
window.MA = window.MA || {};
window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
window.__MA_INIT__ = window.__INIT__;
window.MA.routes = { router: window.MA.paths.routerApi, login: <?= json_encode(MA_ROUTE_LOGIN) ?> };
</script>
<script src="/assets/js/ma_shared.js"></script>
<script src="/assets/modules/ghin_player_search.js"></script>
<script src="/assets/pages/game_players.js"></script>
</body>
</html>
