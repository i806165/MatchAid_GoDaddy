<?php
// /public_html/app/game_summary/gamesummary.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

// 1) USER context hydration (Rule-2)
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// 2) GAME context hydration (Rule-2 for pages)
try {
  $gc = ServiceContextGame::getGameContext();
  if (!$gc || empty($gc["game"])) {
    throw new RuntimeException("Missing game context.");
  }

  require_once MA_API . "/game_summary/initGameSummary.php";
  $initPayload = buildGameSummaryInit($ctx, $gc);
  if (empty($initPayload["ok"])) {
    throw new RuntimeException("buildGameSummaryInit returned not-ok.");
  }

  $initPayload["portal"] = $_SESSION["SessionPortal"] ?? "ADMIN PORTAL";

  Logger::info("GAMESUMMARY_CTX_DEBUG", [
    "ggid"    => $gc["ggid"] ?? "missing",
    "hasGame" => !empty($gc["game"])
  ]);

} catch (Throwable $e) {
  Logger::error("GAMESUMMARY_INIT_FAIL", [
    "err"       => $e->getMessage(),
    "ghin"      => $_SESSION["SessionGHINLogonID"] ?? "",
    "ggid"      => $_SESSION["SessionStoredGGID"] ?? "",
    "loginTime" => $_SESSION["SessionLoginTime"] ?? "",
    "uri"       => $_SERVER["REQUEST_URI"] ?? "",
  ]);
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Provide path constants to JS (no hard-coded paths in JS)
$paths = [
  "apiSession"     => MA_ROUTE_API_SESSION,
  "routerApi"      => MA_ROUTE_API_ROUTER,
  "apiGHIN"        => MA_ROUTE_API_GHIN,
  "apiGameSummary" => "/api/game_summary/initGameSummary.php",
  "apiNotify"      => MA_ROUTE_API_MESSAGING,  
];

// Chrome values
$maChromeTitle    = "Game Summary";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl  = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid - Game Summary</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/game_summary.css') ?>" />
</head>
<body>

  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <?php include __DIR__ . "/gamesummary_view.php"; ?>

  <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

<script>
  window.MA = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router:         window.MA.paths.routerApi,
    login:          <?= json_encode(MA_ROUTE_LOGIN) ?>,
    apiGHIN:        window.MA.paths.apiGHIN,
    apiGameSummary: window.MA.paths.apiGameSummary
  };
</script>

  <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/addCalendar.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/composeEmail.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/player_notifications.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/recalculate_handicaps.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_DisplayGameFormat.js') ?>"></script>
  <script src="<?= ma_asset('/assets/pages/game_summary.js') ?>"></script>
</body>
</html>