<?php
// /public_html/app/game_maintenance/gamemaint.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";

// 1) USER context hydration (Rule-2)
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// 2) GAME context hydration (Rule-2 for pages)
$modeParam = strtolower(trim((string)($_GET["mode"] ?? "")));
$storedGGID = $_SESSION["SessionStoredGGID"] ?? "";

$mode = ($modeParam === "add") ? "add" : "edit";
if ($modeParam === "" && trim((string)$storedGGID) === "") {
  $mode = "add";
}

try {
  $playerCount = 0;
  if ($mode === "edit") {
    $gc = ServiceContextGame::getGameContext();
    $game = $gc["game"];
    $ggid = $gc["ggid"];
    $playerCount = ($mode === "edit" && $ggid)
        ? ServiceDbPlayers::getPlayerCount((string)$ggid)
        : 0;
  } else {
    $game = ServiceContextGame::defaultGameForAdd();
    $ggid = null;
  }

  $subtitle = ($mode === "add")
    ? "Add New Game"
    : ("GGID " . (string)$ggid);

  $initPayload = [
    "ok" => true,
    "mode" => $mode,
    "ggid" => $ggid,
    "game" => $game,
    "playerCount" => $playerCount,
    "authorizations" => ($mode === "edit") ? ($gc["authorizations"] ?? []) : ServiceContextGame::getGameAuthorizations(),
    "header" => [
      "subtitle" => $subtitle
    ]
  ];
} catch (Throwable $e) {
  Logger::error("GAMEMAINT_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Provide path constants to JS (no hard-coded paths in JS)
$paths = [
  "apiSession"    => MA_ROUTE_API_SESSION,
  "routerApi"     => MA_ROUTE_API_ROUTER,
  "apiGHIN"       => MA_ROUTE_API_GHIN,
  "apiGameMaint"  => MA_ROUTE_API_GAME_MAINT,
  "apiNotify"     => MA_ROUTE_API_MESSAGING,
];

// Chrome values
$maChromeTitle    = "Game Maintenance";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl  = null;

// Page help — key derived from this controller's filename
$pageHelpKey = ServicePageHelp::keyFromControllerFile(__FILE__);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Game Maintenance</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/game_maintenance.css') ?>" />
</head>
<body>
  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <main class="maPage" role="main">
    <?php include __DIR__ . "/gamemaint_view.php"; ?>
  </main>

  <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

  <?php
  // Render help modal into the DOM (hidden until ? button is clicked)
  if (!empty($pageHelpKey)) {
      ServicePageHelp::renderByKey($pageHelpKey);
  }
  ?>

<script>
  window.MA = window.MA || {};

  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

  // Canonical aliases/pattern
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router:      window.MA.paths.routerApi,
    login:       <?= json_encode(MA_ROUTE_LOGIN) ?>,
    apiGHIN:     window.MA.paths.apiGHIN,
    apiGameMaint: window.MA.paths.apiGameMaint
  };
</script>

  <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/composeEmail.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/player_notifications.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/pageHelp.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/recalculate_handicaps.js') ?>"></script>
  <script src="<?= ma_asset('/assets/pages/game_maintenance.js') ?>"></script>
</body>
</html>