<?php
declare(strict_types=1);
// /public_html/app/scorecardShared/scorecardShared.php

function renderScorecardSharedPage(array $initPayload, string $pageTitle): void {
  global $maChromeTitle, $maChromeSubtitle, $pageCardTitle;

  $paths = [
  "apiSession" => MA_ROUTE_API_SESSION,
  "routerApi"  => MA_ROUTE_API_ROUTER,
];


  $maChromeTitle = $pageTitle;
  $maChromeSubtitle = $initPayload['header']['subtitle'] ?? '';
  $pageCardTitle = $pageTitle;
  ?>
<!DOCTYPE html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>MatchAid — <?= htmlspecialchars($pageTitle) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
<link rel="stylesheet" href="<?= ma_asset('/assets/css/game_scorecards.css') ?>" />
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
<script src="<?= ma_asset('/assets/pages/scorecardShared.js') ?>"></script>
</body></html>
<?php }
