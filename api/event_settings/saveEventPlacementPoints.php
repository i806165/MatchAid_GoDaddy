<?php
declare(strict_types=1);
// /public_html/api/event_settings/saveEventPlacementPoints.php
//
// Saves dbEvents_KPIConfig — the event-level competition/placement
// catalog owned by module_setEventPlacementPoints.js.
//
// NOT modeled on saveEventFlights.php / saveEventTeams.php /
// saveEventHandicapSettings.php: those three cascade into every linked
// game via WorkflowProcessEventCascade because the event-level value is
// meant to override each game's own copy. dbEvents_KPIConfig has no such
// relationship — it's read directly, at the event level only, by
// ServiceBuildEventSummary::parseEventKPIConfig() for event-wide
// standings. No mode field, no cascade call, no linked-game write.
// Shape instead follows saveEventRosterPlayer.php: auth -> validate ->
// persist -> respond.
//
// Request:
//   {
//     "payload": {
//       "dbEvents_KPIConfig": {
//         "grossPlacement":   { "state": "default"|"active"|"disabled", "pointsConfig": {...}, "tieRule": "split"|"high"|"low" },
//         "netPlacement":     { ... },
//         "pairingPlacement": { ... },
//         "teamPlacement":    { ... },
//         "RINGER":           { "state": "default"|"active"|"disabled" },
//         "HOLE_CHAMPIONS":   { "state": "default"|"active"|"disabled" }
//       }
//     }
//   }
//
// Vocabulary is fixed and must match module_setEventPlacementPoints.js's
// CATALOG exactly (see that file's header). These six keys are exactly
// what ServiceBuildEventSummary::parseEventKPIConfig() reads — an
// unrecognized key reaching this endpoint is rejected outright rather
// than silently passed through, since a mismatch there would silently
// fall back to that service's own hardcoded default table.
//
// pairingPlacement/teamPlacement backstop: mirrors the "never trust the
// client's lock state alone" convention every other save endpoint in
// this family follows (see saveGameHandicapSettings.php's Gross Play /
// PairField backstops). The client already greys these rows unless
// dbEvents_PairingMode / dbEvents_TeamMode is "fixed", but this endpoint
// re-verifies independently against the freshly-loaded Event and coerces
// a stale "active" back to "disabled" rather than rejecting the whole
// save over one now-invalid field — same coercion precedent as the
// Handicap Settings backstops.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth();

$eid = (int)($_SESSION["SessionStoredEID"] ?? 0);

try {
    if ($eid <= 0) {
        throw new RuntimeException("No active Event ID was found.");
    }

    $input = ma_json_in();
    $body  = $input["payload"] ?? null;

    if (!is_array($body) || !array_key_exists("dbEvents_KPIConfig", $body)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Event Competition payload.",
        ]);
    }

    $kpiConfig = $body["dbEvents_KPIConfig"];

    // The module submits an object. Accept a JSON string defensively for
    // compatibility, same as saveGamePlacementPoints.php does.
    if (is_string($kpiConfig)) {
        $decoded = json_decode($kpiConfig, true);

        if (!is_array($decoded)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Event Competition contains invalid JSON.",
            ]);
        }

        $kpiConfig = $decoded;
    }

    if (!is_array($kpiConfig)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Event Competition configuration must be an object.",
        ]);
    }

    /*
     * Canonical catalog. Must match module_setEventPlacementPoints.js's
     * CATALOG verbatim — flat map, no top-level wrapper (unlike
     * dbGames_PlacementPoints' {top, categories} envelope). hasConfig
     * keys require pointsConfig + tieRule; the two "coming soon" keys
     * carry state only.
     */
    $catalogDefs = [
        "grossPlacement"   => ["hasConfig" => true,  "lock" => null],
        "netPlacement"     => ["hasConfig" => true,  "lock" => null],
        "pairingPlacement" => ["hasConfig" => true,  "lock" => "pairing"],
        "teamPlacement"    => ["hasConfig" => true,  "lock" => "team"],
        "RINGER"           => ["hasConfig" => false, "lock" => null],
        "HOLE_CHAMPIONS"   => ["hasConfig" => false, "lock" => null],
    ];

    // Load the authoritative Event for the pairingFixed/teamFixed backstop.
    $event = ServiceDbEvents::getEventByEID($eid);

    if (!$event) {
        throw new RuntimeException("Event not found.");
    }

    $pairingFixed = trim((string)($event["dbEvents_PairingMode"] ?? "")) === "fixed";
    $teamFixed    = trim((string)($event["dbEvents_TeamMode"]    ?? "")) === "fixed";

    $normalized = [];

    foreach ($catalogDefs as $key => $def) {
        $entry = $kpiConfig[$key] ?? null;

        if (!is_array($entry)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Event Competition is missing the '{$key}' category.",
            ]);
        }

        $state = trim((string)($entry["state"] ?? ""));

        if (!in_array($state, ["default", "active", "disabled"], true)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Event Competition contains an invalid state.",
            ]);
        }

        // ── Server-side lock backstop, independent of client UI ────────
        if ($def["lock"] === "pairing" && $state === "active" && !$pairingFixed) {
            $state = "disabled";
        }
        if ($def["lock"] === "team" && $state === "active" && !$teamFixed) {
            $state = "disabled";
        }

        $normalizedEntry = ["state" => $state];

        if ($def["hasConfig"]) {
            $pointsConfig = $entry["pointsConfig"] ?? null;
            $tieRule      = trim((string)($entry["tieRule"] ?? ""));

            if (!is_array($pointsConfig) || $pointsConfig === []) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "The '{$key}' category is missing its finishing positions.",
                ]);
            }

            if (!in_array($tieRule, ["split", "high", "low"], true)) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "The '{$key}' category has an invalid tie rule.",
                ]);
            }

            $normalizedPoints = [];

            foreach ($pointsConfig as $place => $points) {
                $placeString = trim((string)$place);

                if (
                    $placeString === "" ||
                    !ctype_digit($placeString) ||
                    (int)$placeString <= 0
                ) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "The '{$key}' category has an invalid finishing position.",
                    ]);
                }

                if (!is_numeric($points)) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "The '{$key}' category has a non-numeric points value.",
                    ]);
                }

                $numericPoints = (float)$points;

                if ($numericPoints < 0) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "The '{$key}' category cannot have negative points.",
                    ]);
                }

                $normalizedPoints[(string)(int)$placeString] = $numericPoints;
            }

            uksort(
                $normalizedPoints,
                static fn(string $a, string $b): int => ((int)$a) <=> ((int)$b)
            );

            $normalizedEntry["pointsConfig"] = $normalizedPoints;
            $normalizedEntry["tieRule"]      = $tieRule;
        }

        $normalized[$key] = $normalizedEntry;
    }

    $patch = [
        "dbEvents_KPIConfig" => $normalized,
    ];

    $result = ServiceDbEvents::saveEvent("edit", $patch, ["eid" => $eid]);

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_PLACEMENT_POINTS_FAIL", [
        "eid"   => $eid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Event Competition.",
    ]);
}
