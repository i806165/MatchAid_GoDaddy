<?php
declare(strict_types=1);

// /public_html/api/score_gis/getCourseOSM.php
// Returns cached course OSM data to the standalone GIS page.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/database/service_dbCourseOSM.php";

header("Content-Type: application/json; charset=utf-8");

function gis_json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode(
        $payload,
        JSON_UNESCAPED_SLASHES |
        JSON_UNESCAPED_UNICODE |
        JSON_INVALID_UTF8_SUBSTITUTE
    );
    exit;
}

try {
    $ctx = ServiceUserContext::getUserContext();
    if (!$ctx || empty($ctx["ok"])) {
        gis_json_response([
            "ok" => false,
            "message" => "Authentication required."
        ], 401);
    }

    // Accept either the MatchAid postJson envelope { payload:{courseId:...} }
    // or a simple JSON body { courseId:... }. GET is also accepted for manual testing.
    $body = file_get_contents("php://input");
    $decoded = [];
    if (is_string($body) && trim($body) !== "") {
        $tmp = json_decode($body, true);
        if (is_array($tmp)) $decoded = $tmp;
    }

    $requestPayload = [];
    if (isset($decoded["payload"]) && is_array($decoded["payload"])) {
        $requestPayload = $decoded["payload"];
    } elseif ($decoded) {
        $requestPayload = $decoded;
    }

    $courseId = trim((string)(
        $requestPayload["courseId"]
        ?? $_GET["courseId"]
        ?? ""
    ));

    if ($courseId === "") {
        gis_json_response([
            "ok" => false,
            "message" => "CourseID is required."
        ], 400);
    }

    $row = ServiceDbCourseOSM::getByCourseId($courseId);
    if (!$row) {
        gis_json_response([
            "ok" => false,
            "message" => "No OSM data is stored for CourseID {$courseId}."
        ], 404);
    }

    $raw = (string)($row["dbCourseOSM_Data"] ?? "");
    $osmData = json_decode($raw, true);

    if (!is_array($osmData) || json_last_error() !== JSON_ERROR_NONE) {
        Logger::error("COURSE_OSM_INVALID_JSON", [
            "courseId" => $courseId,
            "jsonError" => json_last_error_msg()
        ]);

        gis_json_response([
            "ok" => false,
            "message" => "Stored OSM data is not valid JSON."
        ], 500);
    }

    gis_json_response([
        "ok" => true,
        "course" => [
            "courseId" => (string)$row["dbCourseOSM_CourseID"],
            "facilityName" => (string)($row["dbCourseOSM_FacilityName"] ?? ""),
            "courseName" => (string)($row["dbCourseOSM_CourseName"] ?? ""),
            "fetchedAt" => (string)($row["dbCourseOSM_FetchedAt"] ?? ""),
            "jsonBytes" => strlen($raw)
        ],
        "osmData" => $osmData
    ]);

} catch (Throwable $e) {
    Logger::error("COURSE_OSM_API_FAIL", [
        "err" => $e->getMessage()
    ]);

    gis_json_response([
        "ok" => false,
        "message" => "Unable to load course OSM data."
    ], 500);
}
