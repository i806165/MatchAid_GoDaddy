<?php
// /public_html/api/event_roster/saveEventFlights.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ProcessEventCascade.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth();

$eid = (int)($_SESSION["SessionStoredEID"] ?? 0);

const MAX_FLIGHTS = 5;
const MIN_FLIGHTS = 1;

try {
    if ($eid <= 0) {
        throw new RuntimeException("No active Event ID was found.");
    }

    /*
     * { "payload": { "flights": [...], "mode": "fixed"|"none", "assignments": [{ghin, flight}] } }
     * mode here is always the event's dbEvents_FlightMode.
     */
    $input = ma_json_in();
    $body  = $input["payload"] ?? null;

    if (!is_array($body)) {
        ma_respond(400, ["ok" => false, "message" => "Invalid Flights payload."]);
    }

    $flights     = $body["flights"] ?? null;
    $mode        = trim((string)($body["mode"] ?? ""));
    $assignments = $body["assignments"] ?? null;

    if (!is_array($flights) || count($flights) < MIN_FLIGHTS || count($flights) > MAX_FLIGHTS) {
        ma_respond(400, ["ok" => false, "message" => "Flights requires between " . MIN_FLIGHTS . " and " . MAX_FLIGHTS . " flight definitions."]);
    }
    if (!in_array($mode, ["fixed", "none"], true)) {
        ma_respond(400, ["ok" => false, "message" => "Invalid flight cascade state."]);
    }
    if (!is_array($assignments)) {
        ma_respond(400, ["ok" => false, "message" => "Flights is missing player assignments."]);
    }

    $cleanFlights = [];
    $validIds = [];
    foreach (array_values($flights) as $i => $f) {
        $id   = "F" . ($i + 1);
        $name = trim((string)($f["name"] ?? ""));
        if ($name === "") {
            ma_respond(400, ["ok" => false, "message" => "Every flight needs a name."]);
        }
        $cleanFlights[] = ["id" => $id, "name" => $name, "sort" => $i + 1];
        $validIds[] = $id;
    }

    $cleanAssignments = [];
    foreach ($assignments as $a) {
        $ghin   = trim((string)($a["ghin"] ?? ""));
        $flight = trim((string)($a["flight"] ?? ""));
        if ($ghin === "") continue;
        if ($flight !== "" && !in_array($flight, $validIds, true)) {
            ma_respond(400, ["ok" => false, "message" => "Invalid flight assignment for one or more players."]);
        }
        $cleanAssignments[] = ["ghin" => $ghin, "flight" => $flight];
    }

    $patch = [
        "dbEvents_FlightConfig" => json_encode(["flights" => $cleanFlights], JSON_UNESCAPED_SLASHES),
        "dbEvents_FlightMode"   => $mode,
    ];
    $result = ServiceDbEvents::saveEvent("edit", $patch, ["eid" => $eid]);

    /*
     * NOTE: unlike Teams, ServiceDbEventPlayers has no dedicated
     * updateFlightKey() — only updateTeamKey() exists as a named method.
     * dbEventPlayers_FlightKey IS in ALLOWED_FIELDS though, so the
     * generic upsertEventPlayer() covers it correctly; just flagging the
     * asymmetry between the two rather than silently treating it as
     * uniform.
     */
    $savedPlayers = [];
    foreach ($cleanAssignments as $a) {
        try {
            $saved = ServiceDbEventPlayers::upsertEventPlayer(
                $eid,
                $a["ghin"],
                ["dbEventPlayers_FlightKey" => $a["flight"]]
            );
            if ($saved) $savedPlayers[] = $saved;
        } catch (Throwable $e) {
            Logger::error("SAVE_EVENT_FLIGHTS_PLAYER_FAIL", ["eid" => $eid, "ghin" => $a["ghin"], "error" => $e->getMessage()]);
        }
    }

    // Same two-call cascade as saveEventTeams.php — see its identical
    // comment for why these are separate calls, not one.
    WorkflowProcessEventCascade::propagateFlightConfig($eid, ["flights" => $cleanFlights]);
    $reconcile = WorkflowProcessEventCascade::propagateFlightAssignments($eid, []);

    ma_respond(200, [
        "ok"      => true,
        "payload" => [
            "flightConfig" => ["flights" => $cleanFlights],
            "mode"         => $mode,
            "players"      => $savedPlayers,
            "reconcile"    => $reconcile,
        ],
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_FLIGHTS_FAIL", ["eid" => $eid, "error" => $e->getMessage()]);
    ma_respond(500, ["ok" => false, "message" => "Unable to save Flights."]);
}
