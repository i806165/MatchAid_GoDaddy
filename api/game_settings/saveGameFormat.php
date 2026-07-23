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

    // Needed below to know the game's prior Competition and Placement
    // Points shape, so the cross-domain reconciliation can tell a
    // transition (e.g. PairField -> PairPair) apart from a same-state
    // resave (e.g. saving GameLabel while already PairPair).
    $existingGame = ServiceDbGames::getGameByGGID($ggid);

    if (!$existingGame) {
        throw new RuntimeException("Game not found.");
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
     * ── Cross-domain: Placement Points state + structural reconciliation ──
     *
     * Competition can only ever change through this endpoint, so this is
     * the one place that can keep Placement Points' category states — and
     * Match's structural segment shape — from drifting out of agreement
     * with it, rather than waiting for a human to happen to reopen
     * Placement Points after the fact. Mirrors the same applicability
     * rule saveGamePlacementPoints.php's own $applicable check already
     * enforces, just run proactively here instead of reactively there.
     *
     * pointsConfig/tieRule are never touched, in either direction, on any
     * category — only kind:"placement"'s irrelevant-when-inactive content,
     * exactly like saveGamePlacementPoints.php's own "pass disabled
     * categories through untouched" precedent. Only Match's segments (a
     * structural key, not a cosmetic one) is ever reset, and only on the
     * transition into active — a game that's already PairPair keeps
     * whatever segment configuration Placement Points itself produced,
     * including a legitimate 3-segment split.
     */
    $existingCompetition = trim((string)($existingGame["dbGames_Competition"] ?? "PairField"));

    $rawPlacement = $existingGame["dbGames_PlacementPoints"] ?? null;
    $decodedPlacement = is_array($rawPlacement)
        ? $rawPlacement
        : ((is_string($rawPlacement) && trim($rawPlacement) !== "") ? json_decode($rawPlacement, true) : null);

    // Falls back to the same canonical shape game creation seeds — keeps
    // this endpoint correct even for a row whose PlacementPoints is null
    // or failed to decode, without hand-maintaining a second copy of that
    // shape here.
    $categoriesByKey = ServiceDbGames::defaultPlacementPointsCategories();

    if (is_array($decodedPlacement["categories"] ?? null)) {
        foreach ($decodedPlacement["categories"] as $existingCategory) {
            $existingKey = is_array($existingCategory) ? ($existingCategory["key"] ?? "") : "";
            if ($existingKey !== "" && isset($categoriesByKey[$existingKey])) {
                $categoriesByKey[$existingKey] = array_merge($categoriesByKey[$existingKey], $existingCategory);
            }
        }
    }

    $funkyGameLabels = ["Alt-Shot", "Chapman", "Scramble", "Shamble"];
    $isFunkyFormat    = in_array($gameLabel, $funkyGameLabels, true);

    $previousMatchState = $categoriesByKey["matchResult"]["state"] ?? "disabled";
    $matchBecomesActive = ($competition === "PairPair");

    $categoriesByKey["matchResult"]["state"]      = $matchBecomesActive ? "active" : "disabled";
    $categoriesByKey["gross"]["state"]             = ($competition === "PairField") ? "active" : "disabled";
    $categoriesByKey["net"]["state"]               = ($competition === "PairField") ? "active" : "disabled";
    $categoriesByKey["individualGross"]["state"]   = $isFunkyFormat ? "disabled" : "active";
    $categoriesByKey["individualNet"]["state"]     = $isFunkyFormat ? "disabled" : "active";

    // Match's segment shape only ever resets on the disabled/default ->
    // active transition, paired with forcing dbGames_ScoringSegments back
    // to 1 in the same save — Format has no path to ever select 3
    // segments itself, so there is no case where a non-baseline shape
    // reaching this endpoint via a fresh activation would be correct.
    if ($matchBecomesActive && $previousMatchState !== "active") {
        $categoriesByKey["matchResult"]["segments"] = ["1" => ["win" => 1, "halve" => 0.5, "loss" => 0]];
        $patch["dbGames_ScoringSegments"] = 1;
    }

    $anyActive = false;
    foreach ($categoriesByKey as $category) {
        if (($category["state"] ?? "") === "active") {
            $anyActive = true;
            break;
        }
    }

    $patch["dbGames_PlacementPoints"] = [
        "top"        => $anyActive ? "active" : "disabled",
        "categories" => array_values($categoriesByKey),
    ];

    // Rotation Method is PairPair-only (saveGameSegments.php rejects
    // saving it as anything but "None" once Competition isn't PairPair)
    // — so a value left over from a prior PairPair era is orphaned the
    // moment Competition leaves PairPair here, with no other save path
    // left that could ever clear it.
    if ($existingCompetition === "PairPair" && $competition !== "PairPair") {
        $patch["dbGames_RotationMethod"] = "None";
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