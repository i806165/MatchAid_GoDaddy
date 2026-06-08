<?php
declare(strict_types=1);
// /services/workflows/hydrateClubUsers.php

require_once __DIR__ . "/../../bootstrap.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SERVICES . "/database/service_dbFavPlayers.php";
require_once MA_SERVICES . "/database/service_dbGames.php";

/**
 * hydrateClubUsers
 *
 * Queries db_Users scoped to the resolved facility.
 *
 * Two-query approach for performance:
 *   1. LIKE pre-filter on dbUser_Profile to find matching GHINs
 *      — avoids pulling longtext for all users
 *   2. Fetch display columns only for matching GHINs
 *      — dbUser_Profile never crosses the wire in query 2
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

    // ----------------------------------------------------------------
    // Query 1 — Pre-filter: find GHINs whose profile contains this
    // facility_id. The pattern "facility_id":NNNN is structurally
    // reliable in the GHIN API JSON — facility_id is always an integer,
    // never quoted, so this match is precise.
    // dbUser_Profile (longtext) is only touched here for the LIKE — 
    // it is NOT selected, keeping data transfer minimal.
    // ----------------------------------------------------------------
    $likePattern = '%"facility_id":' . intval($facilityId) . '%';

    $sqlGhins = "
      SELECT CAST(dbUser_GHIN AS CHAR) AS ghin
      FROM db_Users
      WHERE dbUser_Profile LIKE :pattern
    ";

    $stGhins = $pdo->prepare($sqlGhins);
    $stGhins->execute([":pattern" => $likePattern]);
    $ghins = $stGhins->fetchAll(PDO::FETCH_COLUMN) ?: [];

    if (empty($ghins)) {
      Logger::info("CLUB_USERS_HYDRATE_EMPTY", [
        "userGHIN"   => $userGHIN,
        "facilityId" => $facilityId,
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
        "users"  => [],
        "header" => [
          "title"    => "Club Users",
          "subtitle" => $facilityName ?: $clubName,
        ],
      ];
    }

    // ----------------------------------------------------------------
    // Query 2 — Fetch display columns only for matching GHINs.
    // dbUser_Profile is deliberately excluded — not needed for display.
    // ----------------------------------------------------------------
    $placeholders = implode(",", array_map(
      fn(int $i) => ":g{$i}",
      range(0, count($ghins) - 1)
    ));

    $params = [];
    foreach ($ghins as $i => $ghin) {
      $params[":g{$i}"] = $ghin;
    }

    $sqlUsers = "
      SELECT
        CAST(dbUser_GHIN        AS CHAR) AS ghin,
        dbUser_Name                       AS name,
        dbUser_FName                      AS fName,
        dbUser_LName                      AS lName,
        dbUser_EMail                      AS email,
        dbUser_MobilePhone                AS mobilePhone,
        dbUser_ContactMethod              AS contactMethod,
        _createdDate                      AS createdDate,
        _updatedDate                      AS updatedDate
      FROM db_Users
      WHERE CAST(dbUser_GHIN AS CHAR) IN ({$placeholders})
      ORDER BY dbUser_LName ASC, dbUser_FName ASC
    ";

    $stUsers = $pdo->prepare($sqlUsers);
    $stUsers->execute($params);
    $rows = $stUsers->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Normalize — ensure all values are strings, never null
    $normalized = array_map(function (array $row): array {
      $ghin = trim(strval($row["ghin"] ?? ""));
      return [
        "ghin"           => $ghin,
        "name"           => trim(strval($row["name"]          ?? "")),
        "fName"          => trim(strval($row["fName"]         ?? "")),
        "lName"          => trim(strval($row["lName"]         ?? "")),
        "email"          => trim(strval($row["email"]         ?? "")),
        "mobilePhone"    => trim(strval($row["mobilePhone"]   ?? "")),
        "contactMethod"  => trim(strval($row["contactMethod"] ?? "")),
        "createdDate"    => trim(strval($row["createdDate"]   ?? "")),
        "updatedDate"    => trim(strval($row["updatedDate"]   ?? "")),
        "favPlayerCount" => $ghin !== "" ? service_dbFavPlayers::getFavPlayerCountForUser($ghin) : 0,
        "gameCount"      => $ghin !== "" ? ServiceDbGames::getGameCountForAdmin($ghin)           : 0,
      ];
    }, $rows);

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