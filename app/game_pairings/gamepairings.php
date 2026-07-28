<?php
// /public_html/app/game_pairings/gamepairings.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ReconcilePairingBoundaries.php";

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

  // Reconcile before the initial fetch — a team/flight change made
  // elsewhere (Manage Teams, Define Flights, or eventually the event
  // cascade) since this game's pairings were last built may have broken
  // the team/flight boundary invariant client-side clamps only guard at
  // write time. Same call the round-level Manage Teams/Define Flights
  // saves already trigger — see workflow_ReconcilePairingBoundaries.php.
  // Second query on getGamePlayers() below is deliberate, not an
  // oversight — a single game's player count is small (well under 100),
  // so the extra round-trip is nominal, and reconciling BEFORE the fetch
  // means the page never renders stale (pre-reset) data even for an
  // instant.
  $reconciled = WorkflowReconcilePairingBoundaries::reconcileGame((string)$ggid, $game);

  $players = ServiceDbPlayers::getGamePlayers((string)$ggid);

  $initPayload = [
    "ok" => true,
    "ggid" => $ggid,
    "game" => $game,
    "players" => $players,
    "reconciled" => $reconciled,
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
  "apiNotify"       => MA_ROUTE_API_MESSAGING,
];

// Chrome values
$maChromeTitle    = "Game Pairings";
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
  <title>MatchAid • Game Pairings</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/game_pairings.css') ?>" />
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
  <?php require_once MA_INCLUDES . "/gameSettingsMenuRows.php"; ?>

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
    window.__MA_INIT__ = window.__INIT__;

    window.MA.routes = {
      router: window.MA.paths.routerApi,
      login: <?= json_encode(MA_ROUTE_LOGIN) ?>,
      apiGamePairings: window.MA.paths.apiGamePairings
    };
  </script>

  <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
  <script src="<?= ma_asset('/assets/js/ma_SharedBusLogic.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/recalculate_handicaps.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/composeEmail.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/player_notifications.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/pageHelp.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_runAutoPair.js') ?>"></script>

  <script src="<?= ma_asset('/assets/modules/module_menuGameSettings.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_DisplayGameFormat.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/addCalendar.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_setGameFormat.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_setGameSegments.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_setGameBlindPlayer.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_setGameScoring.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_setGamePlacementPoints.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_setHandicapsGameEvent.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_defineFlightsGameEvent.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/module_defineTeamsGameEvent.js') ?>"></script>

  <script src="<?= ma_asset('/assets/pages/game_pairings.js') ?>"></script>
</body>
</html>