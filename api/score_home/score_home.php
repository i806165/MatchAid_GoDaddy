<?php
declare(strict_types=1);
// /public_html/api/score_home/score_home.php
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

$input = ma_json_in();
$key = strtoupper(trim((string)($input['playerKey'] ?? '')));

$players = ServiceDbPlayers::getPlayersByPlayerKey($key);
if (!$players) ma_respond(404, ['ok' => false, 'message' => 'ID not found']);

$ggid = (int)$players[0]['dbPlayers_GGID'];
ServiceScoreEntry::setScoringPodGGID($ggid);
ServiceScoreEntry::setScorecardKey($key);
ServiceContextGame::setGameContext($ggid);

$gc = ServiceContextGame::getGameContext();

$gameRow = $gc['game'] ?? null;
$isGameDay = $gameRow ? ServiceScoreEntry::isScoreEntryAllowedToday($gameRow) : false;
$canSave = MA_TESTING_MODE || $isGameDay;

ma_respond(200, ['ok' => true, 'payload' => [
    'players' => $players,
    'game' => $gameRow,
    'isGameDay' => $isGameDay,
    'canSave' => $canSave
]]);