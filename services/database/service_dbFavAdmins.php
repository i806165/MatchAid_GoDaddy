<?php
// /services/database/service_dbFavAdmins.php
declare(strict_types=1);

final class ServiceDbFavAdmins {

  /**
   * queryFavoriteAdmins
   * Returns: adminsAll (with isFavorite/isSelected), favoriteAdminKeys, selectedAdminKeys, favorites list
   *
   * Required inputs: userGHIN, clubId
   */

/**
 * queryFavoriteAdmins
 * Returns: adminsAll (with isFavorite/isSelected), favoriteAdminKeys, selectedAdminKeys, favorites list
 *
 * Required inputs: userGHIN, clubId
 */
public static function queryFavoriteAdmins(array $args): array {
  $userGHIN = strval($args["userGHIN"] ?? "");
  $clubId   = strval($args["clubId"] ?? "");
  $selected = $args["selectedAdminKeys"] ?? [];
  if (!is_array($selected)) $selected = [];

  // --- Use helpers ---
  // Note: helpers now instantiate their own PDO, so we don't pass it.
  $allAdmins = self::getAllGameAdmins(["clubId" => $clubId]);   // [{key,name}]
  $favorites = self::getFavoriteAdmins(["userGHIN" => $userGHIN]); // [{key,name,assocId,assocName}]

  // Build lookup sets and assoc meta from favorites
  $favSet  = [];  // key => true
  $favMeta = [];  // key => ["assocId"=>..., "assocName"=>...]
  foreach ($favorites as $f) {
    $k = strval($f["key"] ?? "");
    if ($k === "") continue;
    $favSet[$k] = true;
    $favMeta[$k] = [
      "assocId" => strval($f["assocId"] ?? ""),
      "assocName" => strval($f["assocName"] ?? "")
    ];
  }

  // Selected set
  $selSet = [];
  foreach ($selected as $k) {
    $kk = strval($k);
    if ($kk !== "") $selSet[$kk] = true;
  }

  // Merge flags into adminsAll; include assoc when known (favorites)
  $adminsAll = [];
  foreach ($allAdmins as $a) {
    $key = strval($a["key"] ?? "");
    if ($key === "") continue;

    $adminsAll[] = [
      "key" => $key,
      "name" => strval($a["name"] ?? ""),
      "isFavorite" => isset($favSet[$key]),
      "isSelected" => isset($selSet[$key]),
      "assocId" => strval($favMeta[$key]["assocId"] ?? ""),
      "assocName" => strval($favMeta[$key]["assocName"] ?? ""),
    ];
  }

  return [
    "adminsAll" => $adminsAll,
    "favoriteAdminKeys" => array_values(array_keys($favSet)),
    "selectedAdminKeys" => array_values(array_keys($selSet)),
    "favorites" => $favorites, // already in {key,name,assocId,assocName}
  ];
}

public static function getAllGameAdmins(array $args): array {
  $clubId = strval($args["clubId"] ?? "");
  if ($clubId === "") return [];
  $pdo = Db::pdo();

  $sqlAll = "
    SELECT DISTINCT
      dbGames_AdminGHIN AS adminGhin,
      dbGames_AdminName AS adminName
    FROM db_Games
    WHERE dbGames_AdminClubID = :clubId
      AND dbGames_AdminGHIN IS NOT NULL
      AND dbGames_AdminGHIN <> ''
    ORDER BY dbGames_AdminName
    LIMIT 500
  ";
  $st = $pdo->prepare($sqlAll);
  $st->execute([":clubId" => $clubId]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  return array_map(function($x) {
    return [
      "key" => strval($x["adminGhin"] ?? ""),
      "name" => strval($x["adminName"] ?? "")
    ];
  }, $rows);
}


public static function getFavoriteAdmins(array $args): array {
  $userGHIN = strval($args["userGHIN"] ?? "");
  if ($userGHIN === "") return [];
  $pdo = Db::pdo();

  $sqlFav = "
    SELECT
      dbFavAdmin_AdminGHIN AS adminGhin,
      dbFavAdmin_AdminName AS adminName,
      dbFavAdmin_AssocID   AS assocId,
      dbFavAdmin_AssocName AS assocName
    FROM db_FavAdmins
    WHERE dbFavAdmin_UserGHIN = :user
    ORDER BY dbFavAdmin_AdminName
    LIMIT 500
  ";
  $st = $pdo->prepare($sqlFav);
  $st->execute([":user" => $userGHIN]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  return array_map(function($x) {
    return [
      "key" => strval($x["adminGhin"] ?? ""),
      "name" => strval($x["adminName"] ?? ""),
      "assocId" => strval($x["assocId"] ?? ""),
      "assocName" => strval($x["assocName"] ?? "")
    ];
  }, $rows);
}



  /**
   * upsertFavoriteAdmin
   * Toggles favorite state for a given adminGhin for the current user.
   * Returns: { isFavorite: bool, message: string }
   */
  public static function upsertFavoriteAdmin(array $args): array {
    $user = strval($args["userGHIN"] ?? "");
    $adminKey = strval($args["adminKey"] ?? "");
    if ($user === "" || $adminKey === "") {
      return ["ok" => false, "message" => "Missing user or adminKey."];
    }

    $pdo = Db::pdo();
    // Does favorite exist?
$chk = $pdo->prepare("
  SELECT 1 AS found
  FROM db_FavAdmins
  WHERE dbFavAdmin_UserGHIN = :u
    AND dbFavAdmin_AdminGHIN = :a
  LIMIT 1
");
$chk->execute([":u" => $user, ":a" => $adminKey]);
$row = $chk->fetch(PDO::FETCH_ASSOC);

if ($row) {
  $del = $pdo->prepare("
    DELETE FROM db_FavAdmins
    WHERE dbFavAdmin_UserGHIN = :u
      AND dbFavAdmin_AdminGHIN = :a
    LIMIT 1
  ");
  $del->execute([":u" => $user, ":a" => $adminKey]);
  return ["ok" => true, "isFavorite" => false, "message" => "Removed from Favorites."];
}


    // Need admin name for insert (best effort via db_Games)
    $name = "";
    $nq = $pdo->prepare("SELECT dbGames_AdminName AS adminName FROM db_Games WHERE dbGames_AdminGHIN=:a LIMIT 1");
    $nq->execute([":a"=>$adminKey]);
    $nr = $nq->fetch(PDO::FETCH_ASSOC);
    if ($nr) $name = strval($nr["adminName"] ?? "");

$adminLName   = strval($args["adminLName"] ?? "");
$facilityId   = strval($args["facilityId"] ?? "");
$facilityName = strval($args["facilityName"] ?? "");
$assocId      = strval($args["adminAssocId"] ?? "");
$assocName    = strval($args["adminAssocName"] ?? "");

// best-effort: if not passed, try to derive from db_Games
if ($name === "" || $adminLName === "" || $facilityId === "" || $facilityName === "" || $assocId === "" || $assocName === "") {
  $nq = $pdo->prepare("
    SELECT 
      dbGames_AdminName      AS adminName,
      dbGames_AdminLName     AS adminLName,
      dbGames_FacilityID     AS facilityId,
      dbGames_FacilityName   AS facilityName,
      dbGames_AssocID        AS adminAssocId,
      dbGames_AssocName      AS adminAssocName
    FROM db_Games
    WHERE dbGames_AdminGHIN = :a
    LIMIT 1
  ");
  $nq->execute([":a" => $adminKey]);
  $nr = $nq->fetch(PDO::FETCH_ASSOC) ?: [];

  if ($name === "")         $name = strval($nr["adminName"] ?? "");
  if ($adminLName === "")   $adminLName = strval($nr["adminLName"] ?? "");
  if ($facilityId === "")   $facilityId = strval($nr["facilityId"] ?? "");
  if ($facilityName === "") $facilityName = strval($nr["facilityName"] ?? "");
  if ($assocId === "")      $assocId = strval($nr["adminAssocId"] ?? "");
  if ($assocName === "")    $assocName = strval($nr["adminAssocName"] ?? "");
}

// last-resort: satisfy NOT NULL columns (empty string ok, NULL not ok)
if ($assocId === "")   $assocId = "0";
if ($assocName === "") $assocName = "Unknown";


$ins = $pdo->prepare("
  INSERT INTO db_FavAdmins (
    dbFavAdmin_UserGHIN,
    dbFavAdmin_AdminGHIN,
    dbFavAdmin_AdminName,
    dbFavAdmin_AdminLName,
    dbFavAdmin_FacilityID,
    dbFavAdmin_FacilityName,
    dbFavAdmin_AssocID,
    dbFavAdmin_AssocName
  ) VALUES (
    :u, :a, :n, :ln, :fid, :fname, :assocId, :assocName
  )
");
$ins->execute([
  ":u"         => $user,
  ":a"         => $adminKey,
  ":n"         => $name,
  ":ln"        => $adminLName,
  ":fid"       => $facilityId,
  ":fname"     => $facilityName,
  ":assocId"   => $assocId,
  ":assocName" => $assocName
]);



    return ["ok"=>true, "isFavorite"=>true, "message"=>"Added to Favorites."];
  }
}