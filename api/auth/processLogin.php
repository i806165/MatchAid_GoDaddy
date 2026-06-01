<?php
declare(strict_types=1);

// /public_html/api/auth/processLogin.php

ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . "/../../bootstrap.php";
header("Content-Type: application/json");

$config = ma_config();
require_once MA_SERVICES . "/context/service_Login.php";

function json_in(): array {
    $raw = file_get_contents("php://input");
    $data = json_decode($raw ?: "{}", true);
    return is_array($data) ? $data : [];
}

function respond(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

$in     = json_in();
$userId = trim((string)($in["userId"] ?? ""));
$pass   = (string)($in["password"] ?? "");

if ($userId === "" || $pass === "") {
    respond(400, ["ok" => false, "message" => "Please enter Golf Network ID and Password."]);
}

try {
    $result = ServiceLogin::processLogin($userId, $pass, $config);

    // Successful login — add nextUrl for JS router fallback
    if (!empty($result["ok"])) {
        $result["nextUrl"] = MA_ROUTE_HOME;
        respond(200, $result);
    }

    // Club not enrolled — redirect to marketing page, passing club ID for display
    if (($result["errCode"] ?? "") === "CLUB_NOT_ENROLLED") {
        $clubId = urlencode((string)($result["clubId"] ?? ""));

        Logger::info("LOGIN_CLUB_NOT_ENROLLED", [
                "userId"    => $userId,
                "ghinId"    => $result["ghinId"]    ?? "",
                "userName"  => $result["userName"]  ?? "",
                "firstName" => $result["firstName"] ?? "",
                "lastName"  => $result["lastName"]  ?? "",
                "clubId"    => $result["clubId"]    ?? "",
                "clubName"  => $result["clubName"]  ?? "",
        ]);

        respond(200, [
            "ok"      => false,
            "nextUrl" => MA_ROUTE_CLUB_MARKETING . ($clubId !== "" ? "?clubId={$clubId}" : ""),
        ]);
    }

    // All other failures — return error message for login.js to display
    respond(200, $result);

} catch (Throwable $e) {
    error_log("[processLogin.php] UNEXPECTED_ERROR: " . $e->getMessage() . " Trace: " . $e->getTraceAsString());
    respond(500, ["ok" => false, "message" => "An unexpected server error occurred during login."]);
}