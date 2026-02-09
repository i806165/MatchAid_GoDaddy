<?php
declare(strict_types=1);

// /public_html/api/GHIN/searchCourses.php

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";

$auth = ma_api_require_auth();
$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : [];

$q = trim((string)($payload["q"] ?? ""));
$state = trim((string)($payload["state"] ?? ""));

if ($q === "") {
  ma_respond(400, ["ok" => false, "error" => "Missing search string."]);
  exit;
}

try {
  $raw = be_getFacilities($q, ($state !== "" ? $state : null), $auth["adminToken"]);

  // GHIN search returns a top-level array of facilities
  $facilities = (is_array($raw) ? $raw : []);
  if (function_exists('array_is_list') && !array_is_list($facilities)) {
    $facilities = $facilities["facilities"] ?? [];
  }
  if (!is_array($facilities)) $facilities = [];

  // Flatten to UI rows (same as Wix normalization)
  $rows = [];
  foreach ($facilities as $f) {
    if (!is_array($f)) continue;

    $facCity  = (string)($f["City"] ?? "");
    $facState = (string)($f["State"] ?? "");
    $courses  = (is_array($f["Courses"] ?? null) ? $f["Courses"] : []);

    foreach ($courses as $c) {
      if (!is_array($c)) continue;
      $rows[] = [
        "facilityId"   => (string)($f["FacilityId"] ?? ""),
        "facilityName" => (string)($f["FacilityName"] ?? ""),
        "courseId"     => (string)($c["CourseId"] ?? ""),
        "courseName"   => (string)($c["CourseName"] ?? ""),
        "city"         => $facCity,
        "state"        => $facState,
      ];
    }
  }

  ma_respond(200, ["ok" => true, "rows" => $rows, "raw" => $raw]);

} catch (Throwable $e) {
  ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}
