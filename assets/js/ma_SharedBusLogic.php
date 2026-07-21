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
 * Default Date Window Resolution — ma_resolveDefaultDateWindow()
 * -----------------------------------------------------------------
 * PHP has no direct access to the browser's local clock, so it can't
 * compute a timezone-correct "today" on its own — DateTimeImmutable
 * ("today") resolves against the server's configured timezone (often
 * UTC on shared hosting), not the user's. To close that gap, ma_shared.js
 * writes the browser's local calendar date into a cookie
 * (MA_dateClientToday) on every page load. Since every unauthenticated
 * path into the app passes through login.php first (which also loads
 * ma_shared.js), the cookie is reliably primed one request ahead of any
 * page that needs a default date window — see adminhome.php / init.php.
 *
 * This function is the single place that interprets that cookie. Before
 * this, adminhome.php and init.php each independently called
 * DateTimeImmutable("today") + modify("+30 days") — two copies of the
 * same server-timezone-dependent logic that had to be kept in sync by
 * hand. Both now call this instead.
 *
 * Future candidate for this file: normalizeDateYMD() as currently
 * duplicated between service_dbGames.php and service_dbEvents.php —
 * already flagged in ma_SharedBusLogic.js's own docblock as a good
 * future candidate, not part of this pass.
 */

declare(strict_types=1);

const MA_CLIENT_TODAY_COOKIE = 'MA_dateClientToday';

/**
 * ma_resolveDefaultDateWindow(spanDays)
 *
 * Resolves the default {dateFrom, dateTo} filter window for a "fresh"
 * page load (no persisted session filters yet):
 *   1. If the MA_dateClientToday cookie is present and well-formed
 *      (YYYY-MM-DD), trust it as the user's local "today".
 *   2. Else fall back to the server's own "today" (DateTimeImmutable
 *      ("today")) — only reached before the client has ever had a
 *      chance to set the cookie (e.g. the very first request of a
 *      brand-new browser, or an expired cookie on a still-active
 *      session).
 *
 * @param  int   $spanDays  Size of the default window in days (default 30)
 * @return array{dateFrom: string, dateTo: string}  Both as Y-m-d strings
 */
function ma_resolveDefaultDateWindow(int $spanDays = 30): array {
  $raw = trim((string)($_COOKIE[MA_CLIENT_TODAY_COOKIE] ?? ''));

  $today = null;
  if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
    $parsed = DateTimeImmutable::createFromFormat('Y-m-d', $raw);
    if ($parsed !== false) {
      $today = $parsed;
    }
  }

  // Fallback: no cookie yet, or it failed to parse
  if ($today === null) {
    $today = new DateTimeImmutable('today');
  }

  return [
    'dateFrom' => $today->format('Y-m-d'),
    'dateTo'   => $today->modify("+{$spanDays} days")->format('Y-m-d'),
  ];
}
