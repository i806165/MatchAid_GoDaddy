<?php
// /public_html/api/game_settings/saveGameSideBets.php

declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/database/service_dbGames.php";
require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_API_LIB . "/Logger.php";

// Authentication required.
$auth = ma_api_require_auth();

// The active session GGID is authoritative.
$ggid = (int)($_SESSION["SessionStoredGGID"] ?? 0);

/*
 * Reject helper — every validation failure below is a plain 4xx with a
 * message the module shows in its OK dialog.
 */
$reject = static function (int $status, string $message): void {
    ma_respond($status, [
        "ok"      => false,
        "message" => $message,
    ]);
};

try {
    if ($ggid <= 0) {
        throw new RuntimeException("No active Game ID was found.");
    }

    /*
     * Expected request:
     *
     * {
     *   "payload": {
     *     "dbGames_GGID": 687,
     *     "dbGames_CustomScores": {
     *       "version": 1,
     *       "status": "active",
     *       "bets": [
     *         {
     *           "key": "sandy",
     *           "name": "Sandy",
     *           "description": "Par or better after a bunker shot",
     *           "type": "achievement",
     *           "status": "active",
     *           "payout": { "unit": "points", "value": 1 }
     *         }
     *       ]
     *     }
     *   }
     * }
     *
     * dbGames_CustomScores holds bet DEFINITIONS only. Claims live per
     * player in db_Players.dbPlayers_CustomScores and are never written
     * here.
     *
     * The top-level "status" is the master on/off switch: downstream code
     * ignores the bets unless it is "active". While it is "disabled" the
     * bets are stored as sent (the user's selections survive flip-flopping),
     * so per-bet completeness rules only apply when it is "active".
     */
    $input   = ma_json_in();
    $payload = $input["payload"] ?? null;

    if (!is_array($payload)) {
        $reject(400, "Invalid Side Bets payload.");
    }

    /*
     * The client includes GGID for stale-context protection, but the
     * session GGID controls which record is saved.
     */
    $postedGGID = (int)($payload["dbGames_GGID"] ?? 0);

    if ($postedGGID > 0 && $postedGGID !== $ggid) {
        Logger::error("SAVE_GAME_SIDE_BETS_GGID_MISMATCH", [
            "sessionGGID" => $ggid,
            "postedGGID"  => $postedGGID,
        ]);

        $reject(409, "The active game changed. Please reopen Side Bets.");
    }

    if (!array_key_exists("dbGames_CustomScores", $payload)) {
        $reject(400, "Side Bets is missing a required setting.");
    }

    $game = ServiceDbGames::getGameByGGID($ggid);

    if (!$game) {
        throw new RuntimeException("Game not found.");
    }

    // ── Parse input ────────────────────────────────────────────────────

    $submitted = $payload["dbGames_CustomScores"];

    // Accept a JSON string defensively, then normalize to an array.
    if (is_string($submitted)) {
        $decoded = json_decode($submitted, true);

        if (!is_array($decoded)) {
            $reject(400, "Side Bets contains invalid JSON.");
        }

        $submitted = $decoded;
    }

    if (!is_array($submitted)) {
        $reject(400, "Side Bets configuration must be an object.");
    }

    if ((int)($submitted["version"] ?? 0) !== 1) {
        $reject(400, "Side Bets has an unsupported version.");
    }

    $gameStatus = trim((string)($submitted["status"] ?? ""));

    if (!in_array($gameStatus, ["active", "disabled"], true)) {
        $reject(400, "Side Bets status must be active or disabled.");
    }

    $bets = $submitted["bets"] ?? null;

    if (!is_array($bets) || $bets === [] || count($bets) > 50) {
        $reject(400, "Side Bets must contain between 1 and 50 bets.");
    }

    // ── Validate and normalize each bet ────────────────────────────────

    $normalized = [];
    $seenKeys   = [];

    foreach ($bets as $bet) {
        if (!is_array($bet)) {
            $reject(400, "Side Bets contains an invalid bet.");
        }

        $key = trim((string)($bet["key"] ?? ""));

        // Permanent identity. Letters, digits, underscore; starts with a letter.
        if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,31}$/', $key)) {
            $reject(400, "Side Bets contains an invalid bet key.");
        }

        if (isset($seenKeys[$key])) {
            $reject(400, "Side Bets contains a duplicate bet.");
        }
        $seenKeys[$key] = true;

        $name        = trim((string)($bet["name"] ?? ""));
        $description = trim((string)($bet["description"] ?? ""));
        $type        = trim((string)($bet["type"] ?? ""));
        $status      = trim((string)($bet["status"] ?? ""));

        if (mb_strlen($name) > 60) {
            $reject(400, "A bet name cannot be longer than 60 characters.");
        }

        if (mb_strlen($description) > 200) {
            $reject(400, "A bet description cannot be longer than 200 characters.");
        }

        if (!in_array($type, ["achievement", "competitive"], true)) {
            $reject(400, "Side Bets contains an invalid bet type.");
        }

        if (!in_array($status, ["active", "disabled"], true)) {
            $reject(400, "Side Bets contains an invalid bet status.");
        }

        // A bet in play needs a name — the scoring view has nothing else to show.
        // Only enforced while side bets are on; a disabled game keeps drafts as-is.
        if ($gameStatus === "active" && $status === "active" && $name === "") {
            $reject(400, "Every active bet needs a name.");
        }

        $payout = $bet["payout"] ?? null;

        if (!is_array($payout)) {
            $reject(400, "Side Bets contains an invalid payout.");
        }

        $unit = trim((string)($payout["unit"] ?? ""));

        if (!in_array($unit, ["points", "dollars"], true)) {
            $reject(400, "Side Bets contains an invalid payout unit.");
        }

        if (!array_key_exists("value", $payout) || !is_numeric($payout["value"])) {
            $reject(400, "Side Bets contains a non-numeric payout value.");
        }

        $value = (float)$payout["value"];

        if ($value < 0 || $value > 100000) {
            $reject(400, "Side Bets payout values must be between 0 and 100000.");
        }

        // Whole numbers stay integers in the stored JSON (1, not 1.0).
        $value = ($value == floor($value)) ? (int)$value : $value;

        // Optional distance unit for a competitive bet (score entry asks for a
        // distance when it is set). Omitted entirely when the bet has none.
        $measure = trim((string)($bet["measure"] ?? ""));

        if ($measure !== "" && !in_array($measure, ["ftin", "yd"], true)) {
            $reject(400, "Side Bets contains an invalid bet measure.");
        }

        if ($measure !== "" && $type !== "competitive") {
            $reject(400, "Only a competitive bet can have a measure.");
        }

        $record = [
            "key"         => $key,
            "name"        => $name,
            "description" => $description,
            "type"        => $type,
            "status"      => $status,
            "payout"      => [
                "unit"  => $unit,
                "value" => $value,
            ],
        ];

        if ($measure !== "") {
            $record["measure"] = $measure;
        }

        $normalized[] = $record;
    }

    // Side bets switched on with nothing in play is not a valid state.
    if ($gameStatus === "active") {
        $anyActive = false;

        foreach ($normalized as $bet) {
            if ($bet["status"] === "active") {
                $anyActive = true;
                break;
            }
        }

        if (!$anyActive) {
            $reject(400, "Choose at least one side bet, or set Activate to No.");
        }
    }

    // ── Compare against what is already stored ─────────────────────────

    $stored = $game["dbGames_CustomScores"] ?? null;

    if (is_string($stored) && trim($stored) !== "") {
        $stored = json_decode($stored, true);
    }

    $storedBets = (is_array($stored) && is_array($stored["bets"] ?? null))
        ? $stored["bets"]
        : [];

    $storedTypeByKey    = [];
    $storedMeasureByKey = [];

    foreach ($storedBets as $storedBet) {
        if (is_array($storedBet) && isset($storedBet["key"])) {
            $storedTypeByKey[(string)$storedBet["key"]]    = (string)($storedBet["type"] ?? "");
            $storedMeasureByKey[(string)$storedBet["key"]] = (string)($storedBet["measure"] ?? "");
        }
    }

    /*
     * The array is never removed from — only `status` changes. Claims
     * reference bets by key, so a missing key would orphan them.
     */
    foreach ($storedTypeByKey as $storedKey => $_storedType) {
        if (!isset($seenKeys[$storedKey])) {
            $reject(400, "Side Bets cannot remove an existing bet. Disable it instead.");
        }
    }

    /*
     * A bet's type decides what a claim means (per-player achievement vs.
     * one winner per hole). Once any player has an active claim for a bet,
     * its type is locked.
     */
    $typeChanged = [];

    foreach ($normalized as $bet) {
        $before = $storedTypeByKey[$bet["key"]] ?? null;

        if ($before !== null && $before !== "" && $before !== $bet["type"]) {
            $typeChanged[$bet["key"]] = $bet["name"] !== "" ? $bet["name"] : $bet["key"];
        }
    }

    /*
     * A bet's measure decides what a stored distance means (inches vs.
     * yards). Changing it would silently change the meaning of distances
     * already recorded, so it is locked once any active claim carries one.
     * A bet with no recorded distances may still gain or lose a measure — a
     * game saved before `measure` existed picks it up from the catalog.
     */
    $measureChanged = [];

    foreach ($normalized as $bet) {
        if (!array_key_exists($bet["key"], $storedMeasureByKey)) {
            continue;
        }

        $measureBefore = $storedMeasureByKey[$bet["key"]];
        $measureAfter  = (string)($bet["measure"] ?? "");

        if ($measureBefore !== $measureAfter) {
            $measureChanged[$bet["key"]] = $bet["name"] !== "" ? $bet["name"] : $bet["key"];
        }
    }

    if ($typeChanged || $measureChanged) {
        $claimedKeys  = [];
        $distanceKeys = [];

        foreach (ServiceDbPlayers::getGamePlayers((string)$ggid) as $playerRow) {
            $raw = $playerRow["dbPlayers_CustomScores"] ?? null;

            if (is_string($raw) && trim($raw) !== "") {
                $raw = json_decode($raw, true);
            }

            if (!is_array($raw) || !is_array($raw["claims"] ?? null)) {
                continue;
            }

            foreach ($raw["claims"] as $claim) {
                if (
                    is_array($claim) &&
                    ($claim["status"] ?? "") === "active" &&
                    isset($claim["betKey"])
                ) {
                    $claimedKeys[(string)$claim["betKey"]] = true;

                    if (($claim["distance"] ?? null) !== null) {
                        $distanceKeys[(string)$claim["betKey"]] = true;
                    }
                }
            }
        }

        foreach ($typeChanged as $changedKey => $changedName) {
            if (isset($claimedKeys[$changedKey])) {
                $reject(
                    409,
                    "The type of \"{$changedName}\" cannot be changed because claims have already been recorded for it."
                );
            }
        }

        foreach ($measureChanged as $changedKey => $changedName) {
            if (isset($distanceKeys[$changedKey])) {
                $reject(
                    409,
                    "The distance unit of \"{$changedName}\" cannot be changed because distances have already been recorded for it."
                );
            }
        }
    }

    // ── Persist ────────────────────────────────────────────────────────

    $patch = [
        "dbGames_CustomScores" => [
            "version" => 1,
            "status"  => $gameStatus,
            "bets"    => $normalized,
        ],
    ];

    /*
     * ServiceDbGames remains the authoritative persistence layer. Its
     * saveGameSettings() master allowlist and JSON-encoding list must
     * include dbGames_CustomScores (see hand-off notes).
     */
    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_SIDE_BETS_FAIL", [
        "ggid"  => $ggid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Side Bets.",
    ]);
}
