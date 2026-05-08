<?php
declare(strict_types=1);
// /public_html/api/scorecardShared/initSharedScoreCard.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/scoring/service_ScoreCard.php";
require_once MA_SERVICES . "/scoring/service_ScoreCardRotation.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

function hydrateSharedScoreCardContext(string $ggid): array {
  $ggid = trim($ggid);
  if ($ggid === '') {
    return ["ok" => false, "error" => "missing_ggid", "game" => [], "players" => []];
  }

  $game = ServiceDbGames::getGameByGGID((int)$ggid) ?? [];
  if (!$game) {
    return ["ok" => false, "error" => "game_not_found", "game" => [], "players" => []];
  }

  $players = ServiceDbPlayers::getScorecardPlayersByGGID($ggid);

  foreach ($players as &$p) {
    foreach (["dbPlayers_TeeSetDetails", "dbPlayers_TeeSetDetailsJSON"] as $k) {
      if (isset($p[$k]) && is_string($p[$k]) && trim($p[$k]) !== "") {
        $decoded = json_decode($p[$k], true);
        if (is_array($decoded)) {
          $p["dbPlayers_TeeSetDetails"] = $decoded;
          break;
        }
      }
    }

    foreach (["dbPlayers_Scores", "dbPlayers_ScoreJson", "dbPlayers_ScoreJSON", "dbPlayers_ScoreCard"] as $k) {
      if (isset($p[$k]) && is_string($p[$k]) && trim($p[$k]) !== "") {
        $decoded = json_decode($p[$k], true);
        if (is_array($decoded)) {
          $p["dbPlayers_Scores"] = $decoded;
          break;
        }
      }
    }
  }
  unset($p);

  // Merge blind player records into player pool if any exist
  require_once MA_SERVICES . '/scoring/service_BlindPlayer.php';
  $blindScores = ServiceBlindPlayer::getBlindScoresForGame((int)$ggid);
  if (!empty($blindScores)) {
    foreach ($blindScores as &$bs) {
      if (isset($bs['dbScores_Scores']) && is_string($bs['dbScores_Scores'])) {
        $decoded = json_decode($bs['dbScores_Scores'], true);
        if (is_array($decoded)) $bs['dbScores_Scores'] = $decoded;
      }
    }
    unset($bs);
    $players = ServiceBlindPlayer::mergeBlindScoresIntoPlayers($players, $blindScores, $game);
  }

  return [
    "ok" => true,
    "game" => $game,
    "players" => $players,
  ];
}

function initSharedScoreCard(string $ggid, string $mode = "game", string $scope = ""): array {
  $hydrated = hydrateSharedScoreCardContext($ggid);
  if (empty($hydrated["ok"])) {
    return [
      "ok" => false,
      "error" => (string)($hydrated["error"] ?? "init_failed"),
    ];
  }

  $game = $hydrated["game"];
  $players = $hydrated["players"];
  $mode = strtolower(trim($mode));
  $scope = trim($scope);

  switch ($mode) {
    case "player":
      $baselineScorecards = ServiceScoreCard::buildPlayerScorecardPayload($game, $players, $scope);
      break;

    case "group":
      $baselineScorecards = ServiceScoreCard::buildGroupScorecardPayload($game, $players, $scope);
      break;

    case "game":
    default:
      $baselineScorecards = ServiceScoreCard::buildGameScorecardsPayload($game, $players);
      $mode = "game";
      break;
  }

  $scorecards = ServiceScoreCardRotation::buildScorecardPayload(
    $game,
    $baselineScorecards,
    $players,
    $mode,
    $scope
  );

  Logger::info('SCORECARD_PLAYERS_PAYLOAD', [
    'rows' => array_map(fn($row) => [
        'groupId'  => $row['groupId'] ?? '',
        'pairingIDs' => $row['pairingIDs'] ?? [],
        'players'  => array_map(fn($p) => [
            'name'                => $p['playerName'] ?? $p['dbPlayers_Name'] ?? '',
            'dbPlayers_PairingID' => $p['dbPlayers_PairingID'] ?? 'NOT SET',
            'pairingID'           => $p['pairingID'] ?? 'NOT SET',
            'effectivePairingID'  => $p['effectivePairingID'] ?? 'NOT SET',
            'isBlind'             => $p['isBlind'] ?? false,
        ], $row['players'] ?? []),
        'columnTotals' => array_map(fn($t) => [
            'label'    => $t['label'] ?? '',
            'pairingID'=> $t['pairingID'] ?? 'NOT SET',
        ], $row['columnTotals'] ?? []),
    ], $scorecards['rows'] ?? []),
]);

  return [
    "ok" => true,
    "mode" => $mode,
    "scope" => $scope,
    "game" => $game,
    "players" => $players,
    "scorecards" => $scorecards,
    "meta" => [
      "playerCount" => count($players),
      "holes" => (string)($game["dbGames_Holes"] ?? "All 18"),
      "hcMethod" => (string)($game["dbGames_HCMethod"] ?? "CH"),
    ],
  ];
}

if (php_sapi_name() !== "cli" && basename($_SERVER["SCRIPT_NAME"] ?? "") === "initSharedScoreCard.php") {
  
  header("Content-Type: application/json; charset=utf-8");

  try {
    $ggid = (string)($_GET["ggid"] ?? ($_SESSION["SessionStoredGGID"] ?? ""));
    $mode = strtolower(trim((string)($_GET["mode"] ?? "game")));
    $scope = (string)($_GET["scope"] ?? "");

    $out = initSharedScoreCard($ggid, $mode, $scope);

      Logger::info('SCORECARD_PLAYERS_PAYLOAD', [
    'rows' => array_map(fn($row) => [
        'groupId' => $row['groupId'] ?? '',
        'players' => array_map(fn($p) => [
            'name'               => $p['playerName'] ?? $p['dbPlayers_Name'] ?? '',
            'dbPlayers_PairingID'=> $p['dbPlayers_PairingID'] ?? 'NOT SET',
            'pairingID'          => $p['pairingID'] ?? 'NOT SET',
            'effectivePairingID' => $p['effectivePairingID'] ?? 'NOT SET',
            'isBlind'            => $p['isBlind'] ?? false,
        ], $row['players'] ?? []),
    ], $out['scorecards']['rows'] ?? []),
]);


    echo json_encode($out, JSON_UNESCAPED_SLASHES);

  } catch (Throwable $e) {
    Logger::error("SHARED_SCORECARDS_INIT_API_FAIL", [
      "err" => $e->getMessage(),
      "trace" => $e->getTraceAsString(),
    ]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
  }
}