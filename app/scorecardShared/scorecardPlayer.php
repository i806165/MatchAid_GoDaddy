<?php
declare(strict_types=1);
// /public_html/app/scorecardShared/scorecardPlayer.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_API . "/game_scorecard/initScoreCard.php";
require_once __DIR__ . "/scorecardShared.php";

try {
  error_log('[MA][INFO][SCORECARD_PLAYER_ENTRY] ' . json_encode([
    'uri' => $_SERVER['REQUEST_URI'] ?? '',
    'session_id' => session_id(),
    'sessionStoredGGID_raw' => $_SESSION['SessionStoredGGID'] ?? null,
    'storedGGID_service' => ServiceContextGame::getStoredGGID(),
    'player_scope' => $_GET['player'] ?? $_GET['pid'] ?? $_GET['scope'] ?? ''
  ], JSON_UNESCAPED_SLASHES));

  $ggid = ServiceContextGame::getStoredGGID();
  if (!$ggid) {
    error_log('[MA][ERROR][SCORECARD_PLAYER_ENTRY] Missing SessionStoredGGID.');
    throw new RuntimeException('No game selected.');
  }

  $scope = (string)($_GET['player'] ?? $_GET['pid'] ?? $_GET['scope'] ?? '');

  $initPayload = initScoredScoreCard((string)$ggid, 'player', $scope, []);

  error_log('[MA][INFO][SCORECARD_PLAYER_INIT] ' . json_encode([
    'ggid' => $ggid,
    'scope' => $scope,
    'init_ok' => !empty($initPayload)
  ], JSON_UNESCAPED_SLASHES));

} catch (Throwable $e) {
  error_log('[MA][ERROR][SCORECARD_PLAYER_INIT] ' . $e->getMessage());
  die('Player Scorecard Init Error: ' . $e->getMessage());
}

renderScorecardSharedPage($initPayload, 'Player Scorecard');