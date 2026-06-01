<?php
// /public_html/api/club_home/setFacility.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextFacility.php";

header("Content-Type: application/json; charset=utf-8");

try {
  // ── Auth check FIRST ─────────────────────────────────────────
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

  // ── Parse request ─────────────────────────────────────────────
  $body       = json_decode(file_get_contents("php://input") ?: "{}", true) ?: [];
  $facilityId = trim(strval($body["facilityId"] ?? ""));

  if ($facilityId === "") {
    http_response_code(400);
    echo json_encode([
      "ok"    => false,
      "error" => "MISSING_FACILITY_ID",
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }

  // ── Validate — must be in the user's authorized facility list ─
  $userGHIN = trim(strval($_SESSION["SessionGHINLogonID"] ?? ""));
  $resolved = ServiceContextFacility::resolve($userGHIN, $facilityId);

  if (empty($resolved["authorized"])) {
    http_response_code(403);
    echo json_encode([
      "ok"    => false,
      "error" => "FACILITY_NOT_AUTHORIZED",
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }

  // Confirm the resolved facility matches what was requested
  if ($resolved["facilityId"] !== $facilityId) {
    http_response_code(403);
    echo json_encode([
      "ok"    => false,
      "error" => "FACILITY_NOT_AUTHORIZED",
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }

  // ── Persist to session ────────────────────────────────────────
  $_SESSION["SessionFacilityID"]          = $resolved["facilityId"];
  $_SESSION["SessionFacilityName"]        = $resolved["facilityName"];
  $_SESSION["SessionCanSelectFacility"]   = $resolved["canSelectFacility"];
  $_SESSION["SessionFacilityCanSearch"]   = $resolved["canSearch"];



  echo json_encode([
    "ok"           => true,
    "facilityId"   => $resolved["facilityId"],
    "facilityName" => $resolved["facilityName"],
  ], JSON_UNESCAPED_SLASHES);
  exit;

} catch (Throwable $e) {
  Logger::error("SET_FACILITY_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode([
    "ok"      => false,
    "error"   => "SET_FACILITY_FAIL",
    "message" => $e->getMessage(),
  ], JSON_UNESCAPED_SLASHES);
  exit;
}
