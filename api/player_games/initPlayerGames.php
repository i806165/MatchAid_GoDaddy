<?php
// /public_html/api/player_games/initPlayerGames.php
// First-pass API: derives player-portal list by adapting existing admin_games/queryGames payload,
// then applies player visibility and registration projections server-side where possible.
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_API_LIB . '/Db.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/workflows/hydratePlayerGamesList.php';

header('Content-Type: application/json; charset=utf-8');

try {
  $body = json_decode(file_get_contents('php://input'), true) ?: [];
  $payload = is_array($body['payload'] ?? null) ? $body['payload'] : $body;
  $inFilters = is_array($payload['filters'] ?? null) ? $payload['filters'] : $payload;

  $ctx = ServiceUserContext::getUserContext();
  if (!$ctx || empty($ctx['ok'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'AUTH_REQUIRED', 'redirectUrl' => MA_ROUTE_LOGIN], JSON_UNESCAPED_SLASHES);
    exit;
  }

  $userGHIN = strval($ctx['userGHIN'] ?? ($_SESSION['SessionGHINLogonID'] ?? ''));

  // Persist player portal filters (session)
  $_SESSION['PP_FILTERDATEFROM'] = trim((string)($inFilters['dateFrom'] ?? ''));
  $_SESSION['PP_FILTERDATETO'] = trim((string)($inFilters['dateTo'] ?? ''));
  $_SESSION['PP_FILTER_ADMINS'] = json_encode($inFilters['selectedAdminKeys'] ?? []);
  $_SESSION['PP_FILTER_PRESET'] = trim((string)($inFilters['quickPreset'] ?? ''));

  // Delegate to shared workflow
  $payload = hydratePlayerGamesList($userGHIN, $inFilters);

  echo json_encode([
    'ok' => true,
    'payload' => $payload
  ], JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
  Logger::error('PLAYERGAMES_INIT_FAIL', ['err' => $e->getMessage()]);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'PLAYERGAMES_INIT_FAIL', 'message' => $e->getMessage()], JSON_UNESCAPED_SLASHES);
}
