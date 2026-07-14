<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ProcessEventCascade.php
// Cross-domain writes from event tables (db_Events / db_EventPlayers)
// down into every round belonging to that event (db_Games / db_Players).
// Lives outside ServiceDbEventPlayers / ServiceDbEvents on purpose —
// those services own a single table each and don't write across domains.

require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbEvents.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ReconcilePairingBoundaries.php";

final class WorkflowProcessEventCascade
{
  /**
   * Path A — Event → Game (config level): the ONE implementation of
   * "does this round need dbEvents_* config applied to its dbGames_*
   * columns, and if so, apply it." Determines relevance and per-dimension
   * mode-gating internally — callers never duplicate that logic.
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
   * Mirror TeamConfig into every round under the event.
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
   * Mirror TeamKey for each enrolled GHIN into every round under the event.
   * @return array Reconciliation summary — see propagateFields().
   */
  public static function propagateTeamAssignments(int $eid, array $ghinToTeam): array
  {
    return self::propagateFields($eid, $ghinToTeam, function ($val) {
      return ["dbPlayers_TeamKey" => $val];
    });
  }

  /**
   * Mirror PairingID/Pos for each enrolled GHIN — caller must pre-filter
   * $ghinToPairing to GHINs that already have a real pairing (id !== "000")
   * and must not call this at all when PairingMode isn't "fixed".
   * @return array Reconciliation summary — see propagateFields().
   */
  public static function propagatePairingAssignments(int $eid, array $ghinToPairing): array
  {
    return self::propagateFields($eid, $ghinToPairing, function ($val) {
      return [
        "dbPlayers_PairingID"  => $val["id"],
        "dbPlayers_PairingPos" => $val["pos"],
      ];
    });
  }

  /** Mirror FlightConfig into every round under the event. Always unconditional. */
  /**
   * Mirror FlightConfig into every round under the event.
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
   * Mirror FlightKey for each enrolled GHIN into every round under the event.
   * @return array Reconciliation summary — see propagateFields().
   */
  public static function propagateFlightAssignments(int $eid, array $ghinToFlight): array
  {
    return self::propagateFields($eid, $ghinToFlight, function ($val) {
      return ["dbPlayers_FlightKey" => $val];
    });
  }

  /**
   * Mirror handicap rules (Method/Allowance/Effectivity/Date) into every
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
   * Shared by propagateTeamAssignments / propagateFlightAssignments /
   * propagatePairingAssignments. Writes each field, then — for every round
   * the loop visits (all rounds linked to the event, unconditionally; see
   * class-level note below) — runs the same boundary reconciliation the
   * round-level Manage Teams/Define Flights saves and gamepairings.php's
   * own load already run (workflow_ReconcilePairingBoundaries), passing
   * the $game row already in hand to skip its internal lookup.
   *
   * Every linked round is checked on every call, not just rounds this
   * particular $ghinMap happened to write to — a fixed-mode Apply always
   * writes to every round (there's no selective per-round save), so this
   * matches that: one check per round, every pass, no conditional logic
   * about whether "this write mattered" to that round.
   *
   * Exception: if $ghinMap itself is empty (nothing was submitted to
   * propagate at all — a degenerate case, not the normal fixed-mode flow),
   * this returns immediately without visiting any round or reconciling
   * anything, since nothing was actually saved.
   *
   * @return array{ roundsTouched: int, roundsAffected: int, affectedGgids: string[] }
   *   roundsTouched  — every round linked to the event (== getGamesByEID() count).
   *   roundsAffected — how many of those had a boundary violation reset.
   *   affectedGgids  — which ones, for logging; the client-facing message
   *                    stays terse ("N of M rounds"), not a per-round dump.
   */
  private static function propagateFields(int $eid, array $ghinMap, callable $toFields): array
  {
    $summary = ["roundsTouched" => 0, "roundsAffected" => 0, "affectedGgids" => []];
    if (!$ghinMap) return $summary;

    $games = ServiceDbGames::getGamesByEID($eid);
    $summary["roundsTouched"] = count($games);

    foreach ($games as $game) {
      $ggid = (string)$game["dbGames_GGID"];
      foreach (ServiceDbPlayers::getGamePlayers($ggid) as $row) {
        $ghin = (string)($row["dbPlayers_PlayerGHIN"] ?? "");
        if ($ghin !== "" && array_key_exists($ghin, $ghinMap)) {
          ServiceDbPlayers::updateGamePlayerFields($ggid, $ghin, $toFields($ghinMap[$ghin]));
        }
      }

      $reconciled = WorkflowReconcilePairingBoundaries::reconcileGame($ggid, $game);
      if ($reconciled) {
        $summary["roundsAffected"]++;
        $summary["affectedGgids"][] = $ggid;
      }
    }

    return $summary;
  }
}
