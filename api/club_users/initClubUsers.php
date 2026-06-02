<?php
// /public_html/api/club_users/initClubUsers.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/workflows/hydrateClubUsers.php";

/**
 * buildClubUsersInit
 *
 * Shared builder used by both the page controller (clubusers.php)
 * and this file when called directly as an API endpoint.
 *
 * Auth and facility must be validated by the caller before invoking.
 *
 * @param array $ctx  Validated user context (must be ok)
 * @return array      INIT payload
 */
function buildClubUsersInit(array $ctx): array {

  $context = [
    "userGHIN"     => strval($ctx["userGHIN"] ?? ($_SESSION["SessionGHINLogonID"] ?? "")),
    "clubId"       => strval($_SESSION["SessionClubID"]                ?? ""),
    "clubName"     => strval($_SESSION["SessionClubName"]              ?? ""),
    "facilityId"   => strval($_SESSION["clubhomeSession_FacilityID"]   ?? ""),
    "facilityName" => strval($_SESSION["clubhomeSession_FacilityName"] ?? ""),
  ];

  return hydrateClubUsers($context);
}

// ----------------------------------------------------------------
// Dual-mode:
//   - Included by clubusers.php (page controller) →
//     buildClubUsersInit() is used, no output produced here.
//   - Called directly as an API endpoint (future re-query) →
//     auth check first, then hydrate, then return JSON.
// ----------------------------------------------------------------
$isDirect = (basename($_SERVER["SCRIPT_NAME"] ?? "") === basename(__FILE__));

if ($isDirect) {
  header("Content-Type: application/json; charset=utf-8");

  try {
    // ── Auth check FIRST — before any DB IO ──────────────────────
    $ctx = ServiceUserContext::getUserContext();
    if (!$ctx || empty($ctx["ok"])) {
      http_response_code(401);
      echo json_encode([
        "ok"          => false,
        "error"       => "AUTH_REQUIRED",
        "redirectUrl" => MA_ROUTE_LOGIN,
      ], JSON_UNESCAPED_SLASHES);
      exit;
    }

    // ── Facility guard ────────────────────────────────────────────
    if (empty($_SESSION["clubhomeSession_FacilityID"])) {
      http_response_code(403);
      echo json_encode([
        "ok"          => false,
        "error"       => "FACILITY_REQUIRED",
        "redirectUrl" => MA_ROUTE_CLUB_HOME,
      ], JSON_UNESCAPED_SLASHES);
      exit;
    }

    // ── Hydrate ───────────────────────────────────────────────────
    $out = buildClubUsersInit($ctx);

    echo json_encode([
      "ok"      => true,
      "payload" => $out,
    ], JSON_UNESCAPED_SLASHES);
    exit;

  } catch (Throwable $e) {
    Logger::error("CLUB_USERS_INIT_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode([
      "ok"      => false,
      "error"   => "CLUB_USERS_INIT_FAIL",
      "message" => $e->getMessage(),
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }
}
