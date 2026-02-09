<?php
// /public_html/api/import_games/initImport.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

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

  $config = ma_config();
  $pdo = Db::pdo($config["db"]);

  $userGhin = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
  $userName = trim((string)($_SESSION["SessionUserName"] ?? ""));
  if ($userGhin === "") {
    // ContextUser should set it, but guard anyway
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "AUTH_REQUIRED"]);
    exit;
  }
$favs = ServiceDbFavAdmins::getFavoriteAdmins($pdo, ["userGHIN" => $userGhin]);

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



  // --- Load user profile JSON (db_Users.dbUser_Profile) ---
  $profileJson = null;
  $stmt = $pdo->prepare("SELECT dbUser_Profile FROM db_Users WHERE dbUser_GHIN = :u LIMIT 1");
  $stmt->execute([":u" => $userGhin]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if ($row && !empty($row["dbUser_Profile"])) {
    $profileJson = json_decode((string)$row["dbUser_Profile"], true);
  }

  // Build courseMap: lowercase courseName -> {facilityId, facilityName, courseId, courseName}
  $courseMap = buildCourseMapFromProfile($profileJson);

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
function buildCourseMapFromProfile($profile): array
{
  if (!is_array($profile)) return [];

  // Flexible: accept facilityJson.facilities OR profileJson.facilityJson.facilities patterns
  $facilities =
    $profile["facilityJson"]["facilities"] ??   // common
    $profile["profileJson"]["facilityJson"]["facilities"] ?? // legacy variant
    $profile["facilities"] ?? null;

  if (!is_array($facilities)) return [];

  $map = [];

  foreach ($facilities as $f) {
    if (!is_array($f)) continue;

    $facilityId = (string)($f["facility_id"] ?? $f["FacilityId"] ?? $f["FacilityID"] ?? "");
    $facilityName = (string)($f["name"] ?? $f["FacilityName"] ?? "");

    $homeCourses = $f["home_courses"] ?? $f["HomeCourses"] ?? [];
    if (!is_array($homeCourses)) continue;

    foreach ($homeCourses as $c) {
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
  }

  return $map;
}
