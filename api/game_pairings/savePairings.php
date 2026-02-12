<?php
// /public_html/api/game_pairings/savePairings.php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/context/service_ContextUser.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbGames.php";

header("Content-Type: application/json; charset=utf-8");

function ma_pad3($v): string {
  $s = preg_replace('/\D+/', '', strval($v ?? ''));
  if ($s === '') $s = '0';
  return str_pad($s, 3, '0', STR_PAD_LEFT);
}

function ma_normFlightPos($v): string {
  $s = strtoupper(trim(strval($v ?? '')));
  if ($s === '1') return 'A';
  if ($s === '2') return 'B';
  return ($s === 'A' || $s === 'B') ? $s : '';
}

function ma_randGameKey(int $len = 6): string {
  $alphabet = str_split('ABCDEFGHJKLMNPQRSTUVWXYZ123456789'); // no I, O, 0
  $out = '';
  for ($i = 0; $i < $len; $i++) {
    $out .= $alphabet[random_int(0, count($alphabet) - 1)];
  }
  return $out;
}

try {
  $pdo = Db::pdo();

  $uc = ServiceUserContext::getUserContext();
  if (!$uc || empty($uc['ok'])) {
    echo json_encode(['ok' => false, 'message' => 'Not signed in.']);
    exit;
  }

  $raw = file_get_contents('php://input');
  $in = json_decode($raw ?: '{}', true);
  if (!is_array($in)) $in = [];

  $ggid = strval($in['ggid'] ?? ($_SESSION['SessionStoredGGID'] ?? ''));
  if ($ggid === '') {
    Logger::error('PAIRINGS_SAVE_FAIL', ['err' => 'missing ggid']);
    echo json_encode(['ok' => false, 'message' => 'Missing GGID.']);
    exit;
  }

  // Guard: prevent saving to a different GGID than the session context (non-destructive)
  $sessionGGID = strval($_SESSION['SessionStoredGGID'] ?? '');
  if ($sessionGGID !== '' && $sessionGGID !== $ggid) {
    Logger::warn('PAIRINGS_SAVE_GGID_MISMATCH', ['ggid' => $ggid, 'sessionGGID' => $sessionGGID, 'userGHIN' => $uc['userGHIN'] ?? '']);
    echo json_encode(['ok' => false, 'message' => 'Game context mismatch (GGID).']);
    exit;
  }

  $assignments = $in['assignments'] ?? [];
  if (!is_array($assignments)) $assignments = [];

  // Load game (for competition rule)
  $game = ServiceDbGames::getGameByGGID($pdo, $ggid);
  $competition = strval($game['dbGames_Competition'] ?? '');
  $isPairPair = ($competition === 'PairPair');

  // Map current player rows by GHIN so we can upsert full rows without losing fields.
  $rows = ServiceDbPlayers::getGamePlayers($pdo, (int)$ggid);
  $byGHIN = [];
  foreach ($rows as $r) {
    $k = strval($r['dbPlayers_PlayerGHIN'] ?? '');
    if ($k !== '') $byGHIN[$k] = $r;
  }

  $updated = 0;
  foreach ($assignments as $a) {
    if (!is_array($a)) continue;
    $playerGHIN = strval($a['playerGHIN'] ?? '');
    if ($playerGHIN === '' || empty($byGHIN[$playerGHIN])) continue;

    $row = $byGHIN[$playerGHIN];

    $pairingId  = ma_pad3($a['pairingId'] ?? ($row['dbPlayers_PairingID'] ?? '000'));
    $pairingPos = strval($a['pairingPos'] ?? ($row['dbPlayers_PairingPos'] ?? ''));

    $flightId   = trim(strval($a['flightId'] ?? ($row['dbPlayers_FlightID'] ?? '')));
    $flightPos  = ma_normFlightPos($a['flightPos'] ?? ($row['dbPlayers_FlightPos'] ?? ''));

    $teeTime    = trim(strval($a['teeTime'] ?? ($row['dbPlayers_TeeTime'] ?? '')));
    $startHole  = trim(strval($a['startHole'] ?? ($row['dbPlayers_StartHole'] ?? '')));
    $startHoleS = trim(strval($a['startHoleSuffix'] ?? ($row['dbPlayers_StartHoleSuffix'] ?? '')));

    // Canonical normalization rules
    if ($pairingId === '000') {
      $pairingPos = '';
      $flightId = '';
      $flightPos = '';
      $teeTime = '';
      $startHole = '';
      $startHoleS = '';
      $row['dbPlayers_GameKey'] = '';
    } else {
      if ($isPairPair) {
        // PairPair: schedule & gameKey are flight-scoped; unmatched pairings are unscheduled.
        if ($flightId === '') {
          $flightPos = '';
          $teeTime = '';
          $startHole = '';
          $startHoleS = '';
          $row['dbPlayers_GameKey'] = '';
        }
      } else {
        // PairField: flight is ignored.
        $flightId = '';
        $flightPos = '';
      }
    }

    $row['dbPlayers_PairingID'] = $pairingId;
    $row['dbPlayers_PairingPos'] = $pairingPos;
    $row['dbPlayers_FlightID'] = $flightId;
    $row['dbPlayers_FlightPos'] = $flightPos;
    $row['dbPlayers_TeeTime'] = $teeTime;
    $row['dbPlayers_StartHole'] = $startHole;
    $row['dbPlayers_StartHoleSuffix'] = $startHoleS;

    ServiceDbPlayers::upsertGamePlayer($pdo, $row);
    $updated++;
  }

  // Reload and enforce post-normalization inheritance (schedule + gameKey)
  $rows2 = ServiceDbPlayers::getGamePlayers($pdo, (int)$ggid);

  // Helper maps for schedule resolution
  $pairingSched = [];
  $flightSched = [];
  $pairingKey = [];
  $flightKey = [];

  foreach ($rows2 as $r) {
    $pid = ma_pad3($r['dbPlayers_PairingID'] ?? '000');
    $fid = trim(strval($r['dbPlayers_FlightID'] ?? ''));
    $k = trim(strval($r['dbPlayers_GameKey'] ?? ''));

    if ($pid !== '000' && !isset($pairingSched[$pid])) {
      $tt = trim(strval($r['dbPlayers_TeeTime'] ?? ''));
      $sh = trim(strval($r['dbPlayers_StartHole'] ?? ''));
      $ss = trim(strval($r['dbPlayers_StartHoleSuffix'] ?? ''));
      if ($tt !== '' || $sh !== '' || $ss !== '') $pairingSched[$pid] = [$tt, $sh, $ss];
    }
    if ($fid !== '' && !isset($flightSched[$fid])) {
      $tt = trim(strval($r['dbPlayers_TeeTime'] ?? ''));
      $sh = trim(strval($r['dbPlayers_StartHole'] ?? ''));
      $ss = trim(strval($r['dbPlayers_StartHoleSuffix'] ?? ''));
      if ($tt !== '' || $sh !== '' || $ss !== '') $flightSched[$fid] = [$tt, $sh, $ss];
    }

    if ($pid !== '000' && $k !== '' && !isset($pairingKey[$pid])) $pairingKey[$pid] = $k;
    if ($fid !== '' && $k !== '' && !isset($flightKey[$fid])) $flightKey[$fid] = $k;
  }

  // Ensure keys exist for any non-empty container
  if ($isPairPair) {
    foreach ($rows2 as &$r) {
      $fid = trim(strval($r['dbPlayers_FlightID'] ?? ''));
      $pid = ma_pad3($r['dbPlayers_PairingID'] ?? '000');
      if ($pid === '000' || $fid === '') {
        $r['dbPlayers_GameKey'] = '';
      } else {
        if (!isset($flightKey[$fid])) $flightKey[$fid] = ma_randGameKey();
        $r['dbPlayers_GameKey'] = $flightKey[$fid];
      }

      // Flight-scoped schedule (unmatched => blank)
      if ($fid === '') {
        $r['dbPlayers_TeeTime'] = '';
        $r['dbPlayers_StartHole'] = '';
        $r['dbPlayers_StartHoleSuffix'] = '';
      } else {
        $sched = $flightSched[$fid] ?? ['', '', ''];
        $r['dbPlayers_TeeTime'] = $sched[0];
        $r['dbPlayers_StartHole'] = $sched[1];
        $r['dbPlayers_StartHoleSuffix'] = $sched[2];
      }
    }
    unset($r);
  } else {
    foreach ($rows2 as &$r) {
      $pid = ma_pad3($r['dbPlayers_PairingID'] ?? '000');
      if ($pid === '000') {
        $r['dbPlayers_GameKey'] = '';
        $r['dbPlayers_TeeTime'] = '';
        $r['dbPlayers_StartHole'] = '';
        $r['dbPlayers_StartHoleSuffix'] = '';
      } else {
        if (!isset($pairingKey[$pid])) $pairingKey[$pid] = ma_randGameKey();
        $r['dbPlayers_GameKey'] = $pairingKey[$pid];

        $sched = $pairingSched[$pid] ?? ['', '', ''];
        $r['dbPlayers_TeeTime'] = $sched[0];
        $r['dbPlayers_StartHole'] = $sched[1];
        $r['dbPlayers_StartHoleSuffix'] = $sched[2];
      }
      // Flight fields ignored in PairField
      $r['dbPlayers_FlightID'] = '';
      $r['dbPlayers_FlightPos'] = '';
    }
    unset($r);
  }

  // Persist inheritance changes (only where needed)
  $final = [];
  foreach ($rows2 as $r) {
    ServiceDbPlayers::upsertGamePlayer($pdo, $r);
    $final[] = $r;
  }

  Logger::info('PAIRINGS_SAVE_OK', ['ggid' => $ggid, 'updated' => $updated, 'competition' => $competition, 'userGHIN' => $uc['userGHIN'] ?? '']);
  echo json_encode(['ok' => true, 'payload' => ['players' => $final]]);
} catch (Throwable $e) {
  Logger::error('PAIRINGS_SAVE_EXCEPTION', ['err' => $e->getMessage()]);
  echo json_encode(['ok' => false, 'message' => 'Server error saving pairings.']);
}
