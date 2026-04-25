<?php
declare(strict_types=1);

// /public_html/services/workflows/workFlow_CourseChange.php
//
// Orchestrates tee re-resolution for all players when a game's course
// changes. Called synchronously from ServiceDbGames::saveGame() after
// the game record update is committed.
//
// Resolution hierarchy (Tier 1 does not apply on course change):
//   Tier 2 — Last tee the player played on the NEW course (db_Players history)
//   Tier 3 — Preferred yardage match from dbUsers profile
//   Tier 4 — Flag as "ReSelect Tee"; admin resolves manually on Game Players page

require_once __DIR__ . "/workflow_TeeResolution.php";
require_once __DIR__ . "/../database/service_dbPlayers.php";
require_once __DIR__ . "/../context/service_ContextUser.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Handicaps.php";

/**
 * Re-resolve tee assignments for all players in a game after a course change.
 *
 * @param string $ggid      The game ID
 * @param array  $game      Full game record (post-save, so CourseID is the NEW course)
 * @param string $token     Admin GHIN API token
 *
 * @return array {
 *   resolved: int,     // players successfully assigned a tee on the new course
 *   reselect: int,     // players flagged ReSelect Tee — need manual assignment
 *   skipped:  int,     // non-rated or players with no tee data to migrate
 *   total:    int,     // total players processed
 *   sources:  array    // breakdown by resolution source (last_played, preferred_yardage, reselect)
 * }
 */
function be_resolveCourseChange(string $ggid, array $game, string $token): array
{
    $players = ServiceDbPlayers::getGamePlayers($ggid);

    $summary = [
        "resolved"  => 0,
        "reselect"  => 0,
        "skipped"   => 0,
        "total"     => count($players),
        "sources"   => [
            "last_played"       => 0,
            "preferred_yardage" => 0,
            "reselect"          => 0,
        ],
    ];

    if (empty($players)) return $summary;

    $newCourseId = trim((string)($game["dbGames_CourseID"] ?? ""));
    if ($newCourseId === "") return $summary;

    $allowance = (float)($game["dbGames_Allowance"] ?? 100);

    foreach ($players as $player) {
        $ghin   = trim((string)($player["dbPlayers_PlayerGHIN"] ?? ""));
        $gender = trim((string)($player["dbPlayers_Gender"]     ?? ""));

        // Non-rated players have no GHIN API identity and no profile —
        // skip tee resolution entirely. They remain as-is.
        if ($ghin === "" || str_starts_with($ghin, "NH")) {
            $summary["skipped"]++;
            continue;
        }

        try {
            // Determine effective HI per the game's HC effectivity setting.
            // This mirrors the logic in upsertGamePlayers.php.
            $manualHi    = trim((string)($player["dbPlayers_HI"] ?? ""));
            $effectiveHI = tr_effective_hi($ghin, $manualHi, $game, $token);

            // Fetch enriched tee sets for this player on the new course.
            // be_buildTeeSetTags() returns tees filtered to this player's gender
            // and enriched with CH values calculated from their HI.
            $teeSets = be_buildTeeSetTags("Index", $effectiveHI, $gender, $game, $token);

            if (empty($teeSets)) {
                // No tee sets returned (course may be non-conforming or GHIN error).
                // Flag for manual re-selection.
                cc_stamp_reselect($ggid, $ghin);
                $summary["reselect"]++;
                $summary["sources"]["reselect"]++;
                continue;
            }

            $resolvedTee    = null;
            $resolvedSource = null;

            // Tier 2 — Last tee played on the NEW course.
            // Queries db_Players for the most recent TeeSetID this player
            // used when their CourseID matched the new course.
            $lastTeeId = ServiceDbPlayers::getLastPlayedTeeForCourse($ghin, $newCourseId);
            if ($lastTeeId !== null) {
                foreach ($teeSets as $t) {
                    if (trim((string)($t["teeSetID"] ?? $t["value"] ?? "")) === $lastTeeId) {
                        $resolvedTee    = $t;
                        $resolvedSource = "last_played";
                        break;
                    }
                }
            }

            // Tier 3 — Preferred yardage match from player profile.
            if ($resolvedTee === null) {
                $userRow        = ServiceUserContext::retrieveGHINUser($ghin);
                $preferredYards = tr_decode_preference_yards(
                    $userRow["dbUser_PreferenceYards"] ?? null
                );
                if ($preferredYards !== null) {
                    $matched = tr_find_preferred_tee($teeSets, $preferredYards, $gender);
                    if ($matched !== null) {
                        $resolvedTee    = $matched;
                        $resolvedSource = "preferred_yardage";
                    }
                }
            }

            // Tier 4 — No resolution found. Flag for manual re-selection.
            if ($resolvedTee === null) {
                cc_stamp_reselect($ggid, $ghin);
                $summary["reselect"]++;
                $summary["sources"]["reselect"]++;
                continue;
            }

            // Resolution succeeded — write the new tee assignment and
            // recalculate CH/PH from the resolved tee's course handicap value.
            $ch = (int)($resolvedTee["playerCH"] ?? 0);
            $ph = (int)round($ch * ($allowance / 100.0));

            ServiceDbPlayers::upsertGamePlayer($ggid, $ghin, [
                "dbPlayers_CourseID"      => $newCourseId,
                "dbPlayers_TeeSetID"      => (string)($resolvedTee["teeSetID"] ?? ""),
                "dbPlayers_TeeSetName"    => (string)($resolvedTee["teeSetName"] ?? ""),
                "dbPlayers_TeeSetSlope"   => (string)($resolvedTee["teeSetSlope"] ?? ""),
                "dbPlayers_TeeSetDetails" => json_encode($resolvedTee),
                "dbPlayers_HI"            => $effectiveHI,
                "dbPlayers_CH"            => (string)$ch,
                "dbPlayers_PH"            => (string)$ph,
                "dbPlayers_SO"            => "0",
            ]);

            $summary["resolved"]++;
            $summary["sources"][$resolvedSource]++;

        } catch (Throwable $e) {
            // Non-fatal per player — log and flag for manual re-selection
            // so the admin can see which players need attention.
            Logger::error("CC_RESOLVE_PLAYER_FAIL", [
                "ggid" => $ggid,
                "ghin" => $ghin,
                "err"  => $e->getMessage(),
            ]);
            cc_stamp_reselect($ggid, $ghin);
            $summary["reselect"]++;
            $summary["sources"]["reselect"]++;
        }
    }

    return $summary;
}

/**
 * Stamp a player record as requiring tee re-selection.
 * Clears tee assignment fields and zeros handicap values.
 * The "ReSelect Tee" TeeSetName is the existing system signal
 * that WorkFlow_Handicaps and Game Players already recognize.
 */
function cc_stamp_reselect(string $ggid, string $ghin): void
{
    ServiceDbPlayers::upsertGamePlayer($ggid, $ghin, [
        "dbPlayers_TeeSetID"      => "",
        "dbPlayers_TeeSetName"    => "ReSelect Tee",
        "dbPlayers_TeeSetSlope"   => "",
        "dbPlayers_TeeSetDetails" => "",
        "dbPlayers_CH"            => "0",
        "dbPlayers_PH"            => "0",
        "dbPlayers_SO"            => "0",
    ]);
}