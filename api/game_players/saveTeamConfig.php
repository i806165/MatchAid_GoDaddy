<?php
declare(strict_types=1);
// /api/game_players/saveTeamConfig.php
//
// Saves team configuration JSON to dbGames_TeamConfig on db_Games.
// Passing an empty teams array sets the column to NULL (resets teams).
//
// Request body:
//   { "teams": [ { "id": "T1", "name": "Red", "color": "red", "sort": 1 }, ... ] }
//
// Success response:
//   { "ok": true, "payload": { "teamConfig": { "teams": [...] } } }

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
  $in    = ma_json_in();
  $teams = $in["teams"] ?? [];
  if (!is_array($teams)) $teams = [];

  // 4) Validate — must be empty (reset) or exactly 2 entries
  if (count($teams) !== 0 && count($teams) !== 2) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "Teams must have exactly 0 or 2 entries."]);
    exit;
  }

  // 5) Validate each team entry when present
  $validIds    = ["T1", "T2"];
  $validColors = ["red", "blue"];
  $sanitized   = [];

  foreach ($teams as $t) {
    $id    = trim((string)($t["id"]    ?? ""));
    $name  = trim((string)($t["name"]  ?? ""));
    $color = trim((string)($t["color"] ?? ""));
    $sort  = (int)($t["sort"] ?? 0);

    if (!in_array($id, $validIds, true)) {
      http_response_code(400);
      echo json_encode(["ok" => false, "message" => "Invalid team id: {$id}."]);
      exit;
    }
    if ($name === "") {
      http_response_code(400);
      echo json_encode(["ok" => false, "message" => "Team name cannot be empty."]);
      exit;
    }
    if (!in_array($color, $validColors, true)) {
      $color = ($id === "T1") ? "red" : "blue"; // safe fallback
    }

    $sanitized[] = [
      "id"    => $id,
      "name"  => mb_substr($name, 0, 32),
      "color" => $color,
      "sort"  => $sort,
    ];
  }

  // 6) Persist — NULL when resetting, JSON when setting
  $teamConfigJson = count($sanitized) === 0 ? null : json_encode(["teams" => $sanitized]);
  $updated = ServiceDbGames::updateGame($ggid, ["dbGames_TeamConfig" => $teamConfigJson]);

  if (!$updated) {
    Logger::error("SAVE_TEAM_CONFIG_FAIL", ["ggid" => $ggid]);
    echo json_encode(["ok" => false, "message" => "Unable to save team configuration."]);
    exit;
  }


  $teamConfig = count($sanitized) === 0 ? null : ["teams" => $sanitized];
  echo json_encode(["ok" => true, "payload" => ["teamConfig" => $teamConfig]]);

} catch (Throwable $e) {
  Logger::error("SAVE_TEAM_CONFIG_EXCEPTION", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Server error saving team configuration."]);
}