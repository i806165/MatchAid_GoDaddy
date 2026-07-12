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
    if (empty($initPayload["ok"])) {
      throw new RuntimeException((string)($initPayload["message"] ?? "Unable to initialize event summary."));
    }

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
<script>
  window.MA = window.MA || {};
  window.MA.paths = { routerApi: "<?= MA_ROUTE_API_ROUTER ?>" };
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = { router: window.MA.paths.routerApi };
</script>
<script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
<script src="<?= ma_asset('/assets/pages/event_summary.js') ?>"></script>
</body></html>
