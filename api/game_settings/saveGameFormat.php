<?php
// /public_html/api/game_settings/saveGameFormat.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_API_LIB . "/Logger.php";

// Authentication is required before reading or saving game context.
$auth = ma_api_require_auth();

// The session GGID is authoritative.
$ggid = (int)($_SESSION["SessionStoredGGID"] ?? 0);

try {
    if ($ggid <= 0) {
        throw new RuntimeException("No active Game ID was found.");
    }

    // module_setGameFormat.js posts:
    // {
    //   payload: {
    //     dbGames_GGID: ...,
    //     dbGames_GameLabel: ...,
    //     ...
    //   }
    // }
    $input = ma_json_in();

    $payload = $input["payload"] ?? null;

    if (!is_array($payload)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Game Format payload.",
        ]);
    }

    /*
     * The client includes GGID for context/debugging, but the session GGID
     * controls which record is saved. Reject a mismatch rather than allowing
     * the request to appear to save one game while actually saving another.
     */
    $postedGGID = (int)($payload["dbGames_GGID"] ?? 0);

    if ($postedGGID > 0 && $postedGGID !== $ggid) {
        Logger::error("SAVE_GAME_FORMAT_GGID_MISMATCH", [
            "sessionGGID" => $ggid,
            "postedGGID"  => $postedGGID,
        ]);

        ma_respond(409, [
            "ok"      => false,
            "message" => "The active game changed. Please reopen Game Format.",
        ]);
    }

    /*
     * Game Format owns the first four fields.
     *
     * The remaining fields are deliberate Format-triggered writes:
     * - locked formats may set Scoring System / Best Ball;
     * - C-O-D may force Segments / Rotation;
     * - leaving PairField clears Blind Players.
     */
    $allowedFields = [
        "dbGames_GameLabel",
        "dbGames_GameFormat",
        "dbGames_ScoringBasis",
        "dbGames_Competition",

        "dbGames_ScoringSystem",
        "dbGames_BestBall",

        "dbGames_Segments",
        "dbGames_RotationMethod",

        "dbGames_BlindPlayers",
    ];

    $patch = [];

    foreach ($allowedFields as $field) {
        if (array_key_exists($field, $payload)) {
            $patch[$field] = $payload[$field];
        }
    }

    // The module should always submit these four primary Format fields.
    $requiredFields = [
        "dbGames_GameLabel",
        "dbGames_GameFormat",
        "dbGames_ScoringBasis",
        "dbGames_Competition",
    ];

    foreach ($requiredFields as $field) {
        if (!array_key_exists($field, $patch)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Game Format is missing a required setting.",
            ]);
        }
    }

    // Validate the principal values before handing off to the shared service.
    $competition = trim((string)$patch["dbGames_Competition"]);

    if (!in_array($competition, ["PairField", "PairPair"], true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid pairing type.",
        ]);
    }

    $gameLabel = trim((string)$patch["dbGames_GameLabel"]);
    $gameFormat = trim((string)$patch["dbGames_GameFormat"]);
    $scoringBasis = trim((string)$patch["dbGames_ScoringBasis"]);

    if ($gameLabel === "" || $gameFormat === "" || $scoringBasis === "") {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Game Format contains an empty required setting.",
        ]);
    }

    /*
     * The shared service remains the authoritative database layer. It:
     * - applies its master allowlist;
     * - JSON-encodes array values such as dbGames_BlindPlayers;
     * - performs existing settings normalization;
     * - updates the game;
     * - returns the refreshed game record.
     */
    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_FORMAT_FAIL", [
        "ggid"  => $ggid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Game Format.",
    ]);
}