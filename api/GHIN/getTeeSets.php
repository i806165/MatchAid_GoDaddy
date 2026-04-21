<?php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
//session_start;
header("Content-Type: application/json; charset=utf-8");

require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Handicaps.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "message" => "Method not allowed."]);
  exit;
}

$in               = ma_json_in();
$player           = is_array($in["player"] ?? null) ? $in["player"] : [];
$gender           = trim((string)($player["gender"] ?? ""));
$ghin             = trim((string)($player["ghin"] ?? ""));
$manualHi         = trim((string)($player["hi"] ?? ""));
$mode             = trim((string)($in["mode"] ?? "options")); // "options" | "resolve"
$sourceGameTeeId  = trim((string)($in["sourceGameTeeSetId"] ?? ""));  // path 4 only

if ($gender === "" || $ghin === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "message" => "Missing player gender or ghin."]);
  exit;
}

$auth  = ma_api_require_auth();
$token = $auth["adminToken"] !== "" ? $auth["adminToken"] : $auth["userToken"];

try {
  $gc      = ServiceContextGame::getGameContext();
  $game    = $gc["game"] ?? [];
  $courseId = trim((string)($game["dbGames_CourseID"] ?? ""));

  $effectiveHI    = gp_effective_hi($ghin, $manualHi, $game, $token);
  $teeSets        = be_buildTeeSetTags("Index", $effectiveHI, $gender, $game, $token);

  $userRow        = ServiceUserContext::retrieveGHINUser($ghin);
  $preferredYards = gp_decode_preference_yards($userRow["dbUser_PreferenceYards"] ?? null);

  // ── options mode (existing behaviour — path 1 single player) ─────────────
  if ($mode !== "resolve") {
    echo json_encode([
      "ok" => true,
      "payload" => [
        "hi"             => $effectiveHI,
        "teeSets"        => $teeSets,
        "preferredYards" => $preferredYards,
      ]
    ]);
    exit;
  }

  // ── resolve mode (paths 2, 3, 4) ─────────────────────────────────────────
  // Run the four-tier hierarchy and return the winning tee plus its source.

  // Build a flat lookup of dest course tee sets keyed by teeSetID.
  // $teeSets is already built by be_buildTeeSetTags — we use it directly.
  $resolvedTeeId     = null;
  $resolvedTeeSource = null;
  $resolvedTeeText   = null;

  // Tier 1 — Same-course carry (path 4 only).
  // Caller passes sourceGameTeeSetId when importing from another game.
  if ($resolvedTeeId === null && $sourceGameTeeId !== "") {
    foreach ($teeSets as $t) {
      if (trim((string)($t["teeSetID"] ?? $t["value"] ?? "")) === $sourceGameTeeId) {
        $resolvedTeeId     = $sourceGameTeeId;
        $resolvedTeeSource = "same_course";
        $resolvedTeeText   = gp_build_tee_text($t);
        break;
      }
    }
  }

  // Tier 2 — Last played tee on this course.
  // Skip for Non-Rated players (NH prefix) — they have no persistent identity.
  if ($resolvedTeeId === null && $courseId !== "" && !str_starts_with($ghin, "NH")) {
    $lastTeeId = ServiceDbPlayers::getLastPlayedTeeForCourse($ghin, $courseId);
    if ($lastTeeId !== null) {
      foreach ($teeSets as $t) {
        if (trim((string)($t["teeSetID"] ?? $t["value"] ?? "")) === $lastTeeId) {
          $resolvedTeeId     = $lastTeeId;
          $resolvedTeeSource = "last_played";
          $resolvedTeeText   = gp_build_tee_text($t);
          break;
        }
      }
    }
  }

  // Tier 3 — Preferred yardage match.
  // Uses same logic as findRecommendedTee() in teesetSelection.js.
  // Skip for Non-Rated players — they have no dbUsers record.
  if ($resolvedTeeId === null && $preferredYards !== null && !str_starts_with($ghin, "NH")) {
    $matched = gp_find_preferred_tee($teeSets, $preferredYards, $gender);
    if ($matched !== null) {
      $resolvedTeeId     = trim((string)($matched["teeSetID"] ?? $matched["value"] ?? ""));
      $resolvedTeeSource = "preferred_yardage";
      $resolvedTeeText   = gp_build_tee_text($matched);
    }
  }

  // No tier resolved — caller will use the picker fallback tee.
  echo json_encode([
    "ok" => true,
    "payload" => [
      "hi"               => $effectiveHI,
      "teeSets"          => $teeSets,
      "preferredYards"   => $preferredYards,
      "resolvedTeeId"    => $resolvedTeeId,
      "resolvedTeeSource"=> $resolvedTeeSource,
      "resolvedTeeText"  => $resolvedTeeText,
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

function gp_decode_preference_yards($raw): ?array
{
  if (!is_string($raw)) return null;

  $trim = trim($raw);
  if ($trim === "") return null;

  $decoded = json_decode($trim, true);
  if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) return null;

  $min = isset($decoded["min"]) ? (int)$decoded["min"] : 0;
  $max = isset($decoded["max"]) ? (int)$decoded["max"] : 0;

  if ($min < 0 || $max <= 0 || $min >= $max) return null;

  return [
    "min" => $min,
    "max" => $max,
  ];
}

/**
 * Build a human-readable tee label from a tee set array.
 * Mirrors formatAssignedTeeText() in game_players.js.
 */
function gp_build_tee_text(array $t): string
{
  $name  = trim((string)($t["teeSetName"] ?? $t["name"] ?? $t["label"] ?? ""));
  $yards = trim((string)($t["teeSetYards"] ?? $t["yards"] ?? ""));
  if ($yards !== "" && $yards !== "0") {
    return $name . " • " . number_format((int)$yards) . " yds";
  }
  return $name;
}

/**
 * Find the best tee match for a player's preferred yardage range.
 * Mirrors findRecommendedTee() in teesetSelection.js — keep both in sync.
 *
 * Priority:
 *   1. Single tee inside [min, max]
 *   2. Multiple inside range — closest to midpoint (or edge if open-ended)
 *   3. Closest tee outside range
 */
function gp_find_preferred_tee(array $teeSets, array $preferredYards, string $gender): ?array
{
  $min = (int)($preferredYards["min"] ?? 0);
  $max = (int)($preferredYards["max"] ?? 0);
  if ($max <= 0 || $min >= $max) return null;

  // Filter to matching gender first; fall back to all tees if none match
  $gU = strtoupper(substr($gender, 0, 1));
  $candidates = ($gU !== "")
    ? array_values(array_filter($teeSets, fn($t) => strtoupper(substr((string)($t["gender"] ?? ""), 0, 1)) === $gU))
    : $teeSets;
  if (empty($candidates)) $candidates = $teeSets;

  // Attach numeric yards to each candidate
  $withYards = array_values(array_filter(array_map(function($t) {
    $raw = preg_replace('/[^\d.]/', '', (string)($t["teeSetYards"] ?? $t["yards"] ?? ""));
    $y   = (int)$raw;
    return $y > 0 ? ["tee" => $t, "yards" => $y] : null;
  }, $candidates)));

  if (empty($withYards)) return null;

  $inside = array_values(array_filter($withYards, fn($x) => $x["yards"] >= $min && $x["yards"] <= $max));

  if (count($inside) === 1) return $inside[0]["tee"];

  if (count($inside) > 1) {
    if ($min <= 0) {
      usort($inside, fn($a, $b) => $a["yards"] - $b["yards"]);
      return $inside[0]["tee"];
    }
    if ($max >= 9999) {
      usort($inside, fn($a, $b) => $b["yards"] - $a["yards"]);
      return $inside[0]["tee"];
    }
    $mid = (int)round(($min + $max) / 2);
    usort($inside, fn($a, $b) => abs($a["yards"] - $mid) - abs($b["yards"] - $mid));
    return $inside[0]["tee"];
  }

  // Nothing inside range — find closest overall
  $mid = (int)round(($min + $max) / 2);
  usort($withYards, fn($a, $b) => abs($a["yards"] - $mid) - abs($b["yards"] - $mid));
  return $withYards[0]["tee"];
}
