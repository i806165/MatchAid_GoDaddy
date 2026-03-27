<?php
// /public_html/api/game_scorecard/initScoreCard.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/scoring/service_ScoreCard.php";

function initScoreCard(string $ggid, array $ctx = []): array {
  // ==========================================================================
  // Hydration
  // ==========================================================================
  $ggid = trim($ggid);
  if ($ggid === "") return ["ok" => false, "error" => "missing_ggid"];

  $pdo = Db::pdo();

  // 1. Load Game
  $stmt = $pdo->prepare("SELECT * FROM db_Games WHERE dbGames_GGID = :ggid LIMIT 1");
  $stmt->execute([":ggid" => $ggid]);
  $game = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

  // 2. Load Players
  $stmtP = $pdo->prepare("SELECT * FROM db_Players WHERE dbPlayers_GGID = :ggid ORDER BY dbPlayers_PairingID, dbPlayers_PairingPos");
  $stmtP->execute([":ggid" => $ggid]);
  $players = $stmtP->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // 3. Normalize JSON Fields
  foreach ($players as &$p) {
    $jsonRaw = $p["dbPlayers_TeeSetDetails"] ?? $p["dbPlayers_TeeSetDetailsJSON"] ?? "";
    if (is_string($jsonRaw) && trim($jsonRaw) !== "") {
      $decoded = json_decode($jsonRaw, true);
      if (is_array($decoded)) $p["dbPlayers_TeeSetDetails"] = $decoded;
    }
  }
  unset($p);

  // ==========================================================================
  // Payload Dispatch
  // ==========================================================================
  $scorecards = ServiceScoreCard::buildBlankScorecardPayload($game, $players);

  return [
    "ok" => true,
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
    $out = initScoreCard($ggid, []);
    echo json_encode($out, JSON_UNESCAPED_SLASHES);
  } catch (Throwable $e) {
    Logger::error("SCORECARDS_INIT_API_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "server_error"]);
  }
}
