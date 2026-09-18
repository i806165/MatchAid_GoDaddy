<?php
// /public_html/api/game_import/initImport.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbFavAdmins.php";

header("Content-Type: application/json; charset=utf-8");

try {
  $uc = ServiceUserContext::getUserContext();
  if (!$uc || empty($uc["ok"])) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "AUTH_REQUIRED"]);
    exit;
  }

  $userGhin = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
  $userName = trim((string)($_SESSION["SessionUserName"] ?? ""));
  if ($userGhin === "") {
    // ContextUser should set it, but guard anyway
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "AUTH_REQUIRED"]);
    exit;
  }
$favs = ServiceDbFavAdmins::getFavoriteAdmins(["userGHIN" => $userGhin]);

$adminOptions = [];

// Self always first
$adminOptions[] = [
  "ghin" => $userGhin,
  "name" => ($userName !== "" ? $userName : $userGhin),
  "assocId" => strval($_SESSION["SessionAdminAssocID"] ?? ""),
  "assocName" => strval($_SESSION["SessionAdminAssocName"] ?? "")
];

// Favorites after
foreach ($favs as $a) {
  $adminOptions[] = [
    "ghin" => strval($a["key"]),
    "name" => strval($a["name"]),
    "assocId" => strval($a["assocId"]),
    "assocName" => strval($a["assocName"])
  ];
}

// De-dupe by ghin (keeps FIRST occurrence, so self stays first)
$seen = [];
$adminOptions = array_values(array_filter($adminOptions, function($a) use (&$seen) {
  $g = strval($a["ghin"]);
  if ($g === "" || isset($seen[$g])) return false;
  $seen[$g] = true;
  return true;
}));



  $activeClubId = trim((string)($_SESSION["SessionClubID"] ?? ""));
  $adminToken = trim((string)($_SESSION["SessionAdminToken"] ?? ""));
  $facility = ServiceUserContext::resolveClubFacility($activeClubId, $adminToken);
  $courseMap = buildCourseMapFromFacility($facility);

  echo json_encode([
    "ok" => true,
    "adminOptions" => $adminOptions,
    "courseMap" => $courseMap,
    "defaults" => [
      "teeTimeInterval" => 9,
      "holes" => "All 18",
      "privacy" => "Club",
      "hcEffectivity" => "PlayDate"
    ]
  ], JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
  Logger::error("IMPORT_INIT_FAIL", ["err" => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "INIT_FAILED"]);
  exit;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
function buildCourseMapFromFacility(array $facility): array
{
  $map = [];
  $facilityId = (string)($facility["facilityId"] ?? "");
  $facilityName = (string)($facility["facilityName"] ?? "");
  $courses = $facility["courses"] ?? [];
  if (!is_array($courses)) return [];

  foreach ($courses as $c) {
      if (!is_array($c)) continue;
      $courseId = (string)($c["course_id"] ?? $c["CourseId"] ?? $c["CourseID"] ?? "");
      $courseName = (string)($c["name"] ?? $c["CourseName"] ?? "");

      if ($courseId === "" || trim($courseName) === "") continue;

      $key = strtolower(trim($courseName));
      $map[$key] = [
        "facilityId" => $facilityId,
        "facilityName" => $facilityName,
        "courseId" => $courseId,
        "courseName" => $courseName
      ];
  }

  return $map;
}
