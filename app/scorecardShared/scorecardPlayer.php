<?php
declare(strict_types=1);
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_API . "/game_scorecard/initScoreCard.php";
require_once __DIR__ . "/scorecardShared.php";

$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx['ok'])) { header('Location: ' . MA_ROUTE_LOGIN); exit; }
try {
  $ggid = ServiceContextGame::getStoredGGID();
  if (!$ggid) {
    $ggidInput = $_GET['ggid'] ?? $_SESSION['SessionStoredGGID'] ?? '';
    if ($ggidInput) ServiceContextGame::setGameContext((int)$ggidInput);
    $ggid = ServiceContextGame::getStoredGGID();
  }
  if (!$ggid) throw new RuntimeException('No game selected.');
  $scope = (string)($_GET['player'] ?? $_GET['pid'] ?? $_GET['scope'] ?? '');
  $initPayload = initScoredScoreCard((string)$ggid, 'player', $scope, $ctx);
} catch (Throwable $e) {
  die('Player Scorecard Init Error: ' . $e->getMessage());
}
renderScorecardSharedPage($initPayload, 'Player Scorecard');
