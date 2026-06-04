<?php
// /public_html/app/home/clubmarketing.php
declare(strict_types=1);

require_once __DIR__ . "/../../bootstrap.php";

$homeUrl      = MA_ROUTE_HOME;
$clubId       = trim((string)($_GET["clubId"]   ?? $_SESSION["SessionClubID"]       ?? ""));
$clubName     = trim((string)($_SESSION["SessionClubName"]     ?? ""));
$facilityId   = trim((string)($_SESSION["SessionFacilityID"]   ?? ""));
$facilityName = trim((string)($_SESSION["SessionFacilityName"] ?? ""));

header("Content-Type: text/html; charset=utf-8");

include __DIR__ . "/clubmarketing_view.php";