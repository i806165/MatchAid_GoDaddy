<?php
declare(strict_types=1);
// /public_html/app/scorecardShared/scorecardGame.php

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_API . "/game_scorecard/initScoreCard.php";
require_once __DIR__ . "/scorecardShared.php";

try {
  $ggid = ServiceContextGame::getStoredGGID();
  if (!$ggid) {
    error_log('[MA][ERROR][SCORECARD_GAME_ENTRY] Missing SessionStoredGGID.');
    throw new RuntimeException('No game selected.');
  }

  $initPayload = initScoredScoreCard((string)$ggid, 'game', '');

} catch (Throwable $e) {
  error_log('[MA][ERROR][SCORECARD_GAME_INIT] ' . $e->getMessage());
  die('Game Scorecard Init Error: ' . $e->getMessage());
}

renderScorecardSharedPage($initPayload, 'Game Scorecards');