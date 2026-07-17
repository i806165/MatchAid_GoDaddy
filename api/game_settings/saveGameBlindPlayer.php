<?php
// /public_html/api/game_settings/saveGameBlindPlayer.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_API_LIB . "/Logger.php";

// Authentication required.
$auth = ma_api_require_auth();

// Session GGID is authoritative.
$ggid = (int)($_SESSION["SessionStoredGGID"] ?? 0);

try {
    if ($ggid <= 0) {
        throw new RuntimeException("No active Game ID was found.");
    }

    /*
     * module_setGameBlindPlayer.js posts:
     *
     * {
     *   payload: {
     *     dbGames_GGID: 622,
     *     dbGames_BlindPlayers: [
     *       { ghin: "...", name: "..." },
     *       { target: 3 }
     *     ]
     *   }
     * }
     */
    $input = ma_json_in();
    $payload = $input["payload"] ?? null;

    if (!is_array($payload)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Blind Player payload.",
        ]);
    }

    /*
     * The posted GGID is informational. The session controls which
     * Game record is saved.
     */
    $postedGGID = (int)($payload["dbGames_GGID"] ?? 0);

    if ($postedGGID > 0 && $postedGGID !== $ggid) {
        Logger::error("SAVE_GAME_BLIND_PLAYER_GGID_MISMATCH", [
            "sessionGGID" => $ggid,
            "postedGGID"  => $postedGGID,
        ]);

        ma_respond(409, [
            "ok"      => false,
            "message" => "The active game changed. Please reopen Blind Player.",
        ]);
    }

    if (!array_key_exists("dbGames_BlindPlayers", $payload)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Blind Player configuration is missing.",
        ]);
    }

    $blindPlayers = $payload["dbGames_BlindPlayers"];

    if (!is_array($blindPlayers)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Blind Player configuration must be an array.",
        ]);
    }

    /*
     * Valid shapes:
     *
     * Disabled:
     *   []
     *
     * Group-selected:
     *   [
     *     { "target": 2|3|4 }
     *   ]
     *
     * Game-assigned:
     *   [
     *     { "ghin": "...", "name": "..." },
     *     { "target": 2|3|4 }
     *   ]
     */
    $normalized = [];
    $playerItem = null;
    $targetItem = null;

    foreach ($blindPlayers as $item) {
        if (!is_array($item)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Invalid Blind Player entry.",
            ]);
        }

        if (array_key_exists("target", $item)) {
            if ($targetItem !== null) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Blind Player contains more than one target.",
                ]);
            }

            $target = (int)$item["target"];

            if (!in_array($target, [2, 3, 4], true)) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Blind Player target must be 2, 3, or 4.",
                ]);
            }

            $targetItem = [
                "target" => $target,
            ];

            continue;
        }

        if (array_key_exists("ghin", $item)) {
            if ($playerItem !== null) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Blind Player contains more than one assigned player.",
                ]);
            }

            $ghin = trim((string)$item["ghin"]);
            $name = trim((string)($item["name"] ?? ""));

            if ($ghin === "") {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Assigned Blind Player is missing a GHIN.",
                ]);
            }

            $playerItem = [
                "ghin" => $ghin,
                "name" => $name,
            ];

            continue;
        }

        ma_respond(400, [
            "ok"      => false,
            "message" => "Blind Player contains an unsupported entry.",
        ]);
    }

    /*
     * A player assignment is only valid when a target is also provided.
     * An empty array means Blind Player is disabled.
     */
    if ($playerItem !== null && $targetItem === null) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Assigned Blind Player is missing a target.",
        ]);
    }

    if ($playerItem !== null) {
        $normalized[] = $playerItem;
    }

    if ($targetItem !== null) {
        $normalized[] = $targetItem;
    }

    /*
     * Blind Player is only applicable to PairField games.
     * Check the authoritative stored Game before saving.
     */
    $game = ServiceDbGames::getGameByGGID($ggid);

    if (!$game) {
        throw new RuntimeException("Game not found.");
    }

    $competition = trim((string)($game["dbGames_Competition"] ?? ""));

    if ($competition !== "PairField" && !empty($normalized)) {
        ma_respond(409, [
            "ok"      => false,
            "message" => "Blind Player can only be configured for Pair vs. Field games.",
        ]);
    }

    /*
     * Optional but recommended:
     * when a specific player is assigned, verify that the GHIN belongs
     * to the current Game roster before saving.
     *
     * Add this check once you decide whether the service layer or this
     * endpoint should query db_Players.
     */

    $patch = [
        "dbGames_BlindPlayers" => $normalized,
    ];

    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_BLIND_PLAYER_FAIL", [
        "ggid"  => $ggid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Blind Player.",
    ]);
}