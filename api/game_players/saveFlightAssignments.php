<?php
declare(strict_types=1);
// /api/game_players/saveFlightAssignments.php
//
// Bulk-saves player flight assignments to dbPlayers_FlightKey on db_Players.
// Mirrors /api/event_roster/saveFlightAssignments.php's shape and validation,
// minus the cascade-propagation step, which belongs to the event only.
//
// Unlike Team, there is no valid "unassigned" value — every player always
// has a flight (floor of 1 flight per game, enforced by saveFlightConfig.php).
// A blank/invalid flight id falls back to the game's first configured
// flight rather than being cleared.
//
// Request body:
//   { "assignments": [ { "ghin": "1234567", "flight": "F1" }, ... ] }
//
// Success response:
//   { "ok": true, "payload": { "players": [ ...full player rows... ] } }

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";

header("Content-Type: application/json; charset=utf-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "message" => "Method not allowed."]);
  exit;
}

try {
  // 1) Auth
  $uc = ServiceUserContext::getUserContext();
  if (!$uc || empty($uc["ok"])) {
    http_response_code(401);
    echo json_encode(["ok" => false, "message" => "Not signed in."]);
    exit;
  }

  // 2) GGID always from session
  $ggid = strval($_SESSION["SessionStoredGGID"] ?? "");
  if ($ggid === "") {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "No game selected."]);
    exit;
  }

  // 3) Load the game's current flight config to validate against and to
  //    resolve the fallback flight id (first configured flight) — mirrors
  //    the event-side endpoint's approach exactly.
  $game = ServiceDbGames::getGameByGGID((int)$ggid);
  $flightConfig = null;
  try {
    $raw = $game["dbGames_FlightConfig"] ?? null;
    $flightConfig = $raw ? json_decode((string)$raw, true) : null;
  } catch (Throwable $e) {
    $flightConfig = null;
  }
  $validIds = array_column($flightConfig["flights"] ?? [], "id");
  if (!$validIds) $validIds = ["F1"]; // defensive — should never happen post-config

  $fallbackId = $validIds[0];

  // 4) Input
  $in          = ma_json_in();
  $assignments = $in["assignments"] ?? [];
  if (!is_array($assignments)) $assignments = [];

  // 5) Save each assignment
  $saved = 0;
  foreach ($assignments as $a) {
    $ghin   = trim((string)($a["ghin"]   ?? ""));
    $flight = trim((string)($a["flight"] ?? ""));

    if ($ghin === "") continue;

    if (!in_array($flight, $validIds, true)) {
      Logger::warn("SAVE_FLIGHT_ASSIGNMENTS_INVALID_FLIGHT", [
        "ggid" => $ggid,
        "ghin" => $ghin,
        "flight" => $flight,
      ]);
      $flight = $fallbackId;
    }

    ServiceDbPlayers::updateGamePlayerFields($ggid, $ghin, [
      "dbPlayers_FlightKey" => $flight,
    ]);
    $saved++;
  }

  // 6) Return refreshed player list
  $players = ServiceDbPlayers::getGamePlayers($ggid);
  echo json_encode(["ok" => true, "payload" => ["players" => $players]]);

} catch (Throwable $e) {
  Logger::error("SAVE_FLIGHT_ASSIGNMENTS_EXCEPTION", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Server error saving flight assignments."]);
}
