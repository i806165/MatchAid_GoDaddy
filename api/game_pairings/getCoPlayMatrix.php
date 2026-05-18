<?php
// /public_html/api/game_pairings/getCoPlayMatrix.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';

header('Content-Type: application/json; charset=utf-8');

try {
  // 1) Auth — identical guard to savePairings.php
  $uc = ServiceUserContext::getUserContext();
  if (!$uc || empty($uc['ok'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'message' => 'Not signed in.']);
    exit;
  }

  // 2) GGID from session — never from request body (same rule as savePairings.php)
  $ggid = strval($_SESSION['SessionStoredGGID'] ?? '');
  if ($ggid === '') {
    Logger::error('COPLAY_MATRIX_FAIL', ['err' => 'missing ggid']);
    echo json_encode(['ok' => false, 'message' => 'No game selected.']);
    exit;
  }

  // 3) Input — array of GHINs from the unpaired pool
  $in    = ma_json_in();
  $ghins = $in['ghins'] ?? [];
  if (!is_array($ghins)) $ghins = [];
  $ghins = array_values(array_filter(array_map('strval', $ghins)));

  // 4) Delegate — NH filtering happens inside getCoPlayMatrix()
  $matrix = ServiceDbPlayers::getCoPlayMatrix($ghins);

  Logger::info('COPLAY_MATRIX_OK', [
    'ggid'     => $ggid,
    'poolSize' => count($ghins),
    'pairs'    => count($matrix),
    'userGHIN' => $_SESSION['SessionGHINLogonID'] ?? ''
  ]);

  echo json_encode(['ok' => true, 'matrix' => $matrix]);

} catch (Throwable $e) {
  Logger::error('COPLAY_MATRIX_EXCEPTION', ['err' => $e->getMessage()]);
  echo json_encode(['ok' => false, 'message' => 'Server error fetching pairing history.']);
}