<?php
declare(strict_types=1);
// /public_html/api/score_home/initScoreHome.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SERVICES . "/scoring/service_BlindPlayer.php";
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

// ── hasScores: true if any player in the group has recorded at least one hole ──
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

// ── scorerGHIN: currently persisted scorer for this pod ──
$scorerGHIN = ServiceScoreEntry::getEffectivePlayerGHIN();

// ── cartAssignments: derive from persisted PairingID/PairingPos on player rows ──
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

// ── portal: pass through for JS scorer resolution ──
$portal = $_SESSION["SessionPortal"] ?? "";

// ── blindConfig: parsed from game record ──────────────────────────────────────
// Null if blind player has not been configured for this game.
// Stored as legacy array shape: [{ ghin, name }, { target }]
// Parse into a normalised shape for the JS payload.
$blindConfig = null;
if ($gameRow) {
    $rawBlind    = $gameRow['dbGames_BlindPlayers'] ?? '[]';
    $blindParsed = is_string($rawBlind)
        ? (json_decode($rawBlind, true) ?: [])
        : (is_array($rawBlind) ? $rawBlind : []);

    if (!empty($blindParsed) && is_array($blindParsed)) {
        $configGHIN   = null;
        $configName   = null;
        $configTarget = null;
        foreach ($blindParsed as $item) {
            if (!is_array($item)) continue;
            if (isset($item['ghin']))   { $configGHIN = (string)$item['ghin']; $configName = (string)($item['name'] ?? ''); }
            if (isset($item['target'])) { $configTarget = (int)$item['target']; }
        }
        if ($configTarget !== null) {
            $blindConfig = [
                'mode'   => ($configGHIN !== null && $configGHIN !== '') ? 'game' : 'group',
                'target' => $configTarget,
                'ghin'   => $configGHIN,
                'name'   => $configName,
            ];
        }
    }
}

// ── existingBlindGHIN: GHIN from db_Scores for this group's pairing ──────────
// Tells the module whether a blind player has already been applied so it can
// render the rerun state rather than the fresh-selection state.
$existingBlindGHIN = null;
$groupPairingId    = (string)($players[0]['dbPlayers_PairingID'] ?? '');
if ($blindConfig !== null && $groupPairingId !== '' && $groupPairingId !== '000') {
    $existingBlindGHIN = ServiceBlindPlayer::getBlindScoreForPairing($ggid, $groupPairingId);
}

// ── roster: full game player list for the blind player selection modal ─────────
// Excludes stray / unattached players (PairingID = "000" or empty, or PlayerKey
// null / empty). Players with null Scores are included — the module renders them
// as non-selectable so the scorer can see they exist but cannot borrow their score.
$roster = [];
if ($blindConfig !== null) {
    $allGamePlayers = ServiceDbPlayers::getGamePlayers((string)$ggid);
    foreach ($allGamePlayers as $gp) {
        $pid = (string)($gp['dbPlayers_PairingID'] ?? '');
        $pk  = (string)($gp['dbPlayers_PlayerKey']  ?? '');
        // Exclude unattached players
        if ($pid === '' || $pid === '000') continue;
        if ($pk  === '') continue;
        $roster[] = $gp;
    }
}

ma_respond(200, ['ok' => true, 'payload' => [
    'players'           => $players,
    'game'              => $gameRow,
    'isGameDay'         => $isGameDay,
    'canSave'           => $canSave,
    'hasScores'         => $hasScores,
    'scorerGHIN'        => $scorerGHIN,
    'cartAssignments'   => $cartAssignments,
    'portal'            => $portal,
    'blindConfig'       => $blindConfig,
    'existingBlindGHIN' => $existingBlindGHIN,
    'roster'            => $roster,
]]);