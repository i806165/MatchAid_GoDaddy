<?php
declare(strict_types=1);
// /public_html/app/scorecardShared/scorecardPlayer.php

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/context/service_UserContext.php";
require_once MA_API . "/game_scorecard/initScoreCard.php";
require_once __DIR__ . "/scorecardShared.php";

try {
  $ggid = ServiceContextGame::getStoredGGID();
  if (!$ggid) {
    error_log('[MA][ERROR][SCORECARD_PLAYER_ENTRY] Missing SessionStoredGGID.');
    throw new RuntimeException('No game selected.');
  }

  $ghin = ServiceUserContext::getEffectivePlayerGHIN();
  if (!$ghin) {
    header("Location: " . MA_ROUTE_LOGIN);
    exit;
  }

  $initPayload = initScoredScoreCard((string)$ggid, 'player', $ghin);

} catch (Throwable $e) {
  error_log('[MA][ERROR][SCORECARD_PLAYER_INIT] ' . $e->getMessage());
  die('Player Scorecard Init Error: ' . $e->getMessage());
}

renderScorecardSharedPage($initPayload, 'Player Scorecard');