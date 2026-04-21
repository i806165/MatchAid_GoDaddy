<?php
declare(strict_types=1);
// /services/database/service_dbPlayers.php

require_once MA_API_LIB . "/Db.php";

final class ServiceDbPlayers
{
  public static function getGamePlayers(string $ggid): array
  {
    $ggid = trim($ggid);
    if ($ggid === "") return [];

    $pdo = Db::pdo();
    $sql = "SELECT *
            FROM db_Players
            WHERE dbPlayers_GGID = :ggid
            ORDER BY dbPlayers_LName ASC, dbPlayers_Name ASC, dbPlayers_PlayerGHIN ASC";
    $st = $pdo->prepare($sql);
    $st->execute([":ggid" => $ggid]);
    return $st->fetchAll() ?: [];
  }

  public static function getPlayerByGGIDGHIN(string $ggid, string $playerGHIN): ?array
  {
    $pdo = Db::pdo();
    $sql = "SELECT *
            FROM db_Players
            WHERE dbPlayers_GGID = :ggid
              AND dbPlayers_PlayerGHIN = :ghin
            LIMIT 1";
    $st = $pdo->prepare($sql);
    $st->execute([":ggid" => trim($ggid), ":ghin" => trim($playerGHIN)]);
    $row = $st->fetch();
    return is_array($row) ? $row : null;
  }
  
    public static function getPlayersByPlayerKey(string $playerKey): array
  {
    $playerKey = trim($playerKey);
    if ($playerKey === "") return [];

    $pdo = Db::pdo();
    $sql = "SELECT *
            FROM db_Players
            WHERE dbPlayers_PlayerKey = :playerKey
            ORDER BY dbPlayers_PairingPos ASC, dbPlayers_LName ASC, dbPlayers_Name ASC, dbPlayers_PlayerGHIN ASC";
    $st = $pdo->prepare($sql);
    $st->execute([":playerKey" => $playerKey]);
    return $st->fetchAll() ?: [];
  }
  public static function updateGamePlayerFields(string $ggid, string $playerGHIN, array $fields): array
  {
    $existing = self::getPlayerByGGIDGHIN($ggid, $playerGHIN);
    if (!$existing) return [];

    $pdo = Db::pdo();
    $setParts = [];
    $params = [":ggid" => trim($ggid), ":ghin" => trim($playerGHIN)];

    foreach ($fields as $k => $v) {
      $setParts[] = "$k = :$k";
      $params[":$k"] = $v;
    }

    if (!$setParts) return $existing;

    $sql = "UPDATE db_Players
            SET " . implode(", ", $setParts) . "
            WHERE dbPlayers_GGID = :ggid
              AND dbPlayers_PlayerGHIN = :ghin";
    $st = $pdo->prepare($sql);
    $st->execute($params);

    return self::getPlayerByGGIDGHIN($ggid, $playerGHIN) ?? [];
  }

  public static function upsertPlayer(array $row): array
  {
    $ggid = (string)($row["dbPlayers_GGID"] ?? "");
    $ghin = (string)($row["dbPlayers_PlayerGHIN"] ?? "");
    return ($ggid !== "" && $ghin !== "") ? self::upsertGamePlayer($ggid, $ghin, $row) : [];
  }

  public static function upsertGamePlayer(string $ggid, string $playerGHIN, array $fields): array
  {
    $existing = self::getPlayerByGGIDGHIN($ggid, $playerGHIN);
    $pdo = Db::pdo();
    

    if ($existing) {
      $setParts = [];
      $params = [":ggid" => $ggid, ":ghin" => $playerGHIN];
      foreach ($fields as $k => $v) {
        $setParts[] = "$k = :$k";
        $params[":$k"] = $v;
      }
      if (!$setParts) return $existing;

      $sql = "UPDATE db_Players SET " . implode(", ", $setParts) . "
              WHERE dbPlayers_GGID = :ggid
                AND dbPlayers_PlayerGHIN = :ghin";
      $st = $pdo->prepare($sql);
      $st->execute($params);
    } else {
      $insert = array_merge([
        "dbPlayers_GGID" => $ggid,
        "dbPlayers_PlayerGHIN" => $playerGHIN,
      ], $fields);

      $cols = array_keys($insert);
      $ph = array_map(fn($c) => ":$c", $cols);
      $params = [];
      foreach ($insert as $k => $v) $params[":$k"] = $v;

      $sql = "INSERT INTO db_Players (" . implode(",", $cols) . ") VALUES (" . implode(",", $ph) . ")";
      $st = $pdo->prepare($sql);
      $st->execute($params);
    }

    return self::getPlayerByGGIDGHIN($ggid, $playerGHIN) ?? [];
  }

  public static function deleteGamePlayer(string $ggid, string $playerGHIN): bool
  {
    $pdo = Db::pdo();
    $sql = "DELETE FROM db_Players
            WHERE dbPlayers_GGID = :ggid
              AND dbPlayers_PlayerGHIN = :ghin
            LIMIT 1";
    $st = $pdo->prepare($sql);
    return $st->execute([":ggid" => trim($ggid), ":ghin" => trim($playerGHIN)]);
  }

    public static function getScorecardPlayersByGGID(string $ggid): array
  {
    $ggid = trim($ggid);
    if ($ggid === "") return [];

    $pdo = Db::pdo();
    $sql = "SELECT *
            FROM db_Players
            WHERE dbPlayers_GGID = :ggid
            ORDER BY dbPlayers_PairingID ASC,
                    dbPlayers_PairingPos ASC,
                    dbPlayers_FlightID ASC,
                    dbPlayers_FlightPos ASC,
                    dbPlayers_LName ASC,
                    dbPlayers_Name ASC,
                    dbPlayers_PlayerGHIN ASC";
    $st = $pdo->prepare($sql);
    $st->execute([":ggid" => $ggid]);
    return $st->fetchAll() ?: [];
  }

  public static function getLastPlayedTeeForCourse(string $ghin, string $courseId): ?string
  {
    $ghin     = trim($ghin);
    $courseId = trim($courseId);

    // Non-Rated players (NH prefix) have no persistent identity — skip lookup
    if ($ghin === "" || str_starts_with($ghin, "NH")) return null;
    if ($courseId === "") return null;

    $pdo = Db::pdo();
    $sql = "SELECT dbPlayers_TeeSetID
            FROM db_Players
            WHERE dbPlayers_PlayerGHIN = :ghin
              AND dbPlayers_CourseID   = :courseId
              AND dbPlayers_TeeSetID   IS NOT NULL
              AND dbPlayers_TeeSetID   <> ''
            ORDER BY _updatedDate DESC
            LIMIT 1";
    $st = $pdo->prepare($sql);
    $st->execute([":ghin" => $ghin, ":courseId" => $courseId]);
    $row = $st->fetch();
    return $row ? (string)$row["dbPlayers_TeeSetID"] : null;
  }

}
