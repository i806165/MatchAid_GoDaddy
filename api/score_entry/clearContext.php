<?php
declare(strict_types=1);
// /public_html/api/score_entry/clearContext.php
require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";

ServiceScoreEntry::clearScoringSession();
ma_respond(200, ['ok' => true]);