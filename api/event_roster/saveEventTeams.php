<?php
// /public_html/api/event_roster/saveEventTeams.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ProcessEventCascade.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth();

$eid = (int)($_SESSION["SessionStoredEID"] ?? 0);

try {
    if ($eid <= 0) {
        throw new RuntimeException("No active Event ID was found.");
    }

    /*
     * { "payload": { "teams": [...], "mode": "fixed"|"none", "assignments": [{ghin, team}] } }
     * mode here is always the event's dbEvents_TeamMode ("fixed"/"none",
     * cascade authority) — never the round's own dbGames_TeamMode, that's
     * saveGameTeams.php's concern.
     */
    $input = ma_json_in();
    $body  = $input["payload"] ?? null;

    if (!is_array($body)) {
        ma_respond(400, ["ok" => false, "message" => "Invalid Teams payload."]);
    }

    $teams       = $body["teams"] ?? null;
    $mode        = trim((string)($body["mode"] ?? ""));
    $assignments = $body["assignments"] ?? null;

    if (!is_array($teams) || count($teams) !== 2) {
        ma_respond(400, ["ok" => false, "message" => "Teams requires exactly two team definitions."]);
    }
    if (!in_array($mode, ["fixed", "none"], true)) {
        ma_respond(400, ["ok" => false, "message" => "Invalid team cascade state."]);
    }
    if (!is_array($assignments)) {
        ma_respond(400, ["ok" => false, "message" => "Teams is missing player assignments."]);
    }

    $cleanTeams = [];
    foreach ($teams as $t) {
        $id   = trim((string)($t["id"] ?? ""));
        $name = trim((string)($t["name"] ?? ""));
        if (!in_array($id, ["T1", "T2"], true) || $name === "") {
            ma_respond(400, ["ok" => false, "message" => "Each team needs a valid ID and a name."]);
        }
        $cleanTeams[] = [
            "id"    => $id,
            "name"  => $name,
            "color" => trim((string)($t["color"] ?? ($id === "T1" ? "red" : "blue"))),
            "sort"  => (int)($t["sort"] ?? ($id === "T1" ? 1 : 2)),
        ];
    }

    $cleanAssignments = [];
    foreach ($assignments as $a) {
        $ghin = trim((string)($a["ghin"] ?? ""));
        $team = trim((string)($a["team"] ?? ""));
        if ($ghin === "") continue;
        if (!in_array($team, ["T1", "T2", ""], true)) {
            ma_respond(400, ["ok" => false, "message" => "Invalid team assignment for one or more players."]);
        }
        $cleanAssignments[] = ["ghin" => $ghin, "team" => $team];
    }

    // Same all-or-none backstop as saveGameTeams.php, unconditional —
    // not gated on $mode === "fixed".
    $assignedCount = 0;
    foreach ($cleanAssignments as $a) {
        if ($a["team"] !== "") $assignedCount++;
    }
    $unassigned = count($cleanAssignments) - $assignedCount;
    if ($assignedCount > 0 && $unassigned > 0) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Team assignment must be all or none — {$unassigned} player(s) still need a team.",
        ]);
    }

    $patch = [
        "dbEvents_TeamConfig" => json_encode(["teams" => $cleanTeams], JSON_UNESCAPED_SLASHES),
        "dbEvents_TeamMode"   => $mode,
    ];
    $result = ServiceDbEvents::saveEvent("edit", $patch, ["eid" => $eid]);

    $savedPlayers = [];
    foreach ($cleanAssignments as $a) {
        ServiceDbEventPlayers::updateTeamKey($eid, $a["ghin"], $a["team"]);
        $saved = ServiceDbEventPlayers::getEventPlayer($eid, $a["ghin"]);
        if ($saved) $savedPlayers[] = $saved;
    }

    /*
     * Two separate calls, not one — they operate on different tables and
     * one is void:
     *   propagateTeamConfig() — cascades dbEvents_TeamConfig into every
     *     linked round's dbGames_TeamConfig. Returns void. Safe to call
     *     regardless of $mode — it re-checks dbEvents_TeamMode fresh
     *     internally and no-ops per round if not "fixed", so there's no
     *     need to gate this call externally.
     *   propagateTeamAssignments() — cascades db_EventPlayers' TeamKey
     *     (already written above) into every linked round's db_Players,
     *     AND runs pairing-boundary reconciliation per round. This is the
     *     one that returns the {roundsTouched, roundsAffected,
     *     affectedGgids} shape used as "reconcile" below. Its own
     *     $ghinToTeam parameter is unused internally (kept only for
     *     backward compatibility — it re-reads the roster fresh instead),
     *     so passing an empty array here is correct, not a shortcut.
     */
    WorkflowProcessEventCascade::propagateTeamConfig($eid, ["teams" => $cleanTeams]);
    $reconcile = WorkflowProcessEventCascade::propagateTeamAssignments($eid, []);

    ma_respond(200, [
        "ok"      => true,
        "payload" => [
            "teamConfig" => ["teams" => $cleanTeams],
            "mode"       => $mode,
            "players"    => $savedPlayers,
            "reconcile"  => $reconcile,
        ],
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_TEAMS_FAIL", ["eid" => $eid, "error" => $e->getMessage()]);
    ma_respond(500, ["ok" => false, "message" => "Unable to save Teams."]);
}
