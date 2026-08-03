<?php
declare(strict_types=1);
// /public_html/app/event_summary/eventsummary.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_API . "/event_summary/initEventSummary.php";

try {
    $ec = ServiceContextEvent::getEventContext();
    $eid = $ec["eid"] ?? null;
    $event = $ec["event"] ?? null;

    if (!$eid || !$event) {
      throw new RuntimeException("Missing event context.");
    }

    $initPayload = buildEventSummaryInit([], $ec);
    // ok:false here (no roster / no rounds / no scoreable rounds) is now
    // an expected, renderable state — NOT thrown/redirected. The page
    // still renders with $initPayload intact; event_summary.js detects
    // init.ok === false client-side and shows a dismissible MA.ui.confirm
    // popup, routing to eventrounds on acknowledgment. Previously this
    // threw here and hard-redirected via the catch block below before the
    // page (and therefore that JS) ever loaded — silently bouncing the
    // user away instead of explaining why.

    $initPayload["eid"] = (int)$eid;
  } catch (Throwable $e) {
    Logger::error("EVENTSUMMARY_INIT_FAIL", ["err" => $e->getMessage()]);
    // UNCONFIRMED — mirrors scoresummary.php's MA_ROUTE_ADMIN_GAMES
    // fallback exactly, but MA_ROUTE_ADMIN_EVENTS itself was never
    // confirmed to exist this session. Replace with the real route
    // constant if it differs.
    header("Location: " . MA_ROUTE_ADMIN_EVENTS);
    exit;
}

$maChromeTitle = "Event Leaderboard";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
?>
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>MatchAid — Event Leaderboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
<link rel="stylesheet" href="<?= ma_asset('/assets/css/event_summary.css') ?>" />
</head><body>
<?php require_once MA_INCLUDES . '/chromeHeader.php'; ?>
<div id="esPanelControls" class="maControlArea" role="region" aria-label="Leaderboard views">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
    <div id="esMetricPills" class="maChoiceChips" role="group" aria-label="Switch gross/net"></div>
    <div id="esViewPills" class="maChoiceChips" role="group" aria-label="Switch view"></div>
  </div>
</div>
<main class="maPage" id="esMain"><?php require __DIR__ . '/eventsummary_view.php'; ?></main>
<?php require_once MA_INCLUDES . '/chromeFooter.php'; ?>

<?php
// Row catalog for module_menuEventSettings.js — see eventmaint.php's
// identical include for the full rationale.
require_once MA_INCLUDES . '/eventSettingsMenuRows.php';
?>

<script>
  window.MA = window.MA || {};
  window.MA.paths = { routerApi: "<?= MA_ROUTE_API_ROUTER ?>" };
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = { router: window.MA.paths.routerApi };
</script>
<script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>

<!-- Event Settings menu + its four rows. None of these were loaded on
     this page before — Event Leaderboard had no prior settings access.
     actions_menu.js was never loaded here either; not added, since none
     of these five modules depend on it (confirmed against
     module_menuGameSettings.js's own dependency list). -->
<script src="<?= ma_asset('/assets/modules/module_setEventPlacementPoints.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_setHandicapsGameEvent.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_defineTeamsGameEvent.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_defineFlightsGameEvent.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_menuEventSettings.js') ?>"></script>

<script src="<?= ma_asset('/assets/pages/event_summary.js') ?>"></script>
</body></html>
