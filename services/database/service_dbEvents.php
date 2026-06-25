<?php
declare(strict_types=1);

// /public_html/services/database/service_dbEvents.php
// db_Events access for Events Home and Event maintenance.

require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";

final class ServiceDbEvents
{
  /**
   * Query events for Events Home.
   *
   * Args:
   * - clubId: required
   * - adminGHIN: required for V1 "my events"
   * - mode: current|past|all
   * - includeCounts: bool
   */
  public static function queryEvents(array $args): array
  {
    $pdo = Db::pdo();

    $clubId = trim((string)($args["clubId"] ?? ""));
    $adminGHIN = trim((string)($args["adminGHIN"] ?? ""));
    $mode = strtolower(trim((string)($args["mode"] ?? "current")));
    if (!in_array($mode, ["current", "past", "all"], true)) $mode = "current";

    $includeCounts = !empty($args["includeCounts"]);
    $today = (new DateTime("today", new DateTimeZone("America/New_York")))->format("Y-m-d");

    $selectSql = "SELECT e.*";
    if ($includeCounts) {
      $selectSql .= ",
        (SELECT COUNT(*)
           FROM db_EventPlayers ep
          WHERE ep.dbEventPlayers_EID = e.dbEvents_EID) AS rosterCount,
        (SELECT COUNT(*)
           FROM db_Games g
          WHERE g.dbGames_EID = e.dbEvents_EID) AS gameCount";
    }

    $where = [];
    $params = [];

    if ($clubId !== "") {
      $where[] = "e.dbEvents_AdminClubID = :clubId";
      $params[":clubId"] = $clubId;
    }

    if ($adminGHIN !== "") {
      $where[] = "e.dbEvents_AdminGHIN = :adminGHIN";
      $params[":adminGHIN"] = $adminGHIN;
    }

    if ($mode === "current") {
      $where[] = "e.dbEvents_EndDate >= :today";
      $params[":today"] = $today;
      $order = "e.dbEvents_StartDate ASC, e.dbEvents_EID DESC";
    } else if ($mode === "past") {
      $where[] = "e.dbEvents_EndDate < :today";
      $params[":today"] = $today;
      $order = "e.dbEvents_EndDate DESC, e.dbEvents_EID DESC";
    } else {
      $order = "e.dbEvents_StartDate DESC, e.dbEvents_EID DESC";
    }

    $sql = $selectSql . " FROM db_Events e";
    if ($where) $sql .= " WHERE " . implode(" AND ", $where);
    $sql .= " ORDER BY " . $order;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $vm = array_map([self::class, "eventVm"], $rows);

    return [
      "events" => [
        "vm" => $vm,
        "raw" => $rows
      ]
    ];
  }

  public static function getEventByEID(int $eid): ?array
  {
    if ($eid <= 0) return null;
    $pdo = Db::pdo();
    $stmt = $pdo->prepare("SELECT * FROM db_Events WHERE dbEvents_EID = :eid LIMIT 1");
    $stmt->execute([":eid" => $eid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }

  public static function countLinkedGames(int $eid): int
  {
    if ($eid <= 0) return 0;
    $pdo = Db::pdo();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM db_Games WHERE dbGames_EID = :eid");
    $stmt->execute([":eid" => $eid]);
    return (int)$stmt->fetchColumn();
  }

  public static function deleteEvent(int $eid): bool
  {
    if ($eid <= 0) return false;

    // V1 safety: block deletion if linked games exist.
    if (self::countLinkedGames($eid) > 0) {
      throw new RuntimeException("This event has linked games and cannot be deleted.");
    }

    $pdo = Db::pdo();

    // Remove event roster first, then event shell.
    $delPlayers = $pdo->prepare("DELETE FROM db_EventPlayers WHERE dbEventPlayers_EID = :eid");
    $delPlayers->execute([":eid" => $eid]);

    $delEvent = $pdo->prepare("DELETE FROM db_Events WHERE dbEvents_EID = :eid LIMIT 1");
    $delEvent->execute([":eid" => $eid]);

    return $delEvent->rowCount() > 0;
  }

  /**
   * Placeholder for Event Maintenance page.
   * Kept here so the service shape is ready.
   */
  public static function saveEvent(string $mode, array $patch, array $sessionCtx): array
  {
    throw new RuntimeException("saveEvent is not implemented yet.");
  }

  private static function eventVm(array $r): array
  {
    return [
      "eid" => (int)($r["dbEvents_EID"] ?? 0),
      "title" => (string)($r["dbEvents_Title"] ?? ""),
      "eventType" => (string)($r["dbEvents_EventType"] ?? ""),
      "startDate" => (string)($r["dbEvents_StartDate"] ?? ""),
      "endDate" => (string)($r["dbEvents_EndDate"] ?? ""),
      "facilityName" => (string)($r["dbEvents_FacilityName"] ?? ""),
      "adminName" => (string)($r["dbEvents_AdminName"] ?? ""),
      "adminGHIN" => (string)($r["dbEvents_AdminGHIN"] ?? ""),
      "scoringMethod" => (string)($r["dbEvents_ScoringMethod"] ?? ""),
      "rosterCount" => (int)($r["rosterCount"] ?? 0),
      "gameCount" => (int)($r["gameCount"] ?? 0),
    ];
  }
}
