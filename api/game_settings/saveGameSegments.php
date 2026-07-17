<?php
// /public_html/api/game_settings/saveGameSegments.php

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
     * Expected request:
     *
     * {
     *   "payload": {
     *     "dbGames_GGID": 622,
     *     "dbGames_Holes": "All 18",
     *     "dbGames_Segments": "6",
     *     "dbGames_RotationMethod": "COD",
     *     "dbGames_StrokeDistribution": "Balanced"
     *   }
     * }
     *
     * dbGames_Segments means Playing Segments.
     *
     * dbGames_ScoringSegments is intentionally absent. It belongs to
     * Placement Points.
     */
    $input = ma_json_in();
    $payload = $input["payload"] ?? null;

    if (!is_array($payload)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Segments payload.",
        ]);
    }

    // Reject a stale or mismatched client context.
    $postedGGID = (int)($payload["dbGames_GGID"] ?? 0);

    if ($postedGGID > 0 && $postedGGID !== $ggid) {
        Logger::error("SAVE_GAME_SEGMENTS_GGID_MISMATCH", [
            "sessionGGID" => $ggid,
            "postedGGID"  => $postedGGID,
        ]);

        ma_respond(409, [
            "ok"      => false,
            "message" => "The active game changed. Please reopen Segments.",
        ]);
    }

    $requiredFields = [
        "dbGames_Holes",
        "dbGames_Segments",
        "dbGames_RotationMethod",
        "dbGames_StrokeDistribution",
    ];

    foreach ($requiredFields as $field) {
        if (!array_key_exists($field, $payload)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Segments is missing a required setting.",
            ]);
        }
    }

    $game = ServiceDbGames::getGameByGGID($ggid);

    if (!$game) {
        throw new RuntimeException("Game not found.");
    }

    // ── Normalize scalar values ────────────────────────────────────────

    $holes = trim(
        (string)$payload["dbGames_Holes"]
    );

    $playingSegments = trim(
        (string)$payload["dbGames_Segments"]
    );

    $rotationMethod = trim(
        (string)$payload["dbGames_RotationMethod"]
    );

    $strokeDistribution = trim(
        (string)$payload["dbGames_StrokeDistribution"]
    );

    $competition = trim(
        (string)($game["dbGames_Competition"] ?? "PairField")
    );

    $gameLabel = trim(
        (string)($game["dbGames_GameLabel"] ?? "")
    );

    $scoringMethod = trim(
        (string)($game["dbGames_ScoringMethod"] ?? "NET")
    );

    // ── Holes ──────────────────────────────────────────────────────────

    if (!in_array($holes, ["All 18", "F9", "B9"], true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid hole selection.",
        ]);
    }

    // ── Playing Segments ───────────────────────────────────────────────

    /*
     * All 18:
     *   6 = three 6-hole playing segments
     *   9 = two 9-hole playing segments
     *
     * F9/B9:
     *   3 = three 3-hole playing segments
     *   9 = one complete 9-hole playing segment
     */
    $validPlayingSegments = $holes === "All 18"
        ? ["6", "9"]
        : ["3", "9"];

    if (!in_array($playingSegments, $validPlayingSegments, true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" =>
                "The selected Playing Segments are not valid for the selected holes.",
        ]);
    }

    // C-O-D has a fixed playing-segment structure.
    if ($gameLabel === "C-O-D") {
        $expectedSegments =
            $holes === "All 18"
                ? "6"
                : "3";

        if ($playingSegments !== $expectedSegments) {
            ma_respond(409, [
                "ok"      => false,
                "message" =>
                    "C-O-D requires 6-hole segments for an 18-hole round or 3-hole segments for a 9-hole round.",
            ]);
        }
    }

    // ── Rotation Method ────────────────────────────────────────────────

    $validRotations = [
        "None",
        "COD",
        "1324",
        "1423",
    ];

    if (!in_array($rotationMethod, $validRotations, true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Rotation Method.",
        ]);
    }

    /*
     * Pair vs. Field does not support partner rotation.
     */
    if (
        $competition !== "PairPair" &&
        $rotationMethod !== "None"
    ) {
        ma_respond(409, [
            "ok"      => false,
            "message" =>
                "Rotation Method is only available for Pair vs. Pair games.",
        ]);
    }

    /*
     * COD requires 3-hole or 6-hole Playing Segments.
     */
    if (
        $rotationMethod === "COD" &&
        !in_array($playingSegments, ["3", "6"], true)
    ) {
        ma_respond(409, [
            "ok"      => false,
            "message" =>
                "C-O-D rotation requires 3-hole or 6-hole Playing Segments.",
        ]);
    }

    /*
     * 1324 and 1423 require:
     * - an 18-hole round;
     * - two 9-hole Playing Segments.
     */
    if (
        in_array($rotationMethod, ["1324", "1423"], true) &&
        !(
            $holes === "All 18" &&
            $playingSegments === "9"
        )
    ) {
        ma_respond(409, [
            "ok"      => false,
            "message" =>
                "1324 and 1423 rotations require an 18-hole round with 9-hole Playing Segments.",
        ]);
    }

    /*
     * C-O-D format itself always uses COD rotation.
     */
    if (
        $gameLabel === "C-O-D" &&
        $rotationMethod !== "COD"
    ) {
        ma_respond(409, [
            "ok"      => false,
            "message" =>
                "C-O-D format requires C-O-D rotation.",
        ]);
    }

    // ── Handicap Allocation Method ─────────────────────────────────────

    $validStrokeDistributions = [
        "Standard",
        "Balanced",
        "Balanced-Rounded",
    ];

    if (!in_array(
        $strokeDistribution,
        $validStrokeDistributions,
        true
    )) {
        ma_respond(400, [
            "ok"      => false,
            "message" =>
                "Invalid Handicap Allocation Method.",
        ]);
    }

    /*
     * Special segment-based handicap distribution is available only when:
     *
     * - Scoring Method is NET;
     * - Rotation Method is COD.
     *
     * ADJ GROSS has no handicap strokes to distribute.
     */
    $allowStrokeDistribution =
        $scoringMethod !== "ADJ GROSS" &&
        $rotationMethod === "COD";

    if (
        !$allowStrokeDistribution &&
        $strokeDistribution !== "Standard"
    ) {
        ma_respond(409, [
            "ok"      => false,
            "message" =>
                "The selected Handicap Allocation Method is not available for this game.",
        ]);
    }

    if (!$allowStrokeDistribution) {
        $strokeDistribution = "Standard";
    }

    // ── Persist module-owned fields only ───────────────────────────────

    $patch = [
        "dbGames_Holes" =>
            $holes,

        // Playing Segments only.
        "dbGames_Segments" =>
            $playingSegments,

        "dbGames_RotationMethod" =>
            $rotationMethod,

        "dbGames_StrokeDistribution" =>
            $strokeDistribution,
    ];

    /*
     * dbGames_ScoringSegments is deliberately not included.
     *
     * Changing Playing Segments or Rotation does not directly rewrite
     * the separately owned Scoring Segments field through this endpoint.
     */
    $result = ServiceDbGames::saveGameSettings(
        $ggid,
        $patch
    );

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_SEGMENTS_FAIL", [
        "ggid"  => $ggid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Segments.",
    ]);
}