<?php
// /public_html/app/home/clubmarketing.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";

$homeUrl = MA_ROUTE_HOME;
$clubId  = trim((string)($_GET["clubId"] ?? ""));

header("Content-Type: text/html; charset=utf-8");

include __DIR__ . "/clubmarketing_view.php";