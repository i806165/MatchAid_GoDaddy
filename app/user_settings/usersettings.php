<?php
declare(strict_types=1);

// app/user_settings/usersettings.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";

$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

$portalLabel = strtoupper(trim((string)($_SESSION["SessionPortal"] ?? "")));
$postSaveAction = match($portalLabel) {
    "ADMIN PORTAL"  => "admin",
    "PLAYER PORTAL" => "player",
    default         => "home",
};

$initPayload = [
  "ok"             => true,
  "postSaveAction" => $postSaveAction,
  "header"         => [
    "subtitle" => "Profile & Contact"
  ]
];

$paths = [
  "apiSession"      => MA_ROUTE_API_SESSION,
  "routerApi"       => MA_ROUTE_API_ROUTER,
  "apiUserSettings" => "/api/user_settings",
  "validateMobile"  => MA_ROUTE_API_EXTERNAL . "/validateMobile.php",
];

$maChromeTitle = "User Settings";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl = null;
$pageHelpKey = ServicePageHelp::keyFromControllerFile(__FILE__);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • User Settings</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>">
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/user_settings.css') ?>">
</head>
<body>
  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <main class="maPage" role="main">
    <?php include __DIR__ . "/usersettings_view.php"; ?>
  </main>

  <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>
  
  <?php
  // Render help modal into the DOM (hidden until ? button is clicked)
  if (!empty($pageHelpKey)) {
      ServicePageHelp::renderByKey($pageHelpKey);
  }
  ?>

<script>
  window.MA = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router: window.MA.paths.routerApi,
    login: <?= json_encode(MA_ROUTE_LOGIN) ?>,
    apiUserSettings: window.MA.paths.apiUserSettings
  };
</script>

  <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/pageHelp.js') ?>"></script>
  <script src="<?= ma_asset('/assets/pages/user_settings.js') ?>"></script>
</body>
</html>