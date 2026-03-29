<?php
declare(strict_types=1);
// /public_html/app/score_home/scorehome.php

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

// 1. Capture incoming context
$urlKey = trim((string)($_GET['key'] ?? ''));
$targetGGID = null;

// Resolve GGID from URL key if provided
if ($urlKey !== "") {
    $players = ServiceDbPlayers::getPlayersByPlayerKey($urlKey);
    if ($players && isset($players[0]['dbPlayers_GGID'])) {
        $targetGGID = (int)$players[0]['dbPlayers_GGID'];
    }
}
if (!$targetGGID) {
    $targetGGID = ServiceContextGame::getStoredGGID();
}

// 2. Extra GGID Check: Reset pod if switching games or keys
$activeScoringGGID = ServiceScoreEntry::getScoringPodGGID();
$sessionKey = ServiceScoreEntry::getScorecardKey();

if ($targetGGID && ($targetGGID !== $activeScoringGGID || ($urlKey !== "" && $urlKey !== $sessionKey))) {
    ServiceScoreEntry::clearScoringSession();
    ServiceScoreEntry::setScoringPodGGID($targetGGID);
    ServiceContextGame::setGameContext($targetGGID);
}

$scorerGHIN = ServiceScoreEntry::getEffectivePlayerGHIN();
$sessionKey = ServiceScoreEntry::getScorecardKey();
$isResumeReady = ($sessionKey !== null && $scorerGHIN !== null);

// 3. Auto-Resume Logic
if ($isResumeReady && $urlKey === "") {
    header("Location: " . MA_ROUTE_SCORE_ENTRY);
    exit;
}

// 4. Build payload
$initPayload = [
    "ok" => true,
    "urlKey" => $urlKey,
    "isResumeReady" => $isResumeReady,
    "header" => ["subtitle" => $isResumeReady ? "Ready to Play" : "Scoring Setup"]
];
?>
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MatchAid — Scoring Home</title>
<link rel="stylesheet" href="/assets/css/ma_shared.css" />
</head><body>
<?php require MA_INCLUDES . '/chromeHeader.php'; ?>
<main class="maPage"><?php require __DIR__ . '/scorehome_view.php'; ?></main>
<?php require MA_INCLUDES . '/chromeFooter.php'; ?>
<script>window.__INIT__ = <?= json_encode($initPayload) ?>;</script>
<script src="/assets/js/ma_shared.js"></script>
<script src="/assets/pages/scorehome.js"></script>
</body></html>