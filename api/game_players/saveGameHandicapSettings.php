<?php
declare(strict_types=1);
// /api/game_players/saveGameHandicapSettings.php
//
// Saves handicap rules (Method/Allowance/Effectivity/Date) directly onto
// this one game's dbGames_* columns. Mirrors saveTeamConfig.php's and
// saveFlightConfig.php's game-side shape — no mode concept, no cascade;
// a round or flat game owns its own rules outright.
//
// Request body:
//   { "method": "CH"|"SO", "allowance": 100,
//     "effectivity": "PlayDate"|"Low3"|"Low6"|"Low12"|"Date",
//     "effDate": "YYYY-MM-DD" }
//
// Success response:
//   { "ok": true, "payload": { "handicapConfig": { method, allowance, effectivity, effDate } } }

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

  $game = ServiceDbGames::getGameByGGID($ggid);
  if (!$game) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "Game not found."]);
    exit;
  }

  // 3) Input
  $in = ma_json_in();

  $method = trim((string)($in["method"] ?? ""));
  if (!in_array($method, ["CH", "SO"], true)) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "Invalid handicap method."]);
    exit;
  }

  $allowance = (int)($in["allowance"] ?? 100);
  if ($allowance < 0 || $allowance > 100 || $allowance % 5 !== 0) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "Invalid allowance."]);
    exit;
  }

  $validEff = ["PlayDate", "Low3", "Low6", "Low12", "Date"];
  $effectivity = trim((string)($in["effectivity"] ?? ""));
  if (!in_array($effectivity, $validEff, true)) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "Invalid handicap effectivity."]);
    exit;
  }

  // 4) Resolve effectivity date — same contract as
  //    ServiceDbGames::enforceHcEffectivity(): PlayDate/Low3/Low6/Low12
  //    always mirror the game's own PlayDate; "Date" uses the supplied
  //    value, clamped to not exceed PlayDate. dbGames_HCEffectivityDate
  //    is NOT NULL, so this always resolves to a real value.
  $playDate = substr((string)($game["dbGames_PlayDate"] ?? ""), 0, 10);
  if ($effectivity !== "Date") {
    $effDate = $playDate;
  } else {
    $effDate = substr((string)($in["effDate"] ?? ""), 0, 10);
    if ($effDate === "" || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $effDate)) {
      $effDate = $playDate;
    }
    if ($playDate !== "" && $effDate > $playDate) {
      $effDate = $playDate;
    }
  }

  // 5) Persist
  $updated = ServiceDbGames::updateGame($ggid, [
    "dbGames_HCMethod"          => $method,
    "dbGames_Allowance"         => $allowance,
    "dbGames_HCEffectivity"     => $effectivity,
    "dbGames_HCEffectivityDate" => $effDate,
  ]);

  if (!$updated) {
    Logger::error("SAVE_GAME_HANDICAP_SETTINGS_FAIL", ["ggid" => $ggid]);
    echo json_encode(["ok" => false, "message" => "Unable to save handicap settings."]);
    exit;
  }

  echo json_encode(["ok" => true, "payload" => ["handicapConfig" => [
    "method"      => $method,
    "allowance"   => $allowance,
    "effectivity" => $effectivity,
    "effDate"     => $effDate,
  ]]]);

} catch (Throwable $e) {
  Logger::error("SAVE_GAME_HANDICAP_SETTINGS_EXCEPTION", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Server error saving handicap settings."]);
}
