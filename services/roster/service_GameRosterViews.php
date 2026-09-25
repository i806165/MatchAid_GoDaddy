<?php
declare(strict_types=1);
// /public_html/services/roster/service_GameRosterViews.php
//
// PHP-canonical source for game_summary.js's roster "views" — By Player,
// By Pairing, By Playing Group — following the same pattern already
// established by services/scoring/service_ScoreCard.php: this service owns
// ALL grouping/sorting/labeling, callers get back fully shaped, sorted,
// display-ready structure, never raw rows. Rendering (HTML, plain text,
// CSV — whatever a given caller needs) stays the caller's own concern.
//
// Exposes buildByPlayerView() / buildByPairingView() / buildByPlayingGroupView()
// (Game Summary page + "Send Tee Sheet" messaging) and buildGameTeeSheetView()
// (Game Tee Sheet Excel export, via workflow_TeeSheet.php). The tee sheet
// view is built on the same sort/grouping as buildByPlayingGroupView(), so
// all of these stay in agreement.
//
// Ported faithfully from game_summary.js's normalizeRosterForPlayingGroupDisplay(),
// partitionByFlight(), and groupRosterForPlayingGroup() — same sort
// precedence, same grouping rules. Previously lived as free functions in
// ma_SharedBusLogic.php (ma_normalizeRosterForPlayingGroupDisplay() etc.);
// moved here because this is genuinely large, domain-specific
// normalization logic — not a small stable cross-page rule like
// ma_SharedBusLogic.php's own isDimensionActive()-adjacent functions —
// and deserves its own service, the same way ServiceScoreCard has its own
// file rather than living inside a general "shared logic" file.

require_once MA_SERVICES . "/shared/ma_SharedBusLogic.php"; // ma__safeStr()

final class ServiceGameRosterViews
{
  // ── Private local helpers — moved here from ma_SharedBusLogic.php's
  // ma__ prefix, since they're only used by this view's normalization
  // logic, not by anything else that stayed in that file. ────────────

  private static function safeStr($v): string { return (string)($v ?? ''); }

  private static function valueOrDash($v): string {
    $s = trim(self::safeStr($v));
    return $s !== '' ? $s : '—';
  }

  // Always parse, then re-format to the zero-padded "07:36 AM" form —
  // stored tee times vary ("07:36 AM" from slotting, "7:36 AM" on older
  // rows, "08:30:00" for dbGames_PlayTime), and passing AM/PM text through
  // unchanged let the same game display two styles. Unparseable text is
  // returned as-is; empty / "—" still yields "—".
  private static function formatTimeAmPm(string $str): string {
    $s = trim($str);
    if ($s === '' || $s === '—') return '—';
    $mins = self::parseTimeToMinutes($s);
    return $mins === null ? $s : self::formatMinutesAmPm($mins);
  }

  private static function formatMinutesAmPm(int $mins): string {
    $h = intdiv($mins, 60) % 24;
    $m = $mins % 60;
    $ampm = $h >= 12 ? 'PM' : 'AM';
    $h = $h % 12;
    if ($h === 0) $h = 12;
    return sprintf('%02d:%02d %s', $h, $m, $ampm);
  }

  private static function getFormattedStartHole(array $player, array $game): string {
    $isShotgun = self::safeStr($game['dbGames_TOMethod'] ?? '') === 'ShotGun';
    $startHole = self::safeStr($player['dbPlayers_StartHole'] ?? '');
    $suffix    = self::safeStr($player['dbPlayers_StartHoleSuffix'] ?? '');
    if ($isShotgun && $suffix !== '') $startHole .= $suffix;
    return $startHole;
  }

  private static function resolveFlightName(string $flightKey, array $game): string {
    if ($flightKey === '' || $flightKey === '—') return $flightKey;
    $raw = $game['dbGames_FlightConfig'] ?? null;
    if (!$raw) return $flightKey;
    $config = is_string($raw) ? json_decode($raw, true) : $raw;
    if (!is_array($config) || empty($config['flights']) || !is_array($config['flights'])) return $flightKey;
    foreach ($config['flights'] as $f) {
      if (($f['id'] ?? null) === $flightKey) return (string)($f['name'] ?? $flightKey);
    }
    return $flightKey;
  }

  private static function parseTimeToMinutes(string $timeText): ?int {
    $raw = trim($timeText);
    if ($raw === '') return null;
    if (preg_match('/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])\b/', $raw, $m)) {
      $hour = (int)$m[1]; $minute = (int)$m[2];
      if ($hour === 12) $hour = 0;
      if (strtoupper($m[3]) === 'PM') $hour += 12;
      return $hour * 60 + $minute;
    }
    if (preg_match('/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:$|\s)/', $raw, $m)) {
      $hour = (int)$m[1]; $minute = (int)$m[2];
      if ($hour >= 0 && $hour <= 23 && $minute >= 0 && $minute <= 59) return $hour * 60 + $minute;
    }
    return null;
  }

  private static function numericOrTextCompare($a, $b): int {
    $aNum = is_numeric($a) ? (float)$a : null;
    $bNum = is_numeric($b) ? (float)$b : null;
    if ($aNum !== null && $bNum !== null) return $aNum <=> $bNum;
    return strnatcasecmp((string)$a, (string)$b);
  }

  // ── Sort — faithful port of normalizeRosterForPlayingGroupDisplay() ──

  private static function sortForPlayingGroup(array $players, array $game, bool $teamsActive, bool $flightsActive): array {
    $pairPair   = self::safeStr($game['dbGames_Competition'] ?? '') === 'PairPair';
    $toMethod   = trim(self::safeStr($game['dbGames_TOMethod'] ?? ''));
    $isShotgun  = $toMethod === 'ShotGun';
    $isTeeTimes = $toMethod === 'TeeTimes';

    $flightSortValue = fn(array $p) => trim(self::safeStr($p['dbPlayers_FlightKey'] ?? '')) ?: '—';
    $teamSortValue   = fn(array $p) => trim(self::safeStr($p['dbPlayers_TeamKey']   ?? '')) ?: '—';
    $holeSortValue   = function ($v) {
      $s = trim(self::safeStr($v));
      return is_numeric($s) ? (float)$s : 999;
    };
    $suffixSortValue = function ($v) {
      $s = strtoupper(trim(self::safeStr($v)));
      return $s !== '' ? $s : 'ZZZ';
    };

    $copy = array_values($players);

    usort($copy, function (array $a, array $b) use (
      $pairPair, $isShotgun, $isTeeTimes, $teamsActive, $flightsActive,
      $flightSortValue, $teamSortValue, $holeSortValue, $suffixSortValue
    ): int {

      if ($flightsActive) {
        $flA = $flightSortValue($a); $flB = $flightSortValue($b);
        if ($flA !== $flB) return strnatcasecmp($flA, $flB);
      }

      if ($isTeeTimes) {
        $tA = self::parseTimeToMinutes(self::safeStr($a['dbPlayers_TeeTime'] ?? '')) ?? 9999;
        $tB = self::parseTimeToMinutes(self::safeStr($b['dbPlayers_TeeTime'] ?? '')) ?? 9999;
        if ($tA !== $tB) return $tA <=> $tB;

        // Split tees: same time on holes 1 and 10 — order by hole, then
        // suffix, rather than falling through to the (random) PlayerKey.
        // Matches game_slotting.js's compareSlotMeta().
        $holeA = $holeSortValue($a['dbPlayers_StartHole'] ?? ''); $holeB = $holeSortValue($b['dbPlayers_StartHole'] ?? '');
        if ($holeA !== $holeB) return $holeA <=> $holeB;
        $sufA = $suffixSortValue($a['dbPlayers_StartHoleSuffix'] ?? ''); $sufB = $suffixSortValue($b['dbPlayers_StartHoleSuffix'] ?? '');
        if ($sufA !== $sufB) return strcmp($sufA, $sufB);
      }

      if ($isShotgun) {
        $holeA = $holeSortValue($a['dbPlayers_StartHole'] ?? ''); $holeB = $holeSortValue($b['dbPlayers_StartHole'] ?? '');
        if ($holeA !== $holeB) return $holeA <=> $holeB;
        $sufA = $suffixSortValue($a['dbPlayers_StartHoleSuffix'] ?? ''); $sufB = $suffixSortValue($b['dbPlayers_StartHoleSuffix'] ?? '');
        if ($sufA !== $sufB) return strcmp($sufA, $sufB);
      }

      $groupA = trim(self::safeStr($a['dbPlayers_PlayerKey'] ?? '')) ?: '—';
      $groupB = trim(self::safeStr($b['dbPlayers_PlayerKey'] ?? '')) ?: '—';
      if ($groupA !== $groupB) return strnatcasecmp($groupA, $groupB);

      if ($pairPair) {
        $matchA = trim(self::safeStr($a['dbPlayers_MatchID'] ?? '')) ?: '—';
        $matchB = trim(self::safeStr($b['dbPlayers_MatchID'] ?? '')) ?: '—';
        if ($matchA !== $matchB) return strnatcasecmp($matchA, $matchB);

        if ($teamsActive) {
          $tmA = $teamSortValue($a); $tmB = $teamSortValue($b);
          if ($tmA !== $tmB) return self::numericOrTextCompare($tmA, $tmB);
        } else {
          $sideA = trim(self::safeStr($a['dbPlayers_MatchPos'] ?? '')) ?: '—';
          $sideB = trim(self::safeStr($b['dbPlayers_MatchPos'] ?? '')) ?: '—';
          if ($sideA !== $sideB) return self::numericOrTextCompare($sideA, $sideB);
        }
      }

      $pairA = trim(self::safeStr($a['dbPlayers_PairingID'] ?? '')) ?: '—';
      $pairB = trim(self::safeStr($b['dbPlayers_PairingID'] ?? '')) ?: '—';
      if ($pairA !== $pairB) return strnatcasecmp($pairA, $pairB);

      $posA = trim(self::safeStr($a['dbPlayers_PairingPos'] ?? '')) ?: '999';
      $posB = trim(self::safeStr($b['dbPlayers_PairingPos'] ?? '')) ?: '999';
      if ($posA !== $posB) return self::numericOrTextCompare($posA, $posB);

      if (!$pairPair && $teamsActive) {
        $tmA = $teamSortValue($a); $tmB = $teamSortValue($b);
        if ($tmA !== $tmB) return self::numericOrTextCompare($tmA, $tmB);
      }

      $lnA = trim(self::safeStr($a['dbPlayers_LName'] ?? ''));
      $lnB = trim(self::safeStr($b['dbPlayers_LName'] ?? ''));
      if ($lnA !== $lnB) return strcmp($lnA, $lnB);

      $nmA = trim(self::safeStr($a['dbPlayers_Name'] ?? ''));
      $nmB = trim(self::safeStr($b['dbPlayers_Name'] ?? ''));
      return strcmp($nmA, $nmB);
    });

    return $copy;
  }

  // ── Partition — faithful port of partitionByFlight() ────────────────

  private static function partitionByFlight(array $sortedPlayers, array $game, bool $flightsActive): array {
    if (!$flightsActive) {
      return [['flightKey' => '', 'flightLabel' => '', 'players' => $sortedPlayers]];
    }

    $groups     = [];
    $currentKey = null;

    foreach ($sortedPlayers as $p) {
      $key = trim(self::safeStr($p['dbPlayers_FlightKey'] ?? '')) ?: '—';
      if ($currentKey === null || $currentKey !== $key) {
        $groups[] = [
          'flightKey'   => $key,
          'flightLabel' => $key === '—' ? 'Unassigned' : self::resolveFlightName($key, $game),
          'players'     => [],
        ];
        $currentKey = $key;
      }
      // Index directly rather than holding a reference to "current" — a
      // PHP reference here would alias every entry to the same variable,
      // silently corrupting earlier groups the moment a new one starts.
      $groups[count($groups) - 1]['players'][] = $p;
    }

    return $groups;
  }

  // ── Group — faithful port of groupRosterForPlayingGroup() ───────────

  private static function groupByPlayerKey(array $sortedPlayers, bool $pairPair): array {
    $groupMap = [];

    foreach ($sortedPlayers as $p) {
      $playerKey = trim(self::safeStr($p['dbPlayers_PlayerKey'] ?? '')) ?: '—';
      $matchId   = $pairPair ? (trim(self::safeStr($p['dbPlayers_MatchID']  ?? '')) ?: '—') : '';
      $matchPos  = $pairPair ? (trim(self::safeStr($p['dbPlayers_MatchPos'] ?? '')) ?: '—') : '';
      $pairingId = trim(self::safeStr($p['dbPlayers_PairingID'] ?? '')) ?: '—';

      if (!isset($groupMap[$playerKey])) {
        $groupMap[$playerKey] = [
          'playerKey' => $playerKey, 'matchId' => $matchId,
          'matchPos'  => $matchPos,  'pairingId' => $pairingId,
          'players'   => [],
        ];
      }
      $groupMap[$playerKey]['players'][] = $p;
    }

    return array_values($groupMap);
  }

  /**
   * buildByPlayerView(players)
   *
   * Faithful port of game_summary.js's normalizeRosterForPlayerDisplay() —
   * simple last-name/first-name/GHIN sort, no grouping.
   *
   * @param  array $players  db_Players rows.
   * @return array{players: array}
   */
  public static function buildByPlayerView(array $players): array {
    $copy = array_values($players);

    usort($copy, function (array $a, array $b): int {
      $lnA = trim(self::safeStr($a['dbPlayers_LName'] ?? ''));
      $lnB = trim(self::safeStr($b['dbPlayers_LName'] ?? ''));
      if ($lnA !== $lnB) return strcmp($lnA, $lnB);

      $nmA = trim(self::safeStr($a['dbPlayers_Name'] ?? ''));
      $nmB = trim(self::safeStr($b['dbPlayers_Name'] ?? ''));
      if ($nmA !== $nmB) return strcmp($nmA, $nmB);

      $ghA = trim(self::safeStr($a['dbPlayers_PlayerGHIN'] ?? ''));
      $ghB = trim(self::safeStr($b['dbPlayers_PlayerGHIN'] ?? ''));
      return strcmp($ghA, $ghB);
    });

    return ['players' => $copy];
  }

  // ── Sort — faithful port of normalizeRosterForPairingDisplay() ──────

  private static function sortForPairing(array $players, array $game, bool $teamsActive, bool $flightsActive): array {
    $pairPair = self::safeStr($game['dbGames_Competition'] ?? '') === 'PairPair';

    $flightSortValue = fn(array $p) => trim(self::safeStr($p['dbPlayers_FlightKey'] ?? '')) ?: '—';
    $teamSortValue   = fn(array $p) => trim(self::safeStr($p['dbPlayers_TeamKey']   ?? '')) ?: '—';

    $copy = array_values($players);

    usort($copy, function (array $a, array $b) use ($pairPair, $teamsActive, $flightsActive, $flightSortValue, $teamSortValue): int {
      if ($flightsActive) {
        $flA = $flightSortValue($a); $flB = $flightSortValue($b);
        if ($flA !== $flB) return strnatcasecmp($flA, $flB);
      }

      if ($pairPair) {
        $matchA = trim(self::safeStr($a['dbPlayers_MatchID'] ?? '')) ?: '—';
        $matchB = trim(self::safeStr($b['dbPlayers_MatchID'] ?? '')) ?: '—';
        if ($matchA !== $matchB) return strnatcasecmp($matchA, $matchB);

        if ($teamsActive) {
          $tmA = $teamSortValue($a); $tmB = $teamSortValue($b);
          if ($tmA !== $tmB) return self::numericOrTextCompare($tmA, $tmB);
        } else {
          $sideA = trim(self::safeStr($a['dbPlayers_MatchPos'] ?? '')) ?: '—';
          $sideB = trim(self::safeStr($b['dbPlayers_MatchPos'] ?? '')) ?: '—';
          if ($sideA !== $sideB) return self::numericOrTextCompare($sideA, $sideB);
        }

        $lnA = trim(self::safeStr($a['dbPlayers_LName'] ?? ''));
        $lnB = trim(self::safeStr($b['dbPlayers_LName'] ?? ''));
        if ($lnA !== $lnB) return strcmp($lnA, $lnB);

        return strcmp(trim(self::safeStr($a['dbPlayers_Name'] ?? '')), trim(self::safeStr($b['dbPlayers_Name'] ?? '')));
      }

      if ($teamsActive) {
        $tmA = $teamSortValue($a); $tmB = $teamSortValue($b);
        if ($tmA !== $tmB) return self::numericOrTextCompare($tmA, $tmB);
      }

      $pairA = trim(self::safeStr($a['dbPlayers_PairingID'] ?? '')) ?: '—';
      $pairB = trim(self::safeStr($b['dbPlayers_PairingID'] ?? '')) ?: '—';
      if ($pairA !== $pairB) return strnatcasecmp($pairA, $pairB);

      $posA = trim(self::safeStr($a['dbPlayers_PairingPos'] ?? '')) ?: '999';
      $posB = trim(self::safeStr($b['dbPlayers_PairingPos'] ?? '')) ?: '999';
      if ($posA !== $posB) return self::numericOrTextCompare($posA, $posB);

      $lnA = trim(self::safeStr($a['dbPlayers_LName'] ?? ''));
      $lnB = trim(self::safeStr($b['dbPlayers_LName'] ?? ''));
      if ($lnA !== $lnB) return strcmp($lnA, $lnB);

      return strcmp(trim(self::safeStr($a['dbPlayers_Name'] ?? '')), trim(self::safeStr($b['dbPlayers_Name'] ?? '')));
    });

    return $copy;
  }

  private static function resolveTeamName(string $teamKey, array $game): string {
    if ($teamKey === '' || $teamKey === '—') return $teamKey;
    $raw = $game['dbGames_TeamConfig'] ?? null;
    if (!$raw) return $teamKey;
    $config = is_string($raw) ? json_decode($raw, true) : $raw;
    if (!is_array($config) || empty($config['teams']) || !is_array($config['teams'])) return $teamKey;
    foreach ($config['teams'] as $t) {
      if (($t['id'] ?? null) === $teamKey) return (string)($t['name'] ?? $teamKey);
    }
    return $teamKey;
  }

  // Team name when Team is active, else "Side A/B" for PairPair, else ''.
  // Faithful port of pairingLabelPrefix().
  private static function pairingLabelPrefix(array $pairing, array $game, bool $teamsActive, bool $pairPair): string {
    $first = $pairing['players'][0] ?? [];
    if ($teamsActive) {
      return self::resolveTeamName(self::safeStr($first['dbPlayers_TeamKey'] ?? ''), $game);
    }
    if ($pairPair) {
      $side = trim(self::safeStr($first['dbPlayers_MatchPos'] ?? ''));
      return $side !== '' ? ('Side ' . $side) : '';
    }
    return '';
  }

  // Faithful port of computePairingAverages() — pre-formatted, same as
  // every numeric field in the ServiceScoreCard output contract this
  // service follows.
  private static function computePairingAverages(array $pairing): array {
    $sHI = 0.0; $sCH = 0.0; $sPH = 0.0;
    $cHI = 0; $cCH = 0; $cPH = 0;

    foreach ($pairing['players'] ?? [] as $p) {
      $hi = $p['dbPlayers_HI'] ?? null;
      if (is_numeric($hi)) { $sHI += (float)$hi; $cHI++; }
      $ch = $p['dbPlayers_CH'] ?? null;
      if (is_numeric($ch)) { $sCH += (float)$ch; $cCH++; }
      $ph = $p['dbPlayers_PH'] ?? null;
      if (is_numeric($ph)) { $sPH += (float)$ph; $cPH++; }
    }

    return [
      'avgHI' => $cHI ? number_format($sHI / $cHI, 1) : '0.0',
      'avgCH' => $cCH ? number_format($sCH / $cCH, 1) : '0.0',
      'avgPH' => $cPH ? number_format($sPH / $cPH, 1) : '0.0',
    ];
  }

  /**
   * buildByPairingView(players, game, teamsActive, flightsActive)
   *
   * Faithful port of normalizeRosterForPairingDisplay() +
   * buildPairingDesktopGroups() + pairingLabelPrefix() +
   * computePairingAverages(). PairPair: outer groups are Match, each
   * holding exactly two Pairing sub-groups. PairField: outer groups ARE
   * pairings (matchId null, exactly one nested pairing each) — same
   * shape either way so a renderer never needs two divergent code paths,
   * matching buildPairingDesktopGroups()'s own documented rationale.
   *
   * Flight-partitioned at the outer level — matches game_summary.js's
   * actual renderRosterByPairing(), which calls partitionByFlight()
   * BEFORE building Match/Pairing groups (Flight is the outermost visual
   * grouping in this view too, not just Playing Group's).
   *
   * Shape:
   *   [
   *     'flightGroups' => [
   *       [
   *         'flightKey'   => string,
   *         'flightLabel' => string,   // '' when flights aren't active
   *         'groups' => [
   *           [
   *             'key'      => string,
   *             'matchId'  => string|null,   // null outside PairPair
   *             'pairings' => [
   *               [
   *                 'pairingId'   => string,
   *                 'labelPrefix' => string,  // team name, "Side A/B", or ''
   *                 'players'     => array,   // sorted db_Players rows
   *                 'averages'    => ['avgHI'=>string,'avgCH'=>string,'avgPH'=>string],
   *               ], ...
   *             ],
   *           ], ...
   *         ],
   *       ], ...
   *     ],
   *   ]
   *
   * @param  array $players       db_Players rows.
   * @param  array $game          Game row.
   * @param  bool  $teamsActive   From ServiceDbEvents::isDimensionActive("team", ...).
   * @param  bool  $flightsActive From ServiceDbEvents::isDimensionActive("flight", ...).
   * @return array
   */
  public static function buildByPairingView(array $players, array $game, bool $teamsActive, bool $flightsActive): array {
    $pairPair = self::safeStr($game['dbGames_Competition'] ?? '') === 'PairPair';
    $sorted   = self::sortForPairing($players, $game, $teamsActive, $flightsActive);
    $flightPartitions = self::partitionByFlight($sorted, $game, $flightsActive);

    $flightGroups = [];
    foreach ($flightPartitions as $fp) {
      $flightGroups[] = [
        'flightKey'   => $fp['flightKey'],
        'flightLabel' => $fp['flightLabel'],
        'groups'      => self::buildMatchPairingGroups($fp['players'], $pairPair, $game, $teamsActive),
      ];
    }

    return ['flightGroups' => $flightGroups];
  }

  // Match/Pairing grouping for one flight's worth of already-sorted
  // players — extracted so buildByPairingView() can run it per flight
  // partition, matching game_summary.js's actual per-flight-group call
  // to buildPairingDesktopGroups(fg.players).
  private static function buildMatchPairingGroups(array $sorted, bool $pairPair, array $game, bool $teamsActive): array {
    $groups           = [];
    $currentGroupKey  = null;
    $currentPairingId = null;

    foreach ($sorted as $p) {
      $matchId   = $pairPair ? (trim(self::safeStr($p['dbPlayers_MatchID'] ?? '')) ?: '—') : null;
      $pairingId = trim(self::safeStr($p['dbPlayers_PairingID'] ?? '')) ?: '—';
      $groupKey  = $pairPair ? $matchId : $pairingId;

      if ($currentGroupKey === null || $currentGroupKey !== $groupKey) {
        $groups[] = ['key' => $groupKey, 'matchId' => $matchId, 'pairings' => []];
        $currentGroupKey  = $groupKey;
        $currentPairingId = null;
      }
      // Index directly rather than holding a reference to "current group"/
      // "current pairing" — nested references through an already-aliased
      // array element are exactly what corrupted ma_partitionByFlight()
      // earlier, and a second, subtler version of that same class of bug
      // showed up here in testing (PHP's copy-on-write separation on a
      // referenced-into array can silently detach the reference from the
      // real array). Direct index access has no aliasing to get wrong.
      $gi = count($groups) - 1;

      if ($currentPairingId === null || $currentPairingId !== $pairingId) {
        $groups[$gi]['pairings'][] = ['pairingId' => $pairingId, 'players' => []];
        $currentPairingId = $pairingId;
      }
      $pi = count($groups[$gi]['pairings']) - 1;

      $groups[$gi]['pairings'][$pi]['players'][] = $p;
    }

    // Second pass: attach labelPrefix/averages now that every pairing's
    // full player list is settled (both need the complete group, not a
    // running one — computing them inline in the loop above would see
    // partial player lists on the currently-open pairing). Index-based
    // here too, for the same reason as above, rather than a foreach-by-
    // reference this file has already gotten wrong twice.
    foreach ($groups as $gi => $group) {
      foreach ($group['pairings'] as $pi => $pairing) {
        $groups[$gi]['pairings'][$pi]['labelPrefix'] = self::pairingLabelPrefix($pairing, $game, $teamsActive, $pairPair);
        $groups[$gi]['pairings'][$pi]['averages']    = self::computePairingAverages($pairing);
      }
    }

    return $groups;
  }

  /**
   * buildByPlayingGroupView(players, game, teamsActive, flightsActive)
   *
   * Fully shaped, sorted, labeled By-Playing-Group structure — the PHP-
   * canonical replacement for game_summary.js's
   * normalizeRosterForPlayingGroupDisplay() + partitionByFlight() +
   * groupRosterForPlayingGroup() chain. One call, one implementation,
   * consumed identically by messaging (plain-text render) and, once
   * game_summary.js is rewritten, its own HTML/CSV render paths.
   *
   * Shape:
   *   [
   *     'flightGroups' => [
   *       [
   *         'flightKey'   => string,
   *         'flightLabel' => string,   // '' when flights aren't active
   *         'playingGroups' => [
   *           [
   *             'playerKey'        => string,
   *             'matchId'          => string,   // '' outside PairPair
   *             'matchPos'         => string,   // '' outside PairPair
   *             'pairingId'        => string,
   *             'teeTimeDisplay'   => string,   // formatted "H:MM AM/PM" or '—'
   *             'startHoleDisplay' => string,   // includes shotgun suffix, or '—'
   *             'players'          => array,    // raw db_Players rows, sorted order preserved
   *           ], ...
   *         ],
   *       ], ...
   *     ],
   *   ]
   *
   * @param  array $players       db_Players rows for this game.
   * @param  array $game          Game row.
   * @param  bool  $teamsActive   From ServiceDbEvents::isDimensionActive("team", ...).
   * @param  bool  $flightsActive From ServiceDbEvents::isDimensionActive("flight", ...).
   * @return array
   */
  public static function buildByPlayingGroupView(array $players, array $game, bool $teamsActive, bool $flightsActive): array {
    $pairPair = self::safeStr($game['dbGames_Competition'] ?? '') === 'PairPair';

    $sorted       = self::sortForPlayingGroup($players, $game, $teamsActive, $flightsActive);
    $flightGroups = self::partitionByFlight($sorted, $game, $flightsActive);

    $out = [];
    foreach ($flightGroups as $fg) {
      $playingGroups = [];
      foreach (self::groupByPlayerKey($fg['players'], $pairPair) as $group) {
        $first = $group['players'][0] ?? [];
        $playingGroups[] = [
          'playerKey'        => $group['playerKey'],
          'matchId'          => $group['matchId'],
          'matchPos'         => $group['matchPos'],
          'pairingId'        => $group['pairingId'],
          'teeTimeDisplay'   => self::formatTimeAmPm(self::valueOrDash($first['dbPlayers_TeeTime'] ?? '')),
          'startHoleDisplay' => self::valueOrDash(self::getFormattedStartHole($first, $game)),
          'players'          => $group['players'],
        ];
      }
      $out[] = [
        'flightKey'     => $fg['flightKey'],
        'flightLabel'   => $fg['flightLabel'],
        'playingGroups' => $playingGroups,
      ];
    }

    return ['flightGroups' => $out];
  }

  // ── Player name — "Last, First" ─────────────────────────────────────
  //
  // dbPlayers_Name holds "First Last"; dbPlayers_LName holds the last name
  // only. The first-name part is whatever precedes a trailing LName (case-
  // insensitive, on a word boundary), so "C. Ryan Haffey" / "Haffey" →
  // "Haffey, C. Ryan". When Name doesn't end with LName (e.g. "Bob Smith
  // Jr."), Name is displayed unchanged rather than guessed at.

  /** @return array{first: string, last: string, display: string} */
  private static function splitPlayerName(array $player): array {
    $name = trim(self::safeStr($player['dbPlayers_Name'] ?? ''));
    $last = trim(self::safeStr($player['dbPlayers_LName'] ?? ''));

    if ($last === '') return ['first' => '', 'last' => $name, 'display' => $name];
    if ($name === '') return ['first' => '', 'last' => $last, 'display' => $last];

    $nameLen = mb_strlen($name);
    $lastLen = mb_strlen($last);
    if ($nameLen >= $lastLen && mb_strtolower(mb_substr($name, $nameLen - $lastLen)) === mb_strtolower($last)) {
      $prefix = mb_substr($name, 0, $nameLen - $lastLen);
      if ($prefix === '' || preg_match('/\s$/u', $prefix)) {
        $first = trim($prefix);
        return ['first' => $first, 'last' => $last, 'display' => $first === '' ? $last : ($last . ', ' . $first)];
      }
    }

    return ['first' => '', 'last' => $last, 'display' => $name];
  }

  /**
   * formatPlayerNameLastFirst(player)
   *
   * Shared "Last, First" display name for a db_Players row. Public so any
   * renderer (tee sheet export today; roster modal later) uses the same
   * rule instead of re-deriving it.
   */
  public static function formatPlayerNameLastFirst(array $player): string {
    return self::splitPlayerName($player)['display'];
  }

  private static function formatPlayDate($raw): string {
    $s = trim(self::safeStr($raw));
    if ($s === '') return '';
    $d = DateTime::createFromFormat('!Y-m-d', substr($s, 0, 10));
    return $d ? $d->format('D m/d/y') : $s;   // "Sat 10/03/26" — same as the scorecards
  }

  // Physical cart number. Planned column, not in db_Players yet — reads
  // as '' until it exists, which keeps the Cart columns hidden (showCart).
  // If the column lands under a different name, change it here only.
  private const CART_FIELD = 'dbPlayers_CartID';

  /**
   * buildGameTeeSheetView(players, game, teamsActive, flightsActive)
   *
   * Data for the Game Tee Sheet export (workflow_TeeSheet.php →
   * exportGameTeeSheet()). Built ON the same sortForPlayingGroup() /
   * groupByPlayerKey() as buildByPlayingGroupView(), so the printed tee
   * sheet, the Summary page and the "Send Tee Sheet" email can't drift
   * apart. The sort is run with flights OFF: flight is a column on the tee
   * sheet, not a section. Game stage comes from ma_getGameAdministration
   * Status() — the same definition messaging uses. No rendering here.
   *
   * Shape:
   *   [
   *     'title'           => string,
   *     'course'          => string,
   *     'playDateDisplay' => string,   // "Sat 10/03/26"
   *     'startInfo'       => string,   // "Tee Times from 07:36 AM" | "Shotgun Start 08:30 AM"
   *     'isShotgun'       => bool,
   *     'isPartial'       => bool,     // slottedCount < totalPlayers
   *     'status'          => array,    // ma_getGameAdministrationStatus()
   *     'showCart'        => bool,
   *     'showFlight'      => bool,
   *     'groups' => [                  // slotted groups only, shared sort order
   *       [ 'playerKey' => string, 'teeTime' => string, 'hole' => string,
   *         'players'   => [ ['display' => 'Last, First', 'cart' => string], ... ] ],
   *     ],
   *     'individuals' => [             // everyone, by last name; '' time/hole when unslotted
   *       [ 'display', 'teeTime', 'hole', 'tee', 'cart', 'flight', 'otherPlayers' ],
   *     ],
   *   ]
   *
   * @param  array $players       db_Players rows for this game.
   * @param  array $game          Game row.
   * @param  bool  $teamsActive   From ServiceDbEvents::isDimensionActive("team", ...).
   * @param  bool  $flightsActive From ServiceDbEvents::isDimensionActive("flight", ...).
   * @return array
   */
  public static function buildGameTeeSheetView(array $players, array $game, bool $teamsActive, bool $flightsActive): array {
    $pairPair  = self::safeStr($game['dbGames_Competition'] ?? '') === 'PairPair';
    $isShotgun = self::safeStr($game['dbGames_TOMethod'] ?? '') === 'ShotGun';
    $status    = ma_getGameAdministrationStatus($players);

    $cartOf = fn(array $p): string => trim(self::safeStr($p[self::CART_FIELD] ?? ''));
    $timeOf = function (array $p): string {
      $t = trim(self::safeStr($p['dbPlayers_TeeTime'] ?? ''));
      return $t === '' ? '' : self::formatTimeAmPm($t);
    };

    // ── Playing groups: shared sort, flights off; drop the unslotted "—" group
    $sorted = self::sortForPlayingGroup($players, $game, $teamsActive, false);
    $groups = [];
    $membersByKey = [];
    foreach (self::groupByPlayerKey($sorted, $pairPair) as $group) {
      if ($group['playerKey'] === '—') continue;
      $first = $group['players'][0] ?? [];
      $groups[] = [
        'playerKey' => $group['playerKey'],
        'teeTime'   => $timeOf($first),
        'hole'      => self::getFormattedStartHole($first, $game),
        'players'   => array_map(
          fn(array $p) => ['display' => self::formatPlayerNameLastFirst($p), 'cart' => $cartOf($p)],
          $group['players']
        ),
      ];
      $membersByKey[$group['playerKey']] = $group['players'];
    }

    // ── Heading: start info
    $playTime = trim(self::safeStr($game['dbGames_PlayTime'] ?? ''));
    if ($isShotgun) {
      $startInfo = 'Shotgun Start' . ($playTime !== '' ? ' ' . self::formatTimeAmPm($playTime) : '');
    } else {
      $earliest = null;
      foreach ($players as $p) {
        if (trim(self::safeStr($p['dbPlayers_PlayerKey'] ?? '')) === '') continue;
        $m = self::parseTimeToMinutes(self::safeStr($p['dbPlayers_TeeTime'] ?? ''));
        if ($m !== null && ($earliest === null || $m < $earliest)) $earliest = $m;
      }
      $from = $earliest !== null
        ? self::formatMinutesAmPm($earliest)
        : ($playTime !== '' ? self::formatTimeAmPm($playTime) : '');
      $startInfo = 'Tee Times' . ($from !== '' ? ' from ' . $from : '');
    }

    // ── Flight column only when flights are active AND someone has one
    $showFlight = false;
    if ($flightsActive) {
      foreach ($players as $p) {
        if (trim(self::safeStr($p['dbPlayers_FlightKey'] ?? '')) !== '') { $showFlight = true; break; }
      }
    }

    $showCart = false;
    foreach ($players as $p) {
      if ($cartOf($p) !== '') { $showCart = true; break; }
    }

    // ── Individuals: everyone, by last name → first name → GHIN
    $rows = [];
    foreach ($players as $p) {
      $n   = self::splitPlayerName($p);
      $key = trim(self::safeStr($p['dbPlayers_PlayerKey'] ?? ''));

      $others = [];
      if ($key !== '' && isset($membersByKey[$key])) {
        $ghin = self::safeStr($p['dbPlayers_PlayerGHIN'] ?? '');
        $mates = array_values(array_filter(
          $membersByKey[$key],
          fn(array $m) => self::safeStr($m['dbPlayers_PlayerGHIN'] ?? '') !== $ghin
        ));
        usort($mates, function (array $a, array $b): int {
          $na = self::splitPlayerName($a); $nb = self::splitPlayerName($b);
          return strcasecmp($na['last'], $nb['last']) ?: strcasecmp($na['first'], $nb['first']);
        });
        $others = array_map(fn(array $m) => self::formatPlayerNameLastFirst($m), $mates);
      }

      $flightKey = trim(self::safeStr($p['dbPlayers_FlightKey'] ?? ''));
      $rows[] = [
        '_last'  => $n['last'],
        '_first' => $n['first'],
        '_ghin'  => self::safeStr($p['dbPlayers_PlayerGHIN'] ?? ''),
        'display'      => $n['display'],
        'teeTime'      => $key !== '' ? $timeOf($p) : '',
        'hole'         => $key !== '' ? self::getFormattedStartHole($p, $game) : '',
        'tee'          => trim(self::safeStr($p['dbPlayers_TeeSetName'] ?? '')),
        'cart'         => $cartOf($p),
        'flight'       => $flightKey !== '' ? self::resolveFlightName($flightKey, $game) : '',
        'otherPlayers' => implode(' + ', $others),
      ];
    }

    usort($rows, function (array $a, array $b): int {
      return strcasecmp($a['_last'], $b['_last'])
        ?: strcasecmp($a['_first'], $b['_first'])
        ?: strcmp($a['_ghin'], $b['_ghin']);
    });

    $individuals = array_map(function (array $r): array {
      unset($r['_last'], $r['_first'], $r['_ghin']);
      return $r;
    }, $rows);

    return [
      'title'           => trim(self::safeStr($game['dbGames_Title'] ?? '')),
      'course'          => trim(self::safeStr($game['dbGames_CourseName'] ?? '')),
      'playDateDisplay' => self::formatPlayDate($game['dbGames_PlayDate'] ?? ''),
      'startInfo'       => $startInfo,
      'isShotgun'       => $isShotgun,
      'isPartial'       => $status['totalPlayers'] > 0 && $status['slottedCount'] < $status['totalPlayers'],
      'status'          => $status,
      'showCart'        => $showCart,
      'showFlight'      => $showFlight,
      'groups'          => $groups,
      'individuals'     => $individuals,
    ];
  }
}
