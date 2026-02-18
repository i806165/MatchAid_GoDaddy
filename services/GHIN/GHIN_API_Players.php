<?php
// /public_html/services/GHIN/GHIN_API_Players.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/HttpClient.php";

/**
 * PHP refactor of Wix:
 * export async function be_getPlayersByID(parmGHIN, parmToken = null)
 *
 * - parmGHIN can be a single GHIN or a comma-separated list.
 * - Returns: { golfers: [...] } sorted so is_home_club:true comes first.
 * - On errors: returns { golfers: [] } (same resilience as Wix).
 */
function be_getPlayersByID(string $parmGHIN, ?string $parmToken = null): array
{
    $myToken = (string)($parmToken ?? "");
    $parmGHIN = trim($parmGHIN);

    if ($parmGHIN === "" || $myToken === "") {
        return ["golfers" => []];
    }

    // Wix replaced commas with %2C (URL-safe list)
    $strGHINList = (strpos($parmGHIN, ",") !== false)
        ? str_replace(",", "%2C", $parmGHIN)
        : $parmGHIN;

    $GHINurl =
        "https://api.ghin.com/api/v1/golfers/search.json" .
        "?per_page=100" .
        "&page=1" .
        "&golfer_id={$strGHINList}" .
        "&sorting_criteria=last_name_first_name" .
        "&order=ASC";

    try {
        $jsonData = HttpClient::getJson($GHINurl, [
            "accept: application/json",
            "Content-Type: application/json",
            "Authorization: Bearer " . $myToken,
        ]);

        $golfers = $jsonData["golfers"] ?? [];
        if (!is_array($golfers)) $golfers = [];

        // Sort so is_home_club:true comes first (Wix logic)
        usort($golfers, function ($a, $b) {
            $aHome = !empty($a["is_home_club"]) ? 1 : 0;
            $bHome = !empty($b["is_home_club"]) ? 1 : 0;

            if ($aHome === $bHome) return 0;
            return ($aHome > $bHome) ? -1 : 1; // home club first
        });

        return ["golfers" => $golfers];

    } catch (Throwable $e) {
        // Mirror Wix: swallow error and return empty list
        return ["golfers" => []];
    }
}

/**
 * PHP refactor of Wix:
 * export async function be_getPlayersByName(parmRecCnt, parmPageNum, parmState, parmLName, parmFName, parmUserClubID, parmToken = null)
 *
 * - Builds URL with last_name prefix match (adds %25 = '%')
 * - Optional first_name prefix match
 * - Dedupes by GHIN, preferring:
 *    1) membership for parmUserClubID
 *    2) is_home_club === true
 *    3) deterministic fallback (first row)
 * - Returns same shape as Wix: { ...jsonData, golfers: preferred }
 * - Throws on HTTP errors (like Wix threw), because this function was not swallowing errors.
 */
function be_getPlayersByName(
    int $parmRecCnt,
    int $parmPageNum,
    string $parmState,
    string $parmLName,
    ?string $parmFName,
    $parmUserClubID,
    ?string $parmToken = null
): array {
    $myToken = (string)($parmToken ?? "");
    if ($myToken === "") {
        throw new RuntimeException("be_getPlayersByName: missing parmToken");
    }

    $parmState = trim($parmState);
    $parmLName = trim($parmLName);
    $first = trim((string)($parmFName ?? ""));

    // mirrors your Wix URL building exactly
    $GHINurl =
        "https://api.ghin.com/api/v1/golfers/search.json" .
        "?per_page=" . (int)$parmRecCnt .
        "&page=" . (int)$parmPageNum .
        "&last_name=" . rawurlencode($parmLName) . "%25" .
        "&state=" . rawurlencode($parmState) .
        "&global_search=true" .
        "&sorting_criteria=last_name_first_name" .
        "&order=ASC&status=Active";

    if ($first !== "") {
        $GHINurl .= "&first_name=" . rawurlencode($first) . "%25";
    }

    $jsonData = HttpClient::getJson($GHINurl, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);

    $golfers = $jsonData["golfers"] ?? [];
    if (!is_array($golfers)) $golfers = [];

    // ---- De-dupe memberships by GHIN ----
    $userClubIdStr = trim((string)($parmUserClubID ?? ""));
    $byGHIN = [];

    foreach ($golfers as $g) {
        if (!is_array($g)) continue;
        $key = trim((string)($g["ghin"] ?? ($g["golfer_id"] ?? "")));
        if ($key === "") continue;
        if (!isset($byGHIN[$key])) $byGHIN[$key] = [];
        $byGHIN[$key][] = $g;
    }

    $preferred = [];

    foreach ($byGHIN as $rows) {
        $pick = null;

        // 1) Prefer membership for user's club
        if ($userClubIdStr !== "") {
            foreach ($rows as $r) {
                $clubId = (string)($r["club_id"] ?? "");
                if ($clubId === $userClubIdStr) {
                    $pick = $r;
                    break;
                }
            }
        }

        // 2) Else GHIN home club
        if ($pick === null) {
            foreach ($rows as $r) {
                if (!empty($r["is_home_club"])) {
                    $pick = $r;
                    break;
                }
            }
        }

        // 3) Else deterministic fallback
        if ($pick === null && count($rows) > 0) {
            $pick = $rows[0];
        }

        if ($pick !== null) $preferred[] = $pick;
    }

    // Keep ordering stable for UI: last_name then first_name
    usort($preferred, function ($a, $b) {
        $aL = strtolower((string)($a["last_name"] ?? ""));
        $bL = strtolower((string)($b["last_name"] ?? ""));
        if ($aL !== $bL) return $aL <=> $bL;

        $aF = strtolower((string)($a["first_name"] ?? ""));
        $bF = strtolower((string)($b["first_name"] ?? ""));
        return $aF <=> $bF;
    });

    // Return SAME SHAPE as Wix: spread jsonData, override golfers with deduped list
    $jsonData["golfers"] = $preferred;
    return $jsonData;
}

/**
 * Global search (no state required) using api2.ghin.com endpoint.
 * Returns raw payload (structure differs from standard search).
 */
function be_getPlayersGlobal(string $lastName, ?string $firstName, ?string $state, string $token): array
{
    $myToken = trim($token);
    if ($myToken === "") {
        throw new RuntimeException("be_getPlayersGlobal: missing token");
    }

    $last = trim($lastName);
    $first = trim((string)($firstName ?? ""));

    if ($last === "") {
        return [];
    }

    $url = "https://api2.ghin.com/api/v1/golfers.json" .
           "?status=Active" .
           "&from_ghin=true" .
           "&per_page=100" .
           "&sorting_criteria=full_name" .
           "&order=asc" .
           "&page=1" .
           "&country=USA" .
           "&source=GHINcom" .
           "&last_name=" . rawurlencode($last);

    if ($first !== "") {
        $url .= "&first_name=" . rawurlencode($first);
    }

    if ($state !== null && $state !== "") {
        $url .= "&state=" . rawurlencode($state);
    }

    return HttpClient::getJson($url, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}

/**
 * PHP placeholder for deprecated Wix function.
 * Wix: export async function be_getPlayers()
 * DO NOT USE.
 */
function be_getPlayers(
    int $parmRecCnt,
    int $parmPageNum,
    string $parmState,
    string $parmLName,
    string $parmFName,
    ?string $parmToken = null
) {
    // DO NOT USE — keep for signature parity only
    return null;
}
