<?php
// /public_html/app/club_home/clubhome.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";

Logger::info("CLUB_HOME_ENTRY", [
  "uri"  => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
]);

// ----------------------------------------------------------------
// 1) Auth check — before any DB IO
// ----------------------------------------------------------------
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// ----------------------------------------------------------------
// 2) Set portal context
// ----------------------------------------------------------------
$_SESSION["SessionPortal"] = "CLUB ADMIN PORTAL";

// ----------------------------------------------------------------
// 3) Build display values
// ----------------------------------------------------------------
$userName = trim(strval($_SESSION["SessionUserName"] ?? ""));
if ($userName === "" && !empty($ctx["profile"]) && is_array($ctx["profile"])) {
  $userName = trim(strval(
    $ctx["profile"]["name"]
    ?? $ctx["profile"]["full_name"]
    ?? $ctx["profile"]["golfer_name"]
    ?? ""
  ));
}

$userInitial = $userName !== "" ? strtoupper(substr($userName, 0, 1)) : "?";

$clubName = trim(strval($_SESSION["SessionClubName"] ?? ""));

// ----------------------------------------------------------------
// 4) Chrome values
// ----------------------------------------------------------------
$maChromeTitle    = "Club Admin";
$maChromeSubtitle = $clubName !== "" ? $clubName : "";
$maChromeLogoUrl  = null;

// ----------------------------------------------------------------
// 5) Path constants for JS
// ----------------------------------------------------------------
$paths = [
  "apiSession"   => MA_ROUTE_API_SESSION,
  "routerApi"    => MA_ROUTE_API_ROUTER,
  "demandReport" => MA_ROUTE_CLUB_DEMAND,
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Club Admin</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css?v=1" />
  <link rel="stylesheet" href="/assets/css/club_home.css?v=1" />
</head>
<body>

  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <?php include __DIR__ . "/clubhome_view.php"; ?>

  <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

<script>
  window.MA       = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.MA.routes = {
    router:       window.MA.paths.routerApi,
    demandReport: window.MA.paths.demandReport,
  };
</script>

  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/modules/actions_menu.js?v=1"></script>
  <script src="/assets/pages/club_home.js?v=1"></script>
</body>
</html>