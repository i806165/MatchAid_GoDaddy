<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ProcessEventCascade.php
// Cross-domain writes from event tables (db_Events / db_EventPlayers)
// down into every round belonging to that event (db_Games / db_Players).
// Lives outside ServiceDbEventPlayers / ServiceDbEvents on purpose —
// those services own a single table each and don't write across domains.
//
// TERMINOLOGY — "cascade" (the class name, kept for now to avoid renaming
// every existing caller) actually covers two DIFFERENT mechanisms. Every
// method below is one or the other; each method's own docblock says
// which, but the definitions live here once:
//
//   INHERITANCE — one-time, at the moment a child is CREATED (or, for
//     Path A, re-applied on every EDIT too). The child PULLS the
//     parent's current state onto itself. Not triggered by a parent-side
//     change — triggered by the child's own creation/edit action.
//     Path A: applyEventDataToGame(), called from ServiceDbGames::
//       saveGame()'s add/edit branches.
//     Path B: a player's Team/Flight/Pairing, pulled from db_EventPlayers
//       at the moment that player is individually enrolled into a round —
//       see WorkflowProcessPlayers::upsertPlayer() (a different file;
//       this class has no Path B inheritance method of its own).
//
//   PROPAGATION — ongoing, triggered by a change at the PARENT
//     (event) level. The parent PUSHES its new state out to every
//     already-existing child. Not triggered by anything happening to the
//     child — triggered by an event-side Apply action.
//     Path A: propagateTeamConfig() / propagateFlightConfig() /
//       propagateHandicapConfig() — each a thin loop over every linked
//       round, delegating to applyEventDataToGame() per round (so
//       Propagation, mechanically, is just Inheritance run once per
//       existing child instead of once at creation).
//     Path B: propagateTeamAssignments() / propagateFlightAssignments()
//       / propagatePairingAssignments() — each a thin trigger delegating
//       to propagateEventDataToPlayers(), which applies whichever of
//       Team/Flight/Pairing are currently fixed to every enrolled
//       player, all in one update — same consolidation shape as Path A's
//       applyEventDataToGame(), just scoped to players instead of
//       game-level config.
//
// Path A = Event → Game (config: dbEvents_* → dbGames_*).
// Path B = Event Roster → Players (assignment: dbEventPlayers_* → dbPlayers_*).
// The two paths are deliberately separate — different source/destination
// tables, different trigger points (Path A's Inheritance fires on both
// create AND edit; Path B's Inheritance is user-driven at enrollment
// only, never automatic — see the "no automatic player seeding at round
// creation" note on service_dbEventPlayers.php's cascadeToGame() removal).

require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbEvents.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SVC_DB . "/service_dbEventPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ReconcilePairingBoundaries.php";

final class WorkflowProcessEventCascade
{
  /**
   * Path A — Event → Game (config level): the ONE implementation of
   * "does this round need dbEvents_* config applied to its dbGames_*
   * columns, and if so, apply it." Determines relevance and per-dimension
   * mode-gating internally — callers never duplicate that logic.
   *
   * Serves BOTH mechanisms (see class header for definitions), depending
   * on who's calling: INHERITANCE when called directly from
   * ServiceDbGames::saveGame() (a round pulling its event's current state
   * at create/edit time); PROPAGATION when called from the loops inside
   * propagateTeamConfig/propagateFlightConfig/propagateHandicapConfig
   * below (an event-side change pushing out to every existing round).
   * This function itself doesn't know or care which — it just answers
   * "apply or skip" for one round, correctly, every time.
   *
   * This replaces what used to be TWO independent implementations that
   * had silently drifted apart: service_dbEventPlayers.php's
   * cascadeToGame() (round-creation time, unconditional — no mode check
   * at all) and this class's own propagateTeamConfig/propagateFlightConfig/
   * propagateHandicapConfig (event-side "apply to all," each duplicating
   * its own copy of the field-set logic). cascadeToGame() is removed;
   * the three propagate* methods below now delegate here instead of
   * carrying their own logic.
   *
   * Called from three places: new round creation, round edit (both in
   * ServiceDbGames::saveGame()), and the propagate* loops below (event-
   * side "apply to all"). Every dimension re-checks its own mode fresh
   * from the event record on every call — so a Team-only Apply, for
   * instance, also harmlessly re-applies Flight/Handicap if THEIR modes
   * are independently "fixed" (idempotent, same current values) — which
   * means any qualifying Apply also self-heals any other dimension that
   * had drifted out of sync, not just the one being edited.
   *
   * Path B (Event Roster → Players, dbEventPlayers_* → dbPlayers_*) is
   * deliberately NOT part of this function — separate source table,
   * separate destination table, separate trigger points (user-driven at
   * round creation, not automatic). See propagateTeamAssignments /
   * propagateFlightAssignments / propagatePairingAssignments below,
   * unchanged by this pass.
   *
   * @param  int    $ggid
   * @param  ?array $gameRow  Optional — pass the game's row if the caller
   *                          already has it (saveGame()'s add/edit
   *                          branches always do; the propagate* loops
   *                          below already have it from getGamesByEID())
   *                          to skip the internal lookup. Only
   *                          `dbGames_EID` is read from it — a partial/
   *                          in-memory row (like saveGame()'s $updated,
   *                          not yet a real fetched row) is fine as long
   *                          as that one key is correct.
   */
  public static function applyEventDataToGame(int $ggid, ?array $gameRow = null): void
  {
    if ($ggid <= 0) return;

    $game = $gameRow ?? ServiceDbGames::getGameByGGID($ggid);
    if (!$game) return;

    $eid = (int)($game["dbGames_EID"] ?? 0);
    if ($eid <= 0) return; // not event-relevant — skip, not an error

    $event = ServiceDbEvents::getEventByEID($eid);
    if (!$event) return;

    $teamMode     = (string)($event["dbEvents_TeamMode"]     ?? "none");
    $flightMode   = (string)($event["dbEvents_FlightMode"]   ?? "none");
    $handicapMode = (string)($event["dbEvents_HandicapMode"] ?? "none");

    $fields = [];
    if ($teamMode === "fixed") {
      $fields["dbGames_TeamConfig"] = $event["dbEvents_TeamConfig"] ?? null;
    }
    if ($flightMode === "fixed") {
      $fields["dbGames_FlightConfig"] = $event["dbEvents_FlightConfig"] ?? null;
    }
    if ($handicapMode === "fixed") {
      $fields["dbGames_HCMethod"]          = $event["dbEvents_HCMethod"]          ?? "CH";
      $fields["dbGames_Allowance"]         = $event["dbEvents_Allowance"]         ?? 100;
      $fields["dbGames_HCEffectivity"]     = $event["dbEvents_HCEffectivity"]     ?? "PlayDate";
      $fields["dbGames_HCEffectivityDate"] = $event["dbEvents_HCEffectivityDate"] ?? null;
    }

    if (!$fields) return; // every dimension is "none" — nothing to apply

    ServiceDbGames::updateGame($ggid, $fields);
  }

  /**
   * PROPAGATION. Mirror TeamConfig into every round under the event.
   * $teamConfig is no longer read directly — applyEventDataToGame() reads
   * dbEvents_TeamConfig fresh per round instead, since the caller has
   * already persisted it to db_Events before calling this (see
   * saveTeamConfig.php: updateEvent() runs first, then this). Signature
   * kept unchanged for backward compatibility with existing callers.
   */
  public static function propagateTeamConfig(int $eid, ?array $teamConfig): void
  {
    foreach (ServiceDbGames::getGamesByEID($eid) as $game) {
      self::applyEventDataToGame((int)$game["dbGames_GGID"], $game);
    }
  }

  /**
   * PROPAGATION (Path B). Mirror TeamKey for every enrolled player into
   * every round under the event. $ghinToTeam is no longer read directly —
   * propagateEventDataToPlayers() re-reads db_EventPlayers fresh for
   * every enrolled player instead, and applies whichever of Team/Flight/
   * Pairing are currently fixed, all in one update per player — not just
   * Team. Signature kept unchanged for backward compatibility with
   * existing callers.
   * @return array Reconciliation summary — see propagateEventDataToPlayers().
   */
  public static function propagateTeamAssignments(int $eid, array $ghinToTeam): array
  {
    return self::propagateEventDataToPlayers($eid);
  }

  /**
   * PROPAGATION (Path B). Mirror PairingID/Pos for every enrolled player
   * into every round under the event. $ghinToPairing is no longer read
   * directly — same reasoning as propagateTeamAssignments() above.
   * @return array Reconciliation summary — see propagateEventDataToPlayers().
   */
  public static function propagatePairingAssignments(int $eid, array $ghinToPairing): array
  {
    return self::propagateEventDataToPlayers($eid);
  }

  /**
   * PROPAGATION. Mirror FlightConfig into every round under the event.
   * $flightConfig is no longer read directly — same reasoning as
   * propagateTeamConfig() above.
   */
  public static function propagateFlightConfig(int $eid, array $flightConfig): void
  {
    foreach (ServiceDbGames::getGamesByEID($eid) as $game) {
      self::applyEventDataToGame((int)$game["dbGames_GGID"], $game);
    }
  }

  /**
   * PROPAGATION (Path B). Mirror FlightKey for every enrolled player into
   * every round under the event. $ghinToFlight is no longer read directly
   * — same reasoning as propagateTeamAssignments() above.
   * @return array Reconciliation summary — see propagateEventDataToPlayers().
   */
  public static function propagateFlightAssignments(int $eid, array $ghinToFlight): array
  {
    return self::propagateEventDataToPlayers($eid);
  }

  /**
   * PROPAGATION. Mirror handicap rules (Method/Allowance/Effectivity/Date) into every
   * round under the event. $config is no longer read directly — same
   * reasoning as propagateTeamConfig() above; applyEventDataToGame() now
   * also gates this on dbEvents_HandicapMode === "fixed" internally
   * (previously this method wrote unconditionally once called — the
   * caller's own "only call when fixed" check was the only gate; now
   * there's a second, internal one too, matching Team/Flight).
   *
   * No assignments-equivalent method exists alongside this one — unlike
   * TeamKey/FlightKey, dbPlayers_HI/CH/PH/SO are computed values, not
   * admin-assigned, so there's no per-player "assignment" to mirror here.
   * Propagating the rule does not refresh the numbers; that stays a
   * separate, deliberate action (Refresh Handicaps), never automatic.
   */
  public static function propagateHandicapConfig(int $eid, array $config): void
  {
    foreach (ServiceDbGames::getGamesByEID($eid) as $game) {
      self::applyEventDataToGame((int)$game["dbGames_GGID"], $game);
    }
  }

  /**
   * PROPAGATION (Path B) engine — the ONE implementation of "does this
   * player need dbEventPlayers_* assignments applied to their dbPlayers_*
   * row, and if so, apply them," mirroring Path A's applyEventDataToGame().
   * "The record is open, apply all in one update": for every enrolled
   * player found in every linked round, applies whichever of Team/
   * Flight/Pairing are currently "fixed" — all three checked and, if
   * qualifying, written together in a single updateGamePlayerFields()
   * call — regardless of which single dimension's save actually
   * triggered this pass. Previously propagateTeamAssignments/
   * propagateFlightAssignments/propagatePairingAssignments each wrote
   * only their own one field via propagateFields() (removed); this
   * consolidation means a Team-only Apply now also re-syncs Flight and
   * Pairing for every player if those are independently fixed too — same
   * self-healing benefit Path A's consolidation already gave Games.
   *
   * Reconciliation (workflow_ReconcilePairingBoundaries) still runs once
   * per round after that round's players are updated, unchanged in
   * behavior from before this consolidation — every linked round is
   * checked on every call, not just rounds this particular Apply actually
   * wrote to, since a fixed-mode Apply always touches every round.
   *
   * @return array{ roundsTouched: int, roundsAffected: int, affectedGgids: string[] }
   *   roundsTouched  — every round linked to the event (== getGamesByEID() count).
   *   roundsAffected — how many of those had a boundary violation reset.
   *   affectedGgids  — which ones, for logging; the client-facing message
   *                    stays terse ("N of M rounds"), not a per-round dump.
   */
  private static function propagateEventDataToPlayers(int $eid): array
  {
    $summary = ["roundsTouched" => 0, "roundsAffected" => 0, "affectedGgids" => []];

    $event = ServiceDbEvents::getEventByEID($eid);
    if (!$event) return $summary;

    // One roster fetch for the whole event, indexed by GHIN, reused for
    // every player in every round below — not re-fetched per round.
    $eventRosterByGhin = [];
    foreach (ServiceDbEventPlayers::getEventRoster($eid) as $r) {
      $ghin = (string)($r["dbEventPlayers_GHIN"] ?? "");
      if ($ghin !== "") $eventRosterByGhin[$ghin] = $r;
    }

    $games = ServiceDbGames::getGamesByEID($eid);
    $summary["roundsTouched"] = count($games);

    foreach ($games as $game) {
      $ggid = (string)$game["dbGames_GGID"];

      foreach (ServiceDbPlayers::getGamePlayers($ggid) as $playerRow) {
        self::applyEventDataToGamePlayer($ggid, $playerRow, $event, $eventRosterByGhin);
      }

      $reconciled = WorkflowReconcilePairingBoundaries::reconcileGame($ggid, $game);
      if ($reconciled) {
        $summary["roundsAffected"]++;
        $summary["affectedGgids"][] = $ggid;
      }
    }

    return $summary;
  }

  /**
   * Applies whichever of Team/Flight/Pairing are currently fixed to ONE
   * player's row, sourced from their event-roster enrollment. A player
   * with no matching event-roster row (not enrolled at the event level)
   * is left untouched — nothing to inherit.
   *
   * All three dimensions are treated symmetrically: while a dimension is
   * "fixed," whatever the event roster currently says — including a
   * blank Team/Flight or an unassigned ("000") Pairing — propagates
   * unconditionally. An earlier version of this function skipped "000"
   * Pairing values, treating them as "nothing to push." That was wrong:
   * flipping a mode to "none" is non-destructive (existing round data is
   * simply left alone going forward), but an explicit clear WHILE fixed
   * is a deliberate assertion of the new state and is meant to be
   * destructive, propagating everywhere — exactly like clearing Team
   * assignments at the event level already blanks TeamKey across every
   * round. Pairing gets no special exemption from that rule.
   */
  private static function applyEventDataToGamePlayer(string $ggid, array $playerRow, array $event, array $eventRosterByGhin): void
  {
    $ghin = (string)($playerRow["dbPlayers_PlayerGHIN"] ?? "");
    if ($ghin === "") return;

    $eventPlayer = $eventRosterByGhin[$ghin] ?? null;
    if (!$eventPlayer) return;

    $teamMode    = (string)($event["dbEvents_TeamMode"]    ?? "none");
    $flightMode  = (string)($event["dbEvents_FlightMode"]  ?? "none");
    $pairingMode = (string)($event["dbEvents_PairingMode"] ?? "none");

    $fields = [];
    if ($teamMode === "fixed") {
      $fields["dbPlayers_TeamKey"] = (string)($eventPlayer["dbEventPlayers_TeamKey"] ?? "");
    }
    if ($flightMode === "fixed") {
      $fields["dbPlayers_FlightKey"] = (string)($eventPlayer["dbEventPlayers_FlightKey"] ?? "");
    }
    if ($pairingMode === "fixed") {
      $fields["dbPlayers_PairingID"]  = (string)($eventPlayer["dbEventPlayers_PairingID"]  ?? "000");
      $fields["dbPlayers_PairingPos"] = (string)($eventPlayer["dbEventPlayers_PairingPos"] ?? "");
    }

    if (!$fields) return; // every dimension is "none" — nothing to apply

    ServiceDbPlayers::updateGamePlayerFields($ggid, $ghin, $fields);
  }
}
