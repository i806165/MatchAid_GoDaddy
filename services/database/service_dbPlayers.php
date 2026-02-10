<?php
declare(strict_types=1);

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
}
