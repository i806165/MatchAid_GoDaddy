<?php
// /public_html/api/event_maintenance/deleteEvent.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";

ma_api_require_auth();

$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : $in;
$eid = (int)($payload["eid"] ?? 0);

if ($eid <= 0) {
  ma_respond(400, ["ok" => false, "message" => "Invalid EID."]);
}

$userGHIN = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$userFacilityId = trim((string)($_SESSION["SessionFacilityID"] ?? $_SESSION["SessionGHINFacilityID"] ?? ""));

$auth = ServiceContextEvent::computeEventAuthorizations([
  "userGHIN" => $userGHIN,
  "eid" => $eid,
  "userFacilityId" => $userFacilityId,
  "action" => "delete"
]);

if (!$auth["canDelete"]) {
  ma_respond(403, ["ok" => false, "message" => "Not authorized to delete this event."]);
}

try {
  $deleted = ServiceDbEvents::deleteEvent($eid);
  if ($deleted) {
    if ((int)(ServiceContextEvent::getStoredEID() ?? 0) === $eid) {
      ServiceContextEvent::clearEventContext();
    }
    ma_respond(200, ["ok" => true, "message" => "Event deleted successfully."]);
  }

  ma_respond(404, ["ok" => false, "message" => "Event not found or could not be deleted."]);
} catch (Throwable $e) {
  error_log("[event_maintenance/deleteEvent] EX " . $e->getMessage());
  ma_respond(500, ["ok" => false, "message" => $e->getMessage() ?: "Server error deleting event."]);
}
