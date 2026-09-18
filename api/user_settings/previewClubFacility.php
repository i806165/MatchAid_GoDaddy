<?php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $ctx = ServiceUserContext::getUserContext();
    if (!$ctx || empty($ctx['ok'])) {
        throw new RuntimeException('Authentication required.', 401);
    }

    $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    $payload = is_array($body['payload'] ?? null) ? $body['payload'] : $body;
    $clubId = trim((string)($payload['clubId'] ?? ''));
    $ghinId = trim((string)($_SESSION['SessionGHINLogonID'] ?? ''));
    $userRow = ServiceUserContext::retrieveGHINUser($ghinId);
    $memberships = json_decode((string)($userRow['dbUser_ClubMemberships'] ?? ''), true);
    if (!is_array($memberships)) $memberships = [];

    $valid = false;
    foreach ($memberships as $membership) {
        if (is_array($membership)
            && (string)($membership['club_id'] ?? '') === $clubId
            && strcasecmp(trim((string)($membership['status'] ?? '')), 'Active') === 0) {
            $valid = true;
            break;
        }
    }
    if ($clubId === '' || !$valid) {
        throw new RuntimeException('Not an active membership for this user.', 400);
    }

    $facility = ServiceUserContext::resolveClubFacility(
        $clubId,
        (string)($_SESSION['SessionAdminToken'] ?? '')
    );
    echo json_encode(['ok' => true, 'payload' => $facility], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    $code = (int)$e->getCode();
    if ($code < 400 || $code > 599) $code = 500;
    http_response_code($code);
    Logger::error('API_PREVIEW_CLUB_FACILITY_FAIL', ['err' => $e->getMessage()]);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_SLASHES);
}
