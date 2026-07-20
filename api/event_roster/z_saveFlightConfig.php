<?php
declare(strict_types=1);
// /public_html/api/event_roster/saveFlightConfig.php
//
// Saves flight configuration JSON and cascade mode to db_Events.
// Mirrors /api/event_roster/saveTeamConfig.php's mode handling.
// 1 to 5 entries (never 0 — an event always has at least one flight),
// no color. Ids are assigned canonically by position (F1..F5) rather
// than trusted from the client, mirroring the same defensive pattern
// used for Team's fixed T1/T2 ids. mode ("fixed"|"none") is bundled
// into this same save — flipping the toggle in module_defineFlights.js
// does nothing on its own until Apply sends it here alongside the
// config. When "fixed", the saved config propagates to every round
// linked to this event (assignments propagate separately, same request
// chain). When "none", rounds keep whatever flight state they already
// have — round-level Flight editing isn't built yet, so today "off"
// just means no further cascade, not an independently editable round.
//
// Request body:
//   { "flights": [ { "id": "F1", "name": "Championship", "sort": 1 }, ... ],
//     "mode": "fixed" | "none" }
//
// Success response:
//   { "ok": true, "payload": { "flightConfig": { "flights": [...] }, "mode": "fixed"|"none" } }
//
// Status code convention: matches the rest of the app (admin_games,
// event_roster) — expected business outcomes (bad input, no event
// selected) always return HTTP 200 with {ok:false, message}, since
// MA.postJson() throws on any non-2xx status. Only 405 (bad method),
// 401 (auth), and 500 (genuine server fault) use real non-2xx codes.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/workflows/workflow_ProcessEventCascade.php";

header("Content-Type: application/json; charset=utf-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    http_response_code(405);
    echo json_encode(["ok" => false, "message" => "Method not allowed."]);
    exit;
}

try {
    // 1) Auth
    $uc = ServiceUserContext::getUserContext();
    if (!$uc || empty($uc["ok"])) {
        http_response_code(401);
        echo json_encode(["ok" => false, "message" => "Session expired."]);
        exit;
    }

    // 2) EID always from session
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)($ec["eid"] ?? 0);
    if ($eid <= 0) {
        echo json_encode(["ok" => false, "message" => "No event selected."]);
        exit;
    }

    // 3) Input
    $in      = ma_json_in();
    $flights = $in["flights"] ?? [];
    if (!is_array($flights)) $flights = [];

    $mode = trim((string)($in["mode"] ?? "none"));
    if ($mode !== "fixed") $mode = "none"; // any invalid value coerces to off

    // 4) Validate — must be 1 to 5 entries; never 0
    $count = count($flights);
    if ($count < 1 || $count > 5) {
        echo json_encode(["ok" => false, "message" => "An event must have between 1 and 5 flights."]);
        exit;
    }

    // 5) Sanitize each entry — ids are assigned canonically by position,
    //    not trusted from the client, matching the Team pattern.
    $sanitized = [];
    foreach (array_values($flights) as $i => $f) {
        $name = trim((string)($f["name"] ?? ""));
        if ($name === "") {
            echo json_encode(["ok" => false, "message" => "Flight name cannot be empty."]);
            exit;
        }

        $sanitized[] = [
            "id"   => "F" . ($i + 1),
            "name" => mb_substr($name, 0, 32),
            "sort" => $i + 1,
        ];
    }

    // 6) Persist — always a real config, never NULL (floor of 1); mode always written
    $flightConfigJson = json_encode(["flights" => $sanitized]);
    $updated = ServiceDbEvents::updateEvent($eid, [
        "dbEvents_FlightConfig" => $flightConfigJson,
        "dbEvents_FlightMode"   => $mode,
    ]);

    if (!$updated) {
        Logger::error("SAVE_EVENT_FLIGHT_CONFIG_FAIL", ["eid" => $eid]);
        echo json_encode(["ok" => false, "message" => "Unable to save flight configuration."]);
        exit;
    }

    // 7) Propagate — only when cascading is on. Off leaves every linked
    //    round exactly as it already is.
    if ($mode === "fixed") {
        WorkflowProcessEventCascade::propagateFlightConfig($eid, ["flights" => $sanitized]);
    }

    echo json_encode(["ok" => true, "payload" => ["flightConfig" => ["flights" => $sanitized], "mode" => $mode]]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_FLIGHT_CONFIG_EXCEPTION", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Server error saving flight configuration."]);
}
