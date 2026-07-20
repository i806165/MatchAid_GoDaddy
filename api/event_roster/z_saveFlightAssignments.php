<?php
declare(strict_types=1);
// /public_html/api/event_roster/saveFlightAssignments.php
//
// Bulk-saves per-player flight assignments to dbEventPlayers_FlightKey on
// db_EventPlayers. Mirrors /api/event_roster/saveTeamAssignments.php.
// Each assignment is { "ghin": "...", "flight": "F1".."F5" }.
// Unlike Team, there is no valid "unassigned" value — every player always
// has a flight (floor of 1 flight per event). A blank/invalid flight id
// falls back to the event's first flight rather than being cleared.
//
// This always runs immediately after saveFlightConfig.php in the same
// Apply (see module_defineFlights.js's _applyChanges()), so
// dbEvents_FlightMode is already current in the DB by the time this
// executes — no mode needs to be passed in the request body here.
//
// Request body:
//   { "assignments": [ { "ghin": "1234567", "flight": "F1" }, ... ] }
//
// Success response:
//   { "ok": true, "payload": { "players": [ ...full roster rows... ] } }
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
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";
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

    // 3) Load the event's current flight config to validate against and
    //    to resolve the fallback flight id (first configured flight).
    $event = $ec["event"] ?? ServiceDbEvents::getEventByEID($eid);
    $flightConfig = null;
    try {
        $raw = $event["dbEvents_FlightConfig"] ?? null;
        $flightConfig = $raw ? json_decode((string)$raw, true) : null;
    } catch (Throwable $e) {
        $flightConfig = null;
    }
    $validIds = array_column($flightConfig["flights"] ?? [], "id");
    if (!$validIds) $validIds = ["F1"]; // defensive — should never happen post-migration
    $fallbackId = $validIds[0];

    // 4) Input
    $in          = ma_json_in();
    $assignments = $in["assignments"] ?? [];
    if (!is_array($assignments)) $assignments = [];

    // 5) Save each assignment
    $updated = 0;
    $ghinToFlight = [];

    foreach ($assignments as $a) {
        if (!is_array($a)) continue;

        $ghin   = trim((string)($a["ghin"]   ?? ""));
        $flight = trim((string)($a["flight"] ?? ""));

        if ($ghin === "") continue;
        if (!in_array($flight, $validIds, true)) {
            Logger::warn("SAVE_EVENT_FLIGHT_ASSIGNMENTS_INVALID_FLIGHT", [
                "eid" => $eid, "ghin" => $ghin, "flight" => $flight,
            ]);
            $flight = $fallbackId;
        }

        ServiceDbEventPlayers::upsertEventPlayer($eid, $ghin, [
            "dbEventPlayers_FlightKey" => $flight,
        ]);
        $updated++;
        $ghinToFlight[$ghin] = $flight;
    }

    // 6) Propagate — only when cascading is on. Captures the reconciliation
    //    summary — see workflow_ProcessEventCascade.php.
    $reconcileSummary = ["roundsTouched" => 0, "roundsAffected" => 0, "affectedGgids" => []];
    if ((string)($event["dbEvents_FlightMode"] ?? "none") === "fixed") {
        $reconcileSummary = WorkflowProcessEventCascade::propagateFlightAssignments($eid, $ghinToFlight);
    }

    // 7) Return refreshed roster
    $roster = ServiceDbEventPlayers::getEventRoster($eid);
    echo json_encode(["ok" => true, "payload" => [
        "players" => $roster,
        "reconcile" => $reconcileSummary,
    ]]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_FLIGHT_ASSIGNMENTS_EXCEPTION", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Server error saving flight assignments."]);
}
