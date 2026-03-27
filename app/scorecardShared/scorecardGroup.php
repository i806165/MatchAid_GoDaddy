<?php
declare(strict_types=1);
// /public_html/app/scorecardShared/scorecardGroup.php

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
    error_log('[MA][ERROR][SCORECARD_GROUP_ENTRY] Missing SessionStoredGGID.');
    throw new RuntimeException('No game selected.');
  }

  $scope = (string)($_GET['group'] ?? $_GET['gid'] ?? $_GET['scope'] ?? '');
  $initPayload = initScoredScoreCard((string)$ggid, 'group', $scope);

} catch (Throwable $e) {
  error_log('[MA][ERROR][SCORECARD_GROUP_INIT] ' . $e->getMessage());
  die('Group Scorecard Init Error: ' . $e->getMessage());
}

renderScorecardSharedPage($initPayload, 'Group Scorecard');