<?php
// /public_html/api/game_settings/saveGameScoring.php

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
     * Expected request:
     *
     * {
     *   "payload": {
     *     "dbGames_GGID": 622,
     *     "dbGames_ScoringMethod": "NET",
     *     "dbGames_ScoringSystem": "BestBall",
     *     "dbGames_BestBall": "2",
     *     "dbGames_HoleDeclaration": [],
     *     "dbGames_PointsConfig": {
     *       "strategy": "Stableford",
     *       "values": [...]
     *     },
     *
     *     // Conditional cross-domain reset:
     *     "dbGames_HCMethod": "CH",
     *     "dbGames_Allowance": 100
     *   }
     * }
     */
    $input = ma_json_in();
    $payload = $input["payload"] ?? null;

    if (!is_array($payload)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Scoring payload.",
        ]);
    }

    // Reject a stale or mismatched client context.
    $postedGGID = (int)($payload["dbGames_GGID"] ?? 0);

    if ($postedGGID > 0 && $postedGGID !== $ggid) {
        Logger::error("SAVE_GAME_SCORING_GGID_MISMATCH", [
            "sessionGGID" => $ggid,
            "postedGGID"  => $postedGGID,
        ]);

        ma_respond(409, [
            "ok"      => false,
            "message" => "The active game changed. Please reopen Scoring.",
        ]);
    }

    $game = ServiceDbGames::getGameByGGID($ggid);

    if (!$game) {
        throw new RuntimeException("Game not found.");
    }

    // ── Required fields ────────────────────────────────────────────────

    $requiredFields = [
        "dbGames_ScoringMethod",
        "dbGames_ScoringSystem",
        "dbGames_BestBall",
        "dbGames_HoleDeclaration",
        "dbGames_PointsConfig",
    ];

    foreach ($requiredFields as $field) {
        if (!array_key_exists($field, $payload)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Scoring is missing a required setting.",
            ]);
        }
    }

    // ── Scoring Method ─────────────────────────────────────────────────

    $scoringMethod = trim((string)$payload["dbGames_ScoringMethod"]);

    if (!in_array($scoringMethod, ["NET", "ADJ GROSS"], true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Scoring Method.",
        ]);
    }

    // ── Scoring System ─────────────────────────────────────────────────

    $scoringSystem = trim((string)$payload["dbGames_ScoringSystem"]);

    $validScoringSystems = [
        "AllScores",
        "BestBall",
        "DeclareHole",
        "DeclareManual",
    ];

    if (!in_array($scoringSystem, $validScoringSystems, true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Scoring System.",
        ]);
    }

    // ── Best Ball ──────────────────────────────────────────────────────

    $bestBall = null;

    if ($scoringSystem === "BestBall") {
        $bestBall = trim((string)$payload["dbGames_BestBall"]);

        if (!in_array($bestBall, ["1", "2", "3", "4"], true)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Invalid Best Ball count.",
            ]);
        }
    }

    // ── Hole Declaration ───────────────────────────────────────────────

    $holeDeclaration = $payload["dbGames_HoleDeclaration"];

    if (!is_array($holeDeclaration)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Scores Per Hole configuration must be an array.",
        ]);
    }

    $normalizedHoleDeclaration = [];

    if ($scoringSystem === "DeclareHole") {
        $seenHoles = [];

        foreach ($holeDeclaration as $row) {
            if (!is_array($row)) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Invalid Scores Per Hole entry.",
                ]);
            }

            $hole  = (int)($row["hole"] ?? 0);
            $count = (int)($row["count"] ?? -1);

            if ($hole < 1 || $hole > 18) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Scores Per Hole contains an invalid hole number.",
                ]);
            }

            if ($count < 0 || $count > 4) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Scores Per Hole count must be between 0 and 4.",
                ]);
            }

            if (isset($seenHoles[$hole])) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Scores Per Hole contains a duplicate hole.",
                ]);
            }

            $seenHoles[$hole] = true;

            $normalizedHoleDeclaration[] = [
                "hole"  => $hole,
                "count" => $count,
            ];
        }

        if (count($normalizedHoleDeclaration) !== 18) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Scores Per Hole must contain all 18 holes.",
            ]);
        }

        usort(
            $normalizedHoleDeclaration,
            static fn(array $a, array $b): int =>
                $a["hole"] <=> $b["hole"]
        );
    }

    // ── Points Configuration ───────────────────────────────────────────

    $basis = trim(
        (string)($game["dbGames_ScoringBasis"] ?? "Strokes")
    );

    $competition = trim(
        (string)($game["dbGames_Competition"] ?? "PairField")
    );

    $pointsConfig = $payload["dbGames_PointsConfig"];
    $normalizedPointsConfig = null;

    if ($basis === "Points") {
        if (!is_array($pointsConfig)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Points Configuration must be an object.",
            ]);
        }

        $strategy = trim(
            (string)($pointsConfig["strategy"] ?? "")
        );

        $validStrategies = [
            "Stableford",
            "Chicago",
            "Nines",
            "LowBallLowTotal",
            "LowBallHighBall",
            "Vegas",
        ];

        if (!in_array($strategy, $validStrategies, true)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Invalid Points Strategy.",
            ]);
        }

        $pairPairOnly = [
            "Nines",
            "LowBallLowTotal",
            "LowBallHighBall",
            "Vegas",
        ];

        if (
            $competition !== "PairPair" &&
            in_array($strategy, $pairPairOnly, true)
        ) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "The selected Points Strategy requires Pair vs. Pair.",
            ]);
        }

        $normalizedPointsConfig = [
            "strategy" => $strategy,
        ];

        // Stableford and Chicago use relative-to-par rows.
        if (in_array($strategy, ["Stableford", "Chicago"], true)) {
            $values = $pointsConfig["values"] ?? null;

            if (!is_array($values) || $values === []) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Points Configuration requires at least one scoring value.",
                ]);
            }

            $normalizedValues = [];
            $seenRelToPar = [];

            foreach ($values as $row) {
                if (!is_array($row)) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Invalid Points Configuration entry.",
                    ]);
                }

                if (!array_key_exists("reltoPar", $row)) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Points Configuration is missing a relative-to-par value.",
                    ]);
                }

                if (!array_key_exists("points", $row)) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Points Configuration is missing a points value.",
                    ]);
                }

                $relToPar = (int)$row["reltoPar"];
                $points   = (float)$row["points"];

                if (isset($seenRelToPar[$relToPar])) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Points Configuration contains a duplicate relative-to-par value.",
                    ]);
                }

                if ($points < -99 || $points > 99) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Points values must be between -99 and 99.",
                    ]);
                }

                $seenRelToPar[$relToPar] = true;

                $normalizedValues[] = [
                    "reltoPar" => $relToPar,
                    "points"   => $points,
                ];
            }

            usort(
                $normalizedValues,
                static fn(array $a, array $b): int =>
                    $a["reltoPar"] <=> $b["reltoPar"]
            );

            $normalizedPointsConfig["values"] = $normalizedValues;

            if ($strategy === "Chicago") {
                $normalizedPointsConfig["quota"] = [
                    "method" => "handicap",
                    "base"   => 36,
                ];
            }
        }

        // Nines uses separate 4-player and 3-player distributions.
        if ($strategy === "Nines") {
            $values = $pointsConfig["values"] ?? null;

            if (
                !is_array($values) ||
                !isset($values["4"], $values["3"]) ||
                !is_array($values["4"]) ||
                !is_array($values["3"]) ||
                count($values["4"]) !== 4 ||
                count($values["3"]) !== 3
            ) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Invalid 9's Points Configuration.",
                ]);
            }

            $pool4 = array_map(
                static fn($value): float => (float)$value,
                array_values($values["4"])
            );

            $pool3 = array_map(
                static fn($value): float => (float)$value,
                array_values($values["3"])
            );

            foreach (array_merge($pool4, $pool3) as $value) {
                if ($value < 0 || $value > 9) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "9's point values must be between 0 and 9.",
                    ]);
                }
            }

            $normalizedPointsConfig["values"] = [
                "4" => $pool4,
                "3" => $pool3,
            ];
        }

        /*
         * LowBallLowTotal, LowBallHighBall, and Vegas do not currently
         * require additional editable configuration. Their persisted JSON
         * remains:
         *
         * { "strategy": "..." }
         */
    }

    // ── Build Scoring patch ────────────────────────────────────────────

    $patch = [
        "dbGames_ScoringMethod"   => $scoringMethod,
        "dbGames_ScoringSystem"   => $scoringSystem,
        "dbGames_BestBall"        => $bestBall,
        "dbGames_HoleDeclaration" => $normalizedHoleDeclaration,
        "dbGames_PointsConfig"    => $normalizedPointsConfig,
    ];

    /*
     * Verify the deliberate cross-domain reset server-side.
     *
     * When Scoring changes from ADJ GROSS to NET:
     *   dbGames_HCMethod  = CH
     *   dbGames_Allowance = 100
     */
    $existingScoringMethod = trim(
        (string)($game["dbGames_ScoringMethod"] ?? "NET")
    );

    if (
        $existingScoringMethod === "ADJ GROSS" &&
        $scoringMethod === "NET"
    ) {
        $patch["dbGames_HCMethod"] = "CH";
        $patch["dbGames_Allowance"] = 100;
    }

    /*
     * ── Cross-domain: DeclareManual disables Blind Player ──
     *
     * Player Declare (Manual) scoring is not compatible with Blind
     * Player (saveGameBlindPlayer.php's own guard rejects assigning one
     * under DeclareManual). Scoring System can only ever change through
     * this endpoint, so this is the only place that can proactively
     * clear a Blind Player configuration left over from before the
     * switch — unconditional on every save while DeclareManual is
     * selected, not just on the transition edge, since a resave with
     * DeclareManual already active should never leave a stale
     * assignment sitting in the row either.
     */
    if ($scoringSystem === "DeclareManual") {
        $patch["dbGames_BlindPlayers"] = [];
    }

    /*
     * ServiceDbGames remains the authoritative persistence layer:
     * - master allowlist
     * - JSON encoding
     * - normalization
     * - database update
     * - refreshed Game response
     */
    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_SCORING_FAIL", [
        "ggid"  => $ggid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Scoring.",
    ]);
}