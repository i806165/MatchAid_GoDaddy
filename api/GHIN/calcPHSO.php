<?php
declare(strict_types=1);

// /public_html/api/GHIN/calcPHSO.php
// Pass-B: Calculate Playing Handicap (PH) and Shots Off (SO) for all players.
// Requires grouping context (Pairings/Flights).

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/workflows/workflow_Handicaps.php";

$auth = ma_api_require_auth();
$in = ma_json_in();
$payload = $in['payload'] ?? $in;

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"];
  $ggid = (string)($gc["ggid"] ?? "");

  // be_calculateGamePHSO() already self-skips correctly on ADJ GROSS once
  // it's reached — this is a pure optimization, saving the round trip for
  // callers that reach this endpoint independently of refreshHandicaps.php
  // (e.g. game_players.js's pairing-change flow). workflow_Handicaps.php
  // itself is untouched either way.
  if ((string)($game["dbGames_ScoringMethod"] ?? "") === "ADJ GROSS") {
    ma_respond(200, [
      "ok" => true,
      "skipped" => true,
      "message" => "PH/SO skipped — this game uses gross scoring.",
    ]);
    exit;
  }

  // Action: "all" (default), "player", "pairing", "flight"
  $action = trim((string)($payload["action"] ?? "all"));
  // ID: GHIN, PairingID, or FlightID (depending on action)
  $id = trim((string)($payload["id"] ?? ""));

  $out = be_calculateGamePHSO($action, $id, $game, $auth["adminToken"]);

  ma_respond(200, ["ok" => true, "result" => $out]);

} catch (Throwable $e) {
  ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}