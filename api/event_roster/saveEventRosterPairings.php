<?php
// /public_html/api/event_roster/saveEventRosterPairings.php
// Saves PairingID/PairingPos assignments for event roster players.
// Called by module_createEventPairings.js on Save.
// Writes to db_EventPlayers only — never touches db_Players.
// Game-level cascade happens at game roster build time (Phase 7).
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";

ma_api_require_auth();

$in      = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : $in;

// Assignments: array of { ghin, pairingId, pairingPos }
$assignments = $payload["assignments"] ?? [];
if (!is_array($assignments)) {
    ma_respond(400, ["ok" => false, "message" => "Missing assignments array."]);
}

try {
    $ec  = ServiceContextEvent::getEventContext();
    $eid = (int)$ec["eid"];

    $updated = 0;
    $errors  = 0;

    foreach ($assignments as $a) {
        if (!is_array($a)) continue;

        $ghin       = trim((string)($a["ghin"]       ?? ""));
        $pairingId  = trim((string)($a["pairingId"]  ?? ""));
        $pairingPos = trim((string)($a["pairingPos"] ?? ""));

        if ($ghin === "") continue;

        try {
            ServiceDbEventPlayers::updatePairing($eid, $ghin, $pairingId, $pairingPos);
            $updated++;
        } catch (Throwable $e) {
            error_log("[saveEventRosterPairings] ghin={$ghin} err=" . $e->getMessage());
            $errors++;
        }
    }

    // Return fresh roster so client can update state in one round-trip
    $roster = ServiceDbEventPlayers::getEventRoster($eid);

    ma_respond(200, [
        "ok"      => true,
        "message" => "Pairings saved for {$updated} players." . ($errors ? " {$errors} failed." : ""),
        "updated" => $updated,
        "errors"  => $errors,
        "payload" => ["roster" => $roster]
    ]);

} catch (Throwable $e) {
    error_log("[saveEventRosterPairings] EX=" . $e->getMessage());
    ma_respond(500, ["ok" => false, "message" => "Server error saving pairings."]);
}
