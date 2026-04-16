<?php
declare(strict_types=1);
// /public_html/api/score_entry/setHoleContext.php
require_once __DIR__ . "/../../bootstrap.php";
$input = ma_json_in();
$hole = (int)($input['hole'] ?? 1);


$_SESSION['SessionCurrentHole'] = $hole;
ma_respond(200, ['ok' => true]);