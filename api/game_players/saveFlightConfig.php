<?php
declare(strict_types=1);
// /api/game_players/saveFlightConfig.php
//
// Saves flight configuration JSON to dbGames_FlightConfig on db_Games.
// Mirrors /api/event_roster/saveFlightConfig.php's shape and validation,
// minus the mode/cascade concern, which belongs to the event only.
//
// 1 to 5 entries, never 0 — a game always has at least one flight (no
// reset-to-null path, unlike Teams). Ids are assigned canonically by
// position (F1..F5), never trusted from the client — same defensive
// posture as saveTeamConfig.php's fixed T1/T2 ids.
//
// This endpoint has no concept of "mode" — a flat game, or a round with
// event cascading turned off, owns its flights outright. (A round whose
// event has cascading turned on never reaches this endpoint at all: its
// Define Flights button is hidden client-side while dbEvents_FlightMode
// is "fixed".)
//
// Request body:
//   { "flights": [ { "name": "Championship" }, { "name": "Flight 2" }, ... ] }
//
// Success response:
//   { "ok": true, "payload": { "flightConfig": { "flights": [...] } } }

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbGames.php";

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
  $ggid = (int)($_SESSION["SessionStoredGGID"] ?? 0);
  if ($ggid === 0) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "No game selected."]);
    exit;
  }

  // 3) Input
  $in      = ma_json_in();
  $flights = $in["flights"] ?? [];
  if (!is_array($flights)) $flights = [];

  // 4) Validate — must be 1 to 5 entries; never 0
  $count = count($flights);
  if ($count < 1 || $count > 5) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "A game must have between 1 and 5 flights."]);
    exit;
  }

  // 5) Validate + canonicalize each entry — ids are position-based (F1..F5),
  //    never trusted from the client, same posture as saveTeamConfig.php
  $sanitized = [];
  foreach (array_values($flights) as $i => $f) {
    $name = trim((string)($f["name"] ?? ""));
    if ($name === "") {
      http_response_code(400);
      echo json_encode(["ok" => false, "message" => "Flight name cannot be empty."]);
      exit;
    }

    $sanitized[] = [
      "id"   => "F" . ($i + 1),
      "name" => mb_substr($name, 0, 32),
      "sort" => $i + 1,
    ];
  }

  // 6) Persist — always a real config, never NULL (floor of 1 flight)
  $flightConfigJson = json_encode(["flights" => $sanitized]);
  $updated = ServiceDbGames::updateGame($ggid, ["dbGames_FlightConfig" => $flightConfigJson]);

  if (!$updated) {
    Logger::error("SAVE_FLIGHT_CONFIG_FAIL", ["ggid" => $ggid]);
    echo json_encode(["ok" => false, "message" => "Unable to save flight configuration."]);
    exit;
  }

  echo json_encode(["ok" => true, "payload" => ["flightConfig" => ["flights" => $sanitized]]]);

} catch (Throwable $e) {
  Logger::error("SAVE_FLIGHT_CONFIG_EXCEPTION", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Server error saving flight configuration."]);
}
