<?php
declare(strict_types=1);
// /public_html/app/scorecardShared/scorecardShared.php
//
// Single consolidated controller for Player / Group / Game Scorecards.
// Previously three separate files (scorecardGame.php / scorecardGroup.php /
// scorecardPlayer.php), each hardcoding one mode server-side via its own
// URL — retired in favor of this one file, since mode is now a
// client-side .maSeg tab switch (page-owned, in .maControlArea).
// scorecardShared.js self-fetches via initScoreCardMode.php when the tab
// changes, same self-fetch pattern event_scorecard.js already established
// for Event Scorecards' round selector.
//
// ?mode=group|player is still accepted as an optional deep-link default —
// mirrors the old three-URL behavior for anyone with an existing
// bookmark/link, same convention initSharedScoreCard.php's own GET
// entrypoint already supports for ?mode.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_API . "/scorecardShared/initSharedScoreCard.php";

try {
  $ggid = ServiceContextGame::getStoredGGID();
  if (!$ggid) {
    error_log('[MA][ERROR][SCORECARD_SHARED_ENTRY] Missing SessionStoredGGID.');
    throw new RuntimeException('No game selected.');
  }

  $mode = strtolower(trim((string)($_GET["mode"] ?? "game")));
  if (!in_array($mode, ["game", "group", "player"], true)) {
    $mode = "game";
  }

  // Group/Player modes need the caller's own effective GHIN — only
  // resolved (and only gates the request) when the INITIAL/deep-linked
  // mode actually needs it. A plain page load defaulting to "game" never
  // touches this. If the user later taps the Group/Player tab client-side,
  // that's a separate initScoreCardMode.php request, which resolves and
  // gates on GHIN independently rather than redirecting mid-page-load.
  $scope = "";
  if ($mode === "group" || $mode === "player") {
    $ghin = ServiceScoreEntry::getEffectivePlayerGHIN();
    if (!$ghin) {
      header("Location: " . MA_ROUTE_LOGIN);
      exit;
    }
    $scope = $ghin;
  }

  $initPayload = initSharedScoreCard((string)$ggid, $mode, $scope);
  if (empty($initPayload['ok'])) {
    throw new RuntimeException(
      'Unable to load scorecards: ' . (string)($initPayload['error'] ?? 'unknown')
    );
  }
  $initPayload['portal'] = $_SESSION["SessionPortal"] ?? "";

} catch (Throwable $e) {
  error_log('[MA][ERROR][SCORECARD_SHARED_INIT] ' . $e->getMessage());

  $routerUrl = MA_ROUTE_API_ROUTER . '?' . http_build_query([
    'action'   => 'home',
    'redirect' => '1',
  ]);

  header("Location: " . $routerUrl);
  exit;
}

renderScorecardSharedPage($initPayload, 'Scorecards');

// ==========================================================================
// Shared page shell — same responsibility as before, now living in the
// same file as its only caller (three controllers -> one).
// ==========================================================================
function renderScorecardSharedPage(array $initPayload, string $pageTitle): void {
  global $maChromeTitle, $maChromeSubtitle, $pageCardTitle;

  $paths = [
    "apiSession"        => MA_ROUTE_API_SESSION,
    "routerApi"          => MA_ROUTE_API_ROUTER,
    "initScoreCardMode"  => MA_ROUTE_API_SCORECARD_SHARED . "/initScoreCardMode.php",
  ];

  $maChromeTitle = $pageTitle;
  $maChromeSubtitle = $initPayload['header']['subtitle'] ?? '';
  $pageCardTitle = $pageTitle;
  ?>
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>MatchAid — <?= htmlspecialchars($pageTitle) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
<link rel="stylesheet" href="<?= ma_asset('/assets/css/scorecardShared.css') ?>" />
</head><body>
<?php require_once MA_INCLUDES . '/chromeHeader.php'; ?>
<div id="scControls" class="maControlArea"></div>
<main class="maPage" id="scPage"><?php require __DIR__ . '/scorecardShared_view.php'; ?></main>
<?php require_once MA_INCLUDES . '/chromeFooter.php'; ?>

<script>
  window.MA = window.MA || {};
  window.MA.paths = <?= json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__INIT__ = <?= json_encode($initPayload, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.__MA_INIT__ = window.__INIT__;
  window.MA.routes = Object.assign({}, window.MA.routes || {}, {
    router: window.MA.paths.routerApi
  });
</script>

<script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/actions_menu.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/ghin_post_scores.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_DisplayGameFormat.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/module_renderScoreCards.js') ?>"></script>
<script src="<?= ma_asset('/assets/pages/scorecardShared.js') ?>"></script>
</body></html>
<?php }
