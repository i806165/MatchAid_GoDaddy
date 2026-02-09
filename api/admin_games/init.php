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

// Apply default filters: today .. today+30 or restore last used from session
// Default filters (used only if no persisted session filters exist)
$today  = new DateTimeImmutable("today");
$plus30 = $today->modify("+30 days");

$defaultFrom = $today->format("Y-m-d");
$defaultTo   = $plus30->format("Y-m-d");

// --- Restore from session (legacy keys) ---
$sFromRaw  = trim((string)($_SESSION["AP_FILTERDATEFROM"] ?? ""));
$sToRaw    = trim((string)($_SESSION["AP_FILTERDATETO"] ?? ""));
$sScopeRaw = strtoupper(trim((string)($_SESSION["AP_FILTERADMINSCOPE"] ?? "ME")));

// admins is stored as JSON string
$sAdminsRaw = (string)($_SESSION["AP_FILTER_ADMINS"] ?? "[]");
$sAdmins = json_decode($sAdminsRaw, true);
if (!is_array($sAdmins)) $sAdmins = [];

// normalize admin keys array
$sAdmins = array_values(array_unique(array_filter(array_map("strval", $sAdmins))));

// validate scope
$adminScope = in_array($sScopeRaw, ["ME", "ALL", "CUSTOM"], true) ? $sScopeRaw : "ME";

// use restored dates if present; otherwise defaults
$dateFrom = ($sFromRaw !== "") ? $sFromRaw : $defaultFrom;
$dateTo   = ($sToRaw   !== "") ? $sToRaw   : $defaultTo;

// UI-selected admins
$uiSelectedKeys = $sAdmins;

// legacy fallback: if nothing stored yet, default to ME
if (!$uiSelectedKeys && $userGHIN !== "") {
  $uiSelectedKeys = [$userGHIN];
}

// QUERY admin keys (perf hack preserved): when ALL, query should not filter by key
$querySelectedKeys = ($adminScope === "ALL") ? [] : $uiSelectedKeys;

// Filters passed into hydrate
$filters = [
  "mode" => "current",
  "dateFrom" => $dateFrom,
  "dateTo" => $dateTo,
  "selectedAdminKeys" => $querySelectedKeys,

  // keep intent available (hydrate may ignore; we'll also inject into payload after)
  "adminScope" => $adminScope
];


// New signature: hydrateAdminGamesList(context, filters)
$payload = hydrateAdminGamesList($context, $filters);

// Ensure UI restores the last-used criteria (even when adminScope === ALL)
$payload["filters"] = $payload["filters"] ?? [];
$payload["filters"]["dateFrom"] = $dateFrom;
$payload["filters"]["dateTo"] = $dateTo;
$payload["filters"]["adminScope"] = $adminScope;

// For ALL, set UI selection to all admin keys if we have them in the payload
if ($adminScope === "ALL") {
  $adminsAll = $payload["admins"]["all"] ?? [];
  $allKeys = [];
  foreach ($adminsAll as $a) {
    $k = (string)($a["key"] ?? "");
    if ($k !== "") $allKeys[] = $k;
  }
  $payload["filters"]["selectedAdminKeys"] = array_values(array_unique($allKeys));
} else {
  $payload["filters"]["selectedAdminKeys"] = $uiSelectedKeys;
}

echo json_encode(["ok" => true, "payload" => $payload], JSON_UNESCAPED_SLASHES);
