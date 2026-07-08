<?php
// /public_html/api/event_roster/saveEventRosterPairings.php
// Saves PairingID/PairingPos assignments for event roster players, and
// the cascade mode toggle, to db_EventPlayers / db_Events.
// Called by module_createEventPairings.js on Save — mode is bundled into
// this same request, since the toggle lives inside that module now
// (moved out of Event Maintenance). Writes db_Players indirectly, via
// WorkflowProcessEventCascade, only when mode is "fixed" — this file
// itself still never touches db_Players directly.
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ProcessEventCascade.php";

ma_api_require_auth();

$in      = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : $in;

// Assignments: array of { ghin, pairingId, pairingPos }
$assignments = $payload["assignments"] ?? [];
if (!is_array($assignments)) {
    ma_respond(400, ["ok" => false, "message" => "Missing assignments array."]);
}

$mode = trim((string)($payload["mode"] ?? "none"));
if ($mode !== "fixed") $mode = "none"; // any invalid value coerces to off

try {
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)$ec["eid"];

    // Persist the mode alongside the assignments — bundled into this one
    // request, same as Team/Flight's config saves.
    ServiceDbEvents::updateEvent($eid, ["dbEvents_PairingMode" => $mode]);

    $updated = 0;
    $errors  = 0;
    $ghinToPairing = [];

    foreach ($assignments as $a) {
        if (!is_array($a)) continue;

        $ghin       = trim((string)($a["ghin"]       ?? ""));
        $pairingId  = trim((string)($a["pairingId"]  ?? ""));
        $pairingPos = trim((string)($a["pairingPos"] ?? ""));

        if ($ghin === "") continue;

        try {
            ServiceDbEventPlayers::updatePairing($eid, $ghin, $pairingId, $pairingPos);
            $updated++;
            // Only real, established pairings are worth propagating —
            // skip "000"/blank the same way saveFlightConfig.php skips
            // an empty config.
            if ($pairingId !== "" && $pairingId !== "000") {
                $ghinToPairing[$ghin] = ["id" => $pairingId, "pos" => $pairingPos];
            }
        } catch (Throwable $e) {
            error_log("[saveEventRosterPairings] ghin={$ghin} err=" . $e->getMessage());
            $errors++;
        }
    }

    // Propagate — only when cascading is on.
    if ($mode === "fixed" && $ghinToPairing) {
        WorkflowProcessEventCascade::propagatePairingAssignments($eid, $ghinToPairing);
    }

    // Return fresh roster so client can update state in one round-trip
    $roster = ServiceDbEventPlayers::getEventRoster($eid);

    ma_respond(200, [
        "ok"      => true,
        "message" => "Pairings saved for {$updated} players." . ($errors ? " {$errors} failed." : ""),
        "updated" => $updated,
        "errors"  => $errors,
        "payload" => ["roster" => $roster, "mode" => $mode]
    ]);

} catch (Throwable $e) {
    error_log("[saveEventRosterPairings] EX=" . $e->getMessage());
    ma_respond(500, ["ok" => false, "message" => "Server error saving pairings."]);
}
