<?php
declare(strict_types=1);

// /public_html/app/score_gis/scoregis.php
// Standalone MatchAid GIS page controller.

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/context/service_ContextGame.php";

// 1) USER context
$ctx = ServiceUserContext::getUserContext();
if (!$ctx || empty($ctx["ok"])) {
    header("Location: " . MA_ROUTE_LOGIN);
    exit;
}

$game = [];
$ggid = null;
$errorMessage = "";

// Explicit courseId supports the standalone/manual beta.
$courseId = trim((string)($_GET["courseId"] ?? ""));

// If no explicit course was supplied, use the active game's course.
if ($courseId === "") {
    try {
        $gc = ServiceContextGame::getGameContext();
        $game = $gc["game"] ?? [];
        $ggid = $gc["ggid"] ?? null;
        $courseId = trim((string)($game["dbGames_CourseID"] ?? ""));
    } catch (Throwable $e) {
        Logger::warning("SCOREGIS_GAME_CONTEXT_FAIL", [
            "err" => $e->getMessage()
        ]);
    }
}

if ($courseId === "") {
    $errorMessage = "No course was supplied and no active game course could be resolved.";
}

$initPayload = [
    "ok" => ($courseId !== ""),
    "ggid" => $ggid,
    "game" => $game,
    "courseId" => $courseId,
    "error" => $errorMessage
];

$paths = [
    "routerApi" => MA_ROUTE_API_ROUTER,
    "apiCourseOSM" => MA_ROUTE_API_SCORE_GIS . "/getCourseOSM.php"
];

$maChromeTitle = "Play with GPS";
$maChromeSubtitle = (string)($game["dbGames_CourseName"] ?? "Course GIS");
$maChromeLogoUrl = null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>MatchAid • Play with GPS</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="<?= ma_asset('/assets/vendor/leaflet/leaflet.css') ?>" />
    <link rel="stylesheet" href="<?= ma_asset('/assets/css/ma_shared.css') ?>" />
</head>
<body>

<?php include __DIR__ . "/../../includes/chromeHeader.php"; ?>

<main class="maPage" role="main">
    <?php include __DIR__ . "/scoregis_view.php"; ?>
</main>

<?php include __DIR__ . "/../../includes/chromeFooter.php"; ?>

<script>
    window.MA = window.MA || {};
    window.MA.paths = <?= json_encode(
        $paths,
        JSON_UNESCAPED_SLASHES |
        JSON_HEX_TAG |
        JSON_HEX_AMP |
        JSON_HEX_APOS |
        JSON_HEX_QUOT
    ) ?>;

    window.__INIT__ = <?= json_encode(
        $initPayload,
        JSON_UNESCAPED_SLASHES |
        JSON_HEX_TAG |
        JSON_HEX_AMP |
        JSON_HEX_APOS |
        JSON_HEX_QUOT
    ) ?>;
    window.__MA_INIT__ = window.__INIT__;
</script>

<script src="<?= ma_asset('/assets/js/ma_shared.js') ?>"></script>
<script src="<?= ma_asset('/assets/vendor/leaflet/leaflet.js') ?>"></script>
<script src="<?= ma_asset('/assets/modules/score_GISMap.js') ?>"></script>
<script src="<?= ma_asset('/assets/pages/score_gis.js') ?>"></script>

</body>
</html>
