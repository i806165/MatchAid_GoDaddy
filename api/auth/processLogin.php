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
    respond(400, ["ok" => false, "message" => "Please enter Email/GHIN and Password."]);
}

try {
    $result = ServiceLogin::processLogin($userId, $pass, $config);

    if (!empty($result["ok"])) {
        // Successful login — add nextUrl for JS router fallback
        $result["nextUrl"] = MA_ROUTE_HOME;
        respond(200, $result);
    }

    // Club not authorized — redirect to marketing page instead of showing an error
    if (($result["errCode"] ?? "") === "101") {
        respond(200, [
            "ok"      => false,
            "nextUrl" => MA_ROUTE_CLUB_MARKETING,
        ]);
    }

    // All other failures — return error message for login.js to display
    respond(401, $result);

} catch (Throwable $e) {
    error_log("[processLogin.php] UNEXPECTED_ERROR: " . $e->getMessage() . " Trace: " . $e->getTraceAsString());
    respond(500, ["ok" => false, "message" => "An unexpected server error occurred during login."]);
}