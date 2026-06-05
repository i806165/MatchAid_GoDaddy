<?php
declare(strict_types=1);
// /public_html/app/score_home/scorehome.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

// 1. Capture incoming context
$urlKey    = trim((string)($_GET['key'] ?? ''));
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

// 2. Reset pod if switching games or keys
$activeScoringGGID = ServiceScoreEntry::getScoringPodGGID();
$sessionKey        = ServiceScoreEntry::getScorecardKey();

if ($targetGGID && ($targetGGID !== $activeScoringGGID || ($urlKey !== "" && $urlKey !== $sessionKey))) {
    ServiceScoreEntry::clearScoringSession();
    ServiceScoreEntry::setScoringPodGGID($targetGGID);
    ServiceContextGame::setGameContext($targetGGID);
}

// 3. Read current session state
$scorerGHIN = ServiceScoreEntry::getEffectivePlayerGHIN();
$sessionKey = ServiceScoreEntry::getScorecardKey();

// 4. Auto-scorer: resolve from session login when available
//    (mirrors logic in score_home.js — kept in sync here for the PHP payload)
$sessionGhin  = $_SESSION["SessionGHINLogonID"] ?? "";
$sessionPortal = $_SESSION["SessionPortal"] ?? "";
$autoScorerGhin = "";

if ($sessionGhin !== "" && $sessionPortal === "PLAYER PORTAL") {
    // Verify membership at render time only if we have a session key
    if ($sessionKey !== null) {
        $groupPlayers = ServiceDbPlayers::getPlayersByPlayerKey($sessionKey);
        $isMember = false;
        foreach (($groupPlayers ?? []) as $p) {
            if ((string)($p['dbPlayers_PlayerGHIN'] ?? '') === $sessionGhin) {
                $isMember = true;
                break;
            }
        }
        if ($isMember) $autoScorerGhin = $sessionGhin;
    }
} elseif ($sessionGhin !== "" && $sessionPortal === "ADMIN PORTAL") {
    $autoScorerGhin = $sessionGhin;
}

// 5. Build paths and payload
$paths = [
    "apiScoreHome"    => MA_ROUTE_API_SCORE_HOME,
    "apiGameSettings" => MA_ROUTE_API_GAME_SETTINGS,
    "scoreEntry"      => MA_ROUTE_SCORE_ENTRY,
    "routerApi"       => MA_ROUTE_API_ROUTER,
    "scoreHome"       => MA_ROUTE_SCORE_HOME,
];

$initPayload = [
    "ok"             => true,
    "urlKey"         => $urlKey,
    "portal"         => $sessionPortal,
    "sessionGhin"    => $sessionGhin,
    "autoScorerGhin" => $autoScorerGhin,
    // scorerGHIN: the currently persisted scorer for this pod (null if not yet set)
    "scorerGHIN"     => $scorerGHIN,
    // sessionKey: the current scorecard key (null if no pod established)
    "sessionKey"     => $sessionKey,
];

$maChromeTitle    = "Scoring Home";
$maChromeSubtitle = "Score Entry";
?>
<!DOCTYPE html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>MatchAid — Scoring Home</title>
<link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
<link rel="stylesheet" href="<?= ma_asset('/assets/css/score_home.css') ?>" />
</head><body>
<?php require MA_INCLUDES . '/chromeHeader.php'; ?>
<main class="maPage">
<?php require __DIR__ . '/scorehome_view.php'; ?>
</main>
<?php require MA_INCLUDES . '/chromeFooter.php'; ?>
<script>
  window.MA = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES) ?>;
  window.__INIT__ = <?= json_encode($initPayload) ?>;
</script>
<script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_DisplayGameFormat.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_BlindPlayer.js') ?>"></script>
<script src="<?= ma_asset('/assets/pages/score_home.js') ?>"></script>
</body></html>