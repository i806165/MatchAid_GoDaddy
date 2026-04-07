<?php
// index.php — MatchAid Home
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

session_start();

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

include MA_APP . '/home/home_view.php';
