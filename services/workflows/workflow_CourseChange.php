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
//            Skipped for Non-Rated (NH) players — no persistent GHIN identity.
//   Tier 3 — Preferred yardage match from dbUsers profile
//            Skipped for Non-Rated (NH) players — no dbUsers profile row.
//   Tier 4 — Closest total yardage to the tee played on the OLD course
//            (from dbPlayers_TeeSetDetails). Applies to NH players too —
//            this tier has no GHIN-identity dependency.
//   Tier 5 — No resolution found. Flag as "ReSelect Tee"; admin resolves
//            manually on the Game Players page.

require_once __DIR__ . "/workflow_TeeResolution.php";
require_once __DIR__ . "/../database/service_dbPlayers.php";
require_once __DIR__ . "/../context/service_ContextUser.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Handicaps.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";

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
 *   total:    int,     // total players processed
 *   sources:  array    // breakdown by resolution source (last_played, preferred_yardage, closest_yardage, reselect)
 * }
 */
function be_resolveCourseChange(string $ggid, array $game, string $token): array
{
    $players = ServiceDbPlayers::getGamePlayers($ggid);

    $summary = [
        "resolved"  => 0,
        "reselect"  => 0,
        "total"     => count($players),
        "sources"   => [
            "last_played"       => 0,
            "preferred_yardage" => 0,
            "closest_yardage"   => 0,
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

        // No GHIN identity at all — nothing to look up, not even locally.
        // Flag for manual tee re-selection.
        if ($ghin === "") {
            cc_stamp_reselect($ggid, $ghin);
            $summary["reselect"]++;
            $summary["sources"]["reselect"]++;
            continue;
        }

        $isNonRated = str_starts_with($ghin, "NH");

        try {
            // Determine effective HI per the game's HC effectivity setting.
            // This mirrors the logic in upsertGamePlayers.php.
            // tr_effective_hi() already has a non-rated branch (returns manualHi),
            // so this is safe to call for NH players too.
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
            // Skipped for NH players — no persistent GHIN identity to query
            // play history against.
            if (!$isNonRated) {
                $lastTeeId = ServiceDbPlayers::getLastPlayedTeeForCourse($ghin, $newCourseId, $ggid);
                if ($lastTeeId !== null) {
                    foreach ($teeSets as $t) {
                        if (trim((string)($t["teeSetID"] ?? $t["value"] ?? "")) === $lastTeeId) {
                            $resolvedTee    = $t;
                            $resolvedSource = "last_played";
                            break;
                        }
                    }
                }
            }

            // Tier 3 — Preferred yardage match from player profile.
            // Skipped for NH players — no dbUsers profile row keyed by GHIN.
            if ($resolvedTee === null && !$isNonRated) {
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

            // Tier 4 — Closest total yardage to the tee played on the OLD course.
            // Applies to rated AND non-rated (NH) players — this tier has no
            // GHIN-identity dependency, only the player's own locally-stored
            // dbPlayers_TeeSetDetails from before the course change.
            // Gender filtering is already guaranteed upstream by
            // be_buildTeeSetTags() — $teeSets does not need re-filtering here.
            if ($resolvedTee === null) {
                $oldYardage = cc_old_course_yardage($player["dbPlayers_TeeSetDetails"] ?? null);
                if ($oldYardage !== null) {
                    $matched = cc_find_closest_yardage_tee($teeSets, $oldYardage);
                    if ($matched !== null) {
                        $resolvedTee    = $matched;
                        $resolvedSource = "closest_yardage";
                    }
                }
            }

            // Tier 5 — No resolution found. Flag for manual re-selection.
            if ($resolvedTee === null) {
                cc_stamp_reselect($ggid, $ghin);
                $summary["reselect"]++;
                $summary["sources"]["reselect"]++;
                continue;
            }

            // Resolution succeeded — fetch the full GHIN tee detail object.
            // IMPORTANT: $resolvedTee from be_buildTeeSetTags() is a compact
            // UI picker object { label, value, teeSetID, playerCH, ... }.
            // Scorecards expect dbPlayers_TeeSetDetails to contain the full
            // GHIN tee payload beginning with {"Season":{"SeasonName":...}}.
            // We must call be_getTeeSetByID() to get that full object,
            // exactly as upsertGamePlayers.php does.
            $ch = (int)($resolvedTee["playerCH"] ?? 0);
            $ph = (int)round($ch * ($allowance / 100.0));

            $teeSetId = (string)($resolvedTee["teeSetID"] ?? "");
            $richTeeDetails = ($teeSetId !== "")
                ? be_getTeeSetByID($teeSetId, $token)
                : $resolvedTee;

            ServiceDbPlayers::upsertGamePlayer($ggid, $ghin, [
                "dbPlayers_CourseID"      => $newCourseId,
                "dbPlayers_TeeSetID"      => $teeSetId,
                "dbPlayers_TeeSetName"    => (string)($resolvedTee["teeSetName"] ?? ""),
                "dbPlayers_TeeSetSlope"   => (string)($resolvedTee["teeSetSlope"] ?? ""),
                "dbPlayers_TeeSetDetails" => json_encode($richTeeDetails),
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

/**
 * Extract TotalYardage from a player's stored dbPlayers_TeeSetDetails
 * (the full GHIN tee payload for the tee they played on the OLD course,
 * as stored before the course change was applied).
 *
 * Returns null if the column is empty, unparseable, or has no yardage —
 * callers should fall through to the next tier in that case.
 */
function cc_old_course_yardage(?string $teeSetDetailsJson): ?int
{
    if ($teeSetDetailsJson === null || trim($teeSetDetailsJson) === "") {
        return null;
    }

    $decoded = json_decode($teeSetDetailsJson, true);
    if (!is_array($decoded)) return null;

    $yardage = $decoded["TotalYardage"] ?? null;
    return is_numeric($yardage) ? (int)$yardage : null;
}

/**
 * Extract a numeric yardage value from a compact tee-picker object
 * (as returned by be_buildTeeSetTags()). Mirrors teeNumericYards()
 * in teesetSelection.js and the yardage-parsing pattern used by
 * tr_find_preferred_tee() — keep in sync.
 */
function cc_tee_yards(array $t): ?int
{
    $raw = $t["teeSetYards"] ?? $t["yards"] ?? null;
    if ($raw === null) return null;

    $digits = preg_replace('/[^\d]/', '', (string)$raw);
    return ($digits !== "") ? (int)$digits : null;
}

/**
 * Find the candidate tee whose total yardage is numerically closest to
 * $oldYardage. Pure absolute-difference match, no directional preference.
 * Ties resolve to whichever candidate is encountered first in $teeSets
 * (i.e. GHIN's own return order) — no secondary tiebreak is applied.
 *
 * $teeSets is assumed to already be gender-filtered by the caller
 * (guaranteed upstream by be_buildTeeSetTags()).
 */
function cc_find_closest_yardage_tee(array $teeSets, int $oldYardage): ?array
{
    $best     = null;
    $bestDiff = null;

    foreach ($teeSets as $t) {
        $yards = cc_tee_yards($t);
        if ($yards === null) continue;

        $diff = abs($yards - $oldYardage);
        if ($bestDiff === null || $diff < $bestDiff) {
            $bestDiff = $diff;
            $best     = $t;
        }
    }

    return $best;
}
