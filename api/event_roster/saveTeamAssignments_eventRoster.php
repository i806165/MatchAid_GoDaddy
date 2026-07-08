<?php
declare(strict_types=1);
// /public_html/api/event_roster/saveTeamAssignments.php
//
// Bulk-saves player team assignments to dbEventPlayers_TeamKey on
// db_EventPlayers. Mirrors /api/game_players/saveTeamAssignments.php,
// scoped to EID instead of GGID.
//
// This always runs immediately after saveTeamConfig.php in the same
// Apply (see manage_teams.js's _applyChanges()), so dbEvents_TeamMode
// is already current in the DB by the time this executes — no mode
// needs to be passed in the request body here.
//
// Request body:
//   { "assignments": [ { "ghin": "1234567", "team": "T1" }, ... ] }
//
// Success response:
//   { "ok": true, "payload": { "players": [ ...full roster rows... ] } }

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

    // 3) Current mode — saveTeamConfig.php already persisted it moments
    //    earlier in this same Apply sequence.
    $event = $ec["event"] ?? ServiceDbEvents::getEventByEID($eid);
    $mode  = (string)($event["dbEvents_TeamMode"] ?? "none");

    // 4) Valid team key values
    $validTeams = ["T1", "T2", ""];

    // 5) Input
    $in          = ma_json_in();
    $assignments = $in["assignments"] ?? [];
    if (!is_array($assignments)) $assignments = [];

    // 6) Save each assignment
    $saved = 0;
    $ghinToTeam = [];

    foreach ($assignments as $a) {
        $ghin = trim((string)($a["ghin"] ?? ""));
        $team = trim((string)($a["team"] ?? ""));

        if ($ghin === "") continue;

        if (!in_array($team, $validTeams, true)) {
            Logger::warn("SAVE_EVENT_TEAM_ASSIGNMENTS_INVALID_TEAM", [
                "eid" => $eid, "ghin" => $ghin, "team" => $team,
            ]);
            $team = "";
        }

        ServiceDbEventPlayers::upsertEventPlayer($eid, $ghin, [
            "dbEventPlayers_TeamKey" => $team,
        ]);
        $saved++;
        $ghinToTeam[$ghin] = $team;
    }

    // 7) Propagate — only when cascading is on.
    if ($mode === "fixed") {
        WorkflowProcessEventCascade::propagateTeamAssignments($eid, $ghinToTeam);
    }

    // 8) Return refreshed roster
    $players = ServiceDbEventPlayers::getEventRoster($eid);
    echo json_encode(["ok" => true, "payload" => ["players" => $players]]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_TEAM_ASSIGNMENTS_EXCEPTION", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Server error saving team assignments."]);
}
