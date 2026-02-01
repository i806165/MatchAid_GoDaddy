<?php
// /public_html/api/admin_games/upsertFavoriteAdmin.php
declare(strict_types=1);

session_start();
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/database/service_dbFavAdmins.php";

header("Content-Type: application/json; charset=utf-8");

$userGHIN = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
if ($userGHIN === "") {
  http_response_code(401);
  echo json_encode(["error" => "AUTH_REQUIRED", "redirectUrl" => MA_ROUTE_LOGIN]);
  exit;
}

$body = json_decode(file_get_contents("php://input"), true) ?: [];
$payload = is_array($body["payload"] ?? null) ? $body["payload"] : $body;

$adminKey = trim((string)($payload["adminKey"] ?? ""));
if ($adminKey === "") {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "MISSING_ADMINKEY"]);
  exit;
}

$pdo = Db::pdo();

$res = ServiceDbFavAdmins::upsertFavoriteAdmin($pdo, [
  "userGHIN" => $userGHIN,
  "adminKey" => $adminKey,
  // Optional fields if provided:
  "adminLName" => strval($payload["adminLName"] ?? ""),
  "facilityId" => strval($payload["facilityId"] ?? ""),
  "facilityName" => strval($payload["facilityName"] ?? "")
]);

echo json_encode([
  "ok" => true,
  "payload" => $res
], JSON_UNESCAPED_SLASHES);
