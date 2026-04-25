<?php
// /public_html/app/game_slotting/gameslotting.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

Logger::info("GAMESLOTTING_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
  "ggid" => $_SESSION["SessionStoredGGID"] ?? "",
]);

$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

$ggid = ServiceContextGame::getStoredGGID();
if (!$ggid) {
  header("Location: /app/admin_games/gameslist.php");
  exit;
}

try {
  $gameCtx = ServiceContextGame::getGameContext();
  $players = ServiceDbPlayers::getGamePlayers((string)$ggid);

  $initPayload = [
    "ok" => true,
    "ggid" => $ggid,
    "game" => $gameCtx["game"],
    "players" => $players,
    "meta" => [
      "toMethod" => $gameCtx["game"]["dbGames_TOMethod"] ?? "TeeTimes",
      "teeTimeInterval" => (int)($gameCtx["game"]["dbGames_TeeTimeInterval"] ?? 9),
      "availableSuffixes" => ["A", "B", "C", "D"]
    ],
    "returnTo" => "/app/admin_games/gameslist.php",
    "header" => [
      "subtitle" => (string)($gameCtx["game"]["dbGames_Title"] ?? "") . " - GGID " . (string)$ggid
    ]
  ];
} catch (Throwable $e) {
  Logger::error("GAMESLOTTING_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

$paths = [
  "apiSession" => MA_ROUTE_API_SESSION,
  "routerApi"  => MA_ROUTE_API_ROUTER,
  "apiGHIN"    => MA_ROUTE_API_GHIN,
  "apiSave"    => "/api/game_pairings/savePairings.php",
];

$maChromeTitle = "Game Slotting";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Game Slotting</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/game_slotting.css">
</head>
<body>
  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <div class="maControlArea" role="region" aria-label="Slotting controls"></div>

  <main class="maPage maPage--multi maPage--slotting" role="main">
    <?php include __DIR__ . "/gameslotting_view.php"; ?>
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
      apiSave: window.MA.paths.apiSave
    };
  </script>

  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/modules/actions_menu.js"></script>
  <script src="/assets/pages/game_slotting.js"></script>
</body>
</html>