<?php
// /public_html/app/admin_home/adminhome.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/workflows/hydrateAdminGamesList.php';
require_once MA_SERVICES . '/workflows/workflow_hydrateEventsList.php';
require_once MA_API_LIB . '/Logger.php';

$config = ma_config();

// Portal context (required convention)
$_SESSION["SessionPortal"] = "ADMIN PORTAL";

// ------------------------------------------------------------
// 1) READ user context here (Rule-2)
//    - Each protected page validates session context
//    - If not OK, route to login entry (do not proceed)
//    - If OK, rely on session vars (no profile parsing here)
// ------------------------------------------------------------
$ctx = ServiceUserContext::getUserContext(); // hydrates session vars if needed
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Gate — only members may not access the admin portal
ServiceUserContext::requireAccessLevel("MEMBER");

// Pull “frequently used” values from session
$ghinId     = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$clubId     = trim((string)($_SESSION["SessionClubID"] ?? ""));
$clubName   = trim((string)($_SESSION["SessionClubName"] ?? ""));
$userToken  = trim((string)($_SESSION["SessionUserToken"] ?? ""));
$adminToken = trim((string)($_SESSION["SessionAdminToken"] ?? ""));

// Build the context array expected by hydrateAdminGamesList
$context = [
  "adminToken"  => $adminToken,
  "userToken"   => $userToken,
  "userProfile" => $ctx["profile"] ?? null, // optional; do NOT derive club here
  "userGHIN"    => $ghinId,
  "clubId"      => $clubId,
  "clubName"    => $clubName,
];

// 2) Default filters
//    - First-time fresh: use hard-coded presets (today → today+30, ME)
//    - Return to page: if AP_* session filters exist, restore those
//    - Event mode: if SessionStoredEID is set, bypass all filter logic

// --- EVENT MODE DETECTION ---
$eid = (int)($_SESSION["SessionStoredEID"] ?? 0);
$isEventMode = ($eid > 0);
$initialPanel = "games"; // overridden below in standalone mode when ?mode=events
if ($isEventMode) {
  require_once MA_SERVICES . '/context/service_ContextEvent.php';
  $defaultFilters = ["eid" => $eid];
  $initPayload = hydrateAdminGamesList($context, $defaultFilters);
  $initPayload['portal'] = $_SESSION["SessionPortal"];
} else {
$today  = new DateTimeImmutable("today");
$plus30 = $today->modify("+30 days");

// Hard-coded "fresh" defaults
$defaultMode = "current";
$defaultDateFrom = $today->format("Y-m-d");
$defaultDateTo   = $plus30->format("Y-m-d");
$defaultScope    = "ME";
$defaultSelected = [ strval($context["userGHIN"] ?? "") ];

// Session restore (Return path)
$sessDf    = trim((string)($_SESSION["AP_FILTERDATEFROM"] ?? ""));
$sessDt    = trim((string)($_SESSION["AP_FILTERDATETO"] ?? ""));
$sessScope = strtoupper(trim((string)($_SESSION["AP_FILTERADMINSCOPE"] ?? "")));
if (!in_array($sessScope, ["ME", "ALL", "CUSTOM"], true)) $sessScope = "";

// AP_FILTER_ADMINS is stored as JSON array string
$sessAdminsJson = (string)($_SESSION["AP_FILTER_ADMINS"] ?? "");
$sessAdmins = [];
if ($sessAdminsJson !== "") {
  $tmp = json_decode($sessAdminsJson, true);
  if (is_array($tmp)) $sessAdmins = array_values(array_filter(array_map("strval", $tmp)));
}

// Decide fresh vs return:
// - If we have BOTH dates and a scope in session, treat as "Return"
$isReturn = ($sessDf !== "" && $sessDt !== "" && $sessScope !== "");

if ($isReturn) {
  $dateFrom = $sessDf;
  $dateTo   = $sessDt;
  $scope    = $sessScope;
  $selected = !empty($sessAdmins) ? $sessAdmins : $defaultSelected;

  // Infer "mode" from the restored window (only used for fallback windows)
  $mode = ($dateTo < $today->format("Y-m-d")) ? "past" : "current";

  $defaultFilters = [
    "mode" => $mode,
    "dateFrom" => $dateFrom,
    "dateTo" => $dateTo,
    "adminScope" => $scope,
    "selectedAdminKeys" => $selected,
  ];
} else {
  $defaultFilters = [
    "mode" => $defaultMode,
    "dateFrom" => $defaultDateFrom,
    "dateTo" => $defaultDateTo,
    "adminScope" => $defaultScope,
    "selectedAdminKeys" => $defaultSelected,
  ];
}

// 3) Hydrate INIT payload (admins + games + header)
$initPayload = hydrateAdminGamesList($context, $defaultFilters);
$initPayload['portal'] = $_SESSION["SessionPortal"];

// 4) Hydrate the Events panel (doorway shows both panels side-by-side/tabbed).
//    Mirrors eventshome.php's mode restore (default "current").
$evMode = strtolower(trim((string)($_SESSION["EH_FILTER_MODE"] ?? "current")));
if (!in_array($evMode, ["current", "past", "all"], true)) $evMode = "current";

$eventsContext = [
  "adminToken"  => $adminToken,
  "userToken"   => $userToken,
  "userProfile" => $ctx["profile"] ?? null,
  "userGHIN"    => $ghinId,
  "clubId"      => $clubId,
  "clubName"    => $clubName,
];
$eventsInitPayload = hydrateEventsList($eventsContext, ["mode" => $evMode]);
$initPayload['eventsInit'] = $eventsInitPayload;

// 5) Initial panel selection.
//    Priority order:
//    a) ?mode=events query param (pageRouter "eventhome" action) — one-shot
//    b) ADMIN_PANEL_VIEW session var (user's persisted preference)
//    c) Default: "both"
$savedPanelView = strtolower(trim((string)($_SESSION["ADMIN_PANEL_VIEW"] ?? "")));
if (!in_array($savedPanelView, ["games", "events", "both"], true)) {
  $savedPanelView = "both";
}

// ?mode=events overrides the saved preference for this load only
// (used by pageRouter "eventhome" action to land on the Events panel)
if (strtolower(trim((string)($_GET['mode'] ?? ''))) === 'events') {
  $initialPanel = 'events';
} else {
  $initialPanel = $savedPanelView;
}
$initPayload['initialPanel'] = $initialPanel;

} // end standalone mode

// Provide path constants to JS
$paths = [
  "apiAdminGames"   => MA_ROUTE_API_ADMIN_GAMES,
  "apiEventsHome"   => defined('MA_ROUTE_API_EVENTS_HOME') ? MA_ROUTE_API_EVENTS_HOME : "/api/events_home",
  "apiSetPanelView" => MA_ROUTE_API_ADMIN_GAMES . "/setPanelView.php",
  "apiSession"      => MA_ROUTE_API_SESSION,
  "routerApi"       => MA_ROUTE_API_ROUTER,
  "apiNotify"       => MA_ROUTE_API_MESSAGING,
  "apiRosterView"   => MA_ROUTE_API_ROSTER_VIEW,
  "siteUrl"         => MA_SITE_URL,
];

// Chrome values
$maChromeTitle    = "Administrators Portal";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl  = null; // reserve slot; set later if desired

// Page help — key derived from this controller's filename
$pageHelpKey = ServicePageHelp::keyFromControllerFile(__FILE__);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Admin Games</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/admin_home.css?v=1">

</head>
<body>
  <?php include __DIR__ . '/../../includes/chromeHeader.php'; ?>

  <?php if (!$isEventMode): ?>
  <div id="ahTabs" class="maControlArea" role="region" aria-label="Portal panels">
    <div class="maSeg" role="tablist" aria-label="Switch panel">
      <button class="maSegBtn<?= $initialPanel === 'games' ? ' is-active' : '' ?>" data-tab="games" type="button" role="tab" aria-selected="<?= $initialPanel === 'games' ? 'true' : 'false' ?>">Games</button>
      <button class="maSegBtn<?= $initialPanel === 'events' ? ' is-active' : '' ?>" data-tab="events" type="button" role="tab" aria-selected="<?= $initialPanel === 'events' ? 'true' : 'false' ?>">Events</button>
      <button class="maSegBtn ahTabBoth<?= $initialPanel === 'both' ? ' is-active' : '' ?>" data-tab="both" type="button" role="tab" aria-selected="<?= $initialPanel === 'both' ? 'true' : 'false' ?>">Both</button>
    </div>
  </div>
  <?php endif; ?>

  <main class="maPage<?= !$isEventMode ? ' maPage--multi maPage--adminHome' : '' ?><?= ($initialPanel === 'events') ? ' is-events-open' : '' ?>" role="main">
    <?php include __DIR__ . '/adminhome_view.php'; ?>
  </main>

  <?php include __DIR__ . '/../../includes/chromeFooter.php'; ?>

  <?php
  // Render help modal into the DOM (hidden until ? button is clicked)
  if (!empty($pageHelpKey)) {
      ServicePageHelp::renderByKey($pageHelpKey);
  }
  ?>
  
<script>
  window.MA = window.MA || {};

  // Existing (keep)
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

  // Aliases for the newer pattern (add)
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router: window.MA.paths.routerApi,
    apiAdminGames: window.MA.paths.apiAdminGames,
    apiEventsHome: window.MA.paths.apiEventsHome,
    apiSetPanelView: window.MA.paths.apiSetPanelView
  };
</script>

  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/modules/actions_menu.js?v=1"></script>
  <script src="/assets/modules/addCalendar.js?v=1"></script>
  <script src="/assets/modules/composeEmail.js?v=1"></script>
  <script src="/assets/modules/player_notifications.js?v=1"></script>
  <script src="/assets/modules/game_players_display.js?v=1"></script>
  <script src="/assets/modules/pageHelp.js?v=1"></script>
  <script src="/assets/modules/module_sourceGames.js?v=1"></script>
  <script src="/assets/modules/module_sourceEvents.js?v=1"></script>
  <script src="/assets/pages/admin_home.js"></script>
</body>
</html>