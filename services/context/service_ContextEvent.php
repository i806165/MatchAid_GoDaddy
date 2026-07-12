<?php
declare(strict_types=1);

// /public_html/services/context/service_ContextEvent.php
// Event context management (SessionStoredEID) + hydrated event retrieval.

require_once MA_SVC_DB . "/service_dbEvents.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";

final class ServiceContextEvent
{
  private const SESSION_KEY = "SessionStoredEID";

  public static function setEventContext(int $eid): void
  {
    $_SESSION[self::SESSION_KEY] = $eid;
  }

  public static function clearEventContext(): void
  {
    unset($_SESSION[self::SESSION_KEY]);
  }

  public static function getStoredEID(): ?int
  {
    $v = $_SESSION[self::SESSION_KEY] ?? null;
    if ($v === null || $v === "") return null;
    return (int)$v;
  }

  public static function getEventContext(?int $eid = null): array
  {
    if ($eid === null || $eid <= 0) {
      $eid = self::getStoredEID();
    }

    if (!$eid) {
      throw new RuntimeException("No event is selected (SessionStoredEID not set).");
    }

    $event = ServiceDbEvents::getEventByEID((int)$eid);
    if (!$event) {
      throw new RuntimeException("Selected event not found.");
    }

    return [
      "eid" => (int)$eid,
      "event" => self::hydrateForUi($event),
      "authorizations" => self::getEventAuthorizations($event)
    ];
  }

  public static function getEvent(?int $eid = null): array
  {
    $ctx = self::getEventContext($eid);
    return $ctx["event"];
  }

  public static function getEventAuthorizations(?array $event = null): array
  {
    // V1 placeholder; computeEventAuthorizations has the real rules.
    return [
      "canEdit" => true,
      "canDelete" => true
    ];
  }

  public static function computeEventAuthorizations(array $args): array
  {
    $userGHIN = trim((string)($args["userGHIN"] ?? ""));
    $eid = (int)($args["eid"] ?? 0);
    $userFacilityId = trim((string)($args["userFacilityId"] ?? ""));
    $action = trim((string)($args["action"] ?? ""));

    if ($userGHIN === "" || $eid <= 0) {
      return [
        "status" => "Error",
        "role" => "Error",
        "action" => $action,
        "message" => "Missing userGHIN or EID.",
        "canEdit" => false,
        "canDelete" => false
      ];
    }

    $event = ServiceDbEvents::getEventByEID($eid);
    if (!$event) {
      return [
        "status" => "Error",
        "role" => "Error",
        "action" => $action,
        "message" => "Event not found.",
        "canEdit" => false,
        "canDelete" => false
      ];
    }

    $facilityId = trim((string)($event["dbEvents_FacilityID"] ?? ""));
    $adminGHIN = trim((string)($event["dbEvents_AdminGHIN"] ?? ""));

    try {
      $pdo = Db::pdo();

      // 1) Site Admin
      $stmt = $pdo->prepare("
        SELECT 1
          FROM db_UserRoles
         WHERE dbUserRoles_UserGHIN = :u
           AND dbUserRoles_FacilityID = '00000'
         LIMIT 1
      ");
      $stmt->execute([":u" => $userGHIN]);
      if ($stmt->fetchColumn()) {
        return self::authResult("Authorized", "Site Admin", $action);
      }

      // 2) Facility Admin
      if ($facilityId !== "") {
        $stmt = $pdo->prepare("
          SELECT 1
            FROM db_UserRoles
           WHERE dbUserRoles_UserGHIN = :u
             AND dbUserRoles_FacilityID = :fid
           LIMIT 1
        ");
        $stmt->execute([":u" => $userGHIN, ":fid" => $facilityId]);
        if ($stmt->fetchColumn()) {
          return self::authResult("Authorized", "Facility Admin", $action);
        }
      }

      // 3) Event Admin
      if ($adminGHIN !== "" && $userGHIN === $adminGHIN) {
        return self::authResult("Authorized", "Event Admin", $action);
      }

      return self::authResult("Unauthorized", "User", $action);

    } catch (Throwable $e) {
      error_log("[MA][computeEventAuthorizations] EX " . $e->getMessage());
      return [
        "status" => "Error",
        "role" => "Error",
        "action" => $action,
        "message" => "Authorization error.",
        "canEdit" => false,
        "canDelete" => false
      ];
    }
  }

  private static function authResult(string $status, string $role, string $action): array
  {
    $canEdit = ($status === "Authorized");
    $canDelete = ($status === "Authorized") && in_array($role, ["Site Admin", "Facility Admin", "Event Admin"], true);

    return [
      "status" => $status,
      "role" => $role,
      "action" => $action,
      "canEdit" => $canEdit,
      "canDelete" => $canDelete
    ];
  }

  public static function hydrateForUi(array $event): array
  {
    if (!empty($event["dbEvents_StartDate"])) {
      $event["startDateISO"] = substr((string)$event["dbEvents_StartDate"], 0, 10);
    }
    if (!empty($event["dbEvents_EndDate"])) {
      $event["endDateISO"] = substr((string)$event["dbEvents_EndDate"], 0, 10);
    }
    return $event;
  }

  public static function defaultEventForAdd(): array
  {
    $today = (new DateTimeImmutable("today"))->format("Y-m-d");

    $facilityName = (string)($_SESSION["SessionFacilityName"] ?? $_SESSION["SessionGHINFacilityName"] ?? "");

    $record = [
      "dbEvents_EID" => null,
      "dbEvents_Title" => "",
      "dbEvents_EventType" => "Tournament",
      "dbEvents_StartDate" => $today,
      "dbEvents_EndDate" => $today,
      "dbEvents_Description" => "",

      "dbEvents_FacilityID" => (string)($_SESSION["SessionFacilityID"] ?? $_SESSION["SessionGHINFacilityID"] ?? ""),
      "dbEvents_FacilityName" => $facilityName,

      "dbEvents_AdminGHIN" => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
      "dbEvents_AdminName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
      "dbEvents_AdminLName" => (string)($_SESSION["SessionUserLName"] ?? ""),
      "dbEvents_AdminAssocID" => (string)($_SESSION["SessionAdminAssocID"] ?? ""),
      "dbEvents_AdminAssocName" => (string)($_SESSION["SessionAdminAssocName"] ?? ""),
      "dbEvents_AdminClubID" => (string)($_SESSION["SessionAdminClubID"] ?? $_SESSION["SessionClubID"] ?? ""),
      "dbEvents_AdminClubName" => (string)($_SESSION["SessionAdminClubName"] ?? $_SESSION["SessionClubName"] ?? ""),

      "dbEvents_ScoringMethod" => "",
      "dbEvents_ScoringConfig" => "",
      "dbEvents_TiebreakMethod" => "",
      "dbEvents_TiebreakConfig" => "",
    ];

    // Handicap shell defaults — mirrors ServiceContextGame::defaultGameForAdd()'s
    // applyAddDefaults()/alignHCEffectivity() pattern, kept as its own pair of
    // helpers rather than a shared abstraction, same convention already used
    // between service_dbGames.php and service_ContextGame.php.
    self::applyHandicapDefaults($record);
    self::alignHCEffectivity($record);

    return $record;
  }

  /** Mirrors ServiceContextGame::applyAddDefaults() — handicap fields only. */
  private static function applyHandicapDefaults(array &$record): void
  {
    if (empty($record["dbEvents_HCMethod"]))      $record["dbEvents_HCMethod"] = "CH";
    if (!isset($record["dbEvents_Allowance"]) || $record["dbEvents_Allowance"] === null || $record["dbEvents_Allowance"] === "") {
      $record["dbEvents_Allowance"] = 100;
    }
    if (empty($record["dbEvents_HandicapMode"]))  $record["dbEvents_HandicapMode"] = "none";
  }

  /**
   * Mirrors ServiceContextGame::alignHCEffectivity() exactly, with
   * dbEvents_StartDate standing in for dbGames_PlayDate.
   */
  private static function alignHCEffectivity(array &$record): void
  {
    $hcEff = $record["dbEvents_HCEffectivity"] ?? null;
    $startYMD = self::toYMD($record["dbEvents_StartDate"] ?? null);

    if (!$startYMD) {
      $record["dbEvents_HCEffectivityDate"] = null;
      return;
    }

    switch ($hcEff) {
      case null:
      case "":
        $record["dbEvents_HCEffectivity"] = "PlayDate";
        $record["dbEvents_HCEffectivityDate"] = $startYMD;
        break;

      case "PlayDate":
        $record["dbEvents_HCEffectivityDate"] = $startYMD;
        break;

      case "Date":
        $effYMD = self::toYMD($record["dbEvents_HCEffectivityDate"] ?? null);
        if (!$effYMD || $effYMD > $startYMD) {
          $record["dbEvents_HCEffectivityDate"] = $startYMD;
        } else {
          $record["dbEvents_HCEffectivityDate"] = $effYMD;
        }
        break;

      default:
        $record["dbEvents_HCEffectivityDate"] = null;
        break;
    }
  }

  /** Direct copy of ServiceContextGame::toYMD() — same contract. */
  private static function toYMD($v): ?string
  {
    if ($v === null) return null;
    $s = trim((string)$v);
    if ($s === "") return null;

    if (preg_match('/^\d{4}-\d{2}-\d{2}/', $s, $m)) {
      return substr($s, 0, 10);
    }

    $ts = strtotime($s);
    if ($ts === false) return null;
    return date("Y-m-d", $ts);
  }
}
