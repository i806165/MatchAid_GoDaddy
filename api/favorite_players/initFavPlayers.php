<?php
// /api/favorite_players/initFavPlayers.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
session_start();

header("Content-Type: application/json; charset=utf-8");


require_once MA_SERVICES . "/database/service_dbFavPlayers.php";

$userGHIN  = (string)($_SESSION["SessionGHINLogonID"] ?? "");
$userState = (string)($_SESSION["SessionUserState"] ?? ""); // use your actual key if different

if ($userGHIN === "") {
  http_response_code(401);
  echo json_encode(["ok" => false, "message" => "Session expired or not authenticated."]);
  exit;
}

// Return action logic:
// - If launched from registrations, returnAction is registrations action
// - Else returnAction is favoritePlayersList (route back to list)
$returnAction = (string)($_SESSION["SessionFavReturnAction"] ?? "");
if ($returnAction === "") {
  $returnAction = "favorites";
}

// NEW PATTERN: endpoint orchestrates; service owns DB reads/writes
$favorites = service_dbFavPlayers::getFavoritesForUser($userGHIN); // SELECT * happens inside service
$groups    = service_dbFavPlayers::getGroupsForUser($userGHIN);

echo json_encode([
  "ok" => true,
  "payload" => [
    "context" => [
      "userGHIN"  => $userGHIN,
      "userState" => $userState,
    ],
    "favorites" => $favorites,
    "groups" => $groups,
    "returnAction" => $returnAction,
  ]
]);
