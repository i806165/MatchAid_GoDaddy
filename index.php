<?php
// index.php — MatchAid Home
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';


// Handle portal selection logic
if (isset($_GET['portal'])) {
    $portal = trim((string)$_GET['portal']);
    if ($portal === 'admin') {
        $_SESSION['SessionPortal'] = 'ADMIN PORTAL';
        session_write_close();
        header('Location: ' . MA_ROUTE_ADMIN_GAMES);
        exit;
    } elseif ($portal === 'player') {
        $_SESSION['SessionPortal'] = 'PLAYER PORTAL';
        session_write_close();
        header('Location: ' . MA_ROUTE_PLAYER_HOME);
        exit;
    }
}

$adminPortalHref  = MA_ROUTE_HOME . "?portal=admin";
$playerPortalHref = MA_ROUTE_HOME . "?portal=player";

/*
|--------------------------------------------------------------------------
| Home-page account state
| - Header login icon should NOT set a portal.
| - Login launched from home always returns to home.
|--------------------------------------------------------------------------
*/
$userCtx = ServiceUserContext::getUserContext();

$isLoggedIn = !empty($userCtx['ok']);

$userName = trim((string)($_SESSION['SessionUserName'] ?? ''));
if ($userName === '' && !empty($userCtx['profile']) && is_array($userCtx['profile'])) {
    $userName = trim((string)(
        $userCtx['profile']['name']
        ?? $userCtx['profile']['full_name']
        ?? $userCtx['profile']['golfer_name']
        ?? ''
    ));
}

$userInitial = $userName !== ''
    ? strtoupper(substr($userName, 0, 1))
    : '?';

$loginHref = MA_ROUTE_LOGIN . '?returnAction=home&cancelAction=home';

include MA_APP . '/home/home_view.php';
