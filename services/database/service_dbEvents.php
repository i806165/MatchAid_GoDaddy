<?php
declare(strict_types=1);

// /public_html/services/database/service_dbEvents.php
// db_Events access for Events Home and Event maintenance.

require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";

final class ServiceDbEvents
{
  // Independent copy — same name/value as the constants of the same
  // purpose in module_defineEventKPI.js and
  // ServiceBuildEventSummary::EVENT_PLACEMENT_DEFAULTS, kept in sync by
  // convention (grep EVENT_PLACEMENT_DEFAULTS to find all three), not by
  // a shared require. This copy is the one that actually matters —
  // it's the value written into dbEvents_KPIConfig at event creation and
  // on a mode-transition sync; the other two are UI seeding and a
  // same-class crash guard respectively, not sources of truth.
  private const EVENT_PLACEMENT_DEFAULTS = ["1" => 100, "2" => 75, "3" => 50];
  private const DEFAULT_TIE_RULE = "split";

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
    self::syncKPIConfigForModeChange($eid, $fields);

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

      self::applyDefaultsForAdd($updated);
      self::enforceHcEffectivity($updated);

      $newEID = self::insertEvent($updated);
      $saved = self::getEventByEID($newEID) ?? $updated;
      $saved["dbEvents_EID"] = $newEID;
      return ["eid" => $newEID, "event" => $saved, "mode" => "edit"];
    }

    // edit: enforce rules
    self::enforceHcEffectivity($updated);

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
   * Handicap defaults for a new Event — mirrors service_dbGames.php's
   * applyDefaultsForAdd() for the same fields, deliberately kept in
   * lockstep so neither drifts from the other. Scoped only to the
   * handicap fields; Events has no other defaultable fields in scope here.
   */
  private static function applyDefaultsForAdd(array &$e): void
  {
    if (empty($e["dbEvents_HCMethod"])) {
      $e["dbEvents_HCMethod"] = "CH";
    }
    if (!isset($e["dbEvents_Allowance"]) || $e["dbEvents_Allowance"] === null || $e["dbEvents_Allowance"] === "") {
      $e["dbEvents_Allowance"] = 100;
    }
    if (empty($e["dbEvents_HCEffectivity"])) {
      $e["dbEvents_HCEffectivity"] = "PlayDate";
    }
    if (empty($e["dbEvents_HandicapMode"])) {
      $e["dbEvents_HandicapMode"] = "none";
    }

    // KPIConfig — always hydrated, never left null/empty, mirroring
    // ServiceDbGames' own applyDefaultsForAdd() philosophy for
    // dbGames_PlacementPoints. Unlike games, not every category is
    // unconditionally in scope for an event: Individual Gross/Net apply
    // to every event regardless of configuration, so they seed
    // "default". Pairing/Team are only ever meaningful once their
    // respective mode is "fixed" — which a brand-new event never is —
    // so they seed "disabled" rather than falsely implying they're
    // already valid. See ServiceBuildEventSummary::parseEventKPIConfig()
    // for the four keys this must match exactly.
    if (empty($e["dbEvents_KPIConfig"])) {
      $e["dbEvents_KPIConfig"] = json_encode(self::seedKPIConfig());
    }
  }

  /**
   * Default dbEvents_KPIConfig shape — all four categories always
   * present and fully populated (pointsConfig/tieRule), only "state"
   * ever differs. Individual Gross/Net seed "default" since they're
   * always in scope; Pairing/Team seed "disabled" since they depend on
   * dbEvents_PairingMode/TeamMode being "fixed", which a new event
   * never starts as. Values are this class's own EVENT_PLACEMENT_DEFAULTS
   * — this is the one place that actually establishes the default.
   */
  private static function seedKPIConfig(): array
  {
    $table = self::EVENT_PLACEMENT_DEFAULTS;
    $tie   = self::DEFAULT_TIE_RULE;

    return [
      "grossPlacement"   => ["state" => "default",  "pointsConfig" => $table, "tieRule" => $tie],
      "netPlacement"     => ["state" => "default",  "pointsConfig" => $table, "tieRule" => $tie],
      "pairingPlacement" => ["state" => "disabled", "pointsConfig" => $table, "tieRule" => $tie],
      "teamPlacement"    => ["state" => "disabled", "pointsConfig" => $table, "tieRule" => $tie],
    ];
  }

  /**
   * Forces pairingPlacement/teamPlacement's KPIConfig state to track
   * dbEvents_PairingMode/TeamMode whenever updateEvent() is asked to
   * change one of those mode columns — regardless of which caller
   * triggered it (saveEventRosterPairings.php, saveTeamConfig.php, or
   * saveEvent.php's own edit path all converge on updateEvent(), which
   * is why the sync lives here rather than in any one of them).
   *
   * Mode -> "fixed": category state -> "default" (now in scope, not yet
   * consciously confirmed by an admin in the KPI modal).
   * Mode -> "none"/anything else: category state -> "disabled" (out of
   * scope). pointsConfig/tieRule are NEVER cleared or reset here — an
   * admin's prior configuration survives a mode toggle untouched, only
   * "state" moves. If the mode key is present in $fields but its value
   * is unchanged from what's already stored, this is a no-op — a full
   * merged-row save (e.g. from saveEvent.php's edit path, which always
   * carries every dbEvents_* column) must not re-force state on every
   * unrelated save.
   */
  private static function syncKPIConfigForModeChange(int $eid, array &$fields): void
  {
    $touchesPairing = array_key_exists("dbEvents_PairingMode", $fields);
    $touchesTeam    = array_key_exists("dbEvents_TeamMode", $fields);
    if (!$touchesPairing && !$touchesTeam) return;

    $existing = self::getEventByEID($eid);
    if (!$existing) return;

    $transitions = [];

    if ($touchesPairing) {
      $old = trim((string)($existing["dbEvents_PairingMode"] ?? ""));
      $new = trim((string)($fields["dbEvents_PairingMode"] ?? ""));
      if ($old !== $new) $transitions["pairingPlacement"] = ($new === "fixed");
    }
    if ($touchesTeam) {
      $old = trim((string)($existing["dbEvents_TeamMode"] ?? ""));
      $new = trim((string)($fields["dbEvents_TeamMode"] ?? ""));
      if ($old !== $new) $transitions["teamPlacement"] = ($new === "fixed");
    }

    if (!$transitions) return;

    // Source the current config from whatever's already being written
    // in this same call (a caller could theoretically bundle both), else
    // fall back to what's stored — never invent a config that overwrites
    // an admin's real saved data.
    $raw = $fields["dbEvents_KPIConfig"] ?? $existing["dbEvents_KPIConfig"] ?? null;
    $decoded = null;
    if ($raw !== null && $raw !== "") {
      $decoded = is_array($raw) ? $raw : json_decode((string)$raw, true);
    }
    if (!is_array($decoded)) {
      $decoded = self::seedKPIConfig();
    }

    $table = self::EVENT_PLACEMENT_DEFAULTS;
    $tie   = self::DEFAULT_TIE_RULE;

    foreach ($transitions as $key => $isFixed) {
      if (!isset($decoded[$key]) || !is_array($decoded[$key])) {
        // Category never had a saved shape at all (legacy row predating
        // this seeding) — hydrate it now rather than writing a bare
        // state with no pointsConfig/tieRule alongside it.
        $decoded[$key] = ["pointsConfig" => $table, "tieRule" => $tie];
      }
      $decoded[$key]["state"] = $isFixed ? "default" : "disabled";
    }

    $fields["dbEvents_KPIConfig"] = json_encode($decoded);
  }

  /**
   * Mirrors service_dbGames.php's enforceHcEffectivity() exactly, with
   * dbEvents_StartDate standing in for dbGames_PlayDate — an event has no
   * single play date, so StartDate is the natural anchor. Called on both
   * add and edit, same as the Games version.
   */
  private static function enforceHcEffectivity(array &$e): void
  {
    $startDate = trim((string)($e["dbEvents_StartDate"] ?? ""));
    if ($startDate !== "") {
      $startDate = self::normalizeDateYMD($startDate);
      $e["dbEvents_StartDate"] = $startDate;
    }

    $eff = trim((string)($e["dbEvents_HCEffectivity"] ?? ""));
    $dt  = trim((string)($e["dbEvents_HCEffectivityDate"] ?? ""));

    if ($eff !== "Date") {
      // Only default if empty; otherwise respect Low3/Low12/PlayDate
      if ($eff === "") $e["dbEvents_HCEffectivity"] = "PlayDate";
      $e["dbEvents_HCEffectivityDate"] = $startDate;
      return;
    }

    // eff == Date
    if ($dt === "") $dt = $startDate;
    $dt = self::normalizeDateYMD($dt);
    if ($startDate !== "" && $dt > $startDate) $dt = $startDate; // clamp
    $e["dbEvents_HCEffectivityDate"] = $dt;
  }

  /** Direct copy of service_dbGames.php's normalizeDateYMD() — same contract. */
  private static function normalizeDateYMD(string $s): string
  {
    $s = trim($s);
    if ($s === "") return "";

    $s10 = substr($s, 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s10)) {
      throw new RuntimeException("Invalid StartDate format; expected YYYY-MM-DD.");
    }
    return $s10;
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
      // EVENT SETTINGS
      "dbEvents_PairingMode",
      "dbEvents_HCEffectivity",
      "dbEvents_HCEffectivityDate",
      "dbEvents_HCMethod",
      "dbEvents_Allowance",
      "dbEvents_HandicapMode",
      // EVENT COMPETITION
      "dbEvents_KPIConfig",
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
      "rosterCount" => (int)($r["rosterCount"] ?? 0),
      "gameCount" => (int)($r["gameCount"] ?? 0),
    ];
  }

  // -----------------------------
  // Round-Level Dimension Activation
  // -----------------------------

  /**
   * isDimensionActive($dimension, $game, $event)
   *
   * THE single authoritative answer to "is Team/Flight actually in use
   * right now for this round" — replaces every ad-hoc inference that
   * used to answer this by checking whether config data happened to be
   * present (e.g. game_pairings.js's old teamsActive(), and the private
   * mirror of it in workflow_ReconcilePairingBoundaries.php). Two
   * independent implementations of that inference had already silently
   * drifted into needing to stay manually in sync — this function is
   * what replaces both.
   *
   * Deliberately excludes Pairing — Pairing has no legitimate "off"
   * state at the round level (there is no dbGames_PairingConfig, no
   * round-owned PairingMode column, and none is planned). Locking
   * (pairingsLockedByEvent()) is the entire answer for Pairing; this
   * function is never called for it.
   *
   * Strict two-level hierarchy, event first, round second, off if
   * neither claims it:
   *   1. If $game.dbGames_EID is set AND $event.dbEvents_{Dim}Mode is
   *      "fixed" -> ACTIVE, event-authoritative. Stop.
   *   2. Else if $game.dbGames_{Dim}Mode is "active" -> ACTIVE,
   *      round-authoritative. Stop.
   *   3. Else -> INACTIVE.
   *
   * $event may be null (flat game, or round not yet resolved to an
   * event) — step 1 simply never matches in that case, same as if
   * dbGames_EID were unset.
   *
   * Mirrored in JS by MA.isDimensionActive() in
   * /assets/js/ma_SharedBusLogic.js — same signature, same order of
   * checks, kept as a deliberate duplicate (per project decision) rather
   * than a single cross-language shared implementation, since the logic
   * itself is only a few lines and duplication here is lower-risk than
   * the two-field ambiguity this function exists to close off.
   *
   * @param  string     $dimension  "team" | "flight"
   * @param  array      $game       db_Games row (or any array carrying
   *                                 dbGames_EID and dbGames_{Dim}Mode)
   * @param  ?array     $event      db_Events row, or null
   * @return bool
   */
  public static function isDimensionActive(string $dimension, array $game, ?array $event): bool
  {
    $dimension = strtolower(trim($dimension));
    $fieldMap = [
      "team"   => ["event" => "dbEvents_TeamMode",   "round" => "dbGames_TeamMode"],
      "flight" => ["event" => "dbEvents_FlightMode", "round" => "dbGames_FlightMode"],
    ];

    if (!isset($fieldMap[$dimension])) return false;

    $eventField = $fieldMap[$dimension]["event"];
    $roundField = $fieldMap[$dimension]["round"];

    $eid = (int)($game["dbGames_EID"] ?? 0);

    // 1) Event-authoritative
    if ($eid > 0 && $event) {
      $eventMode = trim((string)($event[$eventField] ?? ""));
      if ($eventMode === "fixed") return true;
    }

    // 2) Round-authoritative
    $roundMode = trim((string)($game[$roundField] ?? ""));
    if ($roundMode === "active") return true;

    // 3) Neither claims it
    return false;
  }
}
