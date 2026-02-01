<?php
// /api/admin_games/init.php (optional fallback; primary INIT is server-embedded in gameslist.php)
declare(strict_types=1);

session_start();
require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/workflows/hydrateAdminGamesList.php';

header('Content-Type: application/json; charset=utf-8');

// Validate session (and hydrate SessionClubID/Name/Tokens if needed)
$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
  http_response_code(401);
  echo json_encode(["error" => "AUTH_REQUIRED", "redirectUrl" => MA_ROUTE_LOGIN]);
  exit;
}

// Build the workflow context from session variables (post-hydration)
$userGHIN = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$clubId   = trim((string)($_SESSION["SessionClubID"] ?? ""));
$clubName = trim((string)($_SESSION["SessionClubName"] ?? ""));

$context = [
  "userGHIN"  => $userGHIN,
  "clubId"    => $clubId,
  "clubName"  => $clubName,
];

// Default filters: today .. today+30
$today  = new DateTimeImmutable("today");
$plus30 = $today->modify("+30 days");

$filters = [
  "mode" => "current",
  "dateFrom" => $today->format("Y-m-d"),
  "dateTo" => $plus30->format("Y-m-d"),
  "selectedAdminKeys" => ($userGHIN !== "" ? [$userGHIN] : []),
];

// New signature: hydrateAdminGamesList(context, filters)
$payload = hydrateAdminGamesList($context, $filters);

echo json_encode(["ok" => true, "payload" => $payload], JSON_UNESCAPED_SLASHES);
