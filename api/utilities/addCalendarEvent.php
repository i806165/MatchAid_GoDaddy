<?php
//   /public_html/api/utilities/addCalendarEvent.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";

/**
 * GET params:
 *  id, title, location, start, end, description
 * start/end: ISO strings (preferred) e.g. 2026-01-27T13:00:00.000Z
 */

function ics_escape(string $s): string {
    $s = str_replace("\\", "\\\\", $s);
    $s = str_replace("\r\n", "\n", $s);
    $s = str_replace("\r", "\n", $s);
    $s = str_replace("\n", "\\n", $s);
    $s = str_replace(",", "\\,", $s);
    $s = str_replace(";", "\\;", $s);
    return $s;
}

function to_ics_utc(string $iso): string {
    $dt = new DateTime($iso);
    $dt->setTimezone(new DateTimeZone("UTC"));
    return $dt->format("Ymd\\THis\\Z");
}

$id   = trim((string)($_GET["id"] ?? ""));
$title = (string)($_GET["title"] ?? "MatchAid Event");
$location = (string)($_GET["location"] ?? "");
$start = (string)($_GET["start"] ?? "");
$end   = (string)($_GET["end"] ?? "");
$desc  = (string)($_GET["description"] ?? "");

if ($start === "" || $end === "") {
    http_response_code(400);
    header("Content-Type: text/plain; charset=utf-8");
    echo "Missing start or end";
    exit;
}

$uid = ($id !== "" ? $id : bin2hex(random_bytes(8))) . "@matchaid";
$dtstart = to_ics_utc($start);
$dtend   = to_ics_utc($end);
$dtstamp = (new DateTime("now", new DateTimeZone("UTC")))->format("Ymd\\THis\\Z");

$ics =
"BEGIN:VCALENDAR\r\n" .
"VERSION:2.0\r\n" .
"PRODID:-//MatchAid//EN\r\n" .
"CALSCALE:GREGORIAN\r\n" .
"METHOD:PUBLISH\r\n" .
"BEGIN:VEVENT\r\n" .
"UID:" . ics_escape($uid) . "\r\n" .
"DTSTAMP:" . $dtstamp . "\r\n" .
"DTSTART:" . $dtstart . "\r\n" .
"DTEND:" . $dtend . "\r\n" .
"SUMMARY:" . ics_escape($title) . "\r\n" .
($location !== "" ? "LOCATION:" . ics_escape($location) . "\r\n" : "") .
($desc !== "" ? "DESCRIPTION:" . ics_escape($desc) . "\r\n" : "") .
"END:VEVENT\r\n" .
"END:VCALENDAR\r\n";

$filename = "MatchAid-" . preg_replace("/[^A-Za-z0-9_-]+/", "-", ($id !== "" ? $id : "event")) . ".ics";

header("Content-Type: text/calendar; charset=utf-8");
header("Content-Disposition: attachment; filename=\"$filename\"");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
echo $ics;
exit;
