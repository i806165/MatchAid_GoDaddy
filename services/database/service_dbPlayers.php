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
                    dbPlayers_MatchID ASC,
                    dbPlayers_MatchPos ASC,
                    dbPlayers_LName ASC,
                    dbPlayers_Name ASC,
                    dbPlayers_PlayerGHIN ASC";
    $st = $pdo->prepare($sql);
    $st->execute([":ggid" => $ggid]);
    return $st->fetchAll() ?: [];
  }

  public static function getLastPlayedTeeForCourse(string $ghin, string $courseId, string $excludeGgid = ""): ?string
  {
    $ghin        = trim($ghin);
    $courseId    = trim($courseId);
    $excludeGgid = trim($excludeGgid);

    // Non-Rated players (NH prefix) have no persistent identity — skip lookup
    if ($ghin === "" || str_starts_with($ghin, "NH")) return null;
    if ($courseId === "") return null;

    $pdo = Db::pdo();

    // Exclude the current game so its own rows don't contaminate the history lookup.
    // This prevents in-progress resolution writes from being seen as historical evidence.
    $excludeClause = ($excludeGgid !== "") ? "AND dbPlayers_GGID != :excludeGgid" : "";

    $sql = "SELECT dbPlayers_TeeSetID
            FROM db_Players
            WHERE dbPlayers_PlayerGHIN = :ghin
              AND dbPlayers_CourseID   = :courseId
              AND dbPlayers_TeeSetID   IS NOT NULL
              AND dbPlayers_TeeSetID   <> ''
              {$excludeClause}
            ORDER BY _updatedDate DESC
            LIMIT 1";
    $st = $pdo->prepare($sql);
    $params = [":ghin" => $ghin, ":courseId" => $courseId];
    if ($excludeGgid !== "") $params[":excludeGgid"] = $excludeGgid;
    $st->execute($params);
    $row = $st->fetch();
    return $row ? (string)$row["dbPlayers_TeeSetID"] : null;
  }

  /**
   * Returns the number of players enrolled in a game.
   * Used by gamemaint.php to hydrate __INIT__ playerCount
   * so the JS can gate the course-change confirmation dialog.
   */
  public static function getPlayerCount(string $ggid): int
  {
    $ggid = trim($ggid);
    if ($ggid === "") return 0;

    $pdo = Db::pdo();
    $st  = $pdo->prepare(
      "SELECT COUNT(*) FROM db_Players WHERE dbPlayers_GGID = :ggid"
    );
    $st->execute([":ggid" => $ggid]);
    return (int)$st->fetchColumn();
  }

  /**
 * Returns co-play history for all pairs within today's unpaired GHIN pool.
 * Used by the Auto-Pair 'Least Played Together' outcome.
 *
 * NH-prefix GHINs are stripped before the query — they have no persistent
 * identity across games (same NH number may be a different person each round).
 * This mirrors the existing NH guard in getLastPlayedTeeForCourse().
 *
 * @param  string[] $ghins  GHINs of unpaired players in today's round.
 * @return array            Flat map keyed 'LOWER_GHIN|HIGHER_GHIN'.
 *                          Each value: ['count' => int, 'last' => string|null]
 *                          Pairs with no shared history are absent from the map.
 *                          Absence = implicitly count 0, last null (best score).
 */
  public static function getCoPlayMatrix(array $ghins, string $ggid): array
  {
    // Strip NH players and blank values — no persistent identity
    $ghins = array_values(array_filter($ghins, function (string $g): bool {
      $g = strtoupper(trim($g));
      return $g !== '' && !str_starts_with($g, 'NH');
    }));

    if (count($ghins) < 2) return [];

    $pdo = Db::pdo();

    // PDO named parameters must be unique within a single query.
    // Build two independent placeholder sets for the two IN clauses.
    $phA = []; $phB = []; $params = [];
    foreach ($ghins as $i => $ghin) {
      $phA[] = ':a' . $i;
      $phB[] = ':b' . $i;
      $params[':a' . $i] = trim($ghin);
        $params[':b' . $i] = trim($ghin);
      }
      $inA = implode(',', $phA);
      $inB = implode(',', $phB);

      // Exclude current game — today's partial pairings must not
      // influence history-based scoring before the round is played.
      $params[':ggid'] = trim($ggid);

      $sql = "
      SELECT
        p1.dbPlayers_PlayerGHIN   AS ghin_a,
        p2.dbPlayers_PlayerGHIN   AS ghin_b,
        COUNT(*)                  AS times_paired,
        MAX(g.dbGames_PlayDate)   AS last_played_together
      FROM db_Players p1
      JOIN db_Players p2
        ON  p1.dbPlayers_GGID      = p2.dbPlayers_GGID
        AND p1.dbPlayers_PairingID = p2.dbPlayers_PairingID
        AND p1.dbPlayers_PairingID != '000'
        AND p1.dbPlayers_PlayerGHIN < p2.dbPlayers_PlayerGHIN
      JOIN db_Games g
        ON  g.dbGames_GGID = p1.dbPlayers_GGID
      WHERE p1.dbPlayers_PlayerGHIN IN ($inA)
        AND p2.dbPlayers_PlayerGHIN IN ($inB)
        AND g.dbGames_GGID != :ggid
      GROUP BY p1.dbPlayers_PlayerGHIN, p2.dbPlayers_PlayerGHIN";

    $st = $pdo->prepare($sql);
    $st->execute($params);

    $matrix = [];
    foreach ($st->fetchAll() as $row) {
      // Key already sorted — query enforces p1.GHIN < p2.GHIN
      $key = $row['ghin_a'] . '|' . $row['ghin_b'];
      $matrix[$key] = [
        'count' => (int)$row['times_paired'],
        'last'  => $row['last_played_together'] ?? null,
      ];
    }
    return $matrix;
  }

    public static function playerHasScores(string $ggid, string $playerGHIN): bool
  {
      $row = self::getPlayerByGGIDGHIN($ggid, $playerGHIN);
      if (!$row) return false;

      $raw = $row["dbPlayers_Scores"] ?? "";
      if (!$raw || $raw === "" || $raw === "null") return false;

      $decoded = json_decode((string)$raw, true);
      $scores  = $decoded["Scores"] ?? [];

      foreach ($scores as $score) {
          foreach ($score["hole_details"] ?? [] as $hole) {
              if (($hole["adjusted_gross_score"] ?? 0) > 0) return true;
          }
      }
      return false;
  }

}