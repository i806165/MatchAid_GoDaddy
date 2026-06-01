<?php
declare(strict_types=1);
// /api/game_players/saveTeamAssignments.php
//
// Bulk-saves player team assignments to dbPlayers_TeamKey on db_Players.
// Each assignment is { "ghin": "...", "team": "T1"|"T2"|"" }.
// Invalid team values are coerced to "" (unassigned).
//
// Request body:
//   { "assignments": [ { "ghin": "1234567", "team": "T1" }, ... ] }
//
// Success response:
//   { "ok": true, "payload": { "players": [ ...full player rows... ] } }

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
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

  // 3) Input
  $in          = ma_json_in();
  $assignments = $in["assignments"] ?? [];
  if (!is_array($assignments)) $assignments = [];

  // 4) Valid team key values
  $validTeams = ["T1", "T2", ""];

  // 5) Save each assignment
  $saved = 0;
  foreach ($assignments as $a) {
    $ghin = trim((string)($a["ghin"] ?? ""));
    $team = trim((string)($a["team"] ?? ""));

    if ($ghin === "") continue;

    // Coerce invalid values to unassigned
    if (!in_array($team, $validTeams, true)) {
      Logger::warn("SAVE_TEAM_ASSIGNMENTS_INVALID_TEAM", [
        "ggid" => $ggid,
        "ghin" => $ghin,
        "team" => $team,
      ]);
      $team = "";
    }

    ServiceDbPlayers::updateGamePlayerFields($ggid, $ghin, [
      "dbPlayers_TeamKey" => $team,
    ]);
    $saved++;
  }

  // 6) Return refreshed player list
  $players = ServiceDbPlayers::getGamePlayers($ggid);
  echo json_encode(["ok" => true, "payload" => ["players" => $players]]);

} catch (Throwable $e) {
  Logger::error("SAVE_TEAM_ASSIGNMENTS_EXCEPTION", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Server error saving team assignments."]);
}