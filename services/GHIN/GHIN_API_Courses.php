<?php
// /public_html/services/GHIN_API_Courses.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
$config = ma_config();
require_once MA_API_LIB . "/HttpClient.php";

/**
 * PHP refactor of Wix:
 * export function be_getFacilities(parmFacility, parmState, parmToken = null)
 *
 * Notes:
 * - state is optional; when provided, Wix used "&state=US-<STATE>"
 * - URL params should be URL-encoded
 */
function be_getFacilities(string $parmFacility, ?string $parmState, ?string $parmToken = null): array
{
    $myToken = (string)($parmToken ?? "");
    if ($myToken === "") {
        throw new RuntimeException("be_getFacilities: missing parmToken");
    }

    $name = trim($parmFacility);
    if ($name === "") {
        // Wix would still call GHIN; but empty name usually yields noisy results.
        // Keep strict: caller must provide something.
        throw new RuntimeException("be_getFacilities: missing parmFacility");
    }

    $txtState = "";
    $st = trim((string)($parmState ?? ""));
    if ($st !== "") {
        // Wix: &state=US-FL
        $txtState = "&state=" . rawurlencode("US-" . $st);
    }

    $GHINurl =
        "https://api.ghin.com/api/v1/facilities/search.json" .
        "?name=" . rawurlencode($name) .
        "&country=USA" .
        $txtState .
        "&course_status=Active" .
        "&facility_status=Active";

    return HttpClient::getJson($GHINurl, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}

/**
 * PHP refactor of Wix:
 * export function be_getClubFacility(parmClub, parmToken = null)
 */
function be_getClubFacility(string $parmClub, ?string $parmToken = null): array
{
    $myToken = (string)($parmToken ?? "");
    if ($myToken === "") {
        throw new RuntimeException("be_getClubFacility: missing parmToken");
    }

    $club = trim($parmClub);
    if ($club === "") {
        throw new RuntimeException("be_getClubFacility: missing parmClub");
    }

    $GHINurl =
        "https://api.ghin.com/api/v1/clubs/" . rawurlencode($club) . "/facility_home_courses.json";

    return HttpClient::getJson($GHINurl, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}

/**
 * PHP refactor of Wix:
 * export function be_getCourseTeeSets(parmCourseID, parmToken = null)
 *
 * Wix hard-coded number_of_holes=18 and tee_set_status=Active
 */
function be_getCourseTeeSets(string $parmCourseID, ?string $parmToken = null): array
{
    $myToken = (string)($parmToken ?? "");
    if ($myToken === "") {
        throw new RuntimeException("be_getCourseTeeSets: missing parmToken");
    }

    $courseId = trim($parmCourseID);
    if ($courseId === "") {
        throw new RuntimeException("be_getCourseTeeSets: missing parmCourseID");
    }

    $GHINurl =
        "https://api.ghin.com/api/v1/courses/" . rawurlencode($courseId) .
        "/tee_set_ratings.json?number_of_holes=18&tee_set_status=Active";

    return HttpClient::getJson($GHINurl, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}

/**
 * PHP refactor of Wix:
 * export function be_getTeeSetByID(parmTeeSetID, parmToken = null)
 *
 * (Wix notes: seemingly not used; keep for signature parity)
 */
function be_getTeeSetByID(string $parmTeeSetID, ?string $parmToken = null): array
{
    $myToken = (string)($parmToken ?? "");
    if ($myToken === "") {
        throw new RuntimeException("be_getTeeSetByID: missing parmToken");
    }

    $teeSetId = trim($parmTeeSetID);
    if ($teeSetId === "") {
        throw new RuntimeException("be_getTeeSetByID: missing parmTeeSetID");
    }

    // Wix used include_altered_tees=false
    $GHINurl =
        "https://api.ghin.com/api/v1/TeeSetRatings/" . rawurlencode($teeSetId) .
        ".json?include_altered_tees=false";

    return HttpClient::getJson($GHINurl, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}

/**
 * Flattens raw GHIN TeeSets response into a simplified array of hole pars.
 * Ported from Wix Velo flattenCoursePars(raw).
 */
function flattenCoursePars(array $raw): array
{
    $teeSets = $raw['TeeSets'] ?? [];
    if (!is_array($teeSets) || empty($teeSets)) {
        return [];
    }

    // Filter by gender
    $maleSets = array_filter($teeSets, fn($ts) => strtolower((string)($ts['Gender'] ?? '')) === 'male');
    $femaleSets = array_filter($teeSets, fn($ts) => strtolower((string)($ts['Gender'] ?? '')) === 'female');

    // Helper to find preferred set (18 holes, else > 0 holes)
    $findPreferred = function (array $sets) {
        foreach ($sets as $ts) {
            $holes = $ts['Holes'] ?? [];
            if (is_array($holes) && count($holes) >= 18) return $ts;
        }
        foreach ($sets as $ts) {
            $holes = $ts['Holes'] ?? [];
            if (is_array($holes) && count($holes) > 0) return $ts;
        }
        return null;
    };

    $malePreferred = $findPreferred($maleSets);
    $femalePreferred = $findPreferred($femaleSets);

    $maleHoles = $malePreferred['Holes'] ?? [];
    $femaleHoles = $femalePreferred['Holes'] ?? [];

    // Build maps: holeNum -> par
    $mMap = [];
    foreach ($maleHoles as $h) {
        $num = (int)($h['Number'] ?? 0);
        $par = (int)($h['Par'] ?? 0);
        if ($num > 0 && $par > 0) $mMap[$num] = $par;
    }

    $fMap = [];
    foreach ($femaleHoles as $h) {
        $num = (int)($h['Number'] ?? 0);
        $par = (int)($h['Par'] ?? 0);
        if ($num > 0 && $par > 0) $fMap[$num] = $par;
    }

    // Union of holes
    $allHoles = array_unique(array_merge(array_keys($mMap), array_keys($fMap)));
    sort($allHoles);

    $result = [];
    foreach ($allHoles as $holeNum) {
        $parM = $mMap[$holeNum] ?? null;
        $parF = $fMap[$holeNum] ?? null;

        $parText = "Par ?";
        if ($parM !== null && $parF !== null) {
            $parText = ($parM === $parF) ? "Par $parM" : "Par $parM/$parF";
        } elseif ($parM !== null) {
            $parText = "Par $parM";
        } elseif ($parF !== null) {
            $parText = "Par $parF";
        }

        $par = $parM ?? $parF;

        $result[] = [
            "hole" => $holeNum,
            "par" => $par,
            "parM" => $parM,
            "parF" => $parF,
            "parText" => $parText
        ];
    }

    return $result;
}
