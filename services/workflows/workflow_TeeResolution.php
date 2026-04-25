<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_TeeResolution.php
//

/*
// Shared tee resolution helpers.
//
// Consumers:
//   - api/GHIN/getTeeSets.php          (single-player tee picker)
//   - services/workflows/workflow_CourseChange.php  (bulk course change)

    Player Import Code Path is: JS loop → HTTP → getTeeSets.php → workflow_TeeResolution.php
    Course change Code Path is: workflow_CourseChange.php → workflow_TeeResolution.php directly
*/

require_once MA_SERVICES . "/GHIN/GHIN_API_Handicaps.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";

/**
 * Determine the effective handicap index for a player given the game's
 * HCEffectivity setting. Non-rated players (NH prefix) return manualHi
 * or "0". All other players hit the GHIN API.
 *
 * Mirrors gp_effective_hi() that was previously in getTeeSets.php.
 */
function tr_effective_hi(string $ghin, string $manualHi, array $game, string $token): string
{
    if (str_starts_with($ghin, "NH")) {
        return ($manualHi !== "") ? $manualHi : "0";
    }

    $hce     = trim((string)($game["dbGames_HCEffectivity"] ?? ""));
    $payload = null;

    if (in_array($hce, ["Low3", "Low6", "Low12"], true)) {
        $payload = be_getHandicapbyPeriod($hce, null, null, $ghin, $token);
    } elseif ($hce === "PlayDate") {
        $d = tr_to_ymd($game["dbGames_PlayDate"] ?? null);
        $payload = be_getHandicapbyPeriod("Range", $d, $d, $ghin, $token);
    } elseif ($hce === "Date") {
        $d = tr_to_ymd($game["dbGames_HCEffectivityDate"] ?? null);
        $payload = be_getHandicapbyPeriod("Range", $d, $d, $ghin, $token);
    }

    $row = (is_array($payload["d"] ?? null)
        && isset($payload["d"][0])
        && is_array($payload["d"][0]))
        ? $payload["d"][0]
        : null;

    if (is_array($row)
        && array_key_exists("LowHIValue", $row)
        && $row["LowHIValue"] !== null
        && $row["LowHIValue"] !== "") {
        return (string)$row["LowHIValue"];
    }

    $byId = be_getPlayersByID($ghin, $token);
    return (string)($byId["golfers"][0]["handicap_index"] ?? "0");
}

/**
 * Normalize a date value to YYYY-MM-DD string, or null if unparseable.
 */
function tr_to_ymd($d): ?string
{
    if (!$d) return null;
    if (is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($d))) return trim($d);
    $ts = strtotime((string)$d);
    if ($ts === false) return null;
    return date('Y-m-d', $ts);
}

/**
 * Decode a player's preferred yardage range from the dbUser_PreferenceYards
 * JSON column. Returns [min, max] array or null if absent/invalid.
 */
function tr_decode_preference_yards($raw): ?array
{
    if (!is_string($raw)) return null;
    $trim = trim($raw);
    if ($trim === "") return null;

    $decoded = json_decode($trim, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) return null;

    $min = isset($decoded["min"]) ? (int)$decoded["min"] : 0;
    $max = isset($decoded["max"]) ? (int)$decoded["max"] : 0;

    if ($min < 0 || $max <= 0 || $min >= $max) return null;
    return ["min" => $min, "max" => $max];
}

/**
 * Build a human-readable tee label.
 * Mirrors formatAssignedTeeText() in game_players.js — keep in sync.
 */
function tr_build_tee_text(array $t): string
{
    $name  = trim((string)($t["teeSetName"] ?? $t["name"] ?? $t["label"] ?? ""));
    $yards = trim((string)($t["teeSetYards"] ?? $t["yards"] ?? ""));
    if ($yards !== "" && $yards !== "0") {
        return $name . " • " . number_format((int)$yards) . " yds";
    }
    return $name;
}

/**
 * Find the best tee match for a player's preferred yardage range.
 * Mirrors findRecommendedTee() in teesetSelection.js — keep both in sync.
 *
 * Priority:
 *   1. Single tee inside [min, max]
 *   2. Multiple inside range — closest to midpoint (or edge if open-ended)
 *   3. Closest tee outside range
 */
function tr_find_preferred_tee(array $teeSets, array $preferredYards, string $gender): ?array
{
    $min = (int)($preferredYards["min"] ?? 0);
    $max = (int)($preferredYards["max"] ?? 0);
    if ($max <= 0 || $min >= $max) return null;

    $gU = strtoupper(substr($gender, 0, 1));
    $candidates = ($gU !== "")
        ? array_values(array_filter($teeSets,
            fn($t) => strtoupper(substr((string)($t["gender"] ?? ""), 0, 1)) === $gU))
        : $teeSets;
    if (empty($candidates)) $candidates = $teeSets;

    $withYards = array_values(array_filter(array_map(function ($t) {
        $raw = preg_replace('/[^\d.]/', '', (string)($t["teeSetYards"] ?? $t["yards"] ?? ""));
        $y   = (int)$raw;
        return $y > 0 ? ["tee" => $t, "yards" => $y] : null;
    }, $candidates)));

    if (empty($withYards)) return null;

    $inside = array_values(array_filter($withYards,
        fn($x) => $x["yards"] >= $min && $x["yards"] <= $max));

    if (count($inside) === 1) return $inside[0]["tee"];

    if (count($inside) > 1) {
        if ($min <= 0) {
            usort($inside, fn($a, $b) => $a["yards"] - $b["yards"]);
            return $inside[0]["tee"];
        }
        if ($max >= 9999) {
            usort($inside, fn($a, $b) => $b["yards"] - $a["yards"]);
            return $inside[0]["tee"];
        }
        $mid = (int)round(($min + $max) / 2);
        usort($inside, fn($a, $b) => abs($a["yards"] - $mid) - abs($b["yards"] - $mid));
        return $inside[0]["tee"];
    }

    // Nothing inside range — closest overall
    $mid = (int)round(($min + $max) / 2);
    usort($withYards, fn($a, $b) => abs($a["yards"] - $mid) - abs($b["yards"] - $mid));
    return $withYards[0]["tee"];
}