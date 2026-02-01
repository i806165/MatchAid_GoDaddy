<?php
// /public_html/services/GHIN/GHIN_API_Users.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
$config = ma_config();
require_once MA_API_LIB . "/HttpClient.php";

/**
 * PHP refactor of Wix:
 * export function be_getRecentCourses(parmGHIN, parmToken = null)
 *
 * Same parameters; returns decoded JSON array.
 */
function be_getRecentCourses(string $parmGHIN, ?string $parmToken = null): array
{
    $parmGHIN = trim($parmGHIN);
    $myToken = (string)($parmToken ?? "");

    if ($parmGHIN === "") {
        throw new RuntimeException("be_getRecentCourses: missing parmGHIN");
    }
    if ($myToken === "") {
        throw new RuntimeException("be_getRecentCourses: missing parmToken");
    }

    // Matches Wix URL exactly
    $GHINurl =
        "https://api.ghin.com/api/v1/golfers/" . rawurlencode($parmGHIN) .
        "/golfer_most_recent_courses.json?scores_to_use=50&include_altered_tees=false";

    return HttpClient::getJson($GHINurl, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}

/**
 * PHP refactor of Wix:
 * export function be_getUserFacility(parmGHIN, parmToken = null)
 *
 * Same parameters; returns decoded JSON array.
 */
function be_getUserFacility(string $parmGHIN, ?string $parmToken = null): array
{
    $parmGHIN = trim($parmGHIN);
    $myToken = (string)($parmToken ?? "");

    if ($parmGHIN === "") {
        throw new RuntimeException("be_getUserFacility: missing parmGHIN");
    }
    if ($myToken === "") {
        throw new RuntimeException("be_getUserFacility: missing parmToken");
    }

    // Matches Wix URL exactly
    $GHINurl =
        "https://api.ghin.com/api/v1/golfers/" . rawurlencode($parmGHIN) .
        "/facility_home_courses.json";

    return HttpClient::getJson($GHINurl, [
        "accept: application/json",
        "Content-Type: application/json",
        "Authorization: Bearer " . $myToken,
    ]);
}
