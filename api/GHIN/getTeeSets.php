<?php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
session_start();
header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Handicaps.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "message" => "Method not allowed."]);
  exit;
}

$in = ma_json_in();
$player = is_array($in["player"] ?? null) ? $in["player"] : [];
$gender = trim((string)($player["gender"] ?? ""));
$ghin = trim((string)($player["ghin"] ?? ""));
$manualHi = trim((string)($player["hi"] ?? ""));

if ($gender === "" || $ghin === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "message" => "Missing player gender or ghin."]);
  exit;
}

$auth = ma_api_require_auth();
$token = $auth["adminToken"] !== "" ? $auth["adminToken"] : $auth["userToken"];

try {
  $gc = ServiceContextGame::getGameContext();
  $game = $gc["game"] ?? [];

  $effectiveHI = gp_effective_hi($ghin, $manualHi, $game, $token);
  $teeSets = be_buildTeeSetTags("Index", $effectiveHI, $gender, $game, $token);

  echo json_encode([
    "ok" => true,
    "payload" => [
      "hi" => $effectiveHI,
      "teeSets" => $teeSets,
    ]
  ]);
} catch (Throwable $e) {
  Logger::error("GAMEPLAYERS_GET_TEES_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => "Unable to derive tee sets."]);
}

function gp_effective_hi(string $ghin, string $manualHi, array $game, string $token): string
{
  if (str_starts_with($ghin, "NH")) {
    return ($manualHi !== "") ? $manualHi : "0";
  }

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
