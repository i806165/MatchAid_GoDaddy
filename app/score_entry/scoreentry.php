<?php
// /public_html/app/score_entry/scoreentry.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_API_LIB . "/Logger.php";

// 1. Authoritative Session Check
$urlKey = trim((string)($_GET['key'] ?? ''));
$scorecardKey = ServiceScoreEntry::getScorecardKey();

if (!$scorecardKey) {
    header("Location: " . MA_ROUTE_SCORE_HOME . ($urlKey ? "?key=$urlKey" : ""));
    exit;
}

// Minimal init payload only.
$initPayload = [
  "ok" => true,
  "scorecardKey" => $scorecardKey,
  "currentHole" => (int)($_SESSION['SessionCurrentHole'] ?? 1),
  "header" => [
    "subtitle" => "Ready to Score"
  ]
];

// Provide path constants to JS (no hard-coded paths in JS)
$paths = [
  "apiSession"      => MA_ROUTE_API_SESSION,
  "routerApi"       => MA_ROUTE_API_ROUTER,
  "apiScoreEntry"   => MA_ROUTE_API_SCORE_ENTRY,
  "apiScoreEntryLaunch" => MA_ROUTE_API_SCORE_ENTRY . "/launch.php",
  "apiScoreHome"    => MA_ROUTE_API_SCORE_HOME,
  "apiScoreCard"    => MA_ROUTE_API_GAME_SCORECARD,
  "apiAdminGames"   => MA_ROUTE_API_ADMIN_GAMES,
  "scoreEntry"      => MA_ROUTE_SCORE_ENTRY,
  "scoreHome"       => MA_ROUTE_SCORE_HOME
];

// Chrome values
$maChromeTitle = "Score Entry";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MatchAid • Score Entry</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/score_entry.css?v=1">
</head>
<body>
  <?php include MA_INCLUDES . "/chromeHeader.php"; ?>

  <main class="maPage" role="main">
    <?php include __DIR__ . "/scoreentry_view.php"; ?>
  </main>

  <?php include MA_INCLUDES . "/chromeFooter.php"; ?>

<script>
  window.MA = window.MA || {};

  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

  // Canonical aliases/pattern
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router: window.MA.paths.routerApi,
    apiScoreEntry: window.MA.paths.apiScoreEntry,
    apiScoreCard: window.MA.paths.apiScoreCard
  };
</script>

  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/pages/score_entry.js"></script>
</body>
</html>