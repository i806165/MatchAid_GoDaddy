<?php
// /public_html/api/GHIN/getCourseData.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";
require_once MA_API_LIB . "/Logger.php";

$auth = ma_api_require_auth(); // Ensures login & gets tokens
$in = ma_json_in();
$payload = is_array($in["payload"] ?? null) ? $in["payload"] : [];

$courseId = trim((string)($payload["courseId"] ?? ""));

if ($courseId === "") {
    ma_respond(400, ["ok" => false, "error" => "Missing courseId"]);
}

// Prefer Admin token, fallback to User token
$token = $auth["adminToken"] ?: $auth["userToken"];

try {
    // 1. Fetch raw tee sets from GHIN
    $raw = be_getCourseTeeSets($courseId, $token);

    // 2. Flatten logic (from service)
    $flattenedPars = flattenCoursePars($raw);

    ma_respond(200, [
        "ok" => true,
        "payload" => [
            "raw" => $raw,
            "pars" => $flattenedPars
        ]
    ]);
} catch (Throwable $e) {
    Logger::error("API_GET_COURSE_DATA_FAIL", ["err" => $e->getMessage(), "cid" => $courseId]);
    ma_respond(500, ["ok" => false, "error" => $e->getMessage()]);
}