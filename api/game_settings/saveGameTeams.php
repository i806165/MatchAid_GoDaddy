<?php
// /public_html/api/game_settings/saveGameTeams.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ReconcilePairingBoundaries.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth();

$ggid = (int)($_SESSION["SessionStoredGGID"] ?? 0);

try {
    if ($ggid <= 0) {
        throw new RuntimeException("No active Game ID was found.");
    }

    /*
     * { "payload": { "teams": [{id,name,color,sort}, {..}], "mode": "active"|"disabled",
     *                "assignments": [{ghin, team}] } }
     *
     * Collapsed from module_defineTeams.js's original two sequential calls
     * (saveTeamConfig.php then saveTeamAssignments.php) into one — see
     * module_defineTeamsGameEvent.js's header note. mode here is always
     * the round's OWN dbGames_TeamMode ("active"/"disabled") — this
     * endpoint is never reached for the event's dbEvents_TeamMode
     * ("fixed"/"none"), that's saveEventTeams.php's concern entirely.
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
    if (!in_array($mode, ["active", "disabled"], true)) {
        ma_respond(400, ["ok" => false, "message" => "Invalid team activation state."]);
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

    /*
     * Server-side backstop for "Teams-active requires full assignment" —
     * module_defineTeamsGameEvent.js already blocks this client-side, but
     * this endpoint doesn't trust that alone, same precedent as every
     * other save endpoint in this family.
     */
    if ($mode === "active") {
        $unassigned = 0;
        foreach ($cleanAssignments as $a) {
            if ($a["team"] === "") $unassigned++;
        }
        if ($unassigned > 0) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "All players must be assigned to a team while Teams is active — {$unassigned} player(s) still need a team.",
            ]);
        }
    }

    $patch = [
        "dbGames_GGID"       => $ggid,
        "dbGames_TeamConfig" => json_encode(["teams" => $cleanTeams], JSON_UNESCAPED_SLASHES),
        "dbGames_TeamMode"   => $mode,
    ];
    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    $savedPlayers = [];
    foreach ($cleanAssignments as $a) {
        $saved = ServiceDbPlayers::updateGamePlayerFields(
            (string)$ggid,
            $a["ghin"],
            ["dbPlayers_TeamKey" => $a["team"] !== "" ? $a["team"] : null]
        );
        if ($saved) $savedPlayers[] = $saved;
    }

    /*
     * Relocated from having been "not implemented" — this is the real
     * boundary check. Any pairing/match that no longer shares team/flight
     * after this save gets fully reset (unpaired), and reported here in
     * the exact shape module_defineTeamsGameEvent.js already expects for
     * "reconciled" (round-shaped): [{type, id, players, reason}, ...].
     */
    $reconciled = WorkflowReconcilePairingBoundaries::reconcileGame((string)$ggid);

    ma_respond(200, [
        "ok"      => true,
        "payload" => [
            "teamConfig" => ["teams" => $cleanTeams],
            "mode"       => $mode,
            "players"    => $savedPlayers,
            "reconciled" => $reconciled,
        ],
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_TEAMS_FAIL", ["ggid" => $ggid, "error" => $e->getMessage()]);
    ma_respond(500, ["ok" => false, "message" => "Unable to save Teams."]);
}
