<?php
// /public_html/app/club_users/clubusers.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_API . "/club_users/initClubUsers.php";

// ----------------------------------------------------------------
// 1) Auth check — before any DB IO
// ----------------------------------------------------------------
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// ----------------------------------------------------------------
// 2) Facility guard — must have been set by club_home.php
// ----------------------------------------------------------------
if (empty($_SESSION["clubhomeSession_FacilityID"])) {
  header("Location: " . MA_ROUTE_CLUB_HOME);
  exit;
}

// ----------------------------------------------------------------
// 3) Build init payload
// ----------------------------------------------------------------
try {
  $initPayload = buildClubUsersInit($ctx);
  if (empty($initPayload["ok"])) {
    Logger::error("CLUB_USERS_INIT_EMPTY", ["msg" => $initPayload["message"] ?? ""]);
    header("Location: " . MA_ROUTE_CLUB_HOME);
    exit;
  }
} catch (Throwable $e) {
  Logger::error("CLUB_USERS_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . MA_ROUTE_CLUB_HOME);
  exit;
}

// ----------------------------------------------------------------
// 4) Path constants for JS
// ----------------------------------------------------------------
$paths = [
  "apiClubUsers" => "/api/club_users/initClubUsers.php",
  "apiSession"   => MA_ROUTE_API_SESSION,
  "routerApi"    => MA_ROUTE_API_ROUTER,
];

// ----------------------------------------------------------------
// 5) Chrome values
// ----------------------------------------------------------------
$facilityName     = strval($_SESSION["clubhomeSession_FacilityName"] ?? "");
$maChromeTitle    = "Club Users";
$maChromeSubtitle = $facilityName !== "" ? $facilityName : strval($_SESSION["SessionClubName"] ?? "");
$maChromeLogoUrl  = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Club Users</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/club_demand.css') ?>" />
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/club_users.css') ?>" />
</head>
<body>

  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <?php include __DIR__ . "/clubusers_view.php"; ?>

  <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

<script>
  window.MA       = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router:       window.MA.paths.routerApi,
    apiClubUsers: window.MA.paths.apiClubUsers,
  };
</script>

  <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
  <script src="<?= ma_asset('/assets/pages/club_users.js') ?>"></script>
</body>
</html>
