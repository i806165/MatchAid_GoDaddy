<?php
declare(strict_types=1);
// /services/context/service_ContextFacility.php
//
// Shared facility resolution service.
// Extracted from hydrateClubDemand.php so club_home, club_demand,
// and club_users can all share the same resolution logic.
//
// Public API:
//   ServiceContextFacility::resolve(userGHIN, requestedFacilityId) → array
//   ServiceContextFacility::loadUserRoles(userGHIN) → array
//   ServiceContextFacility::isAuthorized(userGHIN) → bool

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";

final class ServiceContextFacility {

  /**
   * resolve()
   *
   * Resolves the facility context for the signed-in user.
   *
   * Returns:
   *   ok                 bool
   *   authorized         bool    — false if no roles found
   *   message            string  — only when authorized = false
   *   facilityId         string  — resolved/selected facility
   *   facilityName       string
   *   facilityOptions    array   — all available facilities for this user
   *   canSelectFacility  bool    — true when user has > 1 option
   *   canSearch          bool    — true when user is 00000 (site admin)
   *   hasAllAccess       bool    — true when user has 00000 role
   *
   * @param string $userGHIN
   * @param string $requestedFacilityId  Optional — preselected from session
   */
  public static function resolve(
    string $userGHIN,
    string $requestedFacilityId = ""
  ): array {
    $userGHIN           = trim($userGHIN);
    $requestedFacilityId = self::normalizeFacilityId($requestedFacilityId);

    if ($userGHIN === "") {
      return self::unauthorized("Missing user GHIN.");
    }

    try {
      $roles = self::loadUserRoles($userGHIN);

      if (empty($roles)) {
        return self::unauthorized("No facility access configured for your account.");
      }

      $hasAllAccess = false;
      $realOptions  = [];

      foreach ($roles as $role) {
        $fid = self::normalizeFacilityId($role["facilityId"] ?? "");
        $fn  = trim(strval($role["facilityName"] ?? ""));

        if ($fid === "00000") {
          $hasAllAccess = true;
          continue;
        }

        if ($fid !== "") {
          self::addFacilityOption($realOptions, $fid, $fn);
        }
      }

      // Site Admin — load all real facilities as options
      if ($hasAllAccess) {
        $allOptions = self::loadAllRealFacilities();
        if (!empty($allOptions)) {
          $realOptions = $allOptions;
        }
      }

      self::sortFacilityOptions($realOptions);

      if (empty($realOptions)) {
        return self::unauthorized("No facility access configured for your account.");
      }

      // Resolve the selected facility
      $selected = self::findFacilityOption($realOptions, $requestedFacilityId);

      // Default to first real facility when nothing requested or match not found
      if (!$selected) {
        $selected = $realOptions[0];
      }

      $facilityId   = strval($selected["facilityId"]   ?? "");
      $facilityName = strval($selected["facilityName"] ?? "");
      $optionCount  = count($realOptions);

      return [
        "ok"                => true,
        "authorized"        => true,
        "facilityId"        => $facilityId,
        "facilityName"      => $facilityName,
        "facilityOptions"   => array_values($realOptions),
        "canSelectFacility" => $optionCount > 1,
        "canSearch"         => $hasAllAccess,
        "hasAllAccess"      => $hasAllAccess,
      ];

    } catch (Throwable $e) {
      Logger::error("FACILITY_RESOLVE_FAIL", [
        "userGHIN" => $userGHIN,
        "err"      => $e->getMessage(),
      ]);
      return self::unauthorized("Facility resolution failed.");
    }
  }

  /**
   * loadUserRoles()
   * Returns all facility roles for the given user from db_UserRoles.
   */
  public static function loadUserRoles(string $userGHIN): array {
    $userGHIN = trim($userGHIN);
    if ($userGHIN === "") return [];

    $pdo = Db::pdo();

    $sql = "
      SELECT DISTINCT
        CAST(dbUserRoles_FacilityID   AS CHAR) AS facilityId,
        dbUserRoles_FacilityName               AS facilityName,
        dbUserRoles_RoleID                     AS roleId
      FROM db_UserRoles
      WHERE CAST(dbUserRoles_UserGHIN AS CHAR) = :ghin
      ORDER BY dbUserRoles_FacilityName ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute([":ghin" => $userGHIN]);

    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  }

  /**
   * isAuthorized()
   * Quick check — does this user have any facility roles?
   */
  public static function isAuthorized(string $userGHIN): bool {
    return !empty(self::loadUserRoles(trim($userGHIN)));
  }

  // ── Private helpers ─────────────────────────────────────────────

  /**
   * Load all real (non-00000) facilities from db_UserRoles.
   * Used only for Site Admin (00000) users.
   */
  private static function loadAllRealFacilities(): array {
    $pdo = Db::pdo();

    $sql = "
      SELECT DISTINCT
        CAST(dbUserRoles_FacilityID   AS CHAR) AS facilityId,
        dbUserRoles_FacilityName               AS facilityName
      FROM db_UserRoles
      WHERE TRIM(CAST(dbUserRoles_FacilityID AS CHAR)) <> ''
        AND TRIM(CAST(dbUserRoles_FacilityID AS CHAR)) <> '00000'
      ORDER BY dbUserRoles_FacilityName ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute();

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $out  = [];

    foreach ($rows as $row) {
      $fid = self::normalizeFacilityId($row["facilityId"] ?? "");
      $fn  = trim(strval($row["facilityName"] ?? ""));
      if ($fid !== "") {
        self::addFacilityOption($out, $fid, $fn);
      }
    }

    self::sortFacilityOptions($out);
    return array_values($out);
  }

  private static function normalizeFacilityId($value): string {
    return trim(strval($value ?? ""));
  }

  private static function addFacilityOption(
    array &$options,
    string $facilityId,
    string $facilityName
  ): void {
    if ($facilityId === "" || $facilityId === "00000") return;

    if ($facilityName === "") {
      $facilityName = "Facility " . $facilityId;
    }

    foreach ($options as $existing) {
      if (strval($existing["facilityId"] ?? "") === $facilityId) return;
    }

    $options[] = [
      "facilityId"   => $facilityId,
      "facilityName" => $facilityName,
    ];
  }

  private static function findFacilityOption(
    array $options,
    string $facilityId
  ): ?array {
    if ($facilityId === "" || $facilityId === "00000") return null;

    foreach ($options as $option) {
      if (strval($option["facilityId"] ?? "") === $facilityId) {
        return $option;
      }
    }

    return null;
  }

  private static function sortFacilityOptions(array &$options): void {
    usort($options, function (array $a, array $b): int {
      return strcasecmp(
        strval($a["facilityName"] ?? ""),
        strval($b["facilityName"] ?? "")
      );
    });
  }

  private static function unauthorized(string $message): array {
    return [
      "ok"                => true,
      "authorized"        => false,
      "message"           => $message,
      "facilityId"        => "",
      "facilityName"      => "",
      "facilityOptions"   => [],
      "canSelectFacility" => false,
      "canSearch"         => false,
      "hasAllAccess"      => false,
    ];
  }
}
