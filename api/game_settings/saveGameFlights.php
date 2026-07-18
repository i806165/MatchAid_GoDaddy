<?php
// /public_html/api/game_settings/saveGameFlights.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ReconcilePairingBoundaries.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth();

$ggid = (int)($_SESSION["SessionStoredGGID"] ?? 0);

const MAX_FLIGHTS = 5;
const MIN_FLIGHTS = 1;

try {
    if ($ggid <= 0) {
        throw new RuntimeException("No active Game ID was found.");
    }

    /*
     * { "payload": { "flights": [{id,name,sort}, ...], "mode": "active"|"disabled",
     *                "assignments": [{ghin, flight}] } }
     * mode here is always the round's own dbGames_FlightMode.
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
    if (!in_array($mode, ["active", "disabled"], true)) {
        ma_respond(400, ["ok" => false, "message" => "Invalid flight activation state."]);
    }
    if (!is_array($assignments)) {
        ma_respond(400, ["ok" => false, "message" => "Flights is missing player assignments."]);
    }

    $cleanFlights = [];
    $validIds = [];
    foreach (array_values($flights) as $i => $f) {
        $id   = "F" . ($i + 1); // canonical, position-based — matches the module's own normalizeFlightConfig()
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
        "dbGames_GGID"         => $ggid,
        "dbGames_FlightConfig" => json_encode(["flights" => $cleanFlights], JSON_UNESCAPED_SLASHES),
        "dbGames_FlightMode"   => $mode,
    ];
    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    $savedPlayers = [];
    foreach ($cleanAssignments as $a) {
        $saved = ServiceDbPlayers::updateGamePlayerFields(
            (string)$ggid,
            $a["ghin"],
            ["dbPlayers_FlightKey" => $a["flight"] !== "" ? $a["flight"] : null]
        );
        if ($saved) $savedPlayers[] = $saved;
    }

    // Same real reconciliation check as saveGameTeams.php.
    $reconciled = WorkflowReconcilePairingBoundaries::reconcileGame((string)$ggid);

    ma_respond(200, [
        "ok"      => true,
        "payload" => [
            "flightConfig" => ["flights" => $cleanFlights],
            "mode"         => $mode,
            "players"      => $savedPlayers,
            "reconciled"   => $reconciled,
        ],
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_FLIGHTS_FAIL", ["ggid" => $ggid, "error" => $e->getMessage()]);
    ma_respond(500, ["ok" => false, "message" => "Unable to save Flights."]);
}
