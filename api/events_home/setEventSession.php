<?php
// /public_html/api/events_home/setEventSession.php
declare(strict_types=1);
//
// Status code convention: matches the rest of the app (admin_games) —
// the "not authorized for this event" outcome is an expected business
// result (the user clicked/was routed to an event outside their access)
// and returns HTTP 200 with {ok:false, message}, since MA.postJson()
// throws on any non-2xx status and this is shown inline, not treated
// as an exceptional failure. The "not logged in" case stays a real 401
// (handled specially by postJson as a login redirect).

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";

ma_api_require_auth();

$who = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
if ($who === "") {
  ma_respond(401, ["ok" => false, "error" => "Not logged in."]);
}

$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : $in;
$eid = (int)($payload["eid"] ?? 0);

if ($eid <= 0) {
  ServiceContextEvent::clearEventContext();
  ma_respond(200, ["ok" => true, "payload" => ["eid" => null]]);
}

$userFacilityId = trim((string)($_SESSION["SessionFacilityID"] ?? $_SESSION["SessionGHINFacilityID"] ?? ""));

$auth = ServiceContextEvent::computeEventAuthorizations([
  "userGHIN" => $who,
  "eid" => $eid,
  "userFacilityId" => $userFacilityId,
  "action" => "view"
]);

if ($auth["status"] !== "Authorized") {
  ma_respond(200, ["ok" => false, "message" => "Not authorized for this event."]);
}

ServiceContextEvent::setEventContext($eid);
unset($_SESSION["SessionStoredGGID"]); // clear stale game context on event entry

ma_respond(200, ["ok" => true, "payload" => ["eid" => $eid]]);