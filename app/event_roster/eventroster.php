<?php
declare(strict_types=1);
// /app/event_roster/eventroster.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextEvent.php";
require_once MA_SERVICES . "/database/service_dbFavPlayers.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";

$uc = ServiceUserContext::getUserContext();
if (!$uc || empty($uc["ok"])) {
    header("Location: " . MA_ROUTE_LOGIN);
    exit;
}

try {
    $ec  = ServiceContextEvent::getEventContext();
    $event = $ec["event"] ?? [];
    $eid   = (int)($ec["eid"] ?? 0);

    $userGHIN = (string)($_SESSION["SessionGHINLogonID"] ?? "");
    $courseId  = trim((string)($event["dbEvents_CourseID"] ?? ""));

    $favorites = service_dbFavPlayers::getFavoritesForUser($userGHIN, $courseId);
    $groups    = service_dbFavPlayers::getGroupsForUser($userGHIN);
    $roster    = ServiceDbEventPlayers::getEventRoster($eid);

    $initPayload = [
        "ok"       => true,
        "eid"      => $eid,
        "event"    => $event,
        "roster"   => $roster,
        "favorites" => $favorites,
        "groups"    => $groups,
        "pairingMode"   => trim((string)($event["dbEvents_PairingMode"]   ?? "none")),
        "hcEffectivity" => trim((string)($event["dbEvents_HCEffectivity"] ?? "PlayDate")),
        "context"  => [
            "userGHIN"   => $userGHIN,
            "userName"   => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
            "userGender" => (string)($_SESSION["SessionUserGender"] ?? "M"),
            "userState"  => (string)($_SESSION["SessionUserState"]  ?? ""),
        ],
        "portal" => $_SESSION["SessionPortal"] ?? "ADMIN PORTAL",
    ];

} catch (Throwable $e) {
    Logger::error("EVENT_ROSTER_INIT_FAIL", [
        "err"  => $e->getMessage(),
        "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
        "eid"  => $_SESSION["SessionStoredEID"]   ?? "",
    ]);
    header("Location: " . MA_ROUTE_ADMIN_EVENTS);
    exit;
}

$paths = [
    "routerApi"              => MA_ROUTE_API_ROUTER,
    "apiGHIN"                => MA_ROUTE_API_GHIN,
    "apiEventRoster"        => MA_ROUTE_API_EVENT_ROSTER,
    "apiFavoritePlayers"     => MA_ROUTE_API_FAVORITE_PLAYERS,
    "getEventRoster"         => MA_ROUTE_API_EVENT_ROSTER . "/getEventRoster.php",
    "saveEventRosterPlayer"  => MA_ROUTE_API_EVENT_ROSTER . "/saveEventRosterPlayer.php",
    "deleteEventRosterPlayer"=> MA_ROUTE_API_EVENT_ROSTER . "/deleteEventRosterPlayer.php",
    "refreshEventRosterHI"   => MA_ROUTE_API_EVENT_ROSTER . "/refreshEventRosterHI.php",
    "saveEventRosterPairings"=> MA_ROUTE_API_EVENT_ROSTER . "/saveEventRosterPairings.php",
    "favPlayersInit"         => MA_ROUTE_API_FAVORITE_PLAYERS . "/initFavPlayers.php",
    "ghinPlayerSearch"       => MA_ROUTE_API_GHIN . "/searchPlayers.php",
];

$maChromeTitle    = "Event Roster";
$maChromeSubtitle = trim((string)($event["dbEvents_Title"] ?? "Event"));
$maChromeLogoUrl  = null;

$pageHelpKey = ServicePageHelp::keyFromControllerFile(__FILE__);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>MatchAid • Event Roster</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
    <link rel="stylesheet" href="<?= ma_asset('/assets/css/event_roster.css') ?>" />
</head>
<body>
    <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

    <main class="maPage maPage--multi maPage--event-roster" role="main">
        <?php include __DIR__ . "/eventroster_view.php"; ?>
    </main>

    <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

    <?php if (!empty($pageHelpKey)) ServicePageHelp::renderByKey($pageHelpKey); ?>

    <script>
        window.MA = window.MA || {};
        window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        window.__MA_INIT__ = window.__INIT__;
        window.MA.routes = {
            router:         window.MA.paths.routerApi,
            login:          <?= json_encode(MA_ROUTE_LOGIN) ?>,
            apiGHIN:        window.MA.paths.apiGHIN,
            apiEventPlayers: window.MA.paths.apiEventPlayers,
        };
    </script>
    <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
    <script src="<?= ma_asset('/assets/modules/module_sourceGHINPlayers.js') ?>"></script>
    <script src="<?= ma_asset('/assets/modules/module_sourceFavorites.js') ?>"></script>
    <script src="<?= ma_asset('/assets/modules/module_sourceNonRated.js') ?>"></script>
    <script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
    <script src="<?= ma_asset('/assets/modules/manage_teams.js') ?>"></script>
    <script src="<?= ma_asset('/assets/modules/pageHelp.js') ?>"></script>
    <script src="<?= ma_asset('/assets/modules/module_parseImportPlayers.js') ?>"></script>
    <script src="<?= ma_asset('/assets/modules/module_createEventPairings.js') ?>"></script>
    <script src="<?= ma_asset('/assets/pages/event_roster.js') ?>"></script>
</body>
</html>
