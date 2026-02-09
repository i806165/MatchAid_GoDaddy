<?php
declare(strict_types=1);

// /public_html/api/GHIN/getRecentCourses.php

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Users.php";

$auth = ma_api_require_auth();

try {
  $ghin = $auth["ghinId"];
  $token = $auth["adminToken"];

  $raw = be_getRecentCourses($ghin, $token);

  // Normalize to a simple list for UI
  $courses = [];
  if (is_array($raw) && isset($raw["courses"]) && is_array($raw["courses"])) {
    $courses = $raw["courses"];
  } elseif (is_array($raw)) {
    // Fallback: if some wrapper returns a plain list already
    $courses = $raw;
  }

  $rows = [];
  foreach ($courses as $c) {
    if (!is_array($c)) continue;
    $rows[] = [
      "facilityId"   => (string)($c["FacilityId"] ?? ""),
      "facilityName" => (string)($c["FacilityName"] ?? ""),
      "courseId"     => (string)($c["CourseId"] ?? ""),
      "courseName"   => (string)($c["CourseName"] ?? ""),
      "city"         => "",
      "state"        => "",
    ];
  }

  ma_respond(200, [
    "ok" => true,
    "rows" => $rows,
    "raw" => $raw
  ]);
  
} catch (Throwable $e) {
  ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}
