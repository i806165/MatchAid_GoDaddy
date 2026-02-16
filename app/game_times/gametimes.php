<?php
// /public_html/app/game_times/gametimes.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

// Portal context (required convention)
$_SESSION["SessionPortal"] = "ADMIN PORTAL";

Logger::info("GAMETIMES_ENTRY", [
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

// 2) GAME context hydration (Rule-2 for pages)
try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"] ?? [];
  $ggid = $gc["ggid"] ?? null;

  if (!$ggid) {
    header("Location: /app/admin_games/gameslist.php");
    exit;
  }

  // Build INIT payload (server embeds) via API module function
  require_once __DIR__ . "/../../api/game_times/hydrateGameTimes.php";
  $initPayload = hydrateGameTimes_init((string)$ggid, $ctx);

  // Standard INIT wrappers + helpers
  $initPayload["ok"] = true;
  $initPayload["returnTo"] = "/app/admin_games/gameslist.php";
  $initPayload["header"] = [
    "subtitle" => (string)($game["dbGames_Title"] ?? "") . " - GGID " . (string)$ggid
  ];
} catch (Throwable $e) {
  Logger::error("GAMETIMES_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Provide path constants to JS (no hard-coded paths in JS)
$paths = [
  "apiSession"    => MA_ROUTE_API_SESSION,
  "routerApi"     => MA_ROUTE_API_ROUTER,
  "apiGHIN"       => MA_ROUTE_API_GHIN,

  // Game Times API endpoint (single INIT/SAVE endpoint)
  "apiGameTimes"  => "/api/game_times/hydrateGameTimes.php",
];

// Chrome values (picked up by chromeHeader.php)
$maChromeTitle = "Tee Times";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MatchAid • Tee Times</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/game_times.css?v=1">
</head>
<body>
  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <main class="maPage" role="main">
    <?php include __DIR__ . "/gametimes_view.php"; ?>
  </main>

  <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

<script>
  window.MA = window.MA || {};

  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

  // Canonical aliases/pattern
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router: window.MA.paths.routerApi,
    login: <?= json_encode(MA_ROUTE_LOGIN) ?>,
    apiGHIN: window.MA.paths.apiGHIN,
    apiGameTimes: window.MA.paths.apiGameTimes
  };
</script>

  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/modules/actions_menu.js?v=1"></script>
  <script src="/assets/pages/game_times.js"></script>
</body>
</html>
