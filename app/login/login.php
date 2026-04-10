<?php
// /public_html/app/login/login.php
declare(strict_types=1);

session_start();
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
/**
 * Route table: ONLY place where physical paths live.
 * Keep these as absolute-from-domain-root URLs.
 */
$ROUTES = [
  "home"   => "/",
  "player" => "/app/player_home/playerhome.php",
  "admin" => "/app/admin_games/gameslist.php",
];

header("Content-Type: text/html; charset=utf-8");
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>MatchAid • Login</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/ma_shared.css?v=1" />
  <link rel="stylesheet" href="/assets/css/login.css?v=1" />
</head>
<body>
<?php
// Chrome values
$maChromeTitle = "MatchAid Login";
$maChromeSubtitle = "Sign in to continue"; // Default subtitle

// Attempt to get user context to potentially pre-fill email or show a personalized message
try {
    $userContext = ServiceUserContext::getUserContext();
    if ($userContext && !empty($userContext['profile']['email'])) {
        $maChromeSubtitle = "Welcome back, " . htmlspecialchars($userContext['profile']['email']);
    }
} catch (Throwable $e) {
    Logger::warn("LOGIN_PAGE_CONTEXT_FAIL", ["err" => $e->getMessage()]);
    // Continue with default subtitle
}

include __DIR__ . "/../../includes/chromeHeader.php";

// Determine return and cancel actions
$returnAction = trim((string)($_GET["returnAction"] ?? "home"));
$cancelAction = trim((string)($_GET["cancelAction"] ?? "home"));

// Validate action keys to prevent open-redirect behavior
if (!isset($ROUTES[$returnAction])) $returnAction = "home";
if (!isset($ROUTES[$cancelAction])) $cancelAction = "home";

// Init payload injected into the page for login.js to read
$initPayload = [
    "ok"           => true,
    "returnAction" => $returnAction,
    "cancelAction" => $cancelAction,
];

// Provide path constants to JS (no hard-coded paths in JS)
$paths = [
    "apiLogin"  => "/api/auth/login.php",
    "apiLogout" => "/api/auth/logout.php",
    "routerApi" => MA_ROUTE_API_ROUTER,
];
?>

<script>
  window.MA = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>

<?php include __DIR__ . "/login_view.php"; ?>

<script src="/assets/js/ma_shared.js"></script>
<script src="/assets/pages/login.js"></script>
</body>
</html>
