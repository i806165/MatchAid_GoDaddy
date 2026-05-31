<?php
declare(strict_types=1);
// /services/workflows/hydrateClubUsers.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";

/**
 * hydrateClubUsers
 *
 * Queries db_Users scoped to the resolved facility via db_UserRoles.
 * All filtering (name search) is handled client-side in club_users.js.
 *
 * Facility must be resolved and set in session BEFORE this is called
 * (by club_home.php via service_ContextFacility).
 *
 * @param array $context  userGHIN / clubId / clubName / facilityId / facilityName
 * @return array          INIT payload for the Club Users page
 */
function hydrateClubUsers(array $context): array {

  $userGHIN     = trim(strval($context["userGHIN"]     ?? ""));
  $clubId       = trim(strval($context["clubId"]       ?? ""));
  $clubName     = trim(strval($context["clubName"]     ?? ""));
  $facilityId   = trim(strval($context["facilityId"]   ?? ""));
  $facilityName = trim(strval($context["facilityName"] ?? ""));

  if ($userGHIN === "") {
    return ["ok" => false, "message" => "Missing user context."];
  }

  if ($facilityId === "") {
    return ["ok" => false, "message" => "No facility selected. Return to Club Home and select a facility."];
  }

  try {
    $pdo = Db::pdo();

    // Scope db_Users to users who have a role at the resolved facility.
    // Joins db_UserRoles on GHIN so we only return users belonging
    // to this facility — not the entire system user list.
    $sql = "
      SELECT DISTINCT
        CAST(u.dbUser_GHIN        AS CHAR) AS ghin,
        u.dbUser_Name                       AS name,
        u.dbUser_FName                      AS fName,
        u.dbUser_LName                      AS lName,
        u.dbUser_EMail                      AS email,
        u.dbUser_MobilePhone                AS mobilePhone,
        u.dbUser_ContactMethod              AS contactMethod,
        u._createdDate                      AS createdDate,
        u._updatedDate                      AS updatedDate
      FROM db_Users u
      INNER JOIN db_UserRoles r
        ON CAST(r.dbUserRoles_UserGHIN AS CHAR) = CAST(u.dbUser_GHIN AS CHAR)
      WHERE TRIM(CAST(r.dbUserRoles_FacilityID AS CHAR)) = :facilityId
      ORDER BY u.dbUser_Name ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute([":facilityId" => $facilityId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Normalize rows — ensure all keys are strings, never null
    $normalized = array_map(function (array $row): array {
      return [
        "ghin"          => trim(strval($row["ghin"]          ?? "")),
        "name"          => trim(strval($row["name"]          ?? "")),
        "fName"         => trim(strval($row["fName"]         ?? "")),
        "lName"         => trim(strval($row["lName"]         ?? "")),
        "email"         => trim(strval($row["email"]         ?? "")),
        "mobilePhone"   => trim(strval($row["mobilePhone"]   ?? "")),
        "contactMethod" => trim(strval($row["contactMethod"] ?? "")),
        "createdDate"   => trim(strval($row["createdDate"]   ?? "")),
        "updatedDate"   => trim(strval($row["updatedDate"]   ?? "")),
      ];
    }, $rows);

    Logger::info("CLUB_USERS_HYDRATE_COMPLETE", [
      "userGHIN"     => $userGHIN,
      "facilityId"   => $facilityId,
      "facilityName" => $facilityName,
      "userCount"    => count($normalized),
    ]);

    return [
      "ok"      => true,
      "context" => [
        "clubId"       => $clubId,
        "clubName"     => $clubName,
        "facilityId"   => $facilityId,
        "facilityName" => $facilityName,
        "userGHIN"     => $userGHIN,
      ],
      "users"  => $normalized,
      "header" => [
        "title"    => "Club Users",
        "subtitle" => $facilityName ?: $clubName,
      ],
    ];

  } catch (Throwable $e) {
    Logger::error("CLUB_USERS_HYDRATE_FAIL", [
      "userGHIN"   => $userGHIN,
      "facilityId" => $facilityId,
      "err"        => $e->getMessage(),
    ]);

    return [
      "ok"      => false,
      "message" => "Failed to load users.",
    ];
  }
}
