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
require_once MA_SERVICES . "/workflows/workflow_TeeResolution.php";

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

/*
// Old                              New
$effectiveHI = gp_effective_hi(    $effectiveHI = tr_effective_hi(
$preferredYards = gp_decode_...    $preferredYards = tr_decode_preference_yards(
$matched = gp_find_preferred_tee(  $matched = tr_find_preferred_tee(
$resolvedTeeText = gp_build_tee_   $resolvedTeeText = tr_build_tee_text(
*/

try {
  $gc      = ServiceContextGame::getGameContext();
  $game    = $gc["game"] ?? [];
  $courseId = trim((string)($game["dbGames_CourseID"] ?? ""));

  $effectiveHI    = tr_effective_hi($ghin, $manualHi, $game, $token);
  $teeSets        = be_buildTeeSetTags("Index", $effectiveHI, $gender, $game, $token);

  $userRow        = ServiceUserContext::retrieveGHINUser($ghin);
  $preferredYards = tr_decode_preference_yards($userRow["dbUser_PreferenceYards"] ?? null);

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
        $resolvedTeeText   = tr_build_tee_text($t);
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
          $resolvedTeeText   = tr_build_tee_text($t);
          break;
        }
      }
    }
  }

  // Tier 3 — Preferred yardage match.
  // Uses same logic as findRecommendedTee() in teesetSelection.js.
  // Skip for Non-Rated players — they have no dbUsers record.
  if ($resolvedTeeId === null && $preferredYards !== null && !str_starts_with($ghin, "NH")) {
    $matched = tr_find_preferred_tee($teeSets, $preferredYards, $gender);
    if ($matched !== null) {
      $resolvedTeeId     = trim((string)($matched["teeSetID"] ?? $matched["value"] ?? ""));
      $resolvedTeeSource = "preferred_yardage";
      $resolvedTeeText   = tr_build_tee_text($matched);
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

