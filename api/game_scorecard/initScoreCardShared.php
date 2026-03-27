<?php
// /public_html/api/game_scorecard/initScoreCard.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/scoring/service_ScoreCard.php";

function hydrateScoreCardContext(string $ggid): array {
  $ggid = trim($ggid);
  if ($ggid === '') return ['game' => [], 'players' => []];

  $pdo = Db::pdo();

  $stmt = $pdo->prepare("SELECT * FROM db_Games WHERE dbGames_GGID = :ggid LIMIT 1");
  $stmt->execute([':ggid' => $ggid]);
  $game = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

  $stmtP = $pdo->prepare("SELECT * FROM db_Players WHERE dbPlayers_GGID = :ggid ORDER BY dbPlayers_PairingID, dbPlayers_PairingPos");
  $stmtP->execute([':ggid' => $ggid]);
  $players = $stmtP->fetchAll(PDO::FETCH_ASSOC) ?: [];

  foreach ($players as &$p) {
    foreach (['dbPlayers_TeeSetDetails', 'dbPlayers_TeeSetDetailsJSON', 'dbPlayers_Scores'] as $jsonField) {
      $jsonRaw = $p[$jsonField] ?? '';
      if (is_string($jsonRaw) && trim($jsonRaw) !== '') {
        $decoded = json_decode($jsonRaw, true);
        if (is_array($decoded)) {
          $p[$jsonField === 'dbPlayers_TeeSetDetailsJSON' ? 'dbPlayers_TeeSetDetails' : $jsonField] = $decoded;
        }
      }
    }
  }
  unset($p);

  return ['game' => $game, 'players' => $players];
}

function initScoreCard(string $ggid, array $ctx = []): array {
  $hydrated = hydrateScoreCardContext($ggid);
  $game = $hydrated['game'];
  $players = $hydrated['players'];

  $scorecards = ServiceScoreCard::buildBlankScorecardPayload($game, $players);
  return [
    'ok' => true,
    'game' => $game,
    'players' => $players,
    'scorecards' => $scorecards,
    'meta' => [
      'playerCount' => count($players),
      'holes' => (string)($game['dbGames_Holes'] ?? 'All 18'),
      'hcMethod' => (string)($game['dbGames_HCMethod'] ?? 'CH'),
    ],
  ];
}

function initScoredScoreCard(string $ggid, string $mode = 'game', string $scope = '', array $ctx = []): array {
  $hydrated = hydrateScoreCardContext($ggid);
  $game = $hydrated['game'];
  $players = $hydrated['players'];

  $mode = strtolower(trim($mode));
  $payload = match ($mode) {
    'player' => ServiceScoreCard::buildPlayerScorecardPayload($game, $players, $scope),
    'group'  => ServiceScoreCard::buildGroupScorecardPayload($game, $players, $scope),
    default  => ServiceScoreCard::buildGameScorecardsPayload($game, $players),
  };

  $pageTitle = match ($mode) {
    'player' => 'Player Scorecard',
    'group' => 'Group Scorecard',
    default => 'Game Scorecards',
  };

  $subtitle = implode(' • ', array_filter([
    (string)($game['dbGames_CourseName'] ?? ''),
    (string)($game['dbGames_PlayDate'] ?? ''),
  ]));

  return [
    'ok' => true,
    'mode' => $mode,
    'scope' => $scope,
    'header' => [
      'title' => $pageTitle,
      'subtitle' => $subtitle,
    ],
    'game' => $game,
    'players' => $players,
    'scorecards' => $payload,
  ];
}

if (php_sapi_name() !== 'cli' && basename($_SERVER['SCRIPT_NAME'] ?? '') === 'initScoreCard.php') {
  if (session_status() !== PHP_SESSION_ACTIVE) session_start();
  header('Content-Type: application/json; charset=utf-8');
  try {
    $ggid = (string)($_GET['ggid'] ?? ($_SESSION['SessionStoredGGID'] ?? ''));
    $mode = (string)($_GET['mode'] ?? 'blank');
    $scope = (string)($_GET['scope'] ?? '');
    $out = ($mode === 'blank') ? initScoreCard($ggid, []) : initScoredScoreCard($ggid, $mode, $scope, []);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);
  } catch (Throwable $e) {
    Logger::error('SCORECARDS_INIT_API_FAIL', ['err' => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error']);
  }
}
