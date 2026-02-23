<?php
// /app/favorite_players/favoriteplayers.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";

Logger::info("FAVPLAYERS_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
  "loginTime" => $_SESSION["SessionLoginTime"] ?? "",
]);

// 1) USER context hydration (Rule-2)
$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}


// Determine launch mode (fresh list vs dual-route entry form)
// Expected session keys (set by router action):
// - SessionFavLaunchMode: "favorites" | "registrations"
// - SessionFavPlayerGHIN: (optional) if present, auto-open form
$launchMode = (string)($_SESSION["SessionFavLaunchMode"] ?? "favorites");
$playerGhin = (string)($_SESSION["SessionFavPlayerGHIN"] ?? "");

// Footer suppressed when entry form is active (both favorites mode and registrations mode per spec)
$footerMode = ($playerGhin !== "") ? "none" : "admin3"; // page JS can also override if needed

// Provide MA.paths
$paths = [
  "apiSession"  => MA_ROUTE_API_SESSION,
  "routerApi"   => MA_ROUTE_API_ROUTER,
  "apiGHIN"     => MA_ROUTE_API_GHIN,

  // Page-specific APIs
  "favPlayersInit"   => "/api/favorite_players/initFavPlayers.php",
  "favPlayersSave"   => "/api/favorite_players/saveFavPlayers.php",
  "favPlayersDelete" => "/api/favorite_players/deleteFavPlayers.php",
  "ghinPlayerSearch" => "/api/GHIN/searchPlayers.php",
];

$initPayload = [
  "ok" => true,
  "launchMode" => $launchMode,
  "playerGHIN" => $playerGhin,
  "footerMode" => $footerMode,
  "header" => [
    "subtitle" => "",
  ],
];


// Chrome vars used by includes
$maChromeLogoUrl = "/assets/images/MatchAidLogoSquare.jpeg";
$maChromeTitleLine1 = "Favorite Players";
$maChromeTitleLine2 = "";
$maChromeTitleLine3 = "";

// Allow chromeFooter.php to read this if your footer supports it
$maChromeFooterMode = $footerMode;
?>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MatchAid • Favorite Players</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/favorite_players.css?v=1">
</head>
<body>
<?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

<!-- Optional Control Area (peer of maPage; does NOT scroll) -->
<div class="maControlArea" id="fpControls">
  <div class="maFieldRow">
    <div class="maField">
      <div class="maInputWrap">
        <input id="fpSearchText" class="maTextInput" type="text" placeholder="Search players..." />
      </div>
    </div>

    <div class="maField" style="flex:0 0 180px;">
      <div class="maInputWrap">
        <select id="fpGroupFilter" class="maTextInput"></select>
      </div>
    </div>
  </div>
</div>

<main class="maPage" role="main">
  <?php include __DIR__ . "/favoriteplayers_view.php"; ?>
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
    apiGHIN: window.MA.paths.apiGHIN
  };
</script>

<script src="/assets/js/ma_shared.js"></script>
<script src="/assets/modules/ghin_player_search.js"></script>
<script src="/assets/pages/favorite_players.js"></script>

</body>
</html>

