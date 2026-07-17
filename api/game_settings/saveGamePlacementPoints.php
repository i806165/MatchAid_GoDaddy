<?php
// /public_html/api/game_settings/saveGamePlacementPoints.php

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
     *     "dbGames_ScoringSegments": 3,
     *     "dbGames_PlacementPoints": {
     *       "top": "active",
     *       "categories": [...]
     *     }
     *   }
     * }
     */
    $input = ma_json_in();
    $payload = $input["payload"] ?? null;

    if (!is_array($payload)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Invalid Placement Points payload.",
        ]);
    }

    /*
     * The client includes GGID for stale-context protection, but the
     * session GGID controls which record is saved.
     */
    $postedGGID = (int)($payload["dbGames_GGID"] ?? 0);

    if ($postedGGID > 0 && $postedGGID !== $ggid) {
        Logger::error("SAVE_GAME_PLACEMENT_POINTS_GGID_MISMATCH", [
            "sessionGGID" => $ggid,
            "postedGGID"  => $postedGGID,
        ]);

        ma_respond(409, [
            "ok"      => false,
            "message" => "The active game changed. Please reopen Placement Points.",
        ]);
    }

    // Both fields are owned and always submitted by this module.
    $requiredFields = [
        "dbGames_ScoringSegments",
        "dbGames_PlacementPoints",
    ];

    foreach ($requiredFields as $field) {
        if (!array_key_exists($field, $payload)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Placement Points is missing a required setting.",
            ]);
        }
    }

    // Load the authoritative Game for competition and rotation constraints.
    $game = ServiceDbGames::getGameByGGID($ggid);

    if (!$game) {
        throw new RuntimeException("Game not found.");
    }

    // ── Scoring Segments ───────────────────────────────────────────────

    $scoringSegments = (int)$payload["dbGames_ScoringSegments"];

    if (!in_array($scoringSegments, [1, 3], true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Scoring Segments must be 1 or 3.",
        ]);
    }

    $competition = trim(
        (string)($game["dbGames_Competition"] ?? "PairField")
    );

    $rotationMethod = trim(
        (string)($game["dbGames_RotationMethod"] ?? "None")
    );

    $rotationActive =
        $rotationMethod !== "" &&
        strcasecmp($rotationMethod, "None") !== 0;

    /*
     * Three Scoring Segments means:
     *
     *   1 = Overall
     *   2 = Front 9
     *   3 = Back 9
     *
     * This applies only to non-rotating PairPair games.
     *
     * dbGames_Segments is Playing Segments and is intentionally not
     * referenced or changed by this endpoint.
     */
    if (
        $scoringSegments === 3 &&
        (
            $competition !== "PairPair" ||
            $rotationActive
        )
    ) {
        ma_respond(409, [
            "ok"      => false,
            "message" => "Three Scoring Segments require a non-rotating Pair vs. Pair game.",
        ]);
    }

    // Normalize constrained cases to one Overall scoring result.
    if (
        $competition !== "PairPair" ||
        $rotationActive
    ) {
        $scoringSegments = 1;
    }

    // ── Placement Points input ─────────────────────────────────────────

    $placementPoints = $payload["dbGames_PlacementPoints"];

    /*
     * The module should submit an object/associative array. Accept a JSON
     * string defensively for compatibility, then normalize to an array.
     */
    if (is_string($placementPoints)) {
        $decoded = json_decode($placementPoints, true);

        if (!is_array($decoded)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Placement Points contains invalid JSON.",
            ]);
        }

        $placementPoints = $decoded;
    }

    if (!is_array($placementPoints)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Placement Points configuration must be an object.",
        ]);
    }

    // ── Top-level structure ────────────────────────────────────────────

    $top = trim((string)($placementPoints["top"] ?? ""));

    if (!in_array($top, ["default", "active", "disabled"], true)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Placement Points has an invalid top-level state.",
        ]);
    }

    $categories = $placementPoints["categories"] ?? null;

    if (!is_array($categories)) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Placement Points categories are missing.",
        ]);
    }

    /*
     * Canonical category definitions.
     *
     * All categories remain stored even when inactive for the current
     * competition so switching formats does not destroy prior settings.
     */
    $categoryDefinitions = [
        "gross" => [
            "kind"  => "placement",
            "scope" => "pairfield",
        ],

        "net" => [
            "kind"  => "placement",
            "scope" => "pairfield",
        ],

        "matchResult" => [
            "kind"  => "segments",
            "scope" => "pairpair",
        ],

        "individualGross" => [
            "kind"  => "placement",
            "scope" => "individual",
        ],

        "individualNet" => [
            "kind"  => "placement",
            "scope" => "individual",
        ],
    ];

    $normalizedByKey = [];

    foreach ($categories as $category) {
        if (!is_array($category)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Placement Points contains an invalid category.",
            ]);
        }

        $key = trim((string)($category["key"] ?? ""));

        if (!array_key_exists($key, $categoryDefinitions)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Placement Points contains an unsupported category.",
            ]);
        }

        if (isset($normalizedByKey[$key])) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Placement Points contains a duplicate category.",
            ]);
        }

        $definition = $categoryDefinitions[$key];

        $kind  = trim((string)($category["kind"] ?? ""));
        $scope = trim((string)($category["scope"] ?? ""));
        $state = trim((string)($category["state"] ?? ""));

        if (
            $kind !== $definition["kind"] ||
            $scope !== $definition["scope"]
        ) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Placement Points contains invalid category metadata.",
            ]);
        }

        if (!in_array($state, ["default", "active", "disabled"], true)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Placement Points contains an invalid category state.",
            ]);
        }

        // ── Placement categories ───────────────────────────────────────

        if ($kind === "placement") {
            $pointsConfig = $category["pointsConfig"] ?? null;
            $tieRule = trim((string)($category["tieRule"] ?? ""));

            if (!is_array($pointsConfig) || $pointsConfig === []) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "A Placement Points category is missing its finishing positions.",
                ]);
            }

            if (!in_array($tieRule, ["split", "high", "low"], true)) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Placement Points contains an invalid tie rule.",
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
                        "message" => "Placement Points contains an invalid finishing position.",
                    ]);
                }

                if (!is_numeric($points)) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Placement Points contains a non-numeric points value.",
                    ]);
                }

                $numericPoints = (float)$points;

                if ($numericPoints < 0) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Placement Points values cannot be negative.",
                    ]);
                }

                $normalizedPoints[(string)(int)$placeString] =
                    $numericPoints;
            }

            uksort(
                $normalizedPoints,
                static fn(string $a, string $b): int =>
                    ((int)$a) <=> ((int)$b)
            );

            $normalizedByKey[$key] = [
                "key"          => $key,
                "kind"         => $kind,
                "scope"        => $scope,
                "state"        => $state,
                "pointsConfig" => $normalizedPoints,
                "tieRule"      => $tieRule,
            ];

            continue;
        }

        // ── Match Result category ──────────────────────────────────────

        $segments = $category["segments"] ?? null;

        if (!is_array($segments)) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Match Result segments are missing.",
            ]);
        }

        /*
         * Scoring Segments controls the exact required shape:
         *
         * 1 → segment key "1" only
         * 3 → segment keys "1", "2", and "3"
         */
        $requiredSegmentKeys = $scoringSegments === 3
            ? ["1", "2", "3"]
            : ["1"];

        $providedSegmentKeys = array_map(
            "strval",
            array_keys($segments)
        );

        sort($providedSegmentKeys, SORT_STRING);

        $expectedSegmentKeys = $requiredSegmentKeys;
        sort($expectedSegmentKeys, SORT_STRING);

        if ($providedSegmentKeys !== $expectedSegmentKeys) {
            ma_respond(400, [
                "ok"      => false,
                "message" => $scoringSegments === 3
                    ? "Match Result must contain Overall, Front 9, and Back 9 scoring segments."
                    : "Match Result must contain only the Overall scoring segment.",
            ]);
        }

        $normalizedSegments = [];

        foreach ($requiredSegmentKeys as $segmentKey) {
            $outcomes = $segments[$segmentKey] ?? null;

            if (!is_array($outcomes)) {
                ma_respond(400, [
                    "ok"      => false,
                    "message" => "Match Result contains an invalid outcome configuration.",
                ]);
            }

            $normalizedOutcome = [];

            foreach (["win", "halve", "loss"] as $outcome) {
                if (
                    !array_key_exists($outcome, $outcomes) ||
                    !is_numeric($outcomes[$outcome])
                ) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Match Result is missing a valid win, halve, or loss value.",
                    ]);
                }

                $value = (float)$outcomes[$outcome];

                if ($value < 0) {
                    ma_respond(400, [
                        "ok"      => false,
                        "message" => "Match Result values cannot be negative.",
                    ]);
                }

                $normalizedOutcome[$outcome] = $value;
            }

            $normalizedSegments[$segmentKey] = $normalizedOutcome;
        }

        $normalizedByKey[$key] = [
            "key"      => $key,
            "kind"     => $kind,
            "scope"    => $scope,
            "state"    => $state,
            "segments" => $normalizedSegments,
        ];
    }

    // All canonical categories must remain present.
    foreach (array_keys($categoryDefinitions) as $requiredKey) {
        if (!isset($normalizedByKey[$requiredKey])) {
            ma_respond(400, [
                "ok"      => false,
                "message" => "Placement Points is missing a required category.",
            ]);
        }
    }

    // Restore canonical category order.
    $normalizedCategories = [];

    foreach (array_keys($categoryDefinitions) as $key) {
        $normalizedCategories[] = $normalizedByKey[$key];
    }

    // ── Top-level state consistency ────────────────────────────────────

    $states = array_column($normalizedCategories, "state");

    $hasActive = in_array("active", $states, true);

    $allDisabled =
        count(array_filter(
            $states,
            static fn(string $state): bool =>
                $state === "disabled"
        )) === count($states);

    if ($top === "active" && !$hasActive) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Placement Points top-level state does not match its categories.",
        ]);
    }

    if ($top === "disabled" && !$allDisabled) {
        ma_respond(400, [
            "ok"      => false,
            "message" => "Placement Points top-level state does not match its categories.",
        ]);
    }

    $normalizedPlacementPoints = [
        "top"        => $top,
        "categories" => $normalizedCategories,
    ];

    // ── Persist both fields owned by Placement Points ──────────────────

    $patch = [
        "dbGames_ScoringSegments" => $scoringSegments,
        "dbGames_PlacementPoints" => $normalizedPlacementPoints,
    ];

    /*
     * ServiceDbGames remains the authoritative persistence layer:
     *
     * - master field allowlist;
     * - Scoring Segments normalization;
     * - JSON encoding of Placement Points;
     * - database update;
     * - refreshed Game response.
     */
    $result = ServiceDbGames::saveGameSettings($ggid, $patch);

    ma_respond(200, [
        "ok"      => true,
        "payload" => $result,
    ]);

} catch (Throwable $e) {
    Logger::error("SAVE_GAME_PLACEMENT_POINTS_FAIL", [
        "ggid"  => $ggid,
        "error" => $e->getMessage(),
    ]);

    ma_respond(500, [
        "ok"      => false,
        "message" => "Unable to save Placement Points.",
    ]);
}