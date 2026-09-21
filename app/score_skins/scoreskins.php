<?php
declare(strict_types=1);
// /public_html/app/score_skins/scoreskins.php
//
// LEGACY REDIRECT. This page is now Side Games and lives at
// /app/score_sidegames/scoresidegames.php. This stub only keeps old bookmarks
// and links working; delete this file (and the score_skins folder) once
// nothing points here.

require_once __DIR__ . "/../../bootstrap.php";

header("Location: " . MA_ROUTE_SCORE_SIDEGAMES, true, 301);
exit;
