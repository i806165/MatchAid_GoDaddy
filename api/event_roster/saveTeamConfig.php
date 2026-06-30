<?php
declare(strict_types=1);
// /public_html/api/event_roster/saveTeamConfig.php
//
// Saves team configuration JSON to dbEvents_TeamConfig on db_Events.
// Mirrors /api/game_players/saveTeamConfig.php, scoped to EID instead of GGID.
// Passing an empty teams array sets the column to NULL (resets teams).
//
// Request body:
//   { "teams": [ { "id": "T1", "name": "Red", "color": "red", "sort": 1 }, ... ] }
//
// Success response:
//   { "ok": true, "payload": { "teamConfig": { "teams": [...] } } }
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
            $color = ($id === "T1") ? "red" : "blue"; // safe fallback
        }

        $sanitized[] = [
            "id"    => $id,
            "name"  => mb_substr($name, 0, 32),
            "color" => $color,
            "sort"  => $sort,
        ];
    }

    // 6) Persist — NULL when resetting, JSON when setting
    $teamConfigJson = count($sanitized) === 0 ? null : json_encode(["teams" => $sanitized]);
    $updated = ServiceDbEvents::updateEvent($eid, ["dbEvents_TeamConfig" => $teamConfigJson]);

    if (!$updated) {
        Logger::error("SAVE_EVENT_TEAM_CONFIG_FAIL", ["eid" => $eid]);
        echo json_encode(["ok" => false, "message" => "Unable to save team configuration."]);
        exit;
    }

    $teamConfig = count($sanitized) === 0 ? null : ["teams" => $sanitized];
    echo json_encode(["ok" => true, "payload" => ["teamConfig" => $teamConfig]]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_TEAM_CONFIG_EXCEPTION", ["err" => $e->getMessage()]);
    http_response_code(500);
    echo json_encode(["ok" => false, "message" => "Server error saving team configuration."]);
}