<?php
// /public_html/app/club_demand/clubDemand.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_API . "/club_demand/initClubDemand.php";

// ----------------------------------------------------------------
// 1) Auth check (Rule-2) — before any DB IO
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
// 3) Resolve date filters
//    - Return visit: restore from CD_FILTER* session vars
//    - Fresh visit:  default today → today+30
// ----------------------------------------------------------------
$today  = new DateTimeImmutable("today");
$plus30 = $today->modify("+30 days");

$sessFrom = trim(strval($_SESSION["CD_FILTERDATEFROM"] ?? ""));
$sessTo   = trim(strval($_SESSION["CD_FILTERDATETO"]   ?? ""));

$isReturn = ($sessFrom !== "" && $sessTo !== "");

$filters = [
  "dateFrom"   => $isReturn ? $sessFrom : $today->format("Y-m-d"),
  "dateTo"     => $isReturn ? $sessTo   : $plus30->format("Y-m-d"),
  "facilityId" => strval($_SESSION["clubhomeSession_FacilityID"] ?? ""),
];

// ----------------------------------------------------------------
// 4) Build INIT payload
// ----------------------------------------------------------------
try {
  $initPayload = buildClubDemandInit($ctx, $filters);
  if (empty($initPayload["ok"])) {
    Logger::error("CLUB_DEMAND_INIT_EMPTY", ["msg" => $initPayload["message"] ?? ""]);
    header("Location: " . MA_ROUTE_LOGIN);
    exit;
  }
} catch (Throwable $e) {
  Logger::error("CLUB_DEMAND_INIT_FAIL", ["err" => $e->getMessage()]);
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Persist date filters to session for page restore
$_SESSION["CD_FILTERDATEFROM"] = $filters["dateFrom"];
$_SESSION["CD_FILTERDATETO"]   = $filters["dateTo"];

$initPayload["isReturn"] = $isReturn;

// ----------------------------------------------------------------
// 5) Path constants for JS
// ----------------------------------------------------------------
$paths = [
  "apiClubDemand" => "/api/club_demand/initClubDemand.php",
  "apiSession"    => MA_ROUTE_API_SESSION,
  "routerApi"     => MA_ROUTE_API_ROUTER,
];

// Chrome values
$maChromeTitle    = "Club Demand";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl  = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Club Demand</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
  <link rel="stylesheet" href="<?= ma_asset('/assets/css/club_demand.css') ?>" />
</head>
<body>

  <?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

  <?php include __DIR__ . "/clubdemand_view.php"; ?>

  <?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

<script>
  window.MA       = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes   = {
    router:        window.MA.paths.routerApi,
    apiClubDemand: window.MA.paths.apiClubDemand,
  };
</script>

  <script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
  <script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
  <script src="<?= ma_asset('/assets/pages/club_demand.js') ?>"></script>
</body>
</html>
