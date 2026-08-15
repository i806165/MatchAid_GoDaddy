<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ReconcilePairingBoundaries.php
//
// Detect-and-correct pass for the team/flightKey boundary invariant that
// game_pairings.js's client-side clamps (assignSelectedPlayerToPairing,
// assignSelectedPairingToFlight) enforce at write time, but which can be
// silently broken by any OTHER write path that touches dbPlayers_TeamKey /
// dbPlayers_FlightKey after a pairing/match already exists — round-level
// Manage Teams / Define Flights (wired in below), the event-level cascade
// (on hold, revisit separately), and event-level pairings (on hold).
//
// No "who caused it" analysis, no partial fix — a violated pairing or
// match is fully reset: every member's pairingId/pairingPos/flightId/
// flightPos/teeTime/startHole/startHoleSuffix/playerKey are cleared,
// exactly the same 8 fields unpairGroup() clears client-side. One
// operation regardless of whether the violation was found at the pairing
// level or the match level — deliberately not split into "unpair" vs
// "unmatch": simpler to implement, simpler to reason about, per explicit
// direction ("unpair the group. much easier.").
//
// Stateless: this is a pure re-scan of current data, not a diff against
// prior state — there's no way to know WHICH player in a violating group
// actually caused the drift, so the whole group goes. Nominal overhead
// for a single game's ~100 player rows.

require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbEvents.php";
// NOTE: this file calls ma_pairingViolatesBoundary() / ma_matchSideViolatesBoundary()
// / ma_normFlightPos() from ma_SharedBusLogic.php without its own require_once —
// per that file's docblock it's already required once from bootstrap.php on
// every entry point, and every caller of this workflow (gamepairings.php, the
// game_players team/flight-assignment saves) goes through bootstrap.php first.
// Flagging here rather than guessing a require_once path I can't verify —
// please confirm this holds, or add an explicit require_once with the correct
// path/constant if this file can ever be invoked outside that chain.

final class WorkflowReconcilePairingBoundaries
{
  private const RESET_FIELDS = [
    "dbPlayers_PairingID"       => "000",
    "dbPlayers_PairingPos"      => "",
    "dbPlayers_MatchID"         => "",
    "dbPlayers_MatchPos"        => "",
    "dbPlayers_TeeTime"         => "",
    "dbPlayers_StartHole"       => "",
    "dbPlayers_StartHoleSuffix" => "",
    "dbPlayers_PlayerKey"       => "",
  ];

  /**
   * Reconciles one game. Returns what was reset, for the caller to log or
   * surface — never a silent fix.
   *
   * @param  ?array $gameRow  Optional — pass the game's row if the caller
   *                          already has it (gamepairings.php, the
   *                          game_players flight-assignments save, and the
   *                          event cascade's per-game loop all do) to skip
   *                          teamsActive()'s own lookup. Only fetched
   *                          internally when omitted — currently just the
   *                          game_players team-assignments save, which
   *                          doesn't otherwise need the game row at all.
   * @return array  [{ type: "pairing"|"match", id: string, players: [{ghin,name}], reason: string }, ...]
   *                Empty array means the scan came back clean.
   */
  public static function reconcileGame(string $ggid, ?array $gameRow = null): array
  {
    $ggid = trim($ggid);
    if ($ggid === "") return [];

    $rows = ServiceDbPlayers::getGamePlayers($ggid);
    if (!$rows) return [];

    $teamsActive   = self::teamsActive($ggid, $gameRow);
    $flightsActive = self::flightsActive($ggid, $gameRow);

    // Group by pairingId (skip 000/blank)
    $byPairing = [];
    foreach ($rows as $r) {
      $pid = trim((string)($r["dbPlayers_PairingID"] ?? "000"));
      if ($pid === "" || $pid === "000") continue;
      $byPairing[$pid][] = $r;
    }

    $toReset = []; // ghin => row, deduped across both passes
    $report  = [];

    // Pass 1 — pairing-level: every member of a pairing must share team
    // and/or flightKey, whichever dimension(s) are actually active right
    // now (mirrors assignSelectedPlayerToPairing's clamp). ma_pairingViolatesBoundary()
    // is the shared implementation (also used by
    // ServiceScoreSummary::checkTeamIntegrity()) — see its docblock in
    // ma_SharedBusLogic.php.
    foreach ($byPairing as $pid => $members) {
      if (ma_pairingViolatesBoundary($members, $teamsActive, $flightsActive) !== '') {
        $players = [];
        foreach ($members as $m) {
          $ghin = (string)($m["dbPlayers_PlayerGHIN"] ?? "");
          if ($ghin === "") continue;
          $toReset[$ghin] = true;
          $players[] = ["ghin" => $ghin, "name" => (string)($m["dbPlayers_Name"] ?? $ghin)];
        }
        $report[] = [
          "type"    => "pairing",
          "id"      => $pid,
          "players" => $players,
          "reason"  => "Pairing members no longer share team/flight.",
        ];
      }
    }

    // Pass 2 — match-level: the two pairings on a match's Side A / Side B
    // must share flightKey (only when Flight is active), and must belong
    // to different teams (only when Team is active) — mirrors
    // assignSelectedPairingToFlight's clamp. Only pairings that survived
    // Pass 1 are considered — a pairing already flagged doesn't need a
    // second, redundant reason.
    $byMatch = [];
    foreach ($rows as $r) {
      $fid  = trim((string)($r["dbPlayers_MatchID"] ?? ""));
      $pid  = trim((string)($r["dbPlayers_PairingID"] ?? "000"));
      $ghin = (string)($r["dbPlayers_PlayerGHIN"] ?? "");
      if ($fid === "" || $pid === "" || $pid === "000") continue;
      if (isset($toReset[$ghin])) continue; // already being reset via Pass 1
      $pos = ma_normFlightPos($r["dbPlayers_MatchPos"] ?? "");
      if ($pos !== "A" && $pos !== "B") continue;
      $byMatch[$fid][$pos][] = $r;
    }

    foreach ($byMatch as $fid => $sides) {
      $sideA = $sides["A"][0] ?? null; // representative — pairing already homogeneous post-Pass-1
      $sideB = $sides["B"][0] ?? null;
      if (!$sideA || !$sideB) continue; // only one side occupied — nothing to violate yet

      // ma_matchSideViolatesBoundary() is the shared implementation (also
      // used by ServiceScoreSummary::checkTeamIntegrity() and mirrored by
      // game_pairings.js's own write-time clamp) — see its docblock in
      // ma_SharedBusLogic.php.
      $violation = ma_matchSideViolatesBoundary($sideA, $sideB, $teamsActive, $flightsActive);

      if ($violation !== '') {
        $pidA = (string)($sideA["dbPlayers_PairingID"] ?? "");
        $pidB = (string)($sideB["dbPlayers_PairingID"] ?? "");
        $allMembers = array_merge($byPairing[$pidA] ?? [], $byPairing[$pidB] ?? []);
        $players = [];
        foreach ($allMembers as $m) {
          $ghin = (string)($m["dbPlayers_PlayerGHIN"] ?? "");
          if ($ghin === "") continue;
          $toReset[$ghin] = true;
          $players[] = ["ghin" => $ghin, "name" => (string)($m["dbPlayers_Name"] ?? $ghin)];
        }
        $report[] = [
          "type"    => "match",
          "id"      => $fid,
          "players" => $players,
          "reason"  => "Matched pairings no longer share a flight, or belong to the same team.",
        ];
      }
    }

    foreach (array_keys($toReset) as $ghin) {
      ServiceDbPlayers::updateGamePlayerFields($ggid, (string)$ghin, self::RESET_FIELDS);
    }

    return $report;
  }

  /**
   * Whether Team is active for this round, per the shared Round-Level
   * Dimension Activation hierarchy (ServiceDbEvents::isDimensionActive()).
   * Previously this was its own private mirror of game_pairings.js's
   * teamsActive() — a second, independent copy of the same data-presence
   * inference kept in sync only by hand. That mirror is retired; this is
   * now one of two callers of the single shared implementation (the
   * other being game_pairings.js's own teamsActive() replacement).
   */
  private static function teamsActive(string $ggid, ?array $gameRow = null): bool
  {
    return self::dimensionActive("team", $ggid, $gameRow);
  }

  /**
   * Whether Flight is active for this round — mirrors teamsActive()
   * exactly, one dimension apart. Previously reconcileGame() had no
   * flight-activation check at all: ma_pairingViolatesBoundary() and
   * ma_matchSideViolatesBoundary() compared dbPlayers_FlightKey
   * unconditionally, so a round where Flight had been turned OFF (but
   * whose player rows still carried differing, now-stale FlightKey
   * values — deactivating a dimension deliberately doesn't clear old
   * data) would have every mixed-flight pairing/match flagged as a
   * "violation" and unpaired, even though nothing about Flight was
   * actually wrong for that round anymore. This closes that gap the
   * same way teamsActive() already closes it for Team.
   */
  private static function flightsActive(string $ggid, ?array $gameRow = null): bool
  {
    return self::dimensionActive("flight", $ggid, $gameRow);
  }

  /**
   * Shared lookup behind teamsActive()/flightsActive() — fetches the
   * event only when the round is actually linked to one (dbGames_EID > 0);
   * a flat game never needs it, same guarded pattern used elsewhere
   * (e.g. WorkflowProcessEventCascade::applyEventDataToGame()).
   */
  private static function dimensionActive(string $dimension, string $ggid, ?array $gameRow): bool
  {
    $game = $gameRow ?? ServiceDbGames::getGameByGGID((int)$ggid);
    if (!$game) return false;

    $event = null;
    $eid = (int)($game["dbGames_EID"] ?? 0);
    if ($eid > 0) {
      $event = ServiceDbEvents::getEventByEID($eid);
    }

    return ServiceDbEvents::isDimensionActive($dimension, $game, $event);
  }
}
