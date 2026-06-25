<?php
// /public_html/api/event_maintenance/saveEvent.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";

$auth = ma_api_require_auth();

$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : [];

$mode = strtolower(trim((string)($payload["mode"] ?? "edit")));
if ($mode !== "add" && $mode !== "edit") $mode = "edit";

$patch = $payload["patch"] ?? [];
if (!is_array($patch)) $patch = [];

try {
  $sessionCtx = [
    "eid" => (int)(ServiceContextEvent::getStoredEID() ?? 0),

    "adminGhin" => (string)($auth["ghinId"] ?? ""),
    "adminName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
    "adminLName" => (string)($_SESSION["SessionUserLName"] ?? ""),

    "adminAssocId" => (string)($_SESSION["SessionAdminAssocID"] ?? ""),
    "adminAssocName" => (string)($_SESSION["SessionAdminAssocName"] ?? ""),
    "adminClubId" => (string)($_SESSION["SessionAdminClubID"] ?? $_SESSION["SessionClubID"] ?? ""),
    "adminClubName" => (string)($_SESSION["SessionAdminClubName"] ?? $_SESSION["SessionClubName"] ?? ""),

    "facilityId" => (string)($_SESSION["SessionFacilityID"] ?? $_SESSION["SessionGHINFacilityID"] ?? ""),
    "facilityName" => (string)($_SESSION["SessionFacilityName"] ?? $_SESSION["SessionGHINFacilityName"] ?? ""),
  ];

  $result = ServiceDbEvents::saveEvent($mode, $patch, $sessionCtx);

  $newEID = (int)($result["eid"] ?? 0);
  if ($newEID > 0) {
    ServiceContextEvent::setEventContext($newEID);
  }

  ma_respond(200, [
    "ok" => true,
    "mode" => (string)($result["mode"] ?? "edit"),
    "eid" => $newEID,
    "event" => $result["event"] ?? null
  ]);
} catch (Throwable $e) {
  ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}
