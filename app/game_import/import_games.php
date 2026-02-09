<?php
// /public_html/app/game_import/import_games.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";

// Portal context (required convention)
$_SESSION["SessionPortal"] = "ADMIN PORTAL";

Logger::info("IMPORT_GAMES_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
  "loginTime" => $_SESSION["SessionLoginTime"] ?? "",
]);

// 1) USER context hydration (Rule-2)
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

$paths = [
  "apiImportGames" => "/api/import_games",
  "routerApi"      => MA_ROUTE_API_ROUTER,
  "apiSession"     => MA_ROUTE_API_SESSION,
];

// Chrome values
$maChromeTitle = "Import Games";
$maChromeSubtitle = "Batch game creation";
$maChromeLogoUrl = null;

// Small init payload; page JS will call InitImport.php for real hydrate
$initPayload = [
  "ok" => true,
  "header" => [
    "subtitle" => $maChromeSubtitle
  ]
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MatchAid • Import Games</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/game_import.css">
</head>
<body>
  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <main class="maPage" role="main">
    <?php include __DIR__ . "/import_games_view.php"; ?>
  </main>

  <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

<script>
  window.MA = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;

  window.MA.routes = {
    router: window.MA.paths.routerApi,
    login: <?= json_encode(MA_ROUTE_LOGIN) ?>,
    apiImportGames: window.MA.paths.apiImportGames
  };
</script>

  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/pages/import_games.js"></script>
</body>
</html>
