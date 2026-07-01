<?php
// /public_html/api/event_roster/refreshEventRosterHI.php
// Refreshes dbEventPlayers_HI for all rated players on the event roster.
// Uses WorkflowProcessPlayers::resolveHandicap() with the event's HC
// effectivity settings — same logic as game-level handicap calculation,
// mapped via a synthetic $game array so no new GHIN logic is needed.
// NH* players are skipped — their HI is manually assigned at enrollment.
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ProcessPlayers.php";

ma_api_require_auth();

$token = trim((string)($_SESSION["SessionAdminToken"] ?? $_SESSION["SessionUserToken"] ?? ""));
if ($token === "") {
    ma_respond(401, ["ok" => false, "error" => "Missing GHIN token."]);
}

try {
    // 1) Get event context from session
    $ec    = ServiceContextEvent::getEventContext();
    $event = $ec["event"];
    $eid   = (int)$ec["eid"];

    // 2) Build synthetic game array mapping event HC fields to the
    //    dbGames_* keys expected by WorkflowProcessPlayers::resolveHandicap()
    $syntheticGame = [
        "dbGames_HCEffectivity"     => $event["dbEvents_HCEffectivity"]     ?? "PlayDate",
        "dbGames_HCEffectivityDate" => $event["dbEvents_HCEffectivityDate"] ?? null,
        // PlayDate mode uses the event start date as the as-of date
        "dbGames_PlayDate"          => $event["dbEvents_StartDate"]          ?? null,
    ];

    // 3) Fetch enrolled players — separate rated from NH*
    $roster = ServiceDbEventPlayers::getEventRoster($eid);

    $rated = array_values(array_filter($roster, function ($p) {
        $ghin = trim((string)($p["dbEventPlayers_GHIN"] ?? ""));
        return $ghin !== "" && !str_starts_with($ghin, "NH");
    }));

    if (empty($rated)) {
        ma_respond(200, [
            "ok"      => true,
            "message" => "No rated players to refresh.",
            "updated" => 0,
            "roster"  => $roster
        ]);
    }

    // 4) Process in batches of 25 — courtesy limit for GHIN API
    $chunks  = array_chunk($rated, 25);
    $updated = 0;
    $errors  = 0;

    foreach ($chunks as $chunk) {
        foreach ($chunk as $player) {
            $ghin     = trim((string)($player["dbEventPlayers_GHIN"] ?? ""));
            $manualHi = ""; // NH players already filtered; rated players get HI from GHIN

            try {
                $hi = WorkflowProcessPlayers::resolveHandicap(
                    $ghin,
                    $manualHi,
                    $syntheticGame,
                    $token
                );

                // Only write if HI actually changed — avoids unnecessary DB writes
                $currentHi = trim((string)($player["dbEventPlayers_HI"] ?? ""));
                if ($hi !== $currentHi) {
                    ServiceDbEventPlayers::upsertEventPlayer($eid, $ghin, [
                        "dbEventPlayers_HI" => $hi
                    ]);
                }

                $updated++;
            } catch (Throwable $e) {
                error_log("[refreshEventRosterHI] ghin={$ghin} err=" . $e->getMessage());
                $errors++;
            }
        }
    }

    // 5) Return fresh roster
    $freshRoster = ServiceDbEventPlayers::getEventRoster($eid);

    ma_respond(200, [
        "ok"      => true,
        "message" => "Handicaps refreshed for {$updated} players." . ($errors ? " {$errors} failed." : ""),
        "updated" => $updated,
        "errors"  => $errors,
        "payload" => ["roster" => $freshRoster]
    ]);

} catch (Throwable $e) {
    error_log("[refreshEventRosterHI] EX=" . $e->getMessage());
    ma_respond(500, ["ok" => false, "message" => "Server error refreshing handicaps."]);
}
