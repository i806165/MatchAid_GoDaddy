<?php
// /public_html/api/admin_games/games.php
declare(strict_types=1);

session_start();
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_SERVICES . "/database/service_dbGames.php";

header("Content-Type: application/json; charset=utf-8");

// Session-provided context (set by getUserContext on page load)
$clubId = trim((string)($_SESSION["SessionClubID"] ?? ""));
if ($clubId === "") {
  http_response_code(401);
  echo json_encode(["error" => "AUTH_REQUIRED", "redirectUrl" => MA_ROUTE_LOGIN]);
  exit;
}

$body = json_decode(file_get_contents("php://input"), true) ?: [];
$payload = is_array($body["payload"] ?? null) ? $body["payload"] : $body;

$dateFrom = strval($payload["dateFrom"] ?? "");
$dateTo   = strval($payload["dateTo"] ?? "");

$selected = $payload["selectedAdminKeys"] ?? [];
if (!is_array($selected)) $selected = [];

$pdo = Db::pdo();

$res = ServiceDbGames::queryGames($pdo, [
  "clubId" => $clubId,
  "dateFrom" => $dateFrom,
  "dateTo" => $dateTo,
  "selectedAdminKeys" => $selected,
  "includePlayerCounts" => true
]);

echo json_encode([
  "ok" => true,
  // JS expects the games object as payload (raw/vm)
  "payload" => ($res["games"] ?? ["raw" => [], "vm" => []])
], JSON_UNESCAPED_SLASHES);
