<?php
declare(strict_types=1);

// /public_html/api/GHIN/calcPHSO.php
// Pass-B: Calculate Playing Handicap (PH) and Shots Off (SO) for all players.
// Requires grouping context (Pairings/Flights).

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/workflows/WorkFlow_Handicaps.php";

$auth = ma_api_require_auth();
$in = ma_json_in();
$payload = $in['payload'] ?? $in;

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"];
  $ggid = (string)($gc["ggid"] ?? "");

  // Action: "all" (default), "player", "pairing", "flight"
  $action = trim((string)($payload["action"] ?? "all"));
  // ID: GHIN, PairingID, or FlightID (depending on action)
  $id = trim((string)($payload["id"] ?? ""));

  $out = be_calculateGamePHSO($action, $id, $game, $auth["adminToken"]);

  ma_respond(200, ["ok" => true, "result" => $out]);

} catch (Throwable $e) {
  ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}