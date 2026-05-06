<?php
// /public_html/api/club_demand/initClubDemand.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/workflows/hydrateClubDemand.php";

/**
 * buildClubDemandInit
 *
 * Shared builder used by both the page controller (clubDemand.php)
 * and this file when called directly as an API endpoint.
 *
 * Auth must be validated by the caller before invoking this function.
 *
 * @param array $ctx      Validated user context (must be ok)
 * @param array $filters  dateFrom / dateTo
 * @return array          INIT payload
 */
function buildClubDemandInit(array $ctx, array $filters): array {

  $context = [
    "userGHIN"  => strval($ctx["userGHIN"] ?? ($_SESSION["SessionGHINLogonID"] ?? "")),
    "clubId"    => strval($_SESSION["SessionClubID"]   ?? ""),
    "clubName"  => strval($_SESSION["SessionClubName"] ?? ""),
  ];

  return hydrateClubDemand($context, $filters);
}

// ----------------------------------------------------------------
// Dual-mode:
//   - Included by clubDemand.php (page controller) → only
//     buildClubDemandInit() is used, no output produced here.
//   - Called directly as an API endpoint (date range change) →
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

    // ── Parse request body ────────────────────────────────────────
    $raw     = file_get_contents("php://input");
    $body    = json_decode($raw ?: "{}", true) ?: [];
    $payload = is_array($body["payload"] ?? null) ? $body["payload"] : $body;
    $filters = is_array($payload["filters"] ?? null) ? $payload["filters"] : $payload;

    // ── Persist date filter to session (restore on page return) ──
    $_SESSION["CD_FILTERFACILITYID"] = trim(strval($filters["facilityId"] ?? ""));
    $_SESSION["CD_FILTERDATEFROM"]   = trim(strval($filters["dateFrom"]   ?? ""));
    $_SESSION["CD_FILTERDATETO"]     = trim(strval($filters["dateTo"]     ?? ""));

    // ── Hydrate ───────────────────────────────────────────────────
    $out = buildClubDemandInit($ctx, $filters);

    echo json_encode([
      "ok"      => true,
      "payload" => $out,
    ], JSON_UNESCAPED_SLASHES);
    exit;

  } catch (Throwable $e) {
    Logger::error("CLUB_DEMAND_INIT_FAIL", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode([
      "ok"      => false,
      "error"   => "CLUB_DEMAND_INIT_FAIL",
      "message" => $e->getMessage(),
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }
}