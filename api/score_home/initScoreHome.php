<?php
declare(strict_types=1);
// /public_html/api/score_home/initScoreHome.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

$input = ma_json_in();
$key   = strtoupper(trim((string)($input['playerKey'] ?? '')));

$players = ServiceDbPlayers::getPlayersByPlayerKey($key);
if (!$players) {
    ma_respond(404, ['ok' => false, 'message' => 'ID not found']);
}

$ggid = (int)$players[0]['dbPlayers_GGID'];
ServiceScoreEntry::setScoringPodGGID($ggid);
ServiceScoreEntry::setScorecardKey($key);
ServiceContextGame::setGameContext($ggid);

$gc      = ServiceContextGame::getGameContext();
$gameRow = $gc['game'] ?? null;

$isGameDay = $gameRow ? ServiceScoreEntry::isScoreEntryAllowedToday($gameRow) : false;
$canSave   = true; // Bypass game-day check (testing mode)

// --- hasScores: true if any player in the group has recorded at least one hole ---
$hasScores = false;
foreach ($players as $p) {
    $scoresJson = $p['dbPlayers_Scores'] ?? null;
    if ($scoresJson) {
        $decoded = is_string($scoresJson) ? json_decode($scoresJson, true) : $scoresJson;
        $holesPlayed = (int)($decoded['Scores'][0]['number_of_played_holes'] ?? 0);
        if ($holesPlayed > 0) {
            $hasScores = true;
            break;
        }
    }
}

// --- scorerGHIN: currently persisted scorer for this pod ---
$scorerGHIN = ServiceScoreEntry::getEffectivePlayerGHIN();

// --- cartAssignments: derive from persisted PairingID/PairingPos on player rows ---
// If PairingPos is set (non-null, non-empty) on any player, carts have been configured.
// We return a map of GHIN => { pairingId, pairingPos } so the JS can restore sheet state.
$cartAssignments = null;
$anyPos = false;
foreach ($players as $p) {
    if (!empty($p['dbPlayers_PairingPos'])) {
        $anyPos = true;
        break;
    }
}
if ($anyPos) {
    $cartAssignments = [];
    foreach ($players as $p) {
        $ghin = (string)($p['dbPlayers_PlayerGHIN'] ?? '');
        if ($ghin === '') continue;
        $cartAssignments[$ghin] = [
            'pairingId'  => (string)($p['dbPlayers_PairingID']  ?? ''),
            'pairingPos' => (string)($p['dbPlayers_PairingPos'] ?? ''),
        ];
    }
}

// --- portal: pass through for JS scorer resolution ---
$portal = $_SESSION["SessionPortal"] ?? "";

ma_respond(200, ['ok' => true, 'payload' => [
    'players'         => $players,
    'game'            => $gameRow,
    'isGameDay'       => $isGameDay,
    'canSave'         => $canSave,
    'hasScores'       => $hasScores,
    'scorerGHIN'      => $scorerGHIN,
    'cartAssignments' => $cartAssignments,
    'portal'          => $portal,
]]);