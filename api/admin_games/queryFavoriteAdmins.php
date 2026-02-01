<?php
// /api/admin_games/queryFavoriteAdmins.php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/database/service_dbFavAdmins.php';

header('Content-Type: application/json; charset=utf-8');

// Auth/session (simple + consistent)
$user   = (string)($_SESSION["SessionGHINLogonID"] ?? "");
$clubId = (string)($_SESSION["SessionClubID"] ?? "");

if ($user === "" || $clubId === "") {
  http_response_code(401);
  echo json_encode(["error" => "AUTH_REQUIRED", "redirectUrl" => MA_ROUTE_LOGIN]);
  exit;
}

$body = json_decode(file_get_contents("php://input"), true) ?: [];
$payload = is_array($body["payload"] ?? null) ? $body["payload"] : $body;

$selected = $payload["selectedAdminKeys"] ?? [];
if (!is_array($selected)) $selected = [];

// New PDO usage (bootstrap already Db::init()'d)
$pdo = Db::pdo();

$data = ServiceDbFavAdmins::queryFavoriteAdmins($pdo, [
  "userGHIN" => $user,
  "clubId" => $clubId,
  "selectedAdminKeys" => $selected
]);

echo json_encode([
  "ok" => true,
  "payload" => $data
], JSON_UNESCAPED_SLASHES);
