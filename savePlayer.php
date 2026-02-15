<?php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_SERVICES . '/context/service_ContextGame.php';
require_once MA_SVC_DB . '/service_dbPlayers.php';
require_once MA_SERVICES . '/workflows/WorkFlow_Handicaps.php';

session_start();
$auth = ma_api_require_auth();
$in = ma_json_in();

try {
    // 1. Load Context
    $gc = ServiceContextGame::getGameContext();
    $game = $gc['game'];
    $ggid = (string)($gc['ggid'] ?? '');

    if ($ggid === '') throw new RuntimeException("No active game context.");

    // 2. Validate Inputs
    $player = $in['player'] ?? [];
    $tee = $in['selectedTee'] ?? [];
    
    $ghin = trim((string)($player['ghin'] ?? $player['playerGHIN'] ?? ''));
    if ($ghin === '') throw new RuntimeException("Missing player GHIN.");

    // Calculate Baseline PH (Pass-A logic: PH = CH * Allowance)
    $ch = (int)($tee['playerCH'] ?? 0);
    $allowance = (float)($game['dbGames_Allowance'] ?? 100);
    $ph = (int)round($ch * ($allowance / 100.0));

    // 3. Prepare DB Record
    // We use the HI and CH calculated in Step 2 (getTeeSets)
    $dbRecord = [
        'dbPlayers_GGID'       => $ggid,
        'dbPlayers_PlayerGHIN' => $ghin,
        'dbPlayers_Name'       => trim((string)($player['name'] ?? '')),
        'dbPlayers_FName'      => trim((string)($player['fname'] ?? '')),
        'dbPlayers_LName'      => trim((string)($player['lname'] ?? '')),
        'dbPlayers_Gender'     => trim((string)($player['gender'] ?? '')),
        'dbPlayers_ClubID'     => trim((string)($player['clubId'] ?? '')),
        'dbPlayers_ClubName'   => trim((string)($player['clubName'] ?? '')),
        
        // Handicap Data from Selection
        'dbPlayers_TeeSetID'   => (string)($tee['teeSetID'] ?? ''),
        'dbPlayers_TeeSetName' => (string)($tee['teeSetName'] ?? ''),
        'dbPlayers_HI'         => (string)($in['hi'] ?? '0.0'), // Passed from getTeeSets response
        'dbPlayers_CH'         => (string)$ch,
        
        // Baseline PH (Pass-A)
        'dbPlayers_PH'         => (string)$ph,
        'dbPlayers_SO'         => '0'
    ];

    // 4. Save to DB
    ServiceDbPlayers::upsertPlayer($dbRecord);

    // 5. Pass-B skipped for new player (Trigger-1)

    ma_respond(200, ['ok' => true, 'message' => 'Player saved.']);

} catch (Throwable $e) {
    error_log("[API savePlayer] " . $e->getMessage());
    ma_respond(500, ['ok' => false, 'message' => $e->getMessage()]);
}