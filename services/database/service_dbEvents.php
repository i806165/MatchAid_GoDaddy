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

  /**
   * updateEvent(eid, fields)
   * Generic dynamic-column updater for db_Events.
   * Mirrors ServiceDbGames::updateGame() exactly — only keys prefixed
   * "dbEvents_" are applied; the PK column is always skipped.
   *
   * @param  int   $eid
   * @param  array $fields  keyed by db column name (dbEvents_*)
   * @return bool
   */
  public static function updateEvent(int $eid, array $fields): bool
  {
    $pdo = Db::pdo();
    $sets = [];
    $params = [":eid" => $eid];

    foreach ($fields as $k => $v) {
      if ($k === "dbEvents_EID") continue;
      if (!str_starts_with($k, "dbEvents_")) continue;
      $sets[] = "$k = :" . $k;
      $params[":" . $k] = $v;
    }

    if (!$sets) return true;

    $sql = "UPDATE db_Events SET " . implode(", ", $sets) . " WHERE dbEvents_EID = :eid LIMIT 1";
    $stmt = $pdo->prepare($sql);
    return $stmt->execute($params);
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

  public static function saveEvent(string $mode, array $patch, array $sessionCtx): array
  {
    $mode = strtolower(trim($mode)) === "add" ? "add" : "edit";

    // Load existing or create shell — mirrors ServiceDbGames::saveGame()
    if ($mode === "edit") {
      $eid = (int)($sessionCtx["eid"] ?? 0);
      if ($eid <= 0) throw new RuntimeException("Missing selected event.");
      $existing = self::getEventByEID($eid);
      if (!$existing) throw new RuntimeException("Event not found.");
      $base = $existing;
    } else {
      $eid = 0;
      $base = [];
    }

    // Apply patch (allowlist) — mirrors ServiceDbGames::applyPatch()
    $updated = self::applyEventPatch($base, $patch);

    $title = trim((string)($updated["dbEvents_Title"] ?? ""));
    if ($title === "") {
      throw new RuntimeException("Event title is required.");
    }

    $startDate = trim((string)($updated["dbEvents_StartDate"] ?? ""));
    $endDate = trim((string)($updated["dbEvents_EndDate"] ?? ""));
    if ($startDate === "" || $endDate === "") {
      throw new RuntimeException("Start date and end date are required.");
    }
    if ($endDate < $startDate) {
      throw new RuntimeException("End date cannot be before start date.");
    }

    if ($mode === "add") {
      $updated["dbEvents_FacilityID"] = (string)($sessionCtx["facilityId"] ?? "");
      if (trim((string)($updated["dbEvents_FacilityName"] ?? "")) === "") {
        $updated["dbEvents_FacilityName"] = (string)($sessionCtx["facilityName"] ?? "");
      }

      $updated["dbEvents_AdminGHIN"] = (string)($sessionCtx["adminGhin"] ?? "");
      $updated["dbEvents_AdminName"] = (string)($sessionCtx["adminName"] ?? "");
      $updated["dbEvents_AdminLName"] = (string)($sessionCtx["adminLName"] ?? "");
      $updated["dbEvents_AdminAssocID"] = (string)($sessionCtx["adminAssocId"] ?? "");
      $updated["dbEvents_AdminAssocName"] = (string)($sessionCtx["adminAssocName"] ?? "");
      $updated["dbEvents_AdminClubID"] = (string)($sessionCtx["adminClubId"] ?? "");
      $updated["dbEvents_AdminClubName"] = (string)($sessionCtx["adminClubName"] ?? "");

      $newEID = self::insertEvent($updated);
      $saved = self::getEventByEID($newEID) ?? $updated;
      $saved["dbEvents_EID"] = $newEID;
      return ["eid" => $newEID, "event" => $saved, "mode" => "edit"];
    }

    // edit
    self::updateEvent($eid, $updated);
    $saved = self::getEventByEID($eid);
    if (!$saved) {
      throw new RuntimeException("Event save succeeded, but event could not be reloaded.");
    }

    return [
      "mode" => "edit",
      "eid" => $eid,
      "event" => $saved
    ];
  }

  /**
   * applyEventPatch(base, patch)
   * Mirrors ServiceDbGames::applyPatch() — overlays only allowlisted
   * keys present in $patch onto $base, returning the merged array.
   */
  private static function applyEventPatch(array $base, array $patch): array
  {
    $allow = [
      "dbEvents_Title",
      "dbEvents_EventType",
      "dbEvents_StartDate",
      "dbEvents_EndDate",
      "dbEvents_Description",
      "dbEvents_FacilityName",
      "dbEvents_ScoringMethod",
      "dbEvents_ScoringConfig",
      "dbEvents_TiebreakMethod",
      "dbEvents_TiebreakConfig",
      "dbEvents_PairingMode",
      "dbEvents_HCEffectivity",
      "dbEvents_HCEffectivityDate",
    ];

    foreach ($allow as $k) {
      if (array_key_exists($k, $patch)) {
        $base[$k] = $patch[$k];
      }
    }

    return $base;
  }

  /**
   * insertEvent(e)
   * Mirrors ServiceDbGames::insertGame() — dynamic INSERT built from
   * any dbEvents_-prefixed keys present in $e, excluding the PK.
   *
   * @param  array $e
   * @return int   newly inserted EID
   */
  private static function insertEvent(array $e): int
  {
    $pdo = Db::pdo();
    $cols = [];
    $vals = [];
    $params = [];

    foreach ($e as $k => $v) {
      if ($k === "dbEvents_EID") continue;
      if (!str_starts_with($k, "dbEvents_")) continue;
      $cols[] = $k;
      $vals[] = ":" . $k;
      $params[":" . $k] = $v;
    }

    if (!$cols) throw new RuntimeException("No fields to insert.");

    $sql = "INSERT INTO db_Events (" . implode(",", $cols) . ") VALUES (" . implode(",", $vals) . ")";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return (int)$pdo->lastInsertId();
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
