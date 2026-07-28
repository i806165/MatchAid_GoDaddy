<?php
declare(strict_types=1);
// /public_html/app/event_scorecard/eventscorecard.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_API . "/scorecardShared/initSharedScoreCard.php";

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
    header("Location: " . MA_ROUTE_LOGIN);
    exit;
}

try {
    $ec    = ServiceContextEvent::getEventContext();
    $event = $ec["event"] ?? [];
    $eid   = (int)($ec["eid"] ?? 0);

    // Round list — same source the round selector's Switch Round menu
    // reads from client-side (init.rounds), and the same source
    // initEventScorecard.php validates every subsequent round-switch
    // request against server-side. Single source of truth for
    // "which ggids belong to this event."
    $roundsResult = ServiceDbGames::queryEventGames($eid);
    $rounds = $roundsResult["games"]["vm"] ?? [];

    if (!$rounds) {
        throw new RuntimeException("Event has no rounds.");
    }

    // Default round: first by EventRoundNo ascending — queryEventGames()
    // already sorts this way, so the first row IS the default.
    $defaultGgid = (string)($rounds[0]["ggid"] ?? "");
    if ($defaultGgid === "") {
        throw new RuntimeException("Default round has no GGID.");
    }

    // First-paint hydration happens here, server-side, through the same
    // shared function initEventScorecard.php calls for every subsequent
    // round switch — one hydration path, two entry points (page load vs.
    // client fetch), never duplicated logic.
    $scorecardPayload = initSharedScoreCard($defaultGgid, "game", "");
    if (empty($scorecardPayload["ok"])) {
        throw new RuntimeException(
            "Unable to load scorecards for default round: " .
            (string)($scorecardPayload["error"] ?? "unknown")
        );
    }

    $initPayload = [
        "ok"               => true,
        "eid"              => $eid,
        "event"            => $event,
        "rounds"           => $rounds,
        "ggid"             => $defaultGgid,
        "scorecardPayload" => $scorecardPayload,
        "portal"           => $_SESSION["SessionPortal"] ?? "ADMIN PORTAL",
    ];

} catch (Throwable $e) {
    Logger::error("EVENT_SCORECARD_INIT_FAIL", [
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
    "routerApi"           => MA_ROUTE_API_ROUTER,
    "initEventScorecard"  => MA_ROUTE_API_EVENT_SCORECARD . "/initEventScorecard.php",
];

$maChromeTitle    = "Event Scorecards";
$maChromeSubtitle = trim((string)($event["dbEvents_Title"] ?? "Event"));

$pageHelpKey = ServicePageHelp::keyFromControllerFile(__FILE__);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>MatchAid — Event Scorecards</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">

<link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
</head>
<body>
<?php require_once MA_INCLUDES . '/chromeHeader.php'; ?>

<div id="esControls" class="maControlArea"></div>

<main class="maPage" id="esPage">
<?php require __DIR__ . '/eventscorecard_view.php'; ?>
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
<script src="<?= ma_asset('/assets/modules/module_renderScoreCards.js') ?>"></script>
<script src="<?= ma_asset('/assets/pages/event_scorecard.js') ?>"></script>
</body>
</html>
