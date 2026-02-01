<?php
// /api/admin_games/queryGames.php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/database/service_dbGames.php';
require_once MA_API_LIB . "/Db.php";

header('Content-Type: application/json; charset=utf-8');

$config = ma_config();

// Derive clubId from stored user profile (NOT initializeUserContext)
$ghinId = (string)$_SESSION["SessionGHINLogonID"];
$userRow = ServiceUserContext::retrieveGHINUser($ghinId, $config);

$profileArr = $userRow["dbUser_Profile"];
if (is_string($profileArr)) {
  $profileArr = json_decode($profileArr, true);
}

$clubId = (string)($profileArr["club_id"] ?? $profileArr["clubId"] ?? $profileArr["clubID"] ?? $profileArr["ClubID"] ?? "");
if ($clubId === "" && isset($profileArr["profileJson"]["golfers"][0])) {
  $clubId = (string)($profileArr["profileJson"]["golfers"][0]["club_id"] ?? "");
}

$body = json_decode(file_get_contents("php://input"), true) ?: [];
$payload = $body["payload"] ?? [];

$pdo = Db::pdo($config["db"]);

$args = [
  "clubId" => $clubId,
  "dateFrom" => strval($payload["dateFrom"] ?? ""),
  "dateTo" => strval($payload["dateTo"] ?? ""),
  "selectedAdminKeys" => is_array($payload["selectedAdminKeys"] ?? null) ? $payload["selectedAdminKeys"] : [],
  "includePlayerCounts" => true,
];

//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
error_log("[MA][queryGames] IN clubId={$clubId} df={$args['dateFrom']} dt={$args['dateTo']} adminKeysCount=" .
  (is_array($args['selectedAdminKeys']) ? count($args['selectedAdminKeys']) : 0) .
  " adminKeys=" . json_encode($args['selectedAdminKeys'])
);

//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

$data = ServiceDbGames::queryGames($pdo, $args);

//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
$vmLen  = (isset($data["games"]["vm"])  && is_array($data["games"]["vm"]))  ? count($data["games"]["vm"])  : 0;
$rawLen = (isset($data["games"]["raw"]) && is_array($data["games"]["raw"])) ? count($data["games"]["raw"]) : 0;
error_log("[MA][queryGames] OUT vm={$vmLen} raw={$rawLen}");
//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


echo json_encode([
  "ok" => true,
  "payload" => [
    "games" => $data["games"]
  ]
], JSON_UNESCAPED_SLASHES);