<?php
// /public_html/app/game_summary/gamesummary.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

Logger::info("GAMESUMMARY_ENTRY", [
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
$gc = ServiceContextGame::getGameContext();

Logger::info("GAMESUMMARY_CTX_DEBUG", [
  "ok" => !empty($gc["game"]),
  "ggid" => $gc["ggid"] ?? "missing",
  "hasGame" => !empty($gc["game"])
]);

if (!$gc || empty($gc["game"])) {
  // If game context is missing, route back to Admin Games List (safe default)
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

try {
  require_once MA_API . "/game_summary/initGameSummary.php";
  $initPayload = buildGameSummaryInit($ctx, $gc);
  if (empty($initPayload["ok"])) {
    // Hard failure: treat as context error
    header("Location: " . MA_ROUTE_LOGIN);
    exit;
  }
} catch (Throwable $e) {
  Logger::error("GAMESUMMARY_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Provide path constants to JS (no hard-coded paths in JS)
$paths = [
  "apiSession"     => MA_ROUTE_API_SESSION,
  "routerApi"      => MA_ROUTE_API_ROUTER,
  "apiGHIN"        => MA_ROUTE_API_GHIN,
  "apiGameSummary" => "/api/game_summary/initGameSummary.php",
];

// Chrome values
$maChromeTitle = "Game Summary";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MatchAid - Game Summary</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css?v=1" />
  <link rel="stylesheet" href="/assets/css/game_summary.css?v=1" />
</head>
<body>

  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <!-- CONTROLS BAND (peer to body standard) -->
  <div class="maControlArea" id="gsControls" aria-label="Game Summary Controls">

    <!-- Collapsible: Game Configuration -->
    <button type="button"
            class="gsCfgToggle"
            id="gsCfgToggle"
            aria-expanded="false">
      <span class="gsCfgTitle">Game Settings</span>
      <span class="gsCfgChevron" aria-hidden="true">▾</span>
    </button>

    <div class="gsCfgPanel" id="gsCfgPanel" hidden>
      <div class="gsConfigGrid" id="configGrid"></div>
    </div>

    <!-- Scope + Meta pills row -->
    <div class="gsControlsRow">
      <div class="maSeg gsScopeSeg" role="tablist" aria-label="Roster Scope">
        <button type="button" class="maSegBtn is-active" id="scopeByPlayer" aria-selected="true">By Player</button>
        <button type="button" class="maSegBtn" id="scopeByGroup" aria-selected="false">By Group</button>
      </div>

      <div class="maPills gsMetaPills" aria-label="Game quick stats">
        <div class="maPill maPillKV" role="group" aria-label="Players">
          <div class="maPillLabel">Players</div>
          <div class="maPillValue maListRow__col--muted" id="gsMetaPlayers">—</div>
        </div>

        <div class="maPill maPillKV" role="group" aria-label="Holes">
          <div class="maPillLabel">Holes</div>
          <div class="maPillValue maListRow__col--muted" id="gsMetaHoles">—</div>
        </div>

        <div class="maPill maPillKV" role="group" aria-label="HC Method">
          <div class="maPillLabel">HC</div>
          <div class="maPillValue maListRow__col--muted" id="gsMetaHC">—</div>
        </div>
      </div>
    </div>
  </div>

  <main class="maPage" role="main">
    <?php include __DIR__ . "/gamesummary_view.php"; ?>
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
    apiGameSummary: window.MA.paths.apiGameSummary
  };
</script>

  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/modules/actions_menu.js?v=1"></script>
  <script src="/assets/modules/composeEmail.js?v=1"></script>
  <script src="/assets/pages/game_summary.js"></script>
</body>
</html>
