<?php
declare(strict_types=1);
// /public_html/api/score_home/setScorerContext.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_SERVICES . "/scoring/service_ScoreEntry.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

$input = ma_json_in();
$ghin = trim((string)($input['ghin'] ?? ''));
$carts = $input['carts'] ?? null;

if ($ghin === '') {
    ma_respond(400, ['ok' => false, 'message' => 'GHIN required']);
}

ServiceScoreEntry::setScorerContext($ghin);

// If cart assignments are provided, persist pairing id + pairing pos to the pod
if (is_array($carts)) {
    $ggid = ServiceScoreEntry::getScoringPodGGID();
    if ($ggid) {
        foreach ($carts as $playerGHIN => $assignment) {
            if (!is_array($assignment)) {
                continue;
            }

            $pairingId = trim((string)($assignment['pairingId'] ?? ''));
            $pairingPos = trim((string)($assignment['pairingPos'] ?? ''));

            $fields = [];
            if ($pairingId !== '') {
                $fields['dbPlayers_PairingID'] = $pairingId;
            }
            if (in_array($pairingPos, ['1', '2'], true)) {
                $fields['dbPlayers_PairingPos'] = $pairingPos;
            }

            if ($fields) {
            ServiceDbPlayers::updateGamePlayerFields((string)$ggid, (string)$playerGHIN, $fields);    
            }
        }
    }
}

ma_respond(200, ['ok' => true]);