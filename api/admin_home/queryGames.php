<?php
// /api/admin_home/queryGames.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/database/service_dbGames.php';
require_once MA_SERVICES . '/workflows/hydrateAdminGamesList.php';
require_once MA_API_LIB . "/Db.php";

header('Content-Type: application/json; charset=utf-8');

// Login guard — must have both GHIN and club in session
$ghinId = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$clubId = trim((string)($_SESSION["SessionClubID"] ?? ""));

if ($ghinId === "" || $clubId === "") {
  http_response_code(401);
  echo json_encode(["error" => "AUTH_REQUIRED", "redirectUrl" => MA_ROUTE_LOGIN]);
  exit;
}

// Derive clubId from stored user profile as a verified fallback.
// Session value is preferred — profile lookup only used if session clubId is missing.
if ($clubId === "") {
  $userRow = ServiceUserContext::retrieveGHINUser($ghinId);
  $profileArr = $userRow["dbUser_Profile"] ?? null;
  if (is_string($profileArr)) {
    $profileArr = json_decode($profileArr, true);
  }
  if (is_array($profileArr)) {
    $clubId = (string)($profileArr["club_id"] ?? $profileArr["clubId"] ?? $profileArr["clubID"] ?? $profileArr["ClubID"] ?? "");
    if ($clubId === "" && isset($profileArr["profileJson"]["golfers"][0])) {
      $clubId = (string)($profileArr["profileJson"]["golfers"][0]["club_id"] ?? "");
    }
  }
}

$body = json_decode(file_get_contents("php://input"), true) ?: [];
$payload = $body["payload"] ?? [];

// Resolve and validate adminScope BEFORE building $args
$adminScope = strtoupper(trim((string)($payload["adminScope"] ?? "ME")));
if (!in_array($adminScope, ["ME", "ALL", "CUSTOM"], true)) $adminScope = "ME";

$args = [
  "clubId"              => $clubId,
  "dateFrom"            => strval($payload["dateFrom"] ?? ""),
  "dateTo"              => strval($payload["dateTo"] ?? ""),
  "selectedAdminKeys"   => is_array($payload["selectedAdminKeys"] ?? null) ? $payload["selectedAdminKeys"] : [],
  "includePlayerCounts" => true,
  "adminScope"          => $adminScope,  // now correctly defined before use
];

// Prefer uiSelectedAdminKeys (always has the UI selection, even when scope=ALL
// and selectedAdminKeys is intentionally sent as []).
$uiKeys = is_array($payload["uiSelectedAdminKeys"] ?? null) ? $payload["uiSelectedAdminKeys"] : null;
$keysToStore = is_array($uiKeys) ? $uiKeys : $args["selectedAdminKeys"];

// Normalize + de-dupe
$keysToStore = array_values(array_unique(array_filter(array_map("strval", $keysToStore))));

$_SESSION["AP_FILTERDATEFROM"]   = (string)$args["dateFrom"];
$_SESSION["AP_FILTERDATETO"]     = (string)$args["dateTo"];
$_SESSION["AP_FILTER_ADMINS"]    = json_encode($keysToStore);
$_SESSION["AP_FILTERADMINSCOPE"] = $adminScope;

$data = ServiceDbGames::queryGames($args);

if (!is_array($data) || !array_key_exists("games", $data)) {
  echo json_encode([
    "ok"      => false,
    "error"   => "QUERY_GAMES_FAILED",
    "message" => is_array($data) ? ($data["message"] ?? $data["error"] ?? "Unknown service error") : "Service returned non-array",
    "payload" => [
      "clubId"                  => $clubId,
      "adminScope"              => $adminScope,
      "selectedAdminKeysCount"  => count($args["selectedAdminKeys"]),
    ]
  ], JSON_UNESCAPED_SLASHES);
  exit;
}

// Stamp yourPlayerKey onto each row — same function init.php/query.php
// already call via hydrateAdminGamesList(). Without this, every game
// row returned by this endpoint is missing yourPlayerKey entirely,
// which module_sourceGames.js reads as "no player key" (same as an
// empty string) — making the "Open Scoring Portal" menu item show
// disabled/"Scoring not yet Activated" even for games where the
// signed-in admin genuinely has a valid Scorecard ID.
$data = augmentGamesWithPlayerKey($data, $ghinId);

echo json_encode([
  "ok"      => true,
  "payload" => [
    "games" => $data["games"]
  ]
], JSON_UNESCAPED_SLASHES);