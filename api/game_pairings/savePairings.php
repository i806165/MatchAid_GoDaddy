<?php
// /public_html/api/game_pairings/savePairings.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/workflows/service_ProcessPairings.php";
require_once MA_SVC_DB . "/service_dbGames.php";

header("Content-Type: application/json; charset=utf-8");

try {
  // 1) Auth
  $uc = ServiceUserContext::getUserContext();
  if (!$uc || empty($uc['ok'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'message' => 'Not signed in.']);
    exit;
  }

  // 2) GGID always from session — never trust request body for game identity
  $ggid = strval($_SESSION['SessionStoredGGID'] ?? '');
  if ($ggid === '') {
    Logger::error('PAIRINGS_SAVE_FAIL', ['err' => 'missing ggid']);
    echo json_encode(['ok' => false, 'message' => 'No game selected.']);
    exit;
  }

  // 3) Input
  $in          = ma_json_in();
  $assignments = $in['assignments'] ?? [];
  if (!is_array($assignments)) $assignments = [];

  // 4) Resolve competition type
  $game       = ServiceDbGames::getGameByGGID((int)$ggid);
  $isPairPair = (strval($game['dbGames_Competition'] ?? '') === 'PairPair');

  // 5) Delegate to service — full two-pass normalize + inherit + persist
  $final = ServiceProcessPairings::savePairings($ggid, $assignments, $isPairPair);

  Logger::info('PAIRINGS_SAVE_OK', [
    'ggid'        => $ggid,
    'assigned'    => count($assignments),
    'competition' => $game['dbGames_Competition'] ?? '',
    'userGHIN'    => $_SESSION['SessionGHINLogonID'] ?? ''
  ]);

  echo json_encode(['ok' => true, 'payload' => ['players' => $final]]);

} catch (Throwable $e) {
  Logger::error('PAIRINGS_SAVE_EXCEPTION', ['err' => $e->getMessage()]);
  echo json_encode(['ok' => false, 'message' => 'Server error saving pairings.']);
}