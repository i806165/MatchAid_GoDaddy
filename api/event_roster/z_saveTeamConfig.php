<?php
declare(strict_types=1);
// /public_html/api/event_roster/saveTeamConfig.php
//
// Saves team configuration JSON and cascade mode to db_Events.
// Passing an empty teams array sets dbEvents_TeamConfig to NULL (reset).
// mode ("fixed"|"none") is bundled into this same save — flipping the
// toggle in manage_teams.js does nothing on its own until Apply/Create
// sends it here alongside the config. When mode is "fixed", the saved
// config (and, separately, assignments) propagate down to every round
// linked to this event. When "none", rounds keep whatever they already
// have and are independently editable again.
//
// Request body:
//   { "teams": [ { "id": "T1", "name": "Red", "color": "red", "sort": 1 }, ... ],
//     "mode": "fixed" | "none" }
//
// Success response:
//   { "ok": true, "payload": { "teamConfig": {...}|null, "mode": "fixed"|"none" } }
//
// Status code convention: matches the rest of the app — expected business
// outcomes (bad input, no event selected) return HTTP 200 with
// {ok:false, message}; only 405/401/500 use real non-2xx codes.

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
    $in    = ma_json_in();
    $teams = $in["teams"] ?? [];
    if (!is_array($teams)) $teams = [];

    $mode = trim((string)($in["mode"] ?? "none"));
    if ($mode !== "fixed") $mode = "none"; // any invalid value coerces to off

    // 4) Validate — must be empty (reset) or exactly 2 entries
    if (count($teams) !== 0 && count($teams) !== 2) {
        echo json_encode(["ok" => false, "message" => "Teams must have exactly 0 or 2 entries."]);
        exit;
    }

    // 5) Validate each team entry when present
    $validIds    = ["T1", "T2"];
    $validColors = ["red", "blue"];
    $sanitized   = [];

    foreach ($teams as $t) {
        $id    = trim((string)($t["id"]    ?? ""));
        $name  = trim((string)($t["name"]  ?? ""));
        $color = trim((string)($t["color"] ?? ""));
        $sort  = (int)($t["sort"] ?? 0);

        if (!in_array($id, $validIds, true)) {
            echo json_encode(["ok" => false, "message" => "Invalid team id: {$id}."]);
            exit;
        }
        if ($name === "") {
            echo json_encode(["ok" => false, "message" => "Team name cannot be empty."]);
            exit;
        }
        if (!in_array($color, $validColors, true)) {
            $color = ($id === "T1") ? "red" : "blue";
        }

        $sanitized[] = [
            "id"    => $id,
            "name"  => mb_substr($name, 0, 32),
            "color" => $color,
            "sort"  => $sort,
        ];
    }

    // An empty config can't meaningfully cascade — force mode off with it,
    // same as manage_teams.js's own Reset flow already sends.
    if (!$sanitized) $mode = "none";

    // 6) Persist — NULL when resetting, JSON when setting; mode always written
    $teamConfigJson = count($sanitized) === 0 ? null : json_encode(["teams" => $sanitized]);
    $updated = ServiceDbEvents::updateEvent($eid, [
        "dbEvents_TeamConfig" => $teamConfigJson,
        "dbEvents_TeamMode"   => $mode,
    ]);

    if (!$updated) {
        Logger::error("SAVE_EVENT_TEAM_CONFIG_FAIL", ["eid" => $eid]);
        echo json_encode(["ok" => false, "message" => "Unable to save team configuration."]);
        exit;
    }

    // 7) Propagate — only when cascading is on. Off leaves every linked
    //    round's own dbGames_TeamConfig exactly as it already is.
    if ($mode === "fixed") {
        WorkflowProcessEventCascade::propagateTeamConfig($eid, $sanitized ? ["teams" => $sanitized] : null);
    }

    $teamConfig = count($sanitized) === 0 ? null : ["teams" => $sanitized];
    echo json_encode(["ok" => true, "payload" => ["teamConfig" => $teamConfig, "mode" => $mode]]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_TEAM_CONFIG_EXCEPTION", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Server error saving team configuration."]);
}
