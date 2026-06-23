<?php
// /api/external/validateMobile.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/external/service_Twilio.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $ctx = ServiceUserContext::getUserContext();
    if (!$ctx || empty($ctx["ok"])) {
        throw new Exception("Authentication required.", 401);
    }

    $body   = json_decode(file_get_contents('php://input'), true) ?: [];
    $mobile = trim((string)(($body['payload']['mobile'] ?? $body['mobile']) ?? ""));

    if ($mobile === "") {
        throw new Exception("Mobile number is required.", 400);
    }

    $result = service_Twilio::mobileLookup($mobile);

    echo json_encode([
        "ok"      => $result["valid"],
        "valid"   => $result["valid"],
        "e164"    => $result["e164"],
        "carrier" => $result["carrier"],
        "gateway" => $result["gateway"],
        "type"    => $result["type"],
        "message" => $result["error"] ?? null,
    ], JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    $code = (int)$e->getCode();
    if ($code < 400 || $code > 599) $code = 500;
    http_response_code($code);
    Logger::error("API_VALIDATE_MOBILE_FAIL", ["err" => $e->getMessage()]);
    echo json_encode([
        "ok"      => false,
        "valid"   => false,
        "message" => $e->getMessage(),
    ], JSON_UNESCAPED_SLASHES);
}