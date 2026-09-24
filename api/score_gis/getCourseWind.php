<?php
declare(strict_types=1);

// /public_html/api/score_gis/getCourseWind.php
// Returns current wind (and other station conditions) for a course, via
// ServiceWind. Polled periodically by the GIS page — course location is
// derived server-side from stored OSM data, the client only ever sends
// courseId.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/weather/service_Wind.php";

header("Content-Type: application/json; charset=utf-8");

function gis_wind_json_response(array $payload, int $status = 200): never
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
        gis_wind_json_response([
            "ok" => false,
            "message" => "Authentication required."
        ], 401);
    }

    // Same envelope acceptance as getCourseOSM.php: MatchAid's postJson
    // wrapper, a bare JSON body, or GET for manual testing.
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
        gis_wind_json_response([
            "ok" => false,
            "message" => "CourseID is required."
        ], 400);
    }

    $result = ServiceWind::getCurrentConditions($courseId);
    gis_wind_json_response($result, $result["ok"] ? 200 : 404);

} catch (Throwable $e) {
    Logger::error("COURSE_WIND_API_FAIL", [
        "err" => $e->getMessage()
    ]);

    gis_wind_json_response([
        "ok" => false,
        "message" => "Unable to load current conditions."
    ], 500);
}
