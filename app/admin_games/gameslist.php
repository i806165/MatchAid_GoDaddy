<?php
// /public_html/app/admin_games/gameslist.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/workflows/hydrateAdminGamesList.php';
require_once MA_API_LIB . '/Logger.php';

Logger::info("GAMESLIST_ENTRY", [
  "uri" => $_SERVER["REQUEST_URI"] ?? "",
  "ghin" => $_SESSION["SessionGHINLogonID"] ?? "",
  "loginTime" => $_SESSION["SessionLoginTime"] ?? "",
]);

$config = ma_config();

// Portal context (required convention)
$_SESSION["SessionPortal"] = "ADMIN PORTAL";

// ------------------------------------------------------------
// 1) READ user context here (Rule-2)
//    - Each protected page validates session context
//    - If not OK, route to login entry (do not proceed)
//    - If OK, rely on session vars (no profile parsing here)
// ------------------------------------------------------------
$ctx = ServiceUserContext::getUserContext(); // hydrates session vars if needed
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// Pull “frequently used” values from session
$ghinId     = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
$clubId     = trim((string)($_SESSION["SessionClubID"] ?? ""));
$clubName   = trim((string)($_SESSION["SessionClubName"] ?? ""));
$userToken  = trim((string)($_SESSION["SessionUserToken"] ?? ""));
$adminToken = trim((string)($_SESSION["SessionAdminToken"] ?? ""));

// Build the context array expected by hydrateAdminGamesList
$context = [
  "adminToken"  => $adminToken,
  "userToken"   => $userToken,
  "userProfile" => $ctx["profile"] ?? null, // optional; do NOT derive club here
  "userGHIN"    => $ghinId,
  "clubId"      => $clubId,
  "clubName"    => $clubName,
];

// Log what we got back (you asked for this)
Logger::info("GAMESLIST_USERCTX", [
  "ok" => true,
  "userGHIN" => $context["userGHIN"],
  "clubId" => $context["clubId"],
  "clubName" => $context["clubName"],
  "hasAdminToken" => !empty($context["adminToken"]),
  "hasUserToken" => !empty($context["userToken"]),
  "profileType" => is_array($context["userProfile"] ?? null) ? "array" : gettype($context["userProfile"] ?? null),
]);

// 2) Default filters
//    - First-time fresh: use hard-coded presets (today → today+30, ME)
//    - Return to page: if AP_* session filters exist, restore those
$today  = new DateTimeImmutable("today");
$plus30 = $today->modify("+30 days");

// Hard-coded "fresh" defaults
$defaultMode = "current";
$defaultDateFrom = $today->format("Y-m-d");
$defaultDateTo   = $plus30->format("Y-m-d");
$defaultScope    = "ME";
$defaultSelected = [ strval($context["userGHIN"] ?? "") ];

// Session restore (Return path)
$sessDf    = trim((string)($_SESSION["AP_FILTERDATEFROM"] ?? ""));
$sessDt    = trim((string)($_SESSION["AP_FILTERDATETO"] ?? ""));
$sessScope = strtoupper(trim((string)($_SESSION["AP_FILTERADMINSCOPE"] ?? "")));
if (!in_array($sessScope, ["ME", "ALL", "CUSTOM"], true)) $sessScope = "";

// AP_FILTER_ADMINS is stored as JSON array string
$sessAdminsJson = (string)($_SESSION["AP_FILTER_ADMINS"] ?? "");
$sessAdmins = [];
if ($sessAdminsJson !== "") {
  $tmp = json_decode($sessAdminsJson, true);
  if (is_array($tmp)) $sessAdmins = array_values(array_filter(array_map("strval", $tmp)));
}

// Decide fresh vs return:
// - If we have BOTH dates and a scope in session, treat as "Return"
$isReturn = ($sessDf !== "" && $sessDt !== "" && $sessScope !== "");

if ($isReturn) {
  $dateFrom = $sessDf;
  $dateTo   = $sessDt;
  $scope    = $sessScope;
  $selected = !empty($sessAdmins) ? $sessAdmins : $defaultSelected;

  // Infer "mode" from the restored window (only used for fallback windows)
  $mode = ($dateTo < $today->format("Y-m-d")) ? "past" : "current";

  $defaultFilters = [
    "mode" => $mode,
    "dateFrom" => $dateFrom,
    "dateTo" => $dateTo,
    "adminScope" => $scope,
    // IMPORTANT: this is the UI selection set (even when adminScope=ALL)
    "selectedAdminKeys" => $selected,
  ];

  Logger::info("GAMESLIST_FILTERS_RESTORE", [
    "path" => "return",
    "dateFrom" => $dateFrom,
    "dateTo" => $dateTo,
    "adminScope" => $scope,
    "selectedCount" => count($selected),
  ]);
} else {
  $defaultFilters = [
    "mode" => $defaultMode,
    "dateFrom" => $defaultDateFrom,
    "dateTo" => $defaultDateTo,
    "adminScope" => $defaultScope,
    "selectedAdminKeys" => $defaultSelected,
  ];

  Logger::info("GAMESLIST_FILTERS_RESTORE", [
    "path" => "fresh",
    "dateFrom" => $defaultDateFrom,
    "dateTo" => $defaultDateTo,
    "adminScope" => $defaultScope,
    "selectedCount" => count($defaultSelected),
  ]);
}

// 3) Hydrate INIT payload (admins + games + header)
$initPayload = hydrateAdminGamesList($context, $defaultFilters);

// Provide path constants to JS
$paths = [
  "apiAdminGames" => MA_ROUTE_API_ADMIN_GAMES,
  "apiSession"    => MA_ROUTE_API_SESSION,
  "routerApi"     => MA_ROUTE_API_ROUTER,
];

// Chrome values
$maChromeTitle = "Administrators Portal";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl = null; // reserve slot; set later if desired
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MatchAid • Admin Games</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/ma_shared.css">
  <link rel="stylesheet" href="/assets/css/admin_games_list.css?v=1">

  <!-- Chrome styling lives in /assets/css/ma_shared.css-->
  <!-- Page styling lives in /assets/css/admin_games_list.css-->

</head>
<body>
  <?php include __DIR__ . '/../../includes/chromeHeader.php'; ?>

  <main class="maPage" role="main">
    <?php include __DIR__ . '/gameslistview.php'; ?>
  </main>

  <?php include __DIR__ . '/../../includes/chromeFooter.php'; ?>
  
<script>
  window.MA = window.MA || {};

  // Existing (keep)
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

  // Aliases for the newer pattern (add)
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = {
    router: window.MA.paths.routerApi,
    apiAdminGames: window.MA.paths.apiAdminGames
  };
</script>

  <script src="/assets/js/ma_shared.js"></script>
  <script src="/assets/modules/actions_menu.js?v=1"></script>
  <script src="/assets/pages/admin_games_list.js"></script>
</body>
</html>