<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ProcessPairings.php
// Pairing normalization, schedule inheritance, and two-pass save orchestration.
// Called by savePairings.php and any future pairing-related API.

require_once MA_SVC_DB . "/service_dbPlayers.php";

final class ServiceProcessPairings
{
  // -----------------------------
  // Public API
  // -----------------------------

  /**
   * Full two-pass pairing save.
   * Pass 1: Apply and persist normalized assignments.
   * Pass 2: Reload, enforce schedule + PlayerKey inheritance, persist again.
   * Returns the final player list.
   */
  public static function savePairings(string $ggid, array $assignments, bool $isPairPair): array
  {
    // Load current player rows — scoped to this game only
    $rows = ServiceDbPlayers::getGamePlayers($ggid);
    $byGHIN = self::indexByGHIN($rows);

    // Pass 1 — normalize and persist each assignment
    foreach ($assignments as $a) {
      if (!is_array($a)) continue;
      $playerGHIN = strval($a['playerGHIN'] ?? '');
      if ($playerGHIN === '' || empty($byGHIN[$playerGHIN])) continue;

      $normalized = self::normalizeAssignment($a, $byGHIN[$playerGHIN], $isPairPair);
      ServiceDbPlayers::upsertGamePlayer($ggid, $playerGHIN, $normalized);
    }

    // Pass 2 — reload, build schedule maps, enforce inheritance, persist
    $rows2   = ServiceDbPlayers::getGamePlayers($ggid);
    $maps    = self::buildScheduleMaps($rows2);
    $final   = self::applyInheritance($rows2, $isPairPair, $maps);

    foreach ($final as $r) {
      $rGhin = strval($r['dbPlayers_PlayerGHIN'] ?? '');
      if ($rGhin === '') continue;
      ServiceDbPlayers::upsertGamePlayer($ggid, $rGhin, $r);
    }

    return $final;
  }

  // -----------------------------
  // Normalization
  // -----------------------------

  /**
   * Apply canonical normalization rules to a single assignment.
   * Merges assignment values onto the existing DB row, then enforces rules.
   */
  public static function normalizeAssignment(array $a, array $row, bool $isPairPair): array
  {
    $pairingId  = self::pad3($a['pairingId']  ?? ($row['dbPlayers_PairingID']       ?? '000'));
    $pairingPos = strval($a['pairingPos']      ?? ($row['dbPlayers_PairingPos']      ?? ''));
    $flightId   = trim(strval($a['flightId']   ?? ($row['dbPlayers_FlightID']        ?? '')));
    $flightPos  = self::normFlightPos($a['flightPos'] ?? ($row['dbPlayers_FlightPos'] ?? ''));
    $teeTime    = trim(strval($a['teeTime']    ?? ($row['dbPlayers_TeeTime']         ?? '')));
    $startHole  = trim(strval($a['startHole']  ?? ($row['dbPlayers_StartHole']       ?? '')));
    $startHoleS = trim(strval($a['startHoleSuffix'] ?? ($row['dbPlayers_StartHoleSuffix'] ?? '')));
    $playerKey  = trim(strval($a['playerKey']  ?? ($row['dbPlayers_PlayerKey']       ?? '')));

    if ($pairingId === '000') {
      // Unassigned — clear all scheduling fields
      $pairingPos = '';
      $flightId   = '';
      $flightPos  = '';
      $teeTime    = '';
      $startHole  = '';
      $startHoleS = '';
      $playerKey  = '';
    } elseif ($isPairPair) {
      // PairPair: schedule and PlayerKey are flight-scoped
      if ($flightId === '') {
        $flightPos  = '';
        $teeTime    = '';
        $startHole  = '';
        $startHoleS = '';
        $playerKey  = '';
      }
    } else {
      // PairField: flight fields are not used
      $flightId  = '';
      $flightPos = '';
    }

    $row['dbPlayers_PairingID']         = $pairingId;
    $row['dbPlayers_PairingPos']        = $pairingPos;
    $row['dbPlayers_FlightID']          = $flightId;
    $row['dbPlayers_FlightPos']         = $flightPos;
    $row['dbPlayers_TeeTime']           = $teeTime;
    $row['dbPlayers_StartHole']         = $startHole;
    $row['dbPlayers_StartHoleSuffix']   = $startHoleS;
    $row['dbPlayers_PlayerKey']         = $playerKey;

    return $row;
  }

  // -----------------------------
  // Schedule inheritance
  // -----------------------------

  /**
   * Build pairing/flight schedule and PlayerKey maps from a player list.
   * Returns: [ pairingSched, flightSched, pairingKey, flightKey ]
   */
  public static function buildScheduleMaps(array $players): array
  {
    $pairingSched = [];
    $flightSched  = [];
    $pairingKey   = [];
    $flightKey    = [];

    foreach ($players as $r) {
      $pid = self::pad3($r['dbPlayers_PairingID'] ?? '000');
      $fid = trim(strval($r['dbPlayers_FlightID'] ?? ''));
      $k   = trim(strval($r['dbPlayers_PlayerKey'] ?? ''));
      $tt  = trim(strval($r['dbPlayers_TeeTime'] ?? ''));
      $sh  = trim(strval($r['dbPlayers_StartHole'] ?? ''));
      $ss  = trim(strval($r['dbPlayers_StartHoleSuffix'] ?? ''));

      if ($pid !== '000' && !isset($pairingSched[$pid])) {
        if ($tt !== '' || $sh !== '' || $ss !== '') {
          $pairingSched[$pid] = [$tt, $sh, $ss];
        }
      }
      if ($fid !== '' && !isset($flightSched[$fid])) {
        if ($tt !== '' || $sh !== '' || $ss !== '') {
          $flightSched[$fid] = [$tt, $sh, $ss];
        }
      }
      if ($pid !== '000' && $k !== '' && !isset($pairingKey[$pid])) $pairingKey[$pid] = $k;
      if ($fid !== ''    && $k !== '' && !isset($flightKey[$fid]))  $flightKey[$fid]  = $k;
    }

    return compact('pairingSched', 'flightSched', 'pairingKey', 'flightKey');
  }

  /**
   * Enforce schedule and PlayerKey inheritance across all players.
   * PairPair: inherit from flight scope.
   * PairField: inherit from pairing scope; clear flight fields.
   */
  public static function applyInheritance(array $players, bool $isPairPair, array $maps): array
  {
    $pairingSched = $maps['pairingSched'] ?? [];
    $flightSched  = $maps['flightSched']  ?? [];
    $pairingKey   = $maps['pairingKey']   ?? [];
    $flightKey    = $maps['flightKey']    ?? [];

    foreach ($players as &$r) {
      if ($isPairPair) {
        $fid = trim(strval($r['dbPlayers_FlightID'] ?? ''));
        if ($fid === '') {
          $r['dbPlayers_TeeTime']           = '';
          $r['dbPlayers_StartHole']         = '';
          $r['dbPlayers_StartHoleSuffix']   = '';
          $r['dbPlayers_PlayerKey']         = '';
        } else {
          $sched = $flightSched[$fid] ?? ['', '', ''];
          $r['dbPlayers_TeeTime']           = $sched[0];
          $r['dbPlayers_StartHole']         = $sched[1];
          $r['dbPlayers_StartHoleSuffix']   = $sched[2];
          $r['dbPlayers_PlayerKey']         = $flightKey[$fid] ?? '';
        }
      } else {
        $pid = self::pad3($r['dbPlayers_PairingID'] ?? '000');
        if ($pid === '000') {
          $r['dbPlayers_TeeTime']           = '';
          $r['dbPlayers_StartHole']         = '';
          $r['dbPlayers_StartHoleSuffix']   = '';
          $r['dbPlayers_PlayerKey']         = '';
        } else {
          $sched = $pairingSched[$pid] ?? ['', '', ''];
          $r['dbPlayers_TeeTime']           = $sched[0];
          $r['dbPlayers_StartHole']         = $sched[1];
          $r['dbPlayers_StartHoleSuffix']   = $sched[2];
          $r['dbPlayers_PlayerKey']         = $pairingKey[$pid] ?? '';
        }
        // PairField: flight fields are not used
        $r['dbPlayers_FlightID']  = '';
        $r['dbPlayers_FlightPos'] = '';
      }
    }
    unset($r);

    return $players;
  }

  // -----------------------------
  // Private helpers
  // -----------------------------

  private static function indexByGHIN(array $rows): array
  {
    $out = [];
    foreach ($rows as $r) {
      $k = strval($r['dbPlayers_PlayerGHIN'] ?? '');
      if ($k !== '') $out[$k] = $r;
    }
    return $out;
  }

  public static function pad3($v): string
  {
    $s = preg_replace('/\D+/', '', strval($v ?? ''));
    if ($s === '') $s = '0';
    return str_pad($s, 3, '0', STR_PAD_LEFT);
  }

  public static function normFlightPos($v): string
  {
    $s = strtoupper(trim(strval($v ?? '')));
    if ($s === '1') return 'A';
    if ($s === '2') return 'B';
    return ($s === 'A' || $s === 'B') ? $s : '';
  }
}