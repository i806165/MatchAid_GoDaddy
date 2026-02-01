<?php
// /public_html/api/admin_games/admins.php
declare(strict_types=1);

session_start();
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/database/service_dbFavAdmins.php";

header("Content-Type: application/json; charset=utf-8");

// Session-provided context (set by getUserContext on page load)
$userGHIN = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$clubId   = trim((string)($_SESSION["SessionClubID"] ?? ""));

if ($userGHIN === "" || $clubId === "") {
  http_response_code(401);
  echo json_encode(["error" => "AUTH_REQUIRED", "redirectUrl" => MA_ROUTE_LOGIN]);
  exit;
}

$body = json_decode(file_get_contents("php://input"), true) ?: [];
$payload = is_array($body["payload"] ?? null) ? $body["payload"] : $body;

$selected = $payload["selectedAdminKeys"] ?? [];
if (!is_array($selected)) $selected = [];

$pdo = Db::pdo();

$data = ServiceDbFavAdmins::queryFavoriteAdmins($pdo, [
  "userGHIN" => $userGHIN,
  "clubId" => $clubId,
  "selectedAdminKeys" => $selected
]);

echo json_encode([
  "ok" => true,
  "payload" => $data
], JSON_UNESCAPED_SLASHES);
