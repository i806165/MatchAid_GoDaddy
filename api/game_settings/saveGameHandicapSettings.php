<?php
// /public_html/api/game_settings/saveGameHandicapSettings.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_API_LIB . "/Logger.php";

// Authentication required.
$auth = ma_api_require_auth();

// The active session GGID is authoritative.
$ggid = (int)($_SESSION["SessionStoredGGID"] ?? 0);

try {
    if ($ggid <= 0) {
        throw new RuntimeException("No active Game ID was found.");
    }

    /*
     * Standard wrapper, matching every other Game Settings save endpoint:
     * { "payload": { ... } }
     *
     * module_setHandicapsGameEvent.js posts the plain field shape it
     * inherited from the module it was refactored from
     * (module_defineHandicapSettings.js) — short field names, no
     * dbGames_/dbEvents_ prefix, and no dbGames_GGID for stale-context
     * detection:
     *
     * {
     *   "payload": {
     *     "method":      "CH" | "SO",
     *     "allowance":   0-100 (step 5),
     *     "effectivity": "PlayDate" | "Low3" | "Low6" | "Low12" | "Date",
     *     "effDate":     "YYYY-MM-DD"   // present only when effectivity === "Date"
     *   }
     * }
     *
     * The field names are deliberately NOT dbGames_/dbEvents_ prefixed.
     * This is the only module in the family that serves two different
     * tables through one shared shape (target: "game" vs. "event") — a
     * literal dbGames_HCMethod would be the wrong field name for the
     * event target, which would force per-target branching back into the
     * module itself. Neutral names let each endpoint independently
     * translate to its own table's columns; this endpoint owns the
     * dbGames_ mapping, saveEventHandicapSettings.php owns the dbEvents_
     * one.
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

    /*
     * Matches allowanceOptions() in module_setHandicapsGameEvent.js:
     * 0-100 in steps of 5.
     */
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

    $effDate = "";

    if ($effectivity === "Date") {
        $effDate = trim((string)($body["effDate"] ?? ""));

        if ($effDate === "" || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $effDate)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "A valid Effectivity Date is required.",
            ]);
        }
    }

    // ── Gross Play backstop ─────────────────────────────────────────────

    /*
     * Relocated from wizRenderStep4()'s isAdjGross condition in
     * game_settings.js, same as module_setHandicapsGameEvent.js's own
     * client-side gross-play lock. The client already prevents Save from
     * firing while Gross, but this endpoint doesn't trust that alone —
     * checked here independently against the freshly-loaded Game, same
     * "authoritative backstop regardless of what the client sent"
     * precedent as saveGameScoring.php's GROSS -> NET reset.
     */
    $game = ServiceDbGames::getGameByGGID($ggid);

    if (!$game) {
        throw new RuntimeException("Game not found.");
    }

    $scoringMethod = trim((string)($game["dbGames_ScoringMethod"] ?? "NET"));

    if ($scoringMethod === "ADJ GROSS") {
        $method    = "CH";
        $allowance = 100;
    }

    // ── Persist module-owned fields only ───────────────────────────────

    $patch = [
        "dbGames_HCMethod"          => $method,
        "dbGames_Allowance"         => $allowance,
        "dbGames_HCEffectivity"     => $effectivity,
        "dbGames_HCEffectivityDate" => $effDate,
    ];

    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_HANDICAP_SETTINGS_FAIL", [
        "ggid"  => $ggid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Handicap Settings.",
    ]);
}
