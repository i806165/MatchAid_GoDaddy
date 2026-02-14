<?php
// /public_html/app/game_pairings/gamepairings.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

// Portal context (required convention)
$_SESSION["SessionPortal"] = "ADMIN PORTAL";

Logger::info("GAMEPAIRINGS_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
  "ggid" => $_SESSION["SessionStoredGGID"] ?? "",
  "loginTime" => $_SESSION["SessionLoginTime"] ?? "",
]);

// 1) USER context hydration (Rule-2)
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// 2) GAME context hydration (Rule-2)
try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"] ?? null;
  $ggid = $gc["ggid"] ?? null;
  if (!$game || !$ggid) {
    throw new RuntimeException("Missing game context.");
  }

  $players = ServiceDbPlayers::getGamePlayers((string)$ggid);

  $initPayload = [
    "ok" => true,
    "ggid" => $ggid,
    "game" => $game,
    "players" => $players,
    "authorizations" => $gc["authorizations"] ?? [],
    "header" => [
      "subtitle" => "GGID " . (string)$ggid
    ]
  ];
} catch (Throwable $e) {
  Logger::error("GAMEPAIRINGS_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Provide path constants to JS (no hard-coded paths in JS)
$paths = [
  "apiSession"      => MA_ROUTE_API_SESSION,
  "routerApi"       => MA_ROUTE_API_ROUTER,
  "apiGamePairings" => defined("MA_ROUTE_API_GAME_PAIRINGS") ? MA_ROUTE_API_GAME_PAIRINGS : "/api/game_pairings",
];

// Chrome values
$maChromeTitle = "Game Pairings";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MatchAid • Game Pairings</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/game_pairings.css?v=1">
</head>
<body>
  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <div class="maControlArea" role="region" aria-label="Pairings controls">
    <div style="display: flex; gap: 10px; align-items: center;">
      <div class="maSegWrap" id="gpTabs" role="tablist" aria-label="Pairings tabs" style="flex: 1;">
        <button class="maSegBtn is-active" type="button" data-tab="pair" role="tab" aria-selected="true">Pair Players</button>
        <button class="maSegBtn" type="button" data-tab="match" role="tab" aria-selected="false" id="gpTabMatch">Match Pairings</button>
      </div>

      <div class="gpControls__spacer" style="display:none;"></div>
    </div>
  </div>

  <main class="maPage maPage--multi maPage--pairings" role="main">
    <?php include __DIR__ . "/gamepairings_view.php"; ?>
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
      apiGamePairings: window.MA.paths.apiGamePairings
    };
  </script>

  <script src="/assets/js/ma_shared.js?v=1"></script>
  <script src="/assets/pages/game_pairings.js?v=1"></script>
</body>
</html>
