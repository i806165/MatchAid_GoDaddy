<?php
declare(strict_types=1);
// api/game_players/upsertGamePlayers.php

require_once __DIR__ . "/../../bootstrap.php";
session_start();
header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Handicaps.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";

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

  // Fetch full rich tee details (raw GHIN format with holes) via ID lookup
  $teeSetId = (string)($tee["teeSetID"] ?? "");
  $richTeeDetails = ($teeSetId !== "") ? be_getTeeSetByID($teeSetId, $token) : $tee;

  $existing = ServiceDbPlayers::getPlayerByGGIDGHIN($ggid, $ghin);

    // --- Enrich player profile fields (LocalID / ClubID / ClubName) ---
  // GoDaddy UI sends a minimal player object (ghin/name/gender/hi). Hydrate the rest here.
  $templateGhin = (string)($_SESSION["SessionGHINLogonID"] ?? "");
  $profile = gp_fetch_player_profile($ghin, $token, $templateGhin);

  // Prefer UI-provided values, then GHIN profile, then existing DB values (so we don't blank-out good data)
  $localId = trim((string)($player["local_number"] ?? $player["memberId"] ?? ""));
  if ($localId === "") $localId = trim((string)($profile["local_number"] ?? $profile["member_number"] ?? $profile["memberId"] ?? ""));
  if ($localId === "" && is_array($existing)) $localId = (string)($existing["dbPlayers_LocalID"] ?? "");

  $clubId = trim((string)($player["club_id"] ?? ""));
  if ($clubId === "") $clubId = trim((string)($profile["club_id"] ?? $profile["primary_club_id"] ?? $profile["home_club_id"] ?? ""));
  if ($clubId === "" && is_array($existing)) $clubId = (string)($existing["dbPlayers_ClubID"] ?? "");

  $clubName = trim((string)($player["club_name"] ?? ""));
  if ($clubName === "") $clubName = trim((string)($profile["club_name"] ?? $profile["primary_club_name"] ?? $profile["home_club_name"] ?? ""));
  if ($clubName === "" && is_array($existing)) $clubName = (string)($existing["dbPlayers_ClubName"] ?? "");


  // Calculate Baseline PH (Pass-A logic: PH = CH * Allowance)
  $ch = (int)($tee["playerCH"] ?? 0);
  $allowance = (float)($game["dbGames_Allowance"] ?? 100);
  $ph = (int)round($ch * ($allowance / 100.0));

  $fields = [
    "dbPlayers_Name" => trim(($first . " " . $last)),
    "dbPlayers_LName" => $last,
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
    "dbPlayers_CreatorID" => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
    "dbPlayers_CreatorName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
    "dbPlayers_TeeSetDetails" => json_encode($richTeeDetails),
    "dbPlayers_PlayerKey" => (string)($existing["dbPlayers_PlayerKey"] ?? ""),
    "dbPlayers_LocalID"  => $localId,
    "dbPlayers_ClubID"   => $clubId,
    "dbPlayers_ClubName" => $clubName,
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
function gp_fetch_player_profile(string $ghin, string $token, string $templateGhin): array
{
  $fetch = str_starts_with($ghin, "NH") ? $templateGhin : $ghin;
  $fetch = trim((string)$fetch);
  if ($fetch === "") return [];

  $res = be_getPlayersByID($fetch, $token);
  $golf = (is_array($res["golfers"] ?? null) && isset($res["golfers"][0]) && is_array($res["golfers"][0]))
    ? $res["golfers"][0]
    : [];

  return is_array($golf) ? $golf : [];
}
