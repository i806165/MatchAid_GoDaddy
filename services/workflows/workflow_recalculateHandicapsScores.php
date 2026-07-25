<?php
declare(strict_types=1);
// /public_html/services/workflows/workflow_recalculateHandicapsScores.php
//
// Consolidates the previous front-end-orchestrated, two-request handicap
// refresh (recalculate_handicaps.js -> refreshHandicaps.php -> calcPHSO.php)
// plus the previously-unbuilt score-staleness fix into a single, synchronous,
// server-side, four-pass operation. See spec: "Handicap, PHSO & Score Refresh
// Workflow — Technical Specification" for full rationale.
//
// Execution order (deliberate — see spec Section 2.2):
//   1. Handicaps   — be_recalculateGameHandicaps()          (HI/CH, baseline PH)
//   2. PHSO        — be_calculateGamePHSO()                  (group-relative PH/SO)
//   3. Blind Player Removal — ServiceBlindPlayer::removeBlindPlayersForScope()
//                              (delete-only, no reinsert, config untouched)
//   4. Score Reset — ServiceScoreEntry::resetScoresForGroup() (per PlayerKey group)
//
// Blind Player removal runs BEFORE Score Reset so scores are recalculated
// cleanly, without a stale blind player's data mixed into the recomputation.
//
// Scope is a property of the trigger, not a free caller choice (spec Section 4):
//   - Game-wide settings, Pairings changes, Slotting changes -> scope "game"
//   - Scorecard launch                                       -> scope "playerKey"
//   - Individual player edit (game_players.js)                -> NOT this workflow
//   - Course change                                            -> NOT this workflow
//
// No database transaction wraps this sequence (deferred — spec Section 9).
// A mid-run failure can leave the workflow partially applied; the per-pass
// result breakdown in the return value is what makes a partial failure
// diagnosable rather than silent.

require_once __DIR__ . "/workflow_Handicaps.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SERVICES . "/scoring/service_BlindPlayer.php";
require_once MA_API_LIB . "/Logger.php";

/**
 * @param string $ggid       Game identifier. Always required.
 * @param string $scope      "game" or "playerKey".
 * @param string $playerKey  Required when $scope === "playerKey"; ignored otherwise.
 * @param string $token      Admin GHIN API token, for Passes 1-2.
 *
 * @return array{
 *   ok: bool,
 *   scope: string,
 *   playerKey: ?string,
 *   passes: array{
 *     handicaps: array,
 *     phso: array,
 *     blindPlayerRemoval: array{ok:bool, deletedCount:int, anyDeleted:bool},
 *     scoreReset: array,
 *   },
 *   blindPlayerRemoved: bool,   // convenience flag — drives the front-end notification
 * }
 */
function be_recalculateHandicapsAndScores(
    string $ggid,
    string $scope,
    string $playerKey,
    string $token
): array {
    $ggid = trim($ggid);
    $scope = trim($scope) === "playerKey" ? "playerKey" : "game";
    $playerKey = trim($playerKey);

    if ($ggid === "") {
        return ["ok" => false, "message" => "Missing GGID."];
    }
    if ($scope === "playerKey" && $playerKey === "") {
        return ["ok" => false, "message" => "Missing playerKey for playerKey-scoped refresh."];
    }

    $gameRow = ServiceDbGames::getGameByGGID((int)$ggid);
    if (!$gameRow) {
        return ["ok" => false, "message" => "Game not found."];
    }

    $passes = [];

    // ── Pass 1: Handicaps (HI/CH) ───────────────────────────────────────────
    $handicapTarget = ($scope === "playerKey") ? "" : "allPlayers";
    // be_recalculateGameHandicaps()'s own scorecardKey param takes
    // precedence over parmPlayerGHIN when both are supplied — pass
    // playerKey there directly for playerKey scope, "allPlayers" via the
    // GHIN param for game scope.
    $passes["handicaps"] = be_recalculateGameHandicaps(
        $ggid,
        $scope === "playerKey" ? "" : "allPlayers",
        $gameRow,
        $token,
        $scope === "playerKey" ? $playerKey : ""
    );

    // ── Pass 2: PHSO ─────────────────────────────────────────────────────
    $passes["phso"] = be_calculateGamePHSO(
        $scope === "playerKey" ? "scorecard" : "all",
        $scope === "playerKey" ? $playerKey : null,
        $gameRow,
        $token
    );

    // ── Pass 3: Blind Player Removal (delete-only) ──────────────────────
    // Always attempted regardless of Pass 1/2 outcome — a partial
    // handicap failure shouldn't block cleaning up a now-possibly-stale
    // blind clone. See spec Section 4.1 (scope matches Passes 1/2/4 for
    // this trigger; NOT forced to game-wide independently — flagged as
    // an open point in the spec, revisit if that assumption changes).
    $passes["blindPlayerRemoval"] = ServiceBlindPlayer::removeBlindPlayersForScope(
        (int)$ggid,
        $scope === "playerKey" ? $playerKey : null
    );

    // ── Pass 4: Score Reset ──────────────────────────────────────────────
    // Runs per-PlayerKey. For game scope, every distinct PlayerKey in the
    // game is enumerated and reset individually — resetScoresForGroup()
    // itself is always PlayerKey-scoped; "game" scope here just means
    // "loop it across every group."
    if ($scope === "playerKey") {
        $passes["scoreReset"] = [
            $playerKey => ServiceScoreEntry::resetScoresForGroup($playerKey),
        ];
    } else {
        $allPlayers = ServiceDbPlayers::getGamePlayers($ggid);
        $playerKeys = [];
        foreach ($allPlayers as $p) {
            $pk = trim((string)($p["dbPlayers_PlayerKey"] ?? ""));
            if ($pk !== "" && !isset($playerKeys[$pk])) {
                $playerKeys[$pk] = true;
            }
        }

        $scoreResetResults = [];
        foreach (array_keys($playerKeys) as $pk) {
            $scoreResetResults[$pk] = ServiceScoreEntry::resetScoresForGroup($pk);
        }
        $passes["scoreReset"] = $scoreResetResults;
    }

    $overallOk =
        !empty($passes["handicaps"]["status"]) && $passes["handicaps"]["status"] !== "error"
        && !empty($passes["phso"]["status"]) && $passes["phso"]["status"] !== "error"
        && !empty($passes["blindPlayerRemoval"]["ok"]);

    if ($overallOk) {
        foreach ($passes["scoreReset"] as $result) {
            if (empty($result["ok"])) {
                $overallOk = false;
                break;
            }
        }
    }

    if (!$overallOk) {
        Logger::error("RECALC_HANDICAPS_SCORES_PARTIAL", [
            "ggid" => $ggid,
            "scope" => $scope,
            "playerKey" => $playerKey,
            "passes" => $passes,
        ]);
    }

    return [
        "ok"                 => $overallOk,
        "scope"              => $scope,
        "playerKey"          => $scope === "playerKey" ? $playerKey : null,
        "passes"             => $passes,
        "blindPlayerRemoved" => !empty($passes["blindPlayerRemoval"]["anyDeleted"]),
    ];
}
