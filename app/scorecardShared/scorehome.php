<?php
declare(strict_types=1);
// /public_html/app/score_home/scorehome.php

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

// 1. Capture incoming key from URL (Delivery)
$urlKey = trim((string)($_GET['key'] ?? ''));
$targetGGID = null;

if ($urlKey !== "") {
    $players = ServiceDbPlayers::getPlayersByPlayerKey($urlKey);
    if ($players && isset($players[0]['dbPlayers_GGID'])) {
        $targetGGID = (int)$players[0]['dbPlayers_GGID'];
    }
}

if (!$targetGGID) {
    $targetGGID = ServiceContextGame::getStoredGGID();
}

// 2. The Extra GGID Check: Reset pod if switching games or keys
$activeScoringGGID = ServiceUserContext::getScoringPodGGID();
$sessionKey = ServiceUserContext::getScorecardKey();

if ($targetGGID && ($targetGGID !== $activeScoringGGID || ($urlKey !== "" && $urlKey !== $sessionKey))) {
    ServiceUserContext::clearScoringSession();
    ServiceUserContext::setScoringPodGGID($targetGGID);
    ServiceContextGame::setGameContext($targetGGID);
}

$scorerGHIN = ServiceUserContext::getEffectivePlayerGHIN();

// 3. If we have a full session, we are in "Hot" state (Resume possible)
$isResumeReady = ($sessionKey !== null && $scorerGHIN !== null);

// 4. Auto-Resume Logic: If round is active, bypass launch and go to entry
if ($isResumeReady && $urlKey === "") {
    header("Location: " . MA_ROUTE_SCORE_ENTRY);
    exit;
}

// 4. Prepare the boot payload
$initPayload = [
    "ok" => true,
    "urlKey" => $urlKey,
    "sessionKey" => $sessionKey,
    "scorerGHIN" => $scorerGHIN,
    "isResumeReady" => $isResumeReady,
    "header" => [
        "subtitle" => $isResumeReady ? "Ready to Play" : "Scoring Setup"
    ]
];

$maChromeTitle = "Scoring Home";
$maChromeSubtitle = $initPayload["header"]["subtitle"];
?>
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MatchAid — Scoring Home</title>
<link rel="stylesheet" href="/assets/css/ma_shared.css" />
<link rel="stylesheet" href="/assets/css/scorehome.css" />
</head><body>
<?php require MA_INCLUDES . '/chromeHeader.php'; ?>
<main class="maPage"><?php require __DIR__ . '/scorehome_view.php'; ?></main>
<?php require MA_INCLUDES . '/chromeFooter.php'; ?>
<script>
  window.MA = window.MA || {};
  window.__INIT__ = <?= json_encode($initPayload) ?>;
  window.MA.routes = { apiScoreEntry: '/api/score_entry' };
</script>
<script src="/assets/js/ma_shared.js"></script>
<script src="/assets/pages/scorehome.js"></script>
</body></html>