<?php
declare(strict_types=1);
// /public_html/api/game_settings/applyBlindPlayer.php

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/scoring/service_BlindPlayer.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_API_LIB . '/Logger.php';

$auth = ma_api_require_auth();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ma_respond(405, ['ok' => false, 'message' => 'Method not allowed.']);
}

$in     = ma_json_in();
$action = trim((string)($in['action'] ?? 'apply'));

// GGID always from session — never trust the request body for game identity.
$ggid = (int)(ServiceContextGame::getStoredGGID() ?? 0);
if ($ggid <= 0) {
    ma_respond(400, ['ok' => false, 'message' => 'No game selected.']);
}

// pairingId — present when called from the scoring portal (scoped apply).
// Absent when called from a game-wide context.
$pairingId = trim((string)($in['pairingId'] ?? ''));
$pairingId = ($pairingId !== '' && $pairingId !== '000') ? $pairingId : null;

// overrideGHIN — scorer's selected player (group mode only).
// Ignored by the service when game mode is "game" (pre-assigned).
$overrideGHIN = trim((string)($in['ghin'] ?? ''));
$overrideGHIN = ($overrideGHIN !== '') ? $overrideGHIN : null;

try {
    if ($action === 'recalc') {
        $result = ServiceBlindPlayer::recalculateDeclaredFlags($ggid);
    } else {
        $result = ServiceBlindPlayer::applyBlindPlayer($ggid, $pairingId, $overrideGHIN);
    }

    $code = !empty($result['ok']) ? 200 : 400;
    ma_respond($code, $result);

} catch (Throwable $e) {
    Logger::error('APPLY_BLIND_FAIL', ['ggid' => $ggid, 'err' => $e->getMessage()]);
    ma_respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}
