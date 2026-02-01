<?php
// /services/database/service_dbGames.php
declare(strict_types=1);

final class ServiceDbGames {

  /**
   * queryGames
   * Inputs:
   *  - clubId (required)
   *  - dateFrom/dateTo (YYYY-MM-DD, optional but recommended)
   *  - selectedAdminKeys (array of admin GHIN strings; if empty -> caller should default to "me")
   *  - includePlayerCounts (bool)
   *
   * Returns:
   *  - games.raw (rows)
   *  - games.vm  (view model with display fields)
   */
  public static function queryGames(PDO $pdo, array $args): array {
    $clubId = strval($args["clubId"] ?? "");
$dateFrom = strval($args["dateFrom"] ?? "");
$dateTo   = strval($args["dateTo"] ?? "");

// dbGames_PlayDate is DATE (YYYY-MM-DD). Normalize any accidental DATETIME inputs.
if ($dateFrom !== "") $dateFrom = substr($dateFrom, 0, 10);
if ($dateTo   !== "") $dateTo   = substr($dateTo,   0, 10);
    $admins   = $args["selectedAdminKeys"] ?? [];
    if (!is_array($admins)) $admins = [];

    $where = ["dbGames_AdminClubID = :clubId"];
    $params = [":clubId" => $clubId];

    if ($dateFrom !== "") { $where[] = "dbGames_PlayDate >= :df"; $params[":df"] = $dateFrom; }
    if ($dateTo !== "")   { $where[] = "dbGames_PlayDate <= :dt"; $params[":dt"] = $dateTo; }

    if (count($admins)) {
      $in = [];
      foreach ($admins as $i=>$a) {
        $ph = ":a".$i;
        $in[] = $ph;
        $params[$ph] = strval($a);
      }
      $where[] = "dbGames_AdminGHIN IN (" . implode(",", $in) . ")";
    }

    // Sort direction: if date window is future-ish -> asc else desc (mirrors Wix getSortDirection)
$order = "dbGames_PlayDate ASC, dbGames_PlayTime ASC";
if ($dateFrom !== "" && $dateTo !== "") {
  if ($dateTo < date("Y-m-d")) $order = "dbGames_PlayDate DESC, dbGames_PlayTime DESC";
}

    $sql = "
      SELECT
        dbGames_GGID,
        dbGames_Title,
        dbGames_PlayDate,
        dbGames_PlayTime,
        dbGames_FacilityName,
        dbGames_CourseName,
        dbGames_Holes,
        dbGames_TeeTimeCnt,
        dbGames_Privacy,
        dbGames_AdminGHIN,
        dbGames_AdminName
      FROM db_Games
      WHERE " . implode(" AND ", $where) . "
      ORDER BY $order
      LIMIT 1000
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Player counts (Choice 6A): grouped query + merge
    $counts = [];
    if (!empty($args["includePlayerCounts"]) && count($rows)) {
      $ggids = array_values(array_unique(array_map(fn($r)=>intval($r["dbGames_GGID"]), $rows)));
      $counts = self::countPlayersByGGIDs($pdo, $ggids);
    }

    // Enrich + VM
    $raw = [];
    $vm  = [];
    foreach ($rows as $r) {
      $ggid = intval($r["dbGames_GGID"]);
      $playDate = strval($r["dbGames_PlayDate"] ?? "");
      $playTime = strval($r["dbGames_PlayTime"] ?? ""); // "HH:MM:SS"

      $playerCount = $counts[$ggid] ?? 0;

      // UI strings can be formatted client-side too; keep simple here
      $rawRow = [
        "dbGames_GGID" => $ggid,
        "dbGames_Title" => strval($r["dbGames_Title"] ?? ""),
        "dbGames_PlayDate" => $playDate,
        "dbGames_PlayTime" => $playTime,
        "dbGames_FacilityName" => strval($r["dbGames_FacilityName"] ?? ""),
        "dbGames_CourseName" => strval($r["dbGames_CourseName"] ?? ""),
        "dbGames_Holes" => strval($r["dbGames_Holes"] ?? ""),
        "dbGames_TeeTimeCnt" => strval($r["dbGames_TeeTimeCnt"] ?? ""),
        "dbGames_Privacy" => strval($r["dbGames_Privacy"] ?? ""),
        "dbGames_AdminGHIN" => strval($r["dbGames_AdminGHIN"] ?? ""),
        "dbGames_AdminName" => strval($r["dbGames_AdminName"] ?? ""),
        "gamePlayerCount" => $playerCount,
      ];
      $raw[] = $rawRow;

      $vm[] = [
        "recId" => null,
        "ggid" => $ggid,
        "title" => $rawRow["dbGames_Title"],
        "playDate" => $playDate,
        "playTime" => $playTime,
        "playDateText" => $playDate, // client may format
        "playTimeText" => (strlen($playTime) >= 5 ? substr($playTime, 0, 5) : ""),
        "facilityName" => $rawRow["dbGames_FacilityName"],
        "courseName" => $rawRow["dbGames_CourseName"],
        "holes" => $rawRow["dbGames_Holes"],
        "teeTimeCnt" => $rawRow["dbGames_TeeTimeCnt"],
        "privacy" => $rawRow["dbGames_Privacy"],
        "playerCount" => $playerCount,
        "adminGHIN" => $rawRow["dbGames_AdminGHIN"],
        "adminName" => $rawRow["dbGames_AdminName"],
      ];
    }

    return [
      "games" => [
        "raw" => $raw,
        "vm" => $vm
      ]
    ];
  }

  private static function countPlayersByGGIDs(PDO $pdo, array $ggids): array {
    if (!count($ggids)) return [];
    $in = [];
    $params = [];
    foreach ($ggids as $i=>$g) {
      $ph=":g".$i;
      $in[]=$ph;
      $params[$ph]=intval($g);
    }
    $sql = "SELECT dbPlayers_GGID AS ggid, COUNT(*) AS cnt
            FROM db_Players
            WHERE dbPlayers_GGID IN (" . implode(",", $in) . ")
            GROUP BY dbPlayers_GGID";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $out = [];
    foreach ($rows as $r) { $out[intval($r["ggid"])] = intval($r["cnt"]); }
    return $out;
  }
}