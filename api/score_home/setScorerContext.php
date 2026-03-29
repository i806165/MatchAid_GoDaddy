<?php
declare(strict_types=1);
// /public_html/api/score_home/setScorerContext.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";

$input = ma_json_in();
$ghin = trim((string)($input['ghin'] ?? ''));

if ($ghin !== "") {
    ServiceScoreEntry::setScorerContext($ghin);
    ma_respond(200, ['ok' => true]);
}

ma_respond(400, ['ok' => false, 'message' => 'GHIN required']);