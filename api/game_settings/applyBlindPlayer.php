<?php
declare(strict_types=1);
// /public_html/api/game_settings/applyBlindPlayer.php

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_BlindPlayer.php';
require_once MA_API_LIB . '/Logger.php';

$auth = ma_api_require_auth();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ma_respond(405, ['ok' => false, 'message' => 'Method not allowed']);
}

$in     = ma_json_in();
$ggid   = (int)($in['ggid'] ?? 0);
$action = trim((string)($in['action'] ?? 'apply'));

if ($ggid <= 0) {
    ma_respond(400, ['ok' => false, 'message' => 'Missing or invalid GGID.']);
}

try {
    if ($action === 'recalc') {
        $result = ServiceBlindPlayer::recalculateDeclaredFlags($ggid);
    } else {
        $result = ServiceBlindPlayer::applyBlindPlayer($ggid);
    }

    $code = !empty($result['ok']) ? 200 : 400;
    ma_respond($code, $result);

} catch (Throwable $e) {
    Logger::error('APPLY_BLIND_FAIL', ['ggid' => $ggid, 'err' => $e->getMessage()]);
    ma_respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
