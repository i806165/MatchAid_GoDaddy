<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ProcessEventCascade.php
// Cross-domain writes from event tables (db_Events / db_EventPlayers)
// down into every round belonging to that event (db_Games / db_Players).
// Lives outside ServiceDbEventPlayers / ServiceDbEvents on purpose —
// those services own a single table each and don't write across domains.

require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_SVC_DB . "/service_dbPlayers.php";

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

  /** Mirror TeamKey for each enrolled GHIN into every round under the event. */
  public static function propagateTeamAssignments(int $eid, array $ghinToTeam): void
  {
    self::propagateFields($eid, $ghinToTeam, function ($val) {
      return ["dbPlayers_TeamKey" => $val];
    });
  }

  /**
   * Mirror PairingID/Pos for each enrolled GHIN — caller must pre-filter
   * $ghinToPairing to GHINs that already have a real pairing (id !== "000")
   * and must not call this at all when PairingMode isn't "fixed".
   */
  public static function propagatePairingAssignments(int $eid, array $ghinToPairing): void
  {
    self::propagateFields($eid, $ghinToPairing, function ($val) {
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

  /** Mirror FlightKey for each enrolled GHIN into every round under the event. */
  public static function propagateFlightAssignments(int $eid, array $ghinToFlight): void
  {
    self::propagateFields($eid, $ghinToFlight, function ($val) {
      return ["dbPlayers_FlightKey" => $val];
    });
  }

  private static function propagateFields(int $eid, array $ghinMap, callable $toFields): void
  {
    if (!$ghinMap) return;
    foreach (ServiceDbGames::getGamesByEID($eid) as $game) {
      $ggid = (string)$game["dbGames_GGID"];
      foreach (ServiceDbPlayers::getGamePlayers($ggid) as $row) {
        $ghin = (string)($row["dbPlayers_PlayerGHIN"] ?? "");
        if ($ghin !== "" && array_key_exists($ghin, $ghinMap)) {
          ServiceDbPlayers::updateGamePlayerFields($ggid, $ghin, $toFields($ghinMap[$ghin]));
        }
      }
    }
  }
}
