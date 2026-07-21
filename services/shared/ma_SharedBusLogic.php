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
