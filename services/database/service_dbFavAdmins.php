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
  public static function queryFavoriteAdmins(PDO $pdo, array $args): array {
    $userGHIN = strval($args["userGHIN"] ?? "");
    $clubId   = strval($args["clubId"] ?? "");
    $selected = $args["selectedAdminKeys"] ?? [];
    if (!is_array($selected)) $selected = [];

    // 1) All admins for club: derive from db_Games
    $sqlAll = "
      SELECT DISTINCT dbGames_AdminGHIN AS adminGhin, dbGames_AdminName AS adminName
      FROM db_Games
      WHERE dbGames_AdminClubID = :clubId
        AND dbGames_AdminGHIN IS NOT NULL
        AND dbGames_AdminGHIN <> ''
      ORDER BY dbGames_AdminName
      LIMIT 500
    ";
    $st = $pdo->prepare($sqlAll);
    $st->execute([":clubId" => $clubId]);
    $all = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // 2) Favorites for this user
    $sqlFav = "
      SELECT dbFavAdmin_AdminGHIN AS adminGhin, dbFavAdmin_AdminName AS adminName
      FROM db_FavAdmins
      WHERE dbFavAdmin_UserGHIN = :user
      LIMIT 500
    ";
    $st2 = $pdo->prepare($sqlFav);
    $st2->execute([":user" => $userGHIN]);
    $fav = $st2->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $favSet = [];
    foreach ($fav as $f) { $favSet[strval($f["adminGhin"] ?? "")] = true; }
    $selSet = [];
    foreach ($selected as $k) { $selSet[strval($k)] = true; }

    $adminsAll = [];
    foreach ($all as $a) {
      $key = strval($a["adminGhin"] ?? "");
      $adminsAll[] = [
        "key" => $key,
        "name" => strval($a["adminName"] ?? ""),
        "isFavorite" => isset($favSet[$key]),
        "isSelected" => isset($selSet[$key]),
      ];
    }

    return [
      "adminsAll" => $adminsAll,
      "favoriteAdminKeys" => array_values(array_keys($favSet)),
      "selectedAdminKeys" => array_values(array_filter($selected)),
      "favorites" => array_map(fn($x)=>["key"=>strval($x["adminGhin"]??""), "name"=>strval($x["adminName"]??"")], $fav),
    ];
  }

  /**
   * upsertFavoriteAdmin
   * Toggles favorite state for a given adminGhin for the current user.
   * Returns: { isFavorite: bool, message: string }
   */
  public static function upsertFavoriteAdmin(PDO $pdo, array $args): array {
    $user = strval($args["userGHIN"] ?? "");
    $adminKey = strval($args["adminKey"] ?? "");
    if ($user === "" || $adminKey === "") {
      return ["ok" => false, "message" => "Missing user or adminKey."];
    }

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

// best-effort: if not passed, try to derive from db_Games
if ($name === "" || $adminLName === "" || $facilityId === "" || $facilityName === "") {
  $nq = $pdo->prepare("
    SELECT 
      dbGames_AdminName AS adminName,
      dbGames_AdminLName AS adminLName,
      dbGames_FacilityID AS facilityId,
      dbGames_FacilityName AS facilityName
    FROM db_Games
    WHERE dbGames_AdminGHIN = :a
    LIMIT 1
  ");
  $nq->execute([":a" => $adminKey]);
  $nr = $nq->fetch(PDO::FETCH_ASSOC) ?: [];
  if ($name === "")        $name = strval($nr["adminName"] ?? "");
  if ($adminLName === "")  $adminLName = strval($nr["adminLName"] ?? "");
  if ($facilityId === "")  $facilityId = strval($nr["facilityId"] ?? "");
  if ($facilityName === "")$facilityName = strval($nr["facilityName"] ?? "");
}

$ins = $pdo->prepare("
  INSERT INTO db_FavAdmins (
    dbFavAdmin_UserGHIN,
    dbFavAdmin_AdminGHIN,
    dbFavAdmin_AdminName,
    dbFavAdmin_AdminLName,
    dbFavAdmin_FacilityID,
    dbFavAdmin_FacilityName
  ) VALUES (
    :u, :a, :n, :ln, :fid, :fname
  )
");
$ins->execute([
  ":u"     => $user,
  ":a"     => $adminKey,
  ":n"     => $name,
  ":ln"    => $adminLName,
  ":fid"   => $facilityId,
  ":fname" => $facilityName
]);


    return ["ok"=>true, "isFavorite"=>true, "message"=>"Added to Favorites."];
  }
}