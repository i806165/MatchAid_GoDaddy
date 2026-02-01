<?php
// /public_html/api/admin_games/query.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/workflows/hydrateAdminGamesList.php";

session_start();

// FAST session guard (no DB hit)
$userGHIN = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$clubId   = trim((string)($_SESSION["SessionClubID"] ?? ""));
$clubName = trim((string)($_SESSION["SessionClubName"] ?? ""));

if ($userGHIN === "" || $clubId === "") {
  ma_respond(401, ["error" => "AUTH_REQUIRED", "redirectUrl" => MA_ROUTE_LOGIN]);
}

// Build context from session (no DB/userContext re-fetch here)
$context = [
  "userGHIN" => $userGHIN,
  "clubId"   => $clubId,
  "clubName" => $clubName,
];

// Filters come from request payload (or empty)
$body = json_decode(file_get_contents("php://input"), true) ?: [];
$payloadIn = is_array($body["payload"] ?? null) ? $body["payload"] : $body;

// Allow either {filters:{...}} or direct filter keys
$filters = is_array($payloadIn["filters"] ?? null) ? $payloadIn["filters"] : $payloadIn;

try {
  $payload = hydrateAdminGamesList($context, $filters);
  ma_respond(200, ["ok" => true, "data" => $payload]);
} catch (Throwable $e) {
  error_log("[admin_games/query] EX=" . $e->getMessage());
  ma_respond(500, ["ok" => false, "error" => "Server error"]);
}
