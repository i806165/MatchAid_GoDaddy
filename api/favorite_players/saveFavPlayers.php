<?php
// /api/favorite_players/saveFavPlayers.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
session_start();

header("Content-Type: application/json; charset=utf-8");

require_once MA_SERVICES . "/database/service_dbFavPlayers.php";

// Identity from session
$userGHIN  = (string)($_SESSION["SessionGHINLogonID"] ?? "");
$userState = (string)($_SESSION["SessionUserState"] ?? "");

if ($userGHIN === "") {
  http_response_code(401);
  echo json_encode(["ok" => false, "message" => "Session expired or not authenticated."]);
  exit;
}

// Input
$raw = file_get_contents("php://input");
$in = json_decode($raw ?: "{}", true);
if (!is_array($in)) $in = [];

$playerGHIN = (string)($in["playerGHIN"] ?? "");
$email      = (string)($in["email"] ?? "");
$mobile     = (string)($in["mobile"] ?? "");
$memberId   = (string)($in["memberId"] ?? "");
$groups     = $in["groups"] ?? [];
$playerName = (string)($in["playerName"] ?? "");
$playerLName= (string)($in["playerLName"] ?? "");
$playerHI   = (string)($in["playerHI"] ?? "");
$playerGender=(string)($in["playerGender"] ?? "");

if ($playerGHIN === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "message" => "playerGHIN is required."]);
  exit;
}

try {
  $result = service_dbFavPlayers::upsertFavorite(
    $userGHIN,
    $playerGHIN,
    ($email !== "" ? $email : null),
    ($mobile !== "" ? $mobile : null),
    ($memberId !== "" ? $memberId : null),
    (is_array($groups) ? $groups : []),
    ($playerName !== "" ? $playerName : null),
    ($playerLName !== "" ? $playerLName : null),
    ($playerHI !== "" ? $playerHI : null),
    ($playerGender !== "" ? $playerGender : null)
  );
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(["ok" => false, "message" => $e->getMessage()]);
  exit;
}

// Return refreshed payload (JS expects favorites + groups)
$returnAction = (string)($_SESSION["SessionFavReturnAction"] ?? "");
if ($returnAction === "") $returnAction = "favoritePlayersList";

echo json_encode([
  "ok" => true,
  "payload" => [
    "context" => [
      "userGHIN"  => $userGHIN,
      "userState" => $userState,
    ],
    "favorites" => service_dbFavPlayers::getFavoritesForUser($userGHIN),
    "groups"    => service_dbFavPlayers::getGroupsForUser($userGHIN),
    "returnAction" => $returnAction,
    "result" => $result, // optional; harmless if JS ignores
  ]
]);
