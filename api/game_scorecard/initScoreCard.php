<?php
// /public_html/api/game_scorecard/initScoreCard.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/scoring/service_ScoreCard.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

/**
 * hydrateBlankScoreCardContext
 * Shared baseline hydration for blank / pre-round scorecards.
 */
function hydrateBlankScoreCardContext(string $ggid): array {
  $ggid = trim($ggid);
  if ($ggid === "") {
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

  return [
    "ok" => true,
    "game" => $game,
    "players" => $players,
  ];
}

/**
 * initBlankScoreCard
 * Canonical initializer for blank / pre-round scorecards.
 */
function initBlankScoreCard(string $ggid, array $ctx = []): array {
  $hydrated = hydrateBlankScoreCardContext($ggid);
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

// Backward-compatible alias
function initScoreCard(string $ggid, array $ctx = []): array {
  return initBlankScoreCard($ggid, $ctx);
}

// If invoked directly as endpoint, emit JSON
if (php_sapi_name() !== "cli" && basename($_SERVER["SCRIPT_NAME"] ?? "") === "initScoreCard.php") {
  header("Content-Type: application/json; charset=utf-8");

  try {
    $ggid = (string)($_GET["ggid"] ?? ($_SESSION["SessionStoredGGID"] ?? ""));
    $out = initBlankScoreCard($ggid, []);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);

  } catch (Throwable $e) {
    Logger::error("BLANK_SCORECARDS_INIT_API_FAIL", [
      "err" => $e->getMessage(),
      "trace" => $e->getTraceAsString(),
    ]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
  }
}