<?php
// /public_html/app/score_entry/scoreentry.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";

Logger::info("SCOREENTRY_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "scorecardKey" => $_GET["key"] ?? "",
  "storedGGID" => $_SESSION["SessionStoredGGID"] ?? "",
]);

// Optional incoming scorecard key from URL
$scorecardKey = trim((string)($_GET["key"] ?? ""));

// Minimal init payload only.
// Score Entry uses split hydration (page shell first, launch/group load via endpoint).
$initPayload = [
  "ok" => true,
  "scorecardKey" => $scorecardKey,
  "header" => [
    "subtitle" => "Enter ScoreCard ID"
  ]
];

// Provide path constants to JS (no hard-coded paths in JS)
$paths = [
  "apiSession"      => MA_ROUTE_API_SESSION,
  "routerApi"       => MA_ROUTE_API_ROUTER,
  "apiScoreEntry"   => MA_ROUTE_API_SCORE_ENTRY,
  "apiScoreEntryLaunch" => MA_ROUTE_API_SCORE_ENTRY . "/launch.php",
  "apiScoreCard"    => MA_ROUTE_API_GAME_SCORECARD
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