<?php
declare(strict_types=1);

//  /api/user_settings/initUserSettings.php

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $ctx = ServiceUserContext::getUserContext();
    if (!$ctx || empty($ctx["ok"])) {
        throw new Exception("Authentication required.", 401);
    }

    $ghinId = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
    if ($ghinId === "") {
        throw new Exception("Missing session GHIN.", 401);
    }

    $payload = ServiceUserContext::buildUserSettingsPayload($ghinId);

    echo json_encode([
        "ok" => true,
        "payload" => $payload
    ], JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    $code = (int)$e->getCode();
    if ($code < 400 || $code > 599) $code = 500;
    http_response_code($code);
    Logger::error("API_INIT_USERSETTINGS_FAIL", ["err" => $e->getMessage()]);
    echo json_encode([
        "ok" => false,
        "message" => $e->getMessage()
    ], JSON_UNESCAPED_SLASHES);
}