<?php
// /public_html/app/game_scorecards/scorecards.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_API . "/game_scorecard/initScoreCard.php";

// 1. USER context hydration
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
  header("Location: " . MA_ROUTE_LOGIN);
  exit;
}

// 2. GAME context hydration
try {
  $ggid = ServiceContextGame::getStoredGGID();
  if (!$ggid) {
    $ggidInput = $_GET['ggid'] ?? $_SESSION['SessionStoredGGID'] ?? '';
    if ($ggidInput) ServiceContextGame::setGameContext((int)$ggidInput);
    $ggid = ServiceContextGame::getStoredGGID();
  }
  if (!$ggid) throw new RuntimeException("No game selected.");
  $initPayload = initScoreCard((string)$ggid, $ctx);
} catch (Throwable $e) {
  die("Scorecard Init Error: " . $e->getMessage());
}

// Chrome values (picked up by chromeHeader.php)
$maChromeTitle = "Scorecards";
$maChromeSubtitle = $initPayload["header"]["subtitle"] ?? "";
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MatchAid — Scorecards</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/assets/css/ma_shared.css?v=1" />
  <link rel="stylesheet" href="/assets/css/game_scorecards.css?v=1" />
</head>
<body>

<?php require_once MA_INCLUDES . "/chromeHeader.php"; ?>

<main class="maPage" id="scPage">
  <?php require_once __DIR__ . "/scorecards_view.php"; ?>
</main>

<?php require_once MA_INCLUDES . "/chromeFooter.php"; ?>

<script>
  window.MA = window.MA || {};
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
</script>

<script src="/assets/js/ma_shared.js?v=1"></script>
<script src="/assets/pages/game_scorecards.js?v=1"></script>
<script src="/assets/modules/actions_menu.js?v=1"></script>
</body>
</html>
