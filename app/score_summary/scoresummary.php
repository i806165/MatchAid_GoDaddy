<?php
// /public_html/app/score_summary/scoresummary.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';

Logger::info('SCORESUMMARY_ENTRY', [
    'uri' => $_SERVER['REQUEST_URI'] ?? '',
    'ghin' => $_SESSION['SessionGHINLogonID'] ?? '',
    'ggid' => $_SESSION['SessionStoredGGID'] ?? '',
    'loginTime' => $_SESSION['SessionLoginTime'] ?? '',
]);

$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx['ok'])) {
    header('Location: ' . MA_ROUTE_LOGIN);
    exit;
}

$gc = ServiceContextGame::getGameContext();
if (!$gc || empty($gc['game'])) {
    header('Location: ' . MA_ROUTE_LOGIN);
    exit;
}

try {
    require_once MA_API . '/score_summary/initScoreSummary.php';
    $initPayload = buildScoreSummaryInit($ctx, $gc);

    if (empty($initPayload['ok'])) {
        header('Location: ' . MA_ROUTE_LOGIN);
        exit;
    }

    $initPayload['portal'] = $_SESSION['SessionPortal'] ?? 'ADMIN PORTAL';
} catch (Throwable $e) {
    Logger::error('SCORESUMMARY_INIT_FAIL', ['err' => $e->getMessage()]);
    header('Location: ' . MA_ROUTE_LOGIN);
    exit;
}

$paths = [
    'apiSession' => MA_ROUTE_API_SESSION,
    'routerApi' => MA_ROUTE_API_ROUTER,
    'apiScoreSummary' => '/api/score_summary/initScoreSummary.php',
];

$maChromeTitle = 'Score Summary';
$maChromeSubtitle = $initPayload['header']['subtitle'] ?? '';
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MatchAid - Score Summary</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/assets/css/ma_shared.css?v=1" />
    <link rel="stylesheet" href="/assets/css/score_summary.css?v=1" />
</head>
<body>

<?php include __DIR__ . '/../../includes/chromeHeader.php'; ?>

<div id="ssControls" class="maControlArea"></div>

<main class="maPage" id="ssPage">
    <?php include __DIR__ . '/scoresummary_view.php'; ?>
</main>

<?php include __DIR__ . '/../../includes/chromeFooter.php'; ?>

<script>
window.MA = window.MA || {};
window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
window.__MA_INIT__ = window.__INIT__;
window.MA.routes = {
  router: window.MA.paths.routerApi,
  login: <?= json_encode(MA_ROUTE_LOGIN) ?>,
  apiScoreSummary: window.MA.paths.apiScoreSummary
};
</script>

<script src="/assets/js/ma_shared.js?v=1"></script>
<script src="/assets/pages/score_summary.js?v=1"></script>
</body>
</html>