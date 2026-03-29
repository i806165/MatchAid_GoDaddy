<?php
declare(strict_types=1);
// /public_html/api/score_home/setScorerContext.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

$input = ma_json_in();
$ghin = trim((string)($input['ghin'] ?? ''));
$carts = $input['carts'] ?? null;

if ($ghin !== "") {
    ServiceScoreEntry::setScorerContext($ghin);

    // If cart assignments are provided, persist them to the pod
    if (is_array($carts)) {
        $ggid = ServiceScoreEntry::getScoringPodGGID();
        if ($ggid) {
            foreach ($carts as $pGhin => $pos) {
                ServiceDbPlayers::updateGamePlayerFields($ggid, (string)$pGhin, ['dbPlayers_PairingPos' => (string)$pos]);
            }
        }
    }

    ma_respond(200, ['ok' => true]);
}

ma_respond(400, ['ok' => false, 'message' => 'GHIN required']);