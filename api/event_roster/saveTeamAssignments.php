<?php
declare(strict_types=1);
// /public_html/api/event_roster/saveTeamAssignments.php
//
// Bulk-saves player team assignments to dbEventPlayers_TeamKey on
// db_EventPlayers. Mirrors /api/game_players/saveTeamAssignments.php,
// scoped to EID instead of GGID.
// Each assignment is { "ghin": "...", "team": "T1"|"T2"|"" }.
// Invalid team values are coerced to "" (unassigned) by
// ServiceDbEventPlayers::updateTeamKey().
//
// Request body:
//   { "assignments": [ { "ghin": "1234567", "team": "T1" }, ... ] }
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
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";

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
    $in          = ma_json_in();
    $assignments = $in["assignments"] ?? [];
    if (!is_array($assignments)) $assignments = [];

    // 4) Save each assignment — updateTeamKey() already validates/coerces
    //    invalid team values to "" internally (see service_dbEventPlayers.php).
    $saved = 0;
    foreach ($assignments as $a) {
        $ghin = trim((string)($a["ghin"] ?? ""));
        $team = trim((string)($a["team"] ?? ""));

        if ($ghin === "") continue;

        ServiceDbEventPlayers::updateTeamKey($eid, $ghin, $team);
        $saved++;
    }

    // 5) Return refreshed roster
    $players = ServiceDbEventPlayers::getEventRoster($eid);
    echo json_encode(["ok" => true, "payload" => ["players" => $players]]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_TEAM_ASSIGNMENTS_EXCEPTION", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Server error saving team assignments."]);
}
