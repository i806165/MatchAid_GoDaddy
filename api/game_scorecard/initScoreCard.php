<?php
// /public_html/api/game_scorecard/initScoreCard.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/scoring/service_ScoreCard.php";

/**
 * hydrateScoreCardContext
 * Shared hydration helper for:
 * - blank pre-round scorecards
 * - player/group/game scored scorecards
 *
 * Returns:
 * [
 *   "ok" => bool,
 *   "error" => string?,
 *   "game" => array,
 *   "players" => array,
 * ]
 */
function hydrateScoreCardContext(string $ggid): array {
  $ggid = trim($ggid);
  if ($ggid === "") {
    return ["ok" => false, "error" => "missing_ggid", "game" => [], "players" => []];
  }

  $pdo = Db::pdo();

  // Load game row
  $stmt = $pdo->prepare("
    SELECT *
      FROM db_Games
     WHERE dbGames_GGID = :ggid
     LIMIT 1
  ");
  $stmt->execute([":ggid" => $ggid]);
  $game = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
  if (!$game) {
    return ["ok" => false, "error" => "game_not_found", "game" => [], "players" => []];
  }

  // Load player rows
  $stmtP = $pdo->prepare("
    SELECT *
      FROM db_Players
     WHERE dbPlayers_GGID = :ggid
     ORDER BY dbPlayers_PairingID, dbPlayers_PairingPos, dbPlayers_FlightID, dbPlayers_FlightPos
  ");
  $stmtP->execute([":ggid" => $ggid]);
  $players = $stmtP->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // Decode retained JSON fields
  foreach ($players as &$p) {
    // Tee set details
    foreach (["dbPlayers_TeeSetDetails", "dbPlayers_TeeSetDetailsJSON"] as $k) {
      if (isset($p[$k]) && is_string($p[$k]) && trim($p[$k]) !== "") {
        $decoded = json_decode($p[$k], true);
        if (is_array($decoded)) {
          $p["dbPlayers_TeeSetDetails"] = $decoded;
          break;
        }
      }
    }

    // Score JSON
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

  return [
    "ok" => true,
    "game" => $game,
    "players" => $players,
  ];
}

/**
 * initScoreCard
 * Canonical legacy-compatible initializer for blank / pre-round scorecards.
 *
 * Used two ways:
 *  (A) included by /app/game_scorecards/scorecards.php to embed INIT (preferred)
 *  (B) called directly as an API endpoint returning JSON
 */
function initScoreCard(string $ggid, array $ctx = []): array {
  $hydrated = hydrateScoreCardContext($ggid);
  if (empty($hydrated["ok"])) {
    return [
      "ok" => false,
      "error" => (string)($hydrated["error"] ?? "init_failed"),
    ];
  }

  $game = $hydrated["game"];
  $players = $hydrated["players"];

  $scorecards = ServiceScoreCard::buildBlankScorecardPayload($game, $players);

  return [
    "ok" => true,
    "mode" => "blank",
    "game" => $game,          // raw db_Games row
    "players" => $players,    // raw db_Players rows
    "scorecards" => $scorecards,
    "meta" => [
      "playerCount" => count($players),
      "holes" => (string)($game["dbGames_Holes"] ?? "All 18"),
      "hcMethod" => (string)($game["dbGames_HCMethod"] ?? "CH"),
    ],
  ];
}

/**
 * initScoredScoreCard
 * Shared initializer for in-game / post-game scored scorecards.
 *
 * Used for:
 * - player scorecard
 * - group scorecard
 * - game scorecards
 *
 * This initializer does NOT require user context.
 * It relies only on GGID, mode, scope, and persisted game/player/score data.
 *
 * $mode:
 * - player
 * - group
 * - game
 *
 * $scope:
 * - player: selected player identifier (PlayerID / GHIN / PlayerKey)
 * - group : selected group identifier
 * - game  : ignored
 */
function initScoredScoreCard(string $ggid, string $mode = "game", string $scope = ""): array {
  $hydrated = hydrateScoreCardContext($ggid);
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
      $scorecards = ServiceScoreCard::buildPlayerScorecardPayload($game, $players, $scope);
      break;

    case "group":
      $scorecards = ServiceScoreCard::buildGroupScorecardPayload($game, $players, $scope);
      break;

    case "game":
    default:
      $scorecards = ServiceScoreCard::buildGameScorecardsPayload($game, $players);
      $mode = "game";
      break;
  }

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

// If invoked directly as endpoint, emit JSON
if (php_sapi_name() !== "cli" && basename($_SERVER["SCRIPT_NAME"] ?? "") === "initScoreCard.php") {
  if (session_status() !== PHP_SESSION_ACTIVE) session_start();
  header("Content-Type: application/json; charset=utf-8");

  try {
    $ggid = (string)($_GET["ggid"] ?? ($_SESSION["SessionStoredGGID"] ?? ""));
    $mode = strtolower(trim((string)($_GET["mode"] ?? "blank")));
    $scope = (string)($_GET["scope"] ?? "");

    if ($mode === "blank") {
      $out = initScoreCard($ggid, []);
    } else {
      $out = initScoredScoreCard($ggid, $mode, $scope);
    }

    echo json_encode($out, JSON_UNESCAPED_SLASHES);
  } catch (Throwable $e) {
    Logger::error("SCORECARDS_INIT_API_FAIL", [
      "err" => $e->getMessage(),
      "trace" => $e->getTraceAsString(),
    ]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
  }
}