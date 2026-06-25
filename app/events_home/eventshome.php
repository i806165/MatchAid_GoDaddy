<?php
// /public_html/app/events_home/eventshome.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/workflows/hydrateEventsList.php';
require_once MA_API_LIB . '/Logger.php';

$config = ma_config();

// Portal context
$_SESSION["SessionPortal"] = "ADMIN PORTAL";

// Validate session/user context
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Gate: use same convention as Admin Games
ServiceUserContext::requireAccessLevel("MEMBER");

// Pull frequently-used values from session
$ghinId     = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$clubId     = trim((string)($_SESSION["SessionClubID"] ?? ""));
$clubName   = trim((string)($_SESSION["SessionClubName"] ?? ""));
$userToken  = trim((string)($_SESSION["SessionUserToken"] ?? ""));
$adminToken = trim((string)($_SESSION["SessionAdminToken"] ?? ""));

// Build the context array expected by hydrateEventsList
$context = [
  "adminToken"  => $adminToken,
  "userToken"   => $userToken,
  "userProfile" => $ctx["profile"] ?? null,
  "userGHIN"    => $ghinId,
  "clubId"      => $clubId,
  "clubName"    => $clubName,
];

// Restore simple Events Home mode, default current
$mode = strtolower(trim((string)($_SESSION["EH_FILTER_MODE"] ?? "current")));
if (!in_array($mode, ["current", "past", "all"], true)) {
  $mode = "current";
}

// Hydrate INIT payload
$init = hydrateEventsList($context, [
  "mode" => $mode,
]);

// Optional page help key
$pageHelpKey = "events_home";

// JS path contract expected by ma_shared.js/routerGo()
$paths = [
  "routerApi"     => MA_ROUTE_API_ROUTER,
  "apiEventsHome" => defined('MA_ROUTE_API_EVENTS_HOME') ? MA_ROUTE_API_EVENTS_HOME : "/api/events_home",
  "apiSession"    => MA_ROUTE_API_SESSION,
];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>MatchAid Events</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>">
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/events_home.css') ?>">
</head>

<body>
<?php require MA_INCLUDES . '/chromeHeader.php'; ?>

<main class="maPage maPage--eventsHome">
  <?php require __DIR__ . '/eventshome_view.php'; ?>
</main>

<?php require MA_INCLUDES . '/chromeFooter.php'; ?>

<script>
window.MA = window.MA || {};

window.MA.paths = <?= json_encode(
  $paths,
  JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
) ?>;

window.__INIT__ = <?= json_encode(
  $init,
  JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
) ?>;

window.__MA_INIT__ = window.__INIT__;

window.MA.routes = {
  router: window.MA.paths.routerApi,
  apiEventsHome: window.MA.paths.apiEventsHome,
  apiSession: window.MA.paths.apiSession
};
</script>

<script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
<script src="<?= ma_asset('/assets/pages/events_home.js') ?>"></script>
</body>
</html>