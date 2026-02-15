<?php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
session_start();
header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Handicaps.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "message" => "Method not allowed."]);
  exit;
}

$auth = ma_api_require_auth();
$token = $auth["adminToken"] !== "" ? $auth["adminToken"] : $auth["userToken"];
$in = ma_json_in();
$player = is_array($in["player"] ?? null) ? $in["player"] : [];
$selectedTee = is_array($in["selectedTee"] ?? null) ? $in["selectedTee"] : [];

$ghin = trim((string)($player["ghin"] ?? ""));
$first = trim((string)($player["first_name"] ?? ""));
$last = trim((string)($player["last_name"] ?? ""));
$gender = trim((string)($player["gender"] ?? ""));
$manualHi = trim((string)($player["hi"] ?? ""));

if ($ghin === "" || $gender === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "message" => "Missing player ghin or gender."]);
  exit;
}

try {
  $gc = ServiceContextGame::getGameContext();
  $ggid = (string)($gc["ggid"] ?? "");
  $game = $gc["game"] ?? [];

  $effectiveHI = gp_effective_hi($ghin, $manualHi, $game, $token);
  $teeSets = be_buildTeeSetTags("Index", $effectiveHI, $gender, $game, $token);
  $tee = gp_pick_tee($teeSets, (string)($selectedTee["teeSetID"] ?? $selectedTee["value"] ?? ""));

  if (!$tee) {
    http_response_code(400);
    echo json_encode(["ok" => false, "message" => "Selected tee is no longer available."]);
    exit;
  }

  $existing = ServiceDbPlayers::getPlayerByGGIDGHIN($ggid, $ghin);

  // Calculate Baseline PH (Pass-A logic: PH = CH * Allowance)
  $ch = (int)($tee["playerCH"] ?? 0);
  $allowance = (float)($game["dbGames_Allowance"] ?? 100);
  $ph = (int)round($ch * ($allowance / 100.0));

  $fields = [
    "dbPlayers_Name" => trim(($first . " " . $last)),
    "dbPlayers_LName" => $last,
    "dbPlayers_LocalID" => (string)($player["local_number"] ?? ""),
    "dbPlayers_HI" => $effectiveHI,
    "dbPlayers_CH" => (string)$ch,
    "dbPlayers_PH" => (string)$ph,
    "dbPlayers_SO" => "0",
    "dbPlayers_CourseID" => (string)($game["dbGames_CourseID"] ?? ""),
    "dbPlayers_TeeSetID" => (string)($tee["teeSetID"] ?? ""),
    "dbPlayers_TeeSetName" => (string)($tee["teeSetName"] ?? ""),
    "dbPlayers_TeeSetSlope" => (string)($tee["teeSetSlope"] ?? ""),
    "dbPlayers_PairingID" => (string)($existing["dbPlayers_PairingID"] ?? "000"),
    "dbPlayers_PairingPos" => (string)($existing["dbPlayers_PairingPos"] ?? ""),
    "dbPlayers_FlightID" => (string)($existing["dbPlayers_FlightID"] ?? ""),
    "dbPlayers_FlightPos" => (string)($existing["dbPlayers_FlightPos"] ?? ""),
    "dbPlayers_Gender" => $gender,
    "dbPlayers_ClubID" => (string)($player["club_id"] ?? ""),
    "dbPlayers_ClubName" => (string)($player["club_name"] ?? ""),
    "dbPlayers_CreatorID" => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
    "dbPlayers_CreatorName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
    "dbPlayers_TeeSetDetails" => json_encode($tee),
    "dbPlayers_PlayerKey" => (string)($existing["dbPlayers_PlayerKey"] ?? ""),
  ];

  $saved = ServiceDbPlayers::upsertGamePlayer($ggid, $ghin, $fields);

  echo json_encode(["ok" => true, "payload" => ["player" => $saved]]);
} catch (Throwable $e) {
  Logger::error("GAMEPLAYERS_UPSERT_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Unable to save player."]);
}

function gp_effective_hi(string $ghin, string $manualHi, array $game, string $token): string
{
  if (str_starts_with($ghin, "NH")) return ($manualHi !== "") ? $manualHi : "0";

  $hce = trim((string)($game["dbGames_HCEffectivity"] ?? ""));
  $payload = null;
  if (in_array($hce, ["Low3", "Low6", "Low12"], true)) {
    $payload = be_getHandicapbyPeriod($hce, null, null, $ghin, $token);
  } elseif ($hce === "PlayDate") {
    $d = gp_to_ymd($game["dbGames_PlayDate"] ?? null);
    $payload = be_getHandicapbyPeriod("Range", $d, $d, $ghin, $token);
  } elseif ($hce === "Date") {
    $d = gp_to_ymd($game["dbGames_HCEffectivityDate"] ?? null);
    $payload = be_getHandicapbyPeriod("Range", $d, $d, $ghin, $token);
  }

  $row = (is_array($payload["d"] ?? null) && isset($payload["d"][0]) && is_array($payload["d"][0])) ? $payload["d"][0] : null;
  if (is_array($row) && array_key_exists("LowHIValue", $row) && $row["LowHIValue"] !== null && $row["LowHIValue"] !== "") {
    return (string)$row["LowHIValue"];
  }

  $byId = be_getPlayersByID($ghin, $token);
  return (string)($byId["golfers"][0]["handicap_index"] ?? "0");
}

function gp_to_ymd($d): ?string
{
  if (!$d) return null;
  if (is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($d))) return trim($d);
  $ts = strtotime((string)$d);
  if ($ts === false) return null;
  return date('Y-m-d', $ts);
}

function gp_pick_tee(array $teeSets, string $selectedId): ?array
{
  foreach ($teeSets as $row) {
    if ((string)($row["teeSetID"] ?? "") === $selectedId || (string)($row["value"] ?? "") === $selectedId) {
      return $row;
    }
  }
  return null;
}
