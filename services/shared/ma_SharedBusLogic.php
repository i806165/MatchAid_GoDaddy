<?php
/* /services/shared/ma_SharedBusLogic.php
 *
 * Cross-page BUSINESS logic shared across MatchAid PHP entry points —
 * the PHP counterpart to /assets/js/ma_SharedBusLogic.js. Distinct in
 * purpose from bootstrap.php, which is pure plumbing (paths, session,
 * config, generic request/response helpers) and has no domain rules of
 * its own. This file is the intended home for cross-page rules that
 * would otherwise get copy-pasted per caller.
 *
 * Required once from bootstrap.php, so it's available on every page —
 * mirrors how adminhome.php loads ma_SharedBusLogic.js after ma_shared.js.
 *
 * Client-Local "Today" — ma_resolveClientToday()
 * -----------------------------------------------------------------
 * PHP has no direct access to the browser's local clock, so it can't
 * compute a timezone-correct "today" on its own — DateTimeImmutable
 * ("today") resolves against the server's configured timezone (often
 * UTC on shared hosting), not the user's. To close that gap, ma_shared.js
 * writes the browser's local calendar date into a cookie
 * (MA_dateClientToday) on every page load. Since every unauthenticated
 * path into the app passes through login.php first (which also loads
 * ma_shared.js), the cookie is reliably primed one request ahead of any
 * page that needs "today" — see adminhome.php / initAdminHome.php.
 *
 * This is the single place that interprets that cookie. Prior to this,
 * "today" was computed independently in at least six places across the
 * app (adminhome.php, initAdminHome.php, hydrateAdminGamesList.php,
 * service_dbGames.php x3, service_ContextGame.php), using three
 * different strategies — bare server-default DateTimeImmutable, a
 * hardcoded America/New_York DateTimeZone (an earlier, incomplete fix
 * for this same bug — it only masked the problem for admins in Eastern
 * time), and now this. Every one of those now calls this function
 * instead, so there's exactly one definition of "today" in the app.
 *
 * Future candidate for this file: normalizeDateYMD() as currently
 * duplicated between service_dbGames.php and service_dbEvents.php —
 * already flagged in ma_SharedBusLogic.js's own docblock as a good
 * future candidate, not part of this pass.
 */

declare(strict_types=1);

const MA_CLIENT_TODAY_COOKIE = 'MA_dateClientToday';

/**
 * ma_resolveClientToday()
 *
 *   1. If the MA_dateClientToday cookie is present and well-formed
 *      (YYYY-MM-DD), trust it as the user's local "today".
 *   2. Else fall back to the server's own "today" (DateTimeImmutable
 *      ("today"), server-configured timezone) — only reached before the
 *      client has ever had a chance to set the cookie (e.g. the very
 *      first request of a brand-new browser, or an expired cookie on a
 *      still-active session). Deliberately does NOT fall back to a
 *      hardcoded club/company timezone (e.g. America/New_York) — that
 *      was the previous approach in a few spots, and it just trades one
 *      wrong-for-some-users assumption for another.
 *
 * @return DateTimeImmutable  Midnight on the resolved "today"
 */
function ma_resolveClientToday(): DateTimeImmutable {
  $raw = trim((string)($_COOKIE[MA_CLIENT_TODAY_COOKIE] ?? ''));

  if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
    $parsed = DateTimeImmutable::createFromFormat('Y-m-d', $raw);
    if ($parsed !== false) {
      return $parsed;
    }
  }

  // Fallback: no cookie yet, or it failed to parse
  return new DateTimeImmutable('today');
}

/**
 * ma_resolveDefaultDateWindow(spanDays)
 *
 * Resolves the default {dateFrom, dateTo} filter window for a "fresh"
 * page load (no persisted session filters yet), relative to
 * ma_resolveClientToday(). Sign of $spanDays sets the direction:
 *   - Positive (default): today .. today+N   (e.g. "current" games)
 *   - Negative:            today-N .. today   (e.g. "past" games)
 *
 * @param  int   $spanDays  Size + direction of the window (default 30)
 * @return array{dateFrom: string, dateTo: string}  Both as Y-m-d strings
 */
function ma_resolveDefaultDateWindow(int $spanDays = 30): array {
  $today = ma_resolveClientToday();
  $other = $today->modify("{$spanDays} days");

  if ($spanDays >= 0) {
    return [
      'dateFrom' => $today->format('Y-m-d'),
      'dateTo'   => $other->format('Y-m-d'),
    ];
  }

  return [
    'dateFrom' => $other->format('Y-m-d'),
    'dateTo'   => $today->format('Y-m-d'),
  ];
}

/**
 * Pairing / Match Boundary Invariant — ma_normFlightPos(), ma_pairingViolatesBoundary(),
 * ma_matchSideViolatesBoundary()
 * -----------------------------------------------------------------
 * Single source of truth for the team/flightKey boundary rules that
 * game_pairings.js enforces at write time (assignSelectedPlayerToPairing,
 * assignSelectedPairingToFlight), that WorkflowReconcilePairingBoundaries
 * re-checks as a detect-and-correct pass, and that
 * ServiceScoreSummary::checkTeamIntegrity() re-checks at read time for the
 * score summary page. All three previously carried their own independent
 * copy of this comparison (flagged in this project's own history as a
 * "kept in sync only by hand" risk — see teamsActive()'s docblock in
 * game_pairings.js and workflow_ReconcilePairingBoundaries.php). This is
 * now the one implementation; callers pass in the rows, this returns the
 * verdict.
 *
 * Rules (mirrors game_pairings.js's violatesBoundary() exactly):
 *   - A pairing's members must share dbPlayers_TeamKey AND/OR
 *     dbPlayers_FlightKey — but ONLY for whichever dimension is
 *     actually active right now, per ServiceDbEvents::isDimensionActive().
 *   - The two sides (Side A / Side B) of a match must share
 *     dbPlayers_FlightKey — again, only when Flight is active.
 *   - The two sides of a match must belong to DIFFERENT teams — but
 *     ONLY when Team is actually active for the round (per
 *     ServiceDbEvents::isDimensionActive("team", ...)).
 *   - When a dimension is inactive, its key is not consulted at all,
 *     for either rule — dbPlayers_TeamKey/dbPlayers_FlightKey persist
 *     on a player row even after that dimension is deactivated (by
 *     design, deactivating doesn't clear stale values), so comparing
 *     them unconditionally would false-positive a mismatch between two
 *     players who both just have leftover-but-now-irrelevant keys from
 *     before the dimension was turned off. Without an active Team
 *     dimension, dbPlayers_MatchPos (Side A/B) IS the team distinction
 *     for match sides — dbPlayers_TeamKey is not consulted at all in
 *     that case, since checking it would be circular (blank always
 *     "matches" blank).
 *
 * Each detection function returns a reason string rather than a bool —
 * '' means clean; otherwise one of 'team', 'flight', 'team+flight' — so
 * a caller with user-facing copy (ServiceScoreSummary) can pick the
 * right message without re-deriving which rule was actually broken.
 */

/**
 * ma_normFlightPos($v)
 *
 * Normalizes a raw dbPlayers_MatchPos value to 'A' | 'B' | ''. Mirrors
 * game_pairings.js's normFlightPos() exactly (legacy '1'/'2' -> 'A'/'B').
 */
function ma_normFlightPos($v): string {
  $s = strtoupper(trim((string)($v ?? '')));
  if ($s === '1') return 'A';
  if ($s === '2') return 'B';
  return ($s === 'A' || $s === 'B') ? $s : '';
}

/**
 * ma_pairingViolatesBoundary(members, teamsActive, flightsActive)
 *
 * True (non-empty reason) when the members of a single pairing disagree
 * on team and/or flight. Mirrors assignSelectedPlayerToPairing's clamp
 * and WorkflowReconcilePairingBoundaries::pairingViolates(). A pairing
 * of fewer than 2 members can't violate anything — trivially clean.
 *
 * $teamsActive/$flightsActive gate each half independently — an
 * inactive dimension's key is never compared, so stale
 * dbPlayers_TeamKey/dbPlayers_FlightKey values left over from before
 * that dimension was turned off can't produce a false-positive
 * mismatch. Required (not defaulted) so every call site has to state
 * its intent explicitly — see ServiceScoreSummary::checkTeamIntegrity()
 * for the one caller that deliberately passes true/true to preserve its
 * pre-existing unconditional-on-team behavior (it only ever consults
 * the 'team'/'team+flight' verdicts anyway, so its own $flightsActive
 * value is inert).
 *
 * @param  array  $members       Player rows for one pairingId.
 * @param  bool   $teamsActive   From ServiceDbEvents::isDimensionActive("team", ...).
 * @param  bool   $flightsActive From ServiceDbEvents::isDimensionActive("flight", ...).
 * @return string  '' | 'team' | 'flight' | 'team+flight'
 */
function ma_pairingViolatesBoundary(array $members, bool $teamsActive, bool $flightsActive): string {
  if (count($members) < 2) return '';

  $ref       = $members[0];
  $refTeam   = trim((string)($ref['dbPlayers_TeamKey']   ?? ''));
  $refFlight = trim((string)($ref['dbPlayers_FlightKey'] ?? ''));

  $teamMismatch   = false;
  $flightMismatch = false;
  foreach ($members as $m) {
    if ($teamsActive   && trim((string)($m['dbPlayers_TeamKey']   ?? '')) !== $refTeam)   $teamMismatch   = true;
    if ($flightsActive && trim((string)($m['dbPlayers_FlightKey'] ?? '')) !== $refFlight) $flightMismatch = true;
  }

  if ($teamMismatch && $flightMismatch) return 'team+flight';
  if ($teamMismatch)   return 'team';
  if ($flightMismatch) return 'flight';
  return '';
}

/**
 * ma_matchSideViolatesBoundary(sideA, sideB, teamsActive, flightsActive)
 *
 * True (non-empty reason) when the two sides of a match break the
 * boundary invariant. Mirrors assignSelectedPairingToFlight's
 * violatesBoundary() and WorkflowReconcilePairingBoundaries' Pass 2
 * inline check. Callers pass one representative row per side — a side's
 * members are expected to already be homogeneous (verified separately
 * via ma_pairingViolatesBoundary() on each side's own pairing/group).
 *
 * @param  array $sideA          One representative player row, Side A.
 * @param  array $sideB          One representative player row, Side B.
 * @param  bool  $teamsActive    From ServiceDbEvents::isDimensionActive("team", ...).
 * @param  bool  $flightsActive  From ServiceDbEvents::isDimensionActive("flight", ...).
 * @return string  '' | 'team' | 'flight' | 'team+flight'
 */
function ma_matchSideViolatesBoundary(array $sideA, array $sideB, bool $teamsActive, bool $flightsActive): string {
  $sameFlight = trim((string)($sideA['dbPlayers_FlightKey'] ?? '')) === trim((string)($sideB['dbPlayers_FlightKey'] ?? ''));
  $sameTeam   = trim((string)($sideA['dbPlayers_TeamKey']   ?? '')) === trim((string)($sideB['dbPlayers_TeamKey']   ?? ''));

  $flightViolation = $flightsActive && !$sameFlight; // only meaningful when Flight is active
  $teamViolation   = $teamsActive && $sameTeam;       // only meaningful when Team is active

  if ($flightViolation && $teamViolation) return 'team+flight';
  if ($teamViolation)   return 'team';
  if ($flightViolation) return 'flight';
  return '';
}

/**
 * Messaging — Game Administration Status + Condensed Format Line
 * -----------------------------------------------------------------
 * ma_getGameAdministrationStatus() answers a general question — "how far
 * along its administration path is this game" (Roster -> Pairing ->
 * Slotting) — not a messaging-specific one; messaging (initPlayerNotifications.php)
 * is just the first consumer, reading isSlottingReady as its "Send Game
 * Info" gate. Any future caller wanting roster/pairing/slotting counts
 * (e.g. a status badge) can use this directly rather than reinventing it.
 *
 * ma_describeGameFormatCondensed() is unrelated to the above — a small
 * PHP port of the one piece of ma_SharedBusLogic.js's MA.describeGameFormat()
 * that the "Send Game Info" plain-text body needs (its condensedLine).
 * Lives here specifically because this file is documented as the PHP
 * counterpart to ma_SharedBusLogic.js, where the JS original lives — a
 * cross-language pair for a shared formatting concern belongs in the
 * matching pair of files.
 *
 * NOTE: the large playing-group grouping/sorting logic that used to live
 * in this section (ma_normalizeRosterForPlayingGroupDisplay(),
 * ma_partitionByFlight(), ma_groupRosterForPlayingGroup(),
 * ma_buildTeeSheetText()) has moved to its own service,
 * services/roster/service_GameRosterViews.php (ServiceGameRosterViews) —
 * that's genuinely large, domain-specific normalization logic, not a
 * small stable cross-page rule, and deserves its own file the same way
 * ServiceScoreCard has its own file rather than living in a general
 * "shared logic" file.
 */

/**
 * ma_getGameAdministrationStatus(players)
 *
 * The game's status along its administration path: Roster -> Pairing ->
 * Slotting. Tiers nest in practice (slotted implies paired implies
 * rostered), so each count is independent, no cross-tier consistency
 * checking needed. "000" is the established sentinel for "unpaired" —
 * matches ServiceDbPlayers::getCoPlayMatrix()'s existing
 * `dbPlayers_PairingID != '000'` filter.
 *
 * @param  array $players  db_Players rows (e.g. ServiceDbPlayers::getGamePlayers()).
 * @return array{
 *   totalPlayers: int, isRosterReady: bool,
 *   pairedCount: int, isPairingReady: bool,
 *   slottedCount: int, isSlottingReady: bool
 * }
 */
function ma_getGameAdministrationStatus(array $players): array {
  $total   = count($players);
  $paired  = 0;
  $slotted = 0;

  foreach ($players as $p) {
    $pairingId = trim((string)($p['dbPlayers_PairingID'] ?? ''));
    if ($pairingId !== '' && $pairingId !== '000') $paired++;

    if (trim((string)($p['dbPlayers_PlayerKey'] ?? '')) !== '') $slotted++;
  }

  return [
    'totalPlayers'    => $total,
    'isRosterReady'   => $total > 0,
    'pairedCount'     => $paired,
    'isPairingReady'  => $paired > 0,
    'slottedCount'    => $slotted,
    'isSlottingReady' => $slotted > 0,
  ];
}

/**
 * ma_describeGameFormatCondensed(game)
 *
 * Faithful port of ma_SharedBusLogic.js's MA.describeGameFormat(game,
 * {condensed:true}).condensedLine — the one piece of that function's
 * output buildPlayingGroupsText() actually used to prefix the tee
 * sheet. Only ports what condensedLine itself depends on (gameFormat +
 * the full scoringSystemLine switch, since condensedLine derives from
 * scoringSystemLine with its "Scoring System: " label stripped) —
 * formatLine, hcLabel, allowanceLabel, strokeDistLabel, segmentLabel,
 * and detailLine are the *client's* concern for the on-screen
 * scorecard header and aren't used here, so they're intentionally not
 * ported. If a future caller needs those too, port the rest of
 * describeGameFormat() at that point rather than guessing they're
 * unneeded forever.
 *
 * @param  array $game
 * @return string
 */
function ma_describeGameFormatCondensed(array $game): string {
  $g = $game;

  $gameFormat = trim(ma__safeStr($g['dbGames_GameFormat'] ?? ''));
  $sys        = trim(ma__safeStr($g['dbGames_ScoringSystem'] ?? ''));

  $scoringSystemLine = '';

  if ($sys === 'BestBall') {
    $cnt = trim(ma__safeStr($g['dbGames_BestBallCnt'] ?? $g['dbGames_BestBall'] ?? ''));
    $scoringSystemLine = $cnt !== ''
      ? "Scoring System: Best {$cnt} Ball" . ($cnt === '1' ? '' : 's')
      : 'Scoring System: Best Ball';

  } elseif ($sys === 'DeclareHole') {
    try {
      $raw    = $g['dbGames_HoleDeclaration'] ?? null;
      $parsed = is_string($raw)
        ? (json_decode($raw !== '' ? $raw : '{}', true) ?? [])
        : (is_array($raw) ? $raw : []);

      $map = [];
      $isList = $parsed !== [] && array_keys($parsed) === range(0, count($parsed) - 1);
      if ($isList) {
        foreach ($parsed as $r) {
          if (is_array($r) && isset($r['hole']) && $r['hole'] !== null) {
            $map[(string)$r['hole']] = $r['count'] ?? null;
          }
        }
      } else {
        foreach ($parsed as $k => $v) { $map[(string)$k] = $v; }
      }

      $pairs = [];
      for ($h = 1; $h <= 18; $h++) {
        $val = $map[(string)$h] ?? null;
        if ($val !== null && $val !== '') $pairs[] = "H{$h}:{$val}";
      }

      $scoringSystemLine = $pairs
        ? 'Scoring System: Declare by Hole (' . implode(" \u{2022} ", $pairs) . ')'
        : 'Scoring System: Declare by Hole';
    } catch (Throwable $e) {
      $scoringSystemLine = 'Scoring System: Declare by Hole';
    }

  } elseif ($sys === 'DeclarePlayer') {
    $perPlayer = trim(ma__safeStr($g['dbGames_PlayerDeclaration'] ?? '1'));
    if ($perPlayer === '') $perPlayer = '1';
    $scoringSystemLine = "Scoring System: Declare by Player ({$perPlayer}x per player)";

  } elseif ($sys === 'DeclareManual') {
    $scoringSystemLine = 'Scoring System: Declare Scores Discretionally';

  } elseif ($sys === 'AllScores') {
    $scoringSystemLine = 'Scoring System: Use All Scores';

  } elseif ($sys !== '') {
    $scoringSystemLine = "Scoring System: {$sys}";
  }

  $shortSys = preg_replace('/^Scoring System:\s*/', '', $scoringSystemLine);

  $parts = array_values(array_filter([$gameFormat, $shortSys], fn($v) => $v !== '' && $v !== null));
  return implode(" \u{2022} ", $parts);
}

/**
 * ma__safeStr($v)
 * Small local string helper, mirroring game_summary.js's safeString()
 * exactly. Prefixed ma__ (double underscore) to signal "private to this
 * file" — not part of the public cross-page API the other ma_*
 * functions here represent. Its sibling ma__valueOrDash() and the rest
 * of this file's former private helpers moved to
 * services/roster/service_GameRosterViews.php along with the
 * normalization logic that was their only caller.
 */
function ma__safeStr($v): string { return (string)($v ?? ''); }
