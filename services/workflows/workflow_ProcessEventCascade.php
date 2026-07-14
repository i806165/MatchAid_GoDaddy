<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ProcessEventCascade.php
// Cross-domain writes from event tables (db_Events / db_EventPlayers)
// down into every round belonging to that event (db_Games / db_Players).
// Lives outside ServiceDbEventPlayers / ServiceDbEvents on purpose —
// those services own a single table each and don't write across domains.

require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";
require_once MA_SERVICES . "/workflows/workflow_ReconcilePairingBoundaries.php";

final class WorkflowProcessEventCascade
{
  /** Mirror TeamConfig into every round under the event. Always unconditional. */
  public static function propagateTeamConfig(int $eid, ?array $teamConfig): void
  {
    $json = $teamConfig ? json_encode($teamConfig) : null;
    foreach (ServiceDbGames::getGamesByEID($eid) as $game) {
      ServiceDbGames::updateGame((int)$game["dbGames_GGID"], [
        "dbGames_TeamConfig" => $json,
      ]);
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
  public static function propagateFlightConfig(int $eid, array $flightConfig): void
  {
    $json = json_encode($flightConfig);
    foreach (ServiceDbGames::getGamesByEID($eid) as $game) {
      ServiceDbGames::updateGame((int)$game["dbGames_GGID"], [
        "dbGames_FlightConfig" => $json,
      ]);
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
   * round under the event. Always unconditional, same as its Team/Flight
   * siblings — the caller (saveEventHandicapSettings.php) decides whether
   * to invoke this at all, only when dbEvents_HandicapMode is "fixed".
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
      ServiceDbGames::updateGame((int)$game["dbGames_GGID"], [
        "dbGames_HCMethod"          => $config["method"]      ?? "CH",
        "dbGames_Allowance"         => $config["allowance"]   ?? 100,
        "dbGames_HCEffectivity"     => $config["effectivity"] ?? "PlayDate",
        "dbGames_HCEffectivityDate" => $config["effDate"]     ?? null,
      ]);
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
