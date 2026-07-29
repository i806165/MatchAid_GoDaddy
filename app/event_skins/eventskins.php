<?php
declare(strict_types=1);
// /public_html/app/event_skins/eventskins.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_API . "/event_skins/initEventSkins.php";

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
    header("Location: " . MA_ROUTE_LOGIN);
    exit;
}

try {
  $ec    = ServiceContextEvent::getEventContext();
  $event = $ec["event"] ?? [];
  $eid   = (int)($ec["eid"] ?? 0);

  $roundsResult = ServiceDbGames::queryEventGames($eid);
  $rounds = $roundsResult["games"]["vm"] ?? [];
  if (!$rounds) {
    throw new RuntimeException("Event has no rounds.");
  }

  // Default: first round, ascending EventRoundNo — same convention as
  // eventscorecard.php. NOT "ALL" by default — a single round's
  // champions is the more common first-look, "All Rounds" is an
  // explicit pick via the round selector.
  $defaultSelection = (string)($rounds[0]["ggid"] ?? "");
  if ($defaultSelection === "") {
    throw new RuntimeException("Default round has no GGID.");
  }

  // First-paint hydration, server-side, through the same shared function
  // initEventSkins.php calls for every subsequent round switch.
  $skinsPayload = buildHoleChampionsPayload($defaultSelection, $eid, $event);
  if (empty($skinsPayload["ok"])) {
    throw new RuntimeException(
      "Unable to load hole champions: " . (string)($skinsPayload["error"] ?? "unknown")
    );
  }

  $initPayload = [
    "ok"           => true,
    "eid"          => $eid,
    "event"        => $event,
    "rounds"       => $rounds,
    "selection"    => $defaultSelection,
    "skinsPayload" => $skinsPayload,
    "portal"       => $_SESSION["SessionPortal"] ?? "ADMIN PORTAL",
  ];

} catch (Throwable $e) {
  Logger::error("EVENT_SKINS_INIT_FAIL", [
    "err"  => $e->getMessage(),
    "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
    "eid"  => $_SESSION["SessionStoredEID"]   ?? "",
  ]);

  $routerUrl = MA_ROUTE_API_ROUTER . '?' . http_build_query([
    'action'   => 'home',
    'redirect' => '1',
  ]);
  header("Location: " . $routerUrl);
  exit;
}

$paths = [
    "routerApi"      => MA_ROUTE_API_ROUTER,
    "initEventSkins" => MA_ROUTE_API_EVENT_SKINS . "/initEventSkins.php",
];

$maChromeTitle    = "Hole Champions";
$maChromeSubtitle = trim((string)($event["dbEvents_Title"] ?? "Event"));

$pageHelpKey = ServicePageHelp::keyFromControllerFile(__FILE__);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>MatchAid — Hole Champions</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">

<link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
</head>
<body>
<?php require_once MA_INCLUDES . '/chromeHeader.php'; ?>

<div id="esControls" class="maControlArea"></div>

<main class="maPage" id="esPage">
<?php require __DIR__ . '/eventskins_view.php'; ?>
</main>

<?php require_once MA_INCLUDES . '/chromeFooter.php'; ?>

<?php if (!empty($pageHelpKey)) ServicePageHelp::renderByKey($pageHelpKey); ?>

<script>
  window.MA = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = Object.assign({}, window.MA.routes || {}, {
    router: window.MA.paths.routerApi
  });
</script>

<script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_renderHoleChampions.js') ?>"></script>
<script src="<?= ma_asset('/assets/pages/event_skins.js') ?>"></script>
</body>
</html>
