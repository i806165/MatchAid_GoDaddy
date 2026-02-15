<?php
// /public_html/api/services/GHIN_API_Handicaps.php
declare(strict_types=1);

require_once MA_API_LIB . "/HttpClient.php";

/**
 * PHP refactor of Wix:
 * export function be_getCourseHandicap(parmType, parmValue, parmCourse, parmToken = null)
 *
 * parmType: "Player" | "Index"
 * parmValue: golfer_id (when Player) OR handicap_index (when Index)
 * parmCourse: course_id (or "NC..." non-conforming marker)
 */
function be_getCourseHandicap(string $parmType, $parmValue, string $parmCourse, ?string $parmToken = null): array
{
    $myToken = (string)($parmToken ?? "");
    if ($myToken === "") {
        throw new RuntimeException("be_getCourseHandicap: missing parmToken");
    }

    $course = trim($parmCourse);
    if ($course === "") {
        throw new RuntimeException("be_getCourseHandicap: missing parmCourse");
    }

    // Preserve Wix behavior: non-conforming course shortcut
    if (str_starts_with($course, "NC")) {
        return []; // Wix returned [] / nonConformingCourse placeholder
    }

    $val = trim((string)$parmValue);
    if ($val === "") {
        throw new RuntimeException("be_getCourseHandicap: missing parmValue");
    }

    if ($parmType === "Player") {
        $GHINurl = "https://api.ghin.com/api/v1/course_handicaps.json" .
            "?golfer_id=" . rawurlencode($val) .
            "&course_id=" . rawurlencode($course);
    } else {
        // default to "Index"
        $GHINurl = "https://api.ghin.com/api/v1/course_handicaps.json" .
            "?handicap_index=" . rawurlencode($val) .
            "&course_id=" . rawurlencode($course);
    }

    return HttpClient::getJson($GHINurl, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}

/**
 * PHP refactor of Wix:
 * export async function be_getHandicapbyPeriod(parmPeriod, parmBegDate, parmEndDate, parmGolfers, parmToken)
 *
 * parmPeriod: "Low12" | "Low6" | "Low3" | "Range"
 * parmGolfers: string GHIN, comma list, or array, or array of objects w/ ghin/dbPlayers_PlayerGHIN etc.
 * Returns raw GHIN payload, unmodified.
 */
function be_getHandicapbyPeriod(string $parmPeriod, $parmBegDate, $parmEndDate, $parmGolfers, string $parmToken): array
{
    $myToken = trim((string)$parmToken);
    if ($myToken === "") {
        throw new RuntimeException("be_getHandicapbyPeriod: missing token");
    }

    $GHINurl = match ($parmPeriod) {
        "Low12" => "https://api.ghin.com/api/v1/golfers/low_hi_last_year.json",
        "Low6"  => "https://api.ghin.com/api/v1/golfers/low_hi_last_6months.json",
        "Low3"  => "https://api.ghin.com/api/v1/golfers/low_hi_last_3months.json",
        "Range" => "https://api.ghin.com/api/v1/golfers/low_hi_date_range.json",
        default => throw new RuntimeException("be_getHandicapbyPeriod: Invalid Period " . $parmPeriod),
    };

    $ghinNumber = normalizeGhinNumberArray($parmGolfers);
    if (!count($ghinNumber)) {
        throw new RuntimeException("be_getHandicapbyPeriod: missing golfer GHIN list");
    }

    $requestBody = ["ghinNumber" => $ghinNumber];

    if ($parmPeriod === "Range") {
        $DateBegin = substr(trim((string)$parmBegDate), 0, 10);
        $DateEnd   = substr(trim((string)$parmEndDate), 0, 10);
        if ($DateBegin === "" || $DateEnd === "") {
            throw new RuntimeException("be_getHandicapbyPeriod: Range requires parmBegDate and parmEndDate (YYYY-MM-DD)");
        }
        $requestBody["DateBegin"] = $DateBegin;
        $requestBody["DateEnd"]   = $DateEnd;
    }

    error_log("[be_getHandicapbyPeriod] URL: " . $GHINurl);
    error_log("[be_getHandicapbyPeriod] Body: " . json_encode($requestBody));

    // NOTE: your HttpClient::postJson throws on non-2xx, like your Wix code did.
    $res = HttpClient::postJson($GHINurl, $requestBody, [
        "accept: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
    error_log("[be_getHandicapbyPeriod] Response: " . json_encode($res));
    return $res;
}

/**
 * PHP refactor of Wix:
 * export async function be_buildTeeSetTags(parmMode, parmValue, parmGender, parmGameData, parmToken = null)
 *
 * Builds the same enriched tags array and sorts by slope desc.
 * parmMode: "Player" | "Index"
 * parmValue: GHIN (Player) or HI (Index)
 * parmGender: "M"|"F" (or whatever GHIN returns)
 * parmGameData expects:
 *   - dbGames_CourseID
 *   - dbGames_Holes (e.g., "All 18" / "F9" / "B9" depending on your GHIN rating tee_set_side contract)
 */
function be_buildTeeSetTags(string $parmMode, $parmValue, string $parmGender, array $parmGameData, ?string $parmToken = null): array
{
    $txtCourseID = (string)($parmGameData["dbGames_CourseID"] ?? "");
    $txtHoles    = (string)($parmGameData["dbGames_Holes"] ?? "");

    if (trim($txtCourseID) === "" || trim($txtHoles) === "") {
        return [];
    }

    // Get course handicap payload (same decision as Wix)
    if ($parmMode === "Player") {
        $courseCHData = be_getCourseHandicap("Player", $parmValue, $txtCourseID, $parmToken);
    } else {
        $courseCHData = be_getCourseHandicap("Index", $parmValue, $txtCourseID, $parmToken);
    }

    $teeSets = $courseCHData["tee_sets"] ?? null;
    if (!is_array($teeSets)) return [];

    $tagsArray = [];

    foreach ($teeSets as $teeSet) {
        if (!is_array($teeSet)) continue;
        if (($teeSet["gender"] ?? null) !== $parmGender) continue;

        $ratings = $teeSet["ratings"] ?? [];
        if (!is_array($ratings)) $ratings = [];

        foreach ($ratings as $rating) {
            if (!is_array($rating)) continue;
            if (($rating["tee_set_side"] ?? null) !== $txtHoles) continue;

            // yards calc (sum holes[].Length)
            $totalLength = 0;
            $holes = $teeSet["holes"] ?? [];
            if (is_array($holes)) {
                foreach ($holes as $h) {
                    if (!is_array($h)) continue;
                    $totalLength += (int)($h["Length"] ?? 0);
                }
            }

            $formattedYards = number_format($totalLength);

            $teeSetName = (string)($teeSet["name"] ?? "");
            $teeSetId   = (int)($teeSet["tee_set_id"] ?? 0);

            $chDisplay  = (string)($rating["course_handicap_display"] ?? "");
            $slope      = (string)($rating["slope_rating"] ?? "");
            $courseRating = $rating["course_rating"] ?? "";

            $label = "{$teeSetName} | CH:{$chDisplay} | {$formattedYards} yds";
            $value = (string)$teeSetId;

            $tagsArray[] = [
                // legacy/UI
                "label" => $label,
                "value" => $value,

                // identifiers
                "teeSetID" => $teeSetId,
                "teeSetName" => $teeSetName,
                "holes_number" => $teeSet["holes_number"] ?? null,
                "gender" => $teeSet["gender"] ?? null,

                // handicap data
                "playerCH" => $chDisplay,
                "teeSetSlope" => $slope,

                // structured values
                "teeSetYards" => $totalLength,
                "teeSetRating" => $courseRating,

                // raw GHIN payloads (unchanged)
                "ratings" => $ratings,
                "jsonSetRating" => $rating,
            ];
        }
    }

    // Highest slope first
    usort($tagsArray, function ($a, $b) {
        $sa = (int)($a["teeSetSlope"] ?? 0);
        $sb = (int)($b["teeSetSlope"] ?? 0);
        return $sb <=> $sa;
    });

    return $tagsArray;
}

/**
 * PHP refactor of Wix (deprecated in your code):
 * export function be_getCoursePHSO(parmGolfers, parmToken)
 *
 * NOTE: Your newer logic uses handicap_index input and reads manual_golfer_# from response.
 * This function just returns GHIN response (raw).
 */
function be_getCoursePHSO(array $parmGolfers, string $parmToken): array
{
    $myToken = trim((string)$parmToken);
    if ($myToken === "") {
        throw new RuntimeException("be_getCoursePHSO: missing token");
    }

    $GHINurl = "https://api.ghin.com/api/v1/playing_handicaps.json";
    $requestBody = ["golfers" => $parmGolfers];

    return HttpClient::postJson($GHINurl, $requestBody, [
        "accept: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}

/**
 * Helpers (ported 1:1 intent from Wix)
 */
function toYMD($d): ?string
{
    if ($d === null || $d === "") return null;

    // If already YYYY-MM-DD, keep it
    if (is_string($d)) {
        $s = trim($d);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return $s;
    }

    $ts = is_int($d) ? $d : strtotime((string)$d);
    if ($ts === false) return null;

    // Use server local date parts (similar to Wix local behavior)
    return date("Y-m-d", $ts);
}

function normalizeGhinNumberArray($parmGolfers): array
{
    if ($parmGolfers === null) return [];

    $arr = is_array($parmGolfers) ? $parmGolfers : [$parmGolfers];

    $out = [];
    $seen = [];

    foreach ($arr as $g) {
        $v = "";

        if (is_string($g) || is_int($g) || is_float($g)) {
            $v = trim((string)$g);
        } elseif (is_array($g)) {
            $v = trim((string)($g["ghin"] ?? $g["GHINNumber"] ?? $g["ghinNumber"] ?? $g["dbPlayers_PlayerGHIN"] ?? ""));
        } elseif (is_object($g)) {
            $v = trim((string)($g->ghin ?? $g->GHINNumber ?? $g->ghinNumber ?? $g->dbPlayers_PlayerGHIN ?? ""));
        }

        if ($v === "") continue;
        if (!preg_match('/^\d+$/', $v)) continue;
        if (isset($seen[$v])) continue;

        $seen[$v] = true;
        $out[] = $v;
    }

    return $out;
}
