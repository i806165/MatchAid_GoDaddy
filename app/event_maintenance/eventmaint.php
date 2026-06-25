<?php
// /public_html/app/event_maintenance/eventmaint.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";

// 1) User context hydration
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Portal context
$_SESSION["SessionPortal"] = "ADMIN PORTAL";

// Gate: same convention as Game Maintenance
ServiceUserContext::requireAccessLevel("MEMBER");

// 2) Event context / mode
$modeParam = strtolower(trim((string)($_GET["mode"] ?? "")));
$storedEID = $_SESSION["SessionStoredEID"] ?? "";

$mode = ($modeParam === "add") ? "add" : "edit";
if ($modeParam === "" && trim((string)$storedEID) === "") {
  $mode = "add";
}

try {
  if ($mode === "edit") {
    $ec = ServiceContextEvent::getEventContext();
    $event = $ec["event"];
    $eid = $ec["eid"];
    $authorizations = $ec["authorizations"] ?? [];
  } else {
    $event = ServiceContextEvent::defaultEventForAdd();
    $eid = null;
    $authorizations = ServiceContextEvent::getEventAuthorizations();
  }

  $subtitle = ($mode === "add")
    ? "Add New Event"
    : ("EID " . (string)$eid);

  $initPayload = [
    "ok" => true,
    "mode" => $mode,
    "eid" => $eid,
    "event" => $event,
    "authorizations" => $authorizations,
    "header" => [
      "subtitle" => $subtitle
    ]
  ];
} catch (Throwable $e) {
  Logger::error("EVENTMAINT_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . (defined("MA_ROUTE_EVENTS_HOME") ? MA_ROUTE_EVENTS_HOME : "/app/events_home/eventshome.php"));
  exit;
}

// Provide path constants to JS
$paths = [
  "apiSession"     => MA_ROUTE_API_SESSION,
  "routerApi"      => MA_ROUTE_API_ROUTER,
  "apiEventMaint"  => defined("MA_ROUTE_API_EVENT_MAINT") ? MA_ROUTE_API_EVENT_MAINT : "/api/event_maintenance",
  "apiEventsHome"  => defined("MA_ROUTE_API_EVENTS_HOME") ? MA_ROUTE_API_EVENTS_HOME : "/api/events_home",
];

// Page help
$pageHelpKey = "event_maintenance";
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Event Maintenance</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/event_maintenance.css') ?>" />
</head>
<body>
  <?php include MA_INCLUDES . "/chromeHeader.php"; ?>

  <main class="maPage" role="main">
    <?php include __DIR__ . "/eventmaint_view.php"; ?>
  </main>

  <?php include MA_INCLUDES . "/chromeFooter.php"; ?>

<script>
  window.MA = window.MA || {};

  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router:       window.MA.paths.routerApi,
    login:        <?= json_encode(MA_ROUTE_LOGIN) ?>,
    apiEventMaint: window.MA.paths.apiEventMaint,
    apiEventsHome: window.MA.paths.apiEventsHome
  };
</script>

  <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
  <script src="<?= ma_asset('/assets/pages/event_maintenance.js') ?>"></script>
</body>
</html>
