<?php
// /public_html/app/player_home/playerhome.php
// First-pass scaffold using admin-games implementation pattern.
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/workflows/hydratePlayerGamesList.php';

$_SESSION["SessionPortal"] = "PLAYER PORTAL";
// Direct-link GGID capture (one-time player-home override)
$directLinkGgidFromUrl = trim((string)($_GET['ggid'] ?? ''));
if ($directLinkGgidFromUrl !== '' && ctype_digit($directLinkGgidFromUrl) && (int)$directLinkGgidFromUrl > 0) {
  $_SESSION['PP_DIRECTLINK_GGID'] = $directLinkGgidFromUrl;
}

$context = ServiceUserContext::getUserContext();
if (!$context || empty($context['ok'])) {
  Logger::error("PLAYERGAMES_AUTH_FAIL", [
    "msg" => "Redirecting to login",
    "session_ghin" => $_SESSION["SessionGHINLogonID"] ?? "MISSING",
    "session_time" => $_SESSION["SessionLoginTime"] ?? "MISSING",
    "ctx_result" => $context
  ]);
  header('Location: ' . MA_ROUTE_LOGIN);
  exit;
}

$today = new DateTimeImmutable('today');
$plus30 = $today->modify('+30 days');

// Hard-coded "fresh" defaults
$defaultDateFrom = $today->format('Y-m-d');
$defaultDateTo   = $plus30->format('Y-m-d');
$defaultSelected = [];
$defaultPreset   = 'OPEN'; // Default to "Open Games" (All Available)

// Session restore (Return path)
$sessDf     = trim((string)($_SESSION['PP_FILTERDATEFROM'] ?? ''));
$sessDt     = trim((string)($_SESSION['PP_FILTERDATETO'] ?? ''));
$sessPreset = trim((string)($_SESSION['PP_FILTER_PRESET'] ?? ''));

// PP_FILTER_ADMINS is stored as JSON array string
$sessAdminsJson = (string)($_SESSION['PP_FILTER_ADMINS'] ?? '');
$sessAdmins = [];
if ($sessAdminsJson !== '') {
  $tmp = json_decode($sessAdminsJson, true);
  if (is_array($tmp)) $sessAdmins = array_values(array_filter(array_map('strval', $tmp)));
}

// Decide fresh vs return:
// If we have BOTH dates in session, treat as "Return"
$isReturn = ($sessDf !== '' && $sessDt !== '');

if ($isReturn) {
  $defaultFilters = [
    'dateFrom' => $sessDf,
    'dateTo'   => $sessDt,
    'selectedAdminKeys' => $sessAdmins,
    'quickPreset' => $sessPreset,
  ];
} else {
  $defaultFilters = [
    'dateFrom' => $defaultDateFrom,
    'dateTo'   => $defaultDateTo,
    'selectedAdminKeys' => $defaultSelected,
    'quickPreset' => $defaultPreset,
  ];
}

// Hydrate games list server-side (Option 2)
$userClubId = strval($_SESSION['SessionClubID'] ?? '');

$g = $context['profile']['profileJson']['golfers'][0];

// One-time direct-link session override
$directLinkGGID = trim((string)($_SESSION['PP_DIRECTLINK_GGID'] ?? ''));
if ($directLinkGGID !== '' && (!ctype_digit($directLinkGGID) || (int)$directLinkGGID <= 0)) {
  $directLinkGGID = '';
  unset($_SESSION['PP_DIRECTLINK_GGID']);
}

// Hydrate list using the same canonical GHIN
$hydrated = hydratePlayerGamesList(
  (string)$g['ghin'],
  $defaultFilters,
  $userClubId,
  ['directLinkGGID' => $directLinkGGID]
);

// Consume the one-time direct-link after hydration
if ($directLinkGGID !== '') {
  unset($_SESSION['PP_DIRECTLINK_GGID']);
}

// Build init payload ONCE (do not overwrite later)
$initPayload = [
  'ok' => true,
  'portal' => $_SESSION["SessionPortal"],
  'directLinkGGID' => $directLinkGGID,
  'directLinkMode' => ($directLinkGGID !== ''),
  ...$hydrated,
  'user' => [
    'ghin'       => (string)$g['ghin'],
    'first_name' => (string)$g['first_name'],
    'last_name'  => (string)$g['last_name'],
    'gender'     => (string)$g['gender'],
  ],
];

$paths = [
  'apiPlayerGames' => '/api/player_home',
  'apiAdminGames'  => MA_ROUTE_API_ADMIN_GAMES ?? '/api/admin_games',
  'apiSession'     => MA_ROUTE_API_SESSION ?? '/api/session',
  'routerApi'      => MA_ROUTE_API_ROUTER ?? '/api/router',
  'apiGHIN'        => MA_ROUTE_API_GHIN ?? '/api/GHIN',
  'apiGamePlayers' => MA_ROUTE_API_GAME_PLAYERS ?? '/api/game_players',
  'upsertGamePlayers' => (MA_ROUTE_API_GAME_PLAYERS ?? '/api/game_players') . '/upsertGamePlayers.php',
  'deleteGamePlayers' => (MA_ROUTE_API_GAME_PLAYERS ?? '/api/game_players') . '/deleteGamePlayers.php',

];

$maChromeTitle = 'Player Portal';
$maChromeSubtitle = 'Games';
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Player Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/player_home.css?v=1">
</head>
<body>
  <?php include __DIR__ . '/../../includes/chromeHeader.php'; ?>

  <main class="maPage" role="main">
    <?php include __DIR__ . '/playerhome_view.php'; ?>
  </main>

  <?php include __DIR__ . '/../../includes/chromeFooter.php'; ?>

  <script>
    window.MA = window.MA || {};
    window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.__MA_INIT__ = window.__INIT__;
    window.MA.routes = {
      router: window.MA.paths.routerApi,
      apiPlayerGames: window.MA.paths.apiPlayerGames,
      apiAdminGames: window.MA.paths.apiAdminGames,
      apiSession: window.MA.paths.apiSession
    };
  </script>
  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/modules/actions_menu.js?v=1"></script>
  <script src="/assets/modules/addCalendar.js?v=1"></script>
  <script src="/assets/modules/teesetSelection.js?v=1"></script>
  <script src="/assets/modules/ghin_post_scores.js?v=1"></script>
  <script src="/assets/pages/player_home.js?v=1"></script>
</body>
</html>
