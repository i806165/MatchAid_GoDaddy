<?php
// /public_html/api/event_roster/saveEventHandicapSettings.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_API_LIB . "/Logger.php";

// Authentication required.
$auth = ma_api_require_auth();

// SessionStoredEID confirmed via service_ContextEvent.php's own
// SESSION_KEY constant. Read directly here rather than through
// ServiceContextEvent::getStoredEID(), matching the convention every
// Game-side endpoint already uses (raw session read, not routed through
// the context service just for the ID).
$eid = (int)($_SESSION["SessionStoredEID"] ?? 0);

try {
    if ($eid <= 0) {
        throw new RuntimeException("No active Event ID was found.");
    }

    /*
     * Same standard wrapper as saveGameHandicapSettings.php:
     * { "payload": { "method": ..., "allowance": ..., "effectivity": ..., "effDate": ... } }
     *
     * Same neutral (non dbEvents_-prefixed) field names for the same
     * reason documented in module_setHandicapsGameEvent.js and
     * saveGameHandicapSettings.php: this module serves both the Game and
     * Event tables through one shared shape, and this endpoint owns the
     * dbEvents_ translation for the event target.
     */
    $input = ma_json_in();
    $body  = $input["payload"] ?? null;

    if (!is_array($body)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Handicap Settings payload.",
        ]);
    }

    $requiredFields = [
        "method",
        "allowance",
        "effectivity",
    ];

    foreach ($requiredFields as $field) {
        if (!array_key_exists($field, $body)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Handicap Settings is missing a required setting.",
            ]);
        }
    }

    // ── Method ──────────────────────────────────────────────────────────

    $method = trim((string)$body["method"]);

    if (!in_array($method, ["CH", "SO"], true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid handicap method.",
        ]);
    }

    // ── Allowance ───────────────────────────────────────────────────────

    // Matches allowanceOptions() in module_setHandicapsGameEvent.js:
    // 0-100 in steps of 5.
    $allowance = (int)$body["allowance"];

    if ($allowance < 0 || $allowance > 100 || $allowance % 5 !== 0) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Allowance must be between 0 and 100, in steps of 5.",
        ]);
    }

    // ── Effectivity ─────────────────────────────────────────────────────

    $validEffectivity = ["PlayDate", "Low3", "Low6", "Low12", "Date"];
    $effectivity = trim((string)$body["effectivity"]);

    if (!in_array($effectivity, $validEffectivity, true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid handicap effectivity.",
        ]);
    }

    /*
     * effDate is validated for shape only. ServiceDbEvents::saveEvent()
     * calls enforceHcEffectivity() itself, which is the authoritative
     * normalizer here — it defaults an empty date to the event's own
     * StartDate and CLAMPS a Date-mode value that falls after StartDate,
     * rather than rejecting it. Duplicating a stricter reject-on-invalid
     * rule at this layer would fight that clamp instead of complementing
     * it, so this endpoint deliberately stays permissive and lets the
     * service have the final say.
     */
    $effDate = "";

    if ($effectivity === "Date") {
        $effDate = trim((string)($body["effDate"] ?? ""));

        if ($effDate !== "" && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $effDate)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Invalid Effectivity Date format.",
            ]);
        }
    }

    /*
     * No Gross Play backstop here, unlike saveGameHandicapSettings.php.
     * An Event has no single Scoring Method — it spans multiple Games/
     * Rounds that may each be Gross or Net independently — so there's
     * nothing to lock against at this level. Matches
     * module_setHandicapsGameEvent.js's own _isGrossPlay = false for the
     * event target.
     */

    // ── Persist module-owned fields only ───────────────────────────────

    $patch = [
        "dbEvents_HCMethod"          => $method,
        "dbEvents_Allowance"         => $allowance,
        "dbEvents_HCEffectivity"     => $effectivity,
        "dbEvents_HCEffectivityDate" => $effDate,
    ];

    $result = ServiceDbEvents::saveEvent(
        "edit",
        $patch,
        ["eid" => $eid]
    );

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_EVENT_HANDICAP_SETTINGS_FAIL", [
        "eid"   => $eid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Handicap Settings.",
    ]);
}
