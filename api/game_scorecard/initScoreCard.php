<?php
// /public_html/api/game_scorecard/initScoreCard.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/scoring/service_ScoreCard.php";

/**
 * initScoreCard
 * Used two ways:
 *  (A) included by /app/game_scorecards/scorecards.php to embed INIT (preferred)
 *  (B) called directly as an API endpoint returning JSON
 */
function initScoreCard(string $ggid, array $ctx = []): array {
  $ggid = trim($ggid);
  if ($ggid === "") {
    return ["ok" => false, "error" => "missing_ggid"];
  }

  $pdo = Db::pdo();

  // Load game row
  $stmt = $pdo->prepare("SELECT * FROM db_Games WHERE dbGames_GGID = :ggid LIMIT 1");
  $stmt->execute([":ggid" => $ggid]);
  $game = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

  // Load player rows
  $stmtP = $pdo->prepare("SELECT * FROM db_Players WHERE dbPlayers_GGID = :ggid ORDER BY dbPlayers_PairingID, dbPlayers_PairingPos");
  $stmtP->execute([":ggid" => $ggid]);
  $players = $stmtP->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // Decode TeeSetDetails JSON if stored as string
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
  }
  unset($p);

  $scorecards = ServiceScoreCard::buildBlankScorecardPayload($game, $players);

  return [
    "ok" => true,
    "game" => $game,          // raw db_Games row (no transformations)
    "players" => $players,    // raw db_Players rows (optional but recommended)
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
    $out = initScoreCard($ggid, []);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);
  } catch (Throwable $e) {
    Logger::error("SCORECARDS_INIT_API_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
  }
}
