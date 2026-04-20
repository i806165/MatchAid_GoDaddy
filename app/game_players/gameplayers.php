<?php
declare(strict_types=1);
// /app/game_players/gameplayers.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";

$_SESSION["SessionFavLaunchMode"] = "registrations";
$_SESSION["SessionFavReturnAction"] = "roster";
$_SESSION["SessionFavPlayerGHIN"] = "";

$queryGGID = (int)($_GET["ggid"] ?? 0);
if ($queryGGID > 0) {
  ServiceContextGame::setGameContext($queryGGID);
}

$returnTo = trim((string)($_GET["returnTo"] ?? ""));
if ($returnTo === "" || strpos($returnTo, "/") !== 0) {
  $returnTo = "/app/admin_games/gameslist.php";
}

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"];
  $ggid = $gc["ggid"];
  $courseTeePayload = [];

  $courseId = trim((string)($game["dbGames_CourseID"] ?? ""));
  $adminToken = $_SESSION["SessionAdminToken"];
  $courseTeePayload = be_getCourseTeeSets($courseId, $adminToken);


  $initPayload = [
    "ok" => true,
    "ggid" => $ggid,
    "game" => $game,
    "courseTeePayload" => $courseTeePayload,
    "context" => [
      "userState" => (string)($_SESSION["SessionUserState"] ?? ""),
      "userGHIN" => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
      "userName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
    ],
    "portal" => $_SESSION['SessionPortal'] ?? 'ADMIN PORTAL'
  ];
} catch (Throwable $e) {
  Logger::error("GAMEPLAYERS_INIT_FAIL", [
    "err" => $e->getMessage(),
    "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
    "ggid" => $_SESSION["SessionStoredGGID"] ?? "",
    "returnTo" => $returnTo
  ]);
  header("Location: " . $returnTo);
  exit;
}


$paths = [
  "routerApi" => MA_ROUTE_API_ROUTER,
  "apiGHIN" => MA_ROUTE_API_GHIN,
  "apiGamePlayers" => MA_ROUTE_API_GAME_PLAYERS,
  "apiFavoritePlayers" => MA_ROUTE_API_FAVORITE_PLAYERS,
  "gamePlayersGet" => MA_ROUTE_API_GAME_PLAYERS . "/getGamePlayers.php",
  "gamePlayersUpsert" => MA_ROUTE_API_GAME_PLAYERS . "/upsertGamePlayers.php",
  "gamePlayersDelete" => MA_ROUTE_API_GAME_PLAYERS . "/deleteGamePlayers.php",
  "importSourceGames" => MA_ROUTE_API_GAME_PLAYERS . "/getImportSourceGames.php",
  "getImportPlayers" => MA_ROUTE_API_GAME_PLAYERS . "/getImportPlayers.php",
  "importExecuteGame" => MA_ROUTE_API_GAME_PLAYERS . "/executeImportFromGame.php",
  "favPlayersInit" => MA_ROUTE_API_FAVORITE_PLAYERS . "/initFavPlayers.php",
  "ghinPlayerSearch" => MA_ROUTE_API_GHIN . "/searchPlayers.php",
  "ghinGetTeeSets" => MA_ROUTE_API_GHIN . "/getTeeSets.php",
];

$maChromeTitle = "Game Players";
$maChromeSubtitle = "GGID " . (string)$ggid;
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MatchAid • Game Players</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/game_players.css?v=1">
</head>
<body>
  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <div class="maControlArea gpControlsBand" id="gpControlsBand" role="region" aria-label="Game players controls">
    <div class="gpShell">
      <div id="gpTabStrip" class="gpTabs" role="tablist" aria-label="Player registration tabs"></div>
      <div id="gpTabControls" class="gpTabControls"></div>
    </div>
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
    window.MA.routes = {
      router: window.MA.paths.routerApi,
      login: <?= json_encode(MA_ROUTE_LOGIN) ?>,
      apiGHIN: window.MA.paths.apiGHIN,
      apiGamePlayers: window.MA.paths.apiGamePlayers
    };
  </script>
  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/modules/ghin_player_search.js"></script>
  <script src="/assets/modules/actions_menu.js?v=1"></script>
  <script src="/assets/modules/teesetSelection.js?v=1"></script>
  <script src="/assets/pages/game_players.js"></script>
</body>
</html>