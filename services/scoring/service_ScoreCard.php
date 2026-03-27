<?php
declare(strict_types=1);
// /public_html/services/scoring/service_ScoreCard.php

/**
 * ServiceScoreCard
 * Pure scorecard builder logic (no echo/header/exit).
 * Canonical scorecard/course assembly service.
 *
 * This file is the single scorecard service façade for:
 * - pre-round blank scorecard printing
 * - Player Scorecard
 * - Group Scorecard
 * - Game Scorecards
 */
final class ServiceScoreCard {

  // ==========================================================================
  // 1. Public Payload Builders
  // ==========================================================================

  /**
   * Build blank scorecard payload for pre-round printing.
   * Preserves the existing canonical blank-scorecard behavior.
   */
  public static function buildBlankScorecardPayload(array $gameRow, array $players): array {
    if (!$gameRow) {
      throw new RuntimeException("buildBlankScorecardPayload: missing gameRow");
    }
    $players = is_array($players) ? $players : [];

    $groupingMode = self::determineGroupingModeFromGame($gameRow);
    $groupsMap = self::buildGroupsMap($players, $groupingMode);
    $groupIds = self::buildGroupIds($groupsMap);

    $rows = [];
    foreach ($groupIds as $id) {
      $playersInGroup = self::sortPlayersForScorecard($groupsMap[$id] ?? []);
      $rows[] = self::buildGroupRowPayload($gameRow, $playersInGroup, $id, $groupingMode);
    }

    return [
      "competition" => trim((string)($gameRow["dbGames_Competition"] ?? "PairField")),
      "grouping" => $groupingMode,
      "rows" => $rows,
    ];
  }

  /**
   * Build all scored group cards for in-play/post-play game view.
   */
  public static function buildGameScorecardsPayload(array $gameRow, array $players): array {
    if (!$gameRow) {
      throw new RuntimeException("buildGameScorecardsPayload: missing gameRow");
    }
    $players = is_array($players) ? $players : [];

    $groupingMode = self::determineGroupingModeFromGame($gameRow);
    $groupsMap = self::buildGroupsMap($players, $groupingMode);
    $groupIds = self::buildGroupIds($groupsMap);

    $rows = [];
    foreach ($groupIds as $id) {
      $playersInGroup = self::sortPlayersForScorecard($groupsMap[$id] ?? []);
      $rows[] = self::buildScoredGroupRowPayload($gameRow, $playersInGroup, (string)$id, $groupingMode, null);
    }

    return [
      "mode" => "game",
      "competition" => trim((string)($gameRow["dbGames_Competition"] ?? "PairField")),
      "grouping" => $groupingMode,
      "rows" => $rows,
      "meta" => self::buildScorecardMeta($gameRow, $players),
    ];
  }

  /**
   * Build one scored group card.
   */
  public static function buildGroupScorecardPayload(array $gameRow, array $players, string $groupId): array {
    if (!$gameRow) {
      throw new RuntimeException("buildGroupScorecardPayload: missing gameRow");
    }
    $players = is_array($players) ? $players : [];

    $groupingMode = self::determineGroupingModeFromGame($gameRow);
    $groupsMap = self::buildGroupsMap($players, $groupingMode);
    $playersInGroup = self::sortPlayersForScorecard($groupsMap[$groupId] ?? []);

    return [
      "mode" => "group",
      "competition" => trim((string)($gameRow["dbGames_Competition"] ?? "PairField")),
      "grouping" => $groupingMode,
      "rows" => $playersInGroup ? [self::buildScoredGroupRowPayload($gameRow, $playersInGroup, $groupId, $groupingMode, null)] : [],
      "meta" => self::buildScorecardMeta($gameRow, $players),
    ];
  }

  /**
   * Build one selected player's scorecard in the context of the player's group.
   * Player selector / page wrapper can pass PlayerID, GHIN, or PlayerKey.
   */
  public static function buildPlayerScorecardPayload(array $gameRow, array $players, string $selectedPlayerId): array {
    if (!$gameRow) {
      throw new RuntimeException("buildPlayerScorecardPayload: missing gameRow");
    }
    $players = is_array($players) ? $players : [];
    $selectedPlayerId = trim((string)$selectedPlayerId);

    $groupingMode = self::determineGroupingModeFromGame($gameRow);
    $selected = self::findSelectedPlayer($players, $selectedPlayerId);

    if (!$selected) {
      return [
        "mode" => "player",
        "competition" => trim((string)($gameRow["dbGames_Competition"] ?? "PairField")),
        "grouping" => $groupingMode,
        "rows" => [],
        "meta" => self::buildScorecardMeta($gameRow, $players),
      ];
    }

    $groupId = ($groupingMode === "flight")
      ? self::normStr($selected["dbPlayers_FlightID"] ?? "", "1")
      : self::normStr($selected["dbPlayers_PairingID"] ?? "", "000");

    $groupsMap = self::buildGroupsMap($players, $groupingMode);
    $groupPlayers = self::sortPlayersForScorecard($groupsMap[$groupId] ?? []);

    return [
      "mode" => "player",
      "competition" => trim((string)($gameRow["dbGames_Competition"] ?? "PairField")),
      "grouping" => $groupingMode,
      "rows" => [
        self::buildScoredGroupRowPayload(
          $gameRow,
          $groupPlayers,
          $groupId,
          $groupingMode,
          self::playerIdentity($selected)
        )
      ],
      "meta" => self::buildScorecardMeta($gameRow, $players),
    ];
  }

  /**
   * Preserve this helper if other callers still use it.
   */
  public static function acquireScorecardRosterFromPlayers(array $players, string $ggid): array {
    return ["ggid" => (string)$ggid, "players" => $players];
  }

  // ==========================================================================
  // 2. Scorecard Scope Orchestration
  // ==========================================================================

  private static function determineGroupingModeFromGame(array $gameRow): string {
    return (trim((string)($gameRow["dbGames_Competition"] ?? "")) === "PairPair") ? "flight" : "pairing";
  }

  public static function buildGroupsMap(array $players, string $mode): array {
    $map = [];
    foreach ($players as $p) {
      $id = ($mode === "flight")
        ? self::normStr($p["dbPlayers_FlightID"] ?? "", "1")
        : self::normStr($p["dbPlayers_PairingID"] ?? "", "000");
      if (!isset($map[$id])) $map[$id] = [];
      $map[$id][] = $p;
    }
    return $map;
  }

  public static function buildGroupIds(array $map): array {
    $keys = array_keys($map);
    usort($keys, fn($a, $b) => strcmp((string)$a, (string)$b));
    return $keys;
  }

  public static function sortPlayersForScorecard(array $players): array {
    usort($players, function($a, $b) {
      $aFlight = self::normStr($a["dbPlayers_FlightID"] ?? "", "ZZZ");
      $bFlight = self::normStr($b["dbPlayers_FlightID"] ?? "", "ZZZ");
      if ($aFlight !== $bFlight) return strcmp($aFlight, $bFlight);

      $aPairPos = self::normInt($a["dbPlayers_PairingPos"] ?? null, 999);
      $bPairPos = self::normInt($b["dbPlayers_PairingPos"] ?? null, 999);
      if ($aPairPos !== $bPairPos) return $aPairPos <=> $bPairPos;

      return strcmp(
        self::normStr($a["dbPlayers_LName"] ?? ""),
        self::normStr($b["dbPlayers_LName"] ?? "")
      );
    });
    return $players;
  }

  private static function findSelectedPlayer(array $players, string $selectedPlayerId): ?array {
    $selectedPlayerId = trim((string)$selectedPlayerId);
    if ($selectedPlayerId === "") return null;

    foreach ($players as $p) {
      $candidates = [
        self::normStr($p["dbPlayers_PlayerID"] ?? ""),
        self::normStr($p["dbPlayers_GHIN"] ?? ""),
        self::normStr($p["dbPlayers_PlayerKey"] ?? ""),
      ];
      foreach ($candidates as $c) {
        if ($c !== "" && $c === $selectedPlayerId) {
          return $p;
        }
      }
    }
    return null;
  }

  private static function filterSelectedPlayer(array $players, ?string $selectedPlayerId): array {
    $selectedPlayerId = trim((string)($selectedPlayerId ?? ""));
    if ($selectedPlayerId === "") return $players;

    $out = [];
    foreach ($players as $p) {
      if (self::playerIdentity($p) === $selectedPlayerId) {
        $out[] = $p;
        break;
      }
    }
    return $out;
  }

  // ==========================================================================
  // 3. Header and Meta Assembly
  // ==========================================================================

  private static function buildCourseName(array $gameRow): string {
    $fac = trim((string)($gameRow["dbGames_FacilityName"] ?? ""));
    $crs = trim((string)($gameRow["dbGames_CourseName"] ?? ""));
    return preg_replace('/\b(.+)\b \1/', '$1', trim("$fac $crs"));
  }

  private static function buildGameHeader(array $gameRow, array $firstPlayer, string $courseName): array {
    return array_merge($gameRow, [
      "gameTitle" => (string)($gameRow["dbGames_Title"] ?? ""),
      "GGID" => (string)($gameRow["dbGames_GGID"] ?? ""),
      "courseName" => $courseName,
      "playDate" => (string)($gameRow["dbGames_PlayDate"] ?? ""),
      "holesPlayed" => (string)($gameRow["dbGames_Holes"] ?? "All 18"),
      "playerKey" => (string)($firstPlayer["dbPlayers_PlayerKey"] ?? ""),
    ]);
  }

  private static function buildScorecardMeta(array $gameRow, array $players): array {
    $basis = self::deriveScoringBasis($gameRow);

    return [
      "holes" => (string)($gameRow["dbGames_Holes"] ?? "All 18"),
      "playerCount" => count($players),
      "defaultValueMode" => ($basis === "Points")
        ? "points"
        : ((trim((string)($gameRow["dbGames_ScoringMethod"] ?? "NET")) === "ADJ GROSS") ? "gross" : "net"),
      "supportsPoints" => ($basis === "Points"),
      "scoringBasis" => $basis,
      "scoringMethod" => (string)($gameRow["dbGames_ScoringMethod"] ?? "NET"),
    ];
  }

  // ==========================================================================
  // 4. Course Info Assembly
  // ==========================================================================

  public static function getCourseInfoMap(array $gameRow, array $player): array {
    $teeDetails = $player["dbPlayers_TeeSetDetails"] ?? null;
    $holes = is_array($teeDetails) ? ($teeDetails["holes"] ?? $teeDetails["Holes"] ?? []) : [];
    $teeSetId = $player["dbPlayers_TeeSetID"] ?? null;
    $teeSetLabel = $player["dbPlayers_TeeSetName"] ?? null;
    $gender = $player["dbPlayers_Gender"] ?? null;

    $map = [];
    foreach ($holes as $h) {
      if (!is_array($h)) continue;
      $hole = intval($h["Number"] ?? $h["number"] ?? 0);
      if ($hole > 0) {
        $map[$hole] = [
          "par" => $h["Par"] ?? $h["par"] ?? null,
          "hcp" => $h["Allocation"] ?? $h["allocation"] ?? null,
          "yardage" => $h["Length"] ?? $h["length"] ?? null,
          "teeSetId" => $teeSetId,
          "teeSetLabel" => $teeSetLabel,
          "gender" => $gender,
        ];
      }
    }

    $spinSize = 6;
    $numSpins = (int)ceil(18 / $spinSize);
    for ($spinIndex = 0; $spinIndex < $numSpins; $spinIndex++) {
      $start = $spinIndex * $spinSize + 1;
      $end = min(($spinIndex + 1) * $spinSize, 18);
      $spin = [];
      foreach ($map as $hn => $data) {
        if ($hn >= $start && $hn <= $end) $spin[$hn] = $data;
      }
      uasort($spin, function($a, $b) {
        $ah = intval($a["hcp"] ?? 100);
        $bh = intval($b["hcp"] ?? 100);
        return $ah <=> $bh;
      });
      $rank = 1;
      foreach ($spin as $hn => $data) {
        $map[$hn]["hcpSpin"] = $rank;
        $rank++;
      }
    }

    $rotation = (string)($gameRow["dbGames_RotationMethod"] ?? "");
    $strokeDist = (string)($gameRow["dbGames_StrokeDistribution"] ?? "Standard");
    if ($rotation === "COD" && $strokeDist !== "Standard") {
      foreach ($map as $hn => $data) {
        $map[$hn]["hcp"] = $data["hcpSpin"] ?? $data["hcp"];
      }
    }

    return $map;
  }

  public static function getTeeSetIdsUsed(array $playersInGroup): array {
    $set = [];
    foreach ($playersInGroup as $p) {
      $id = trim((string)($p["dbPlayers_TeeSetID"] ?? ""));
      if ($id !== "") $set[$id] = true;
    }
    return $set;
  }

  public static function filterCourseRowsToTeeSetsUsed(array $courseRows, array $teeSetIdsUsedSet): array {
    $out = [];
    foreach ($courseRows as $row) {
      $label = (string)($row["label"] ?? "");
      if ($label === "Par" || $label === "HCP") {
        $out[] = $row;
        continue;
      }
      $teeSetId = (string)($row["teeSetId"] ?? "");
      if ($teeSetId !== "" && isset($teeSetIdsUsedSet[$teeSetId])) {
        $out[] = $row;
      }
    }
    return $out;
  }

  public static function buildCourseInfoTableRows(array $gameRow, array $players): array {
    $holesStd = self::holesStandard();
    $allYards = [];
    $allHcp = [];
    $allPar = [];

    foreach ($players as $player) {
      $teeSetID = $player["dbPlayers_TeeSetID"] ?? null;
      $teeLabel = $player["dbPlayers_TeeSetName"] ?? null;
      $teeDetails = $player["dbPlayers_TeeSetDetails"] ?? null;
      if (!$teeSetID || !$teeLabel || !is_array($teeDetails)) continue;

      $courseMap = self::getCourseInfoMap($gameRow, $player);
      $yardages = [];
      $pars = [];
      $hcp = [];
      foreach ($courseMap as $hole => $info) {
        $h = intval($hole);
        $yardages[$h] = $info["yardage"] ?? 0;
        $pars[$h] = $info["par"] ?? 0;
        $hcp[$h] = $info["hcp"] ?? 0;
      }

      $holesToPlay = (string)($gameRow["dbGames_Holes"] ?? "All 18");
      $gender = (string)($player["dbPlayers_Gender"] ?? "Unknown");
      $ratings = is_array($teeDetails["Ratings"] ?? null)
        ? $teeDetails["Ratings"]
        : ($teeDetails["ratings"] ?? []);

      $ratingEntry = null;
      foreach ($ratings as $r) {
        $rt = $r["RatingType"] ?? $r["rating_type"] ?? "";
        if ($holesToPlay === "F9" && $rt === "Front") $ratingEntry = $r;
        else if ($holesToPlay === "B9" && $rt === "Back") $ratingEntry = $r;
        else if (!in_array($holesToPlay, ["F9", "B9"], true) && $rt === "Total") $ratingEntry = $r;
      }

      $slope = floatval($ratingEntry["SlopeRating"] ?? $ratingEntry["slope_rating"] ?? 0);
      $rating = floatval($ratingEntry["CourseRating"] ?? $ratingEntry["course_rating"] ?? 0);

      $allYards[] = self::buildCourseRow(
        (string)$teeLabel,
        (string)$teeSetID,
        "Yards",
        array_map(fn($h) => (string)($yardages[$h] ?? 0), $holesStd),
        self::splitTotalFromMap($yardages),
        "Yards",
        1,
        $slope,
        $rating,
        $gender
      );

      $allHcp[] = self::buildCourseRow(
        "HCP",
        (string)$teeSetID,
        "HCP",
        array_map(fn($h) => (string)($hcp[$h] ?? 0), $holesStd),
        self::splitTotalFromMap($hcp),
        "HCP",
        2,
        $slope,
        $rating,
        $gender
      );

      $allPar[] = self::buildCourseRow(
        "Par",
        (string)$teeSetID,
        "Par",
        array_map(fn($h) => (string)($pars[$h] ?? 0), $holesStd),
        self::splitTotalFromMap($pars),
        "Par",
        3,
        $slope,
        $rating,
        $gender
      );
    }

    $dedupY = self::dedupeCourseRows($allYards);
    $dedupH = self::dedupeCourseRows($allHcp);
    $dedupP = self::dedupeCourseRows($allPar);

    $final = [];
    foreach ($dedupY as $yardRow) {
      $teeSetId = (string)($yardRow["teeSetId"] ?? "");
      $final[] = $yardRow;

      if (count($dedupH) > 1) {
        foreach ($dedupH as $r) {
          if ((string)($r["teeSetId"] ?? "") === $teeSetId) {
            $final[] = $r;
            break;
          }
        }
      }

      if (count($dedupP) > 1) {
        foreach ($dedupP as $r) {
          if ((string)($r["teeSetId"] ?? "") === $teeSetId) {
            $final[] = $r;
            break;
          }
        }
      }
    }

    if (count($dedupP) === 1) $final[] = $dedupP[0];
    if (count($dedupH) === 1) $final[] = $dedupH[0];

    return $final;
  }

  private static function buildCourseRow(
    string $label,
    string $teeSetId,
    string $teeLabel,
    array $values,
    array $totals,
    string $lineType,
    int $lineSeq,
    float $slope,
    float $rating,
    string $gender
  ): array {
    $row = [
      "rowType" => "Course",
      "label" => $label,
      "tee" => $teeLabel,
      "teeSetId" => $teeSetId,
      "cols" => array_map("strval", $values),
      "lineType" => $lineType,
      "lineSeq" => $lineSeq,
      "slope" => $slope,
      "rating" => $rating,
      "gender" => $gender,
    ];

    foreach (self::holesStandard() as $num) {
      $row["h" . $num] = (string)($values[$num - 1] ?? "");
    }

    $subtotalFields = ["3a","3b","3c","3d","3e","3f","6a","6b","6c","9a","9b","9c"];
    foreach ($subtotalFields as $k) {
      $row[$k] = ($label === "HCP") ? "" : (string)($totals[$k] ?? "-");
    }

    return $row;
  }

  private static function dedupeCourseRows(array $courseRows): array {
    $grouped = [];
    foreach ($courseRows as $row) {
      $key = (string)($row["label"] ?? "");
      if (!isset($grouped[$key])) $grouped[$key] = [];
      $grouped[$key][] = $row;
    }

    $result = [];
    foreach ($grouped as $rows) {
      $unique = [];
      foreach ($rows as $r) {
        $found = false;
        foreach ($unique as $u) {
          if (self::courseRowEquals($u, $r)) {
            $found = true;
            break;
          }
        }
        if (!$found) $unique[] = $r;
      }
      foreach ($unique as $u) $result[] = $u;
    }

    return $result;
  }

  private static function courseRowEquals(array $a, array $b): bool {
    foreach (self::holesStandard() as $h) {
      if (($a["h" . $h] ?? null) !== ($b["h" . $h] ?? null)) return false;
    }
    return true;
  }

  private static function splitTotalFromMap(array $kpiMap): array {
    $vals = [];
    foreach (self::holesStandard() as $i) {
      $vals[] = intval($kpiMap[$i] ?? 0);
    }
    $sum = fn($arr) => array_sum($arr);

    return [
      "3a" => (string)$sum(array_slice($vals, 0, 3)),
      "3b" => (string)$sum(array_slice($vals, 3, 3)),
      "3c" => (string)$sum(array_slice($vals, 6, 3)),
      "3d" => (string)$sum(array_slice($vals, 9, 3)),
      "3e" => (string)$sum(array_slice($vals, 12, 3)),
      "3f" => (string)$sum(array_slice($vals, 15, 3)),
      "6a" => (string)$sum(array_slice($vals, 0, 6)),
      "6b" => (string)$sum(array_slice($vals, 6, 6)),
      "6c" => (string)$sum(array_slice($vals, 12, 6)),
      "9a" => (string)$sum(array_slice($vals, 0, 9)),
      "9b" => (string)$sum(array_slice($vals, 9, 9)),
      "9c" => (string)$sum($vals),
    ];
  }

  // ==========================================================================
  // 5. Player Scorecard Context Assembly
  // ==========================================================================

  public static function buildGroupRowPayload(array $gameRow, array $players, $groupId, string $mode): array {
    $first = $players[0] ?? [];
    $courseName = self::buildCourseName($gameRow);
    $teeSetIdsUsed = self::getTeeSetIdsUsed($players);
    $courseRows = self::filterCourseRowsToTeeSetsUsed(
      self::buildCourseInfoTableRows($gameRow, $players),
      $teeSetIdsUsed
    );

    return [
      "groupId" => (string)$groupId,
      "grouping" => $mode,
      "pairingID" => (string)($first["dbPlayers_PairingID"] ?? ""),
      "flightID" => (string)($first["dbPlayers_FlightID"] ?? ""),
      "teeTime" => (string)($first["dbPlayers_TeeTime"] ?? ""),
      "startHole" => (string)($first["dbPlayers_StartHole"] ?? ""),
      "courseInfo" => $courseRows,
      "players" => self::buildPlayersArray($players, $gameRow),
      "gameHeader" => self::buildGameHeader($gameRow, $first, $courseName),
    ];
  }

  public static function buildPlayersArray(array $playersInGroup, array $gameRow): array {
    $isAdjGross = (trim((string)($gameRow["dbGames_ScoringMethod"] ?? "NET")) === "ADJ GROSS");
    $out = [];

    foreach ($playersInGroup as $player) {
      $playerHC = self::calculateEffectiveHandicap($gameRow, $player);
      $strokes = [];

      if (!$isAdjGross && $playerHC != 0) {
        $teeDetails = $player["dbPlayers_TeeSetDetails"] ?? null;
        $teeHoles = is_array($teeDetails) ? ($teeDetails["holes"] ?? $teeDetails["Holes"] ?? []) : [];
        $allocMap = self::buildStrokeAllocationMap($gameRow, $playerHC, $teeHoles);
        foreach ($allocMap as $holeNum => $v) {
          if (intval($v) !== 0) $strokes["h" . $holeNum] = intval($v);
        }
      }

      $out[] = array_merge($player, [
        "playerName" => (string)($player["dbPlayers_Name"] ?? ""),
        "playerHC" => $playerHC,
        "tee" => (string)($player["dbPlayers_TeeSetName"] ?? ""),
        "teeSetId" => trim((string)($player["dbPlayers_TeeSetID"] ?? "")),
        "strokes" => $strokes,
      ]);
    }

    return $out;
  }

  /**
   * Shared scored row payload for Player / Group / Game scorecards.
   * Keeps the canonical scorecard structure and overlays scored-hole data.
   */
  private static function buildScoredGroupRowPayload(
    array $gameRow,
    array $players,
    string $groupId,
    string $mode,
    ?string $selectedPlayerId
  ): array {
    $base = self::buildGroupRowPayload($gameRow, $players, $groupId, $mode);
    $fullPlayers = self::decorateScoredPlayers($gameRow, $base["players"]);

    $base["players"] = self::filterSelectedPlayer($fullPlayers, $selectedPlayerId);
    $base["columnTotals"] = self::buildColumnTotals($gameRow, $fullPlayers);
    $base["meta"] = [
      "supportsPoints" => self::deriveScoringBasis($gameRow) === "Points",
      "selectedPlayerId" => $selectedPlayerId,
    ];

    return $base;
  }

  // ==========================================================================
  // 6. Handicap and Stroke Allocation
  // ==========================================================================

  public static function calculateEffectiveHandicap(array $gameRow, array $playerRow): float {
    if (trim((string)($gameRow["dbGames_ScoringMethod"] ?? "")) === "ADJ GROSS") return 0.0;
    $useSO = str_starts_with(trim((string)($gameRow["dbGames_HCMethod"] ?? "CH")), "SO");
    $raw = $useSO ? ($playerRow["dbPlayers_SO"] ?? 0) : ($playerRow["dbPlayers_PH"] ?? 0);
    return is_numeric($raw) ? (float)$raw : 0.0;
  }

  public static function buildStrokeAllocationMap(array $gameRow, $playerHC, array $teeSetHoles = []): array {
    $holes = [];
    foreach ($teeSetHoles as $h) {
      if (!is_array($h)) continue;
      $holes[] = [
        "Number" => intval($h["Number"] ?? $h["number"] ?? 0),
        "Allocation" => intval($h["Allocation"] ?? $h["allocation"] ?? 99),
        "hcpSpin" => intval($h["hcpSpin"] ?? ($h["Allocation"] ?? $h["allocation"] ?? 99)),
      ];
    }

    $filtered = array_values(array_filter($holes, function($h) use ($gameRow) {
      $holesToPlay = (string)($gameRow["dbGames_Holes"] ?? "All 18");
      if ($holesToPlay === "F9") return $h["Number"] >= 1 && $h["Number"] <= 9;
      if ($holesToPlay === "B9") return $h["Number"] >= 10 && $h["Number"] <= 18;
      return true;
    }));

    $strokeMap = [];
    foreach ($holes as $h) $strokeMap[$h["Number"]] = 0;

    if (!is_numeric($playerHC) || floatval($playerHC) == 0) return $strokeMap;
    $hc = floatval($playerHC);

    $rotation = (string)($gameRow["dbGames_RotationMethod"] ?? "");
    $strokeMode = (string)($gameRow["dbGames_StrokeDistribution"] ?? "Standard");

    if ($rotation !== "COD" || $strokeMode === "Standard") {
      if ($hc < 0) {
        $giveBack = (int)abs($hc);
        usort($filtered, fn($a, $b) => $b["Allocation"] <=> $a["Allocation"]);
        for ($i = 0; $i < $giveBack; $i++) {
          if ($h = $filtered[$i % count($filtered)]) {
            $strokeMap[$h["Number"]] = -1;
          }
        }
      } else {
        $base = (int)floor($hc / 18);
        $rem = (int)($hc % 18);
        foreach ($filtered as $h) $strokeMap[$h["Number"]] = $base;
        usort($filtered, fn($a, $b) => $a["Allocation"] <=> $b["Allocation"]);
        for ($i = 0; $i < $rem; $i++) {
          if ($h = $filtered[$i % count($filtered)]) {
            $strokeMap[$h["Number"]] += 1;
          }
        }
      }
      return $strokeMap;
    }

    if ($rotation === "COD" && $strokeMode === "Balanced-Rounded") {
      $isPlus = ($hc < 0);
      $total = (int)abs($hc);
      $basePer = (int)floor($total / 3);
      $rem = $total % 3;
      $spins = [[], [], []];

      foreach ($filtered as $h) {
        if ($h["Number"] <= 6) $spins[0][] = $h;
        else if ($h["Number"] <= 12) $spins[1][] = $h;
        else $spins[2][] = $h;
      }

      foreach ($spins as $idx => $spin) {
        usort($spin, fn($a, $b) => $isPlus ? ($b["hcpSpin"] <=> $a["hcpSpin"]) : ($a["hcpSpin"] <=> $b["hcpSpin"]));
        $count = $basePer + ($idx < $rem ? 1 : 0);
        for ($i = 0; $i < $count; $i++) {
          if ($h = $spin[$i % count($spin)]) {
            $strokeMap[$h["Number"]] += $isPlus ? -1 : 1;
          }
        }
      }

      return $strokeMap;
    }

    return $strokeMap;
  }

  // ==========================================================================
  // 7. Future Scorecard View-Model Adapters
  // ==========================================================================

  private static function decorateScoredPlayers(array $gameRow, array $players): array {
    $stablefordMap = self::parseStablefordMap($gameRow);
    $holes = self::holesForGame($gameRow);
    $out = [];

    foreach ($players as $player) {
      $scoreJson = self::extractScoreJson($player);
      $detailsByHole = self::extractHoleDetailsByNumber($scoreJson);

      $cells = [];
      $totals = [
        "gross" => ["out" => 0.0, "in" => 0.0, "tot" => 0.0, "playedOut" => 0, "playedIn" => 0, "playedTot" => 0],
        "net"   => ["out" => 0.0, "in" => 0.0, "tot" => 0.0, "playedOut" => 0, "playedIn" => 0, "playedTot" => 0],
        "diff"  => ["out" => 0.0, "in" => 0.0, "tot" => 0.0, "playedOut" => 0, "playedIn" => 0, "playedTot" => 0],
        "points"=> ["out" => 0.0, "in" => 0.0, "tot" => 0.0, "playedOut" => 0, "playedIn" => 0, "playedTot" => 0],
      ];

      $courseMap = self::getCourseInfoMap($gameRow, $player);

      foreach ($holes as $holeNumber) {
        $detail = $detailsByHole[$holeNumber] ?? [];
        $gross = self::numOrNull($detail["raw_score"] ?? $detail["gross_score"] ?? null);
        $declared = !empty($detail["declared"]);
        $strokeCount = intval($player["strokes"]["h" . $holeNumber] ?? 0);
        $par = self::numOrNull($courseMap[$holeNumber]["par"] ?? null);

        $net = null;
        if ($gross !== null) {
          $net = (trim((string)($gameRow["dbGames_ScoringMethod"] ?? "NET")) === "ADJ GROSS")
            ? $gross
            : ($gross - $strokeCount);
        }

        $diff = null;
        if ($gross !== null && $par !== null) {
          $diff = $gross - $par;
        }

        $points = null;
        if (self::deriveScoringBasis($gameRow) === "Points" && $declared && $diff !== null) {
          $points = self::stablefordPointsForDiff((int)round($diff), $stablefordMap);
        }

        self::accumulateModeTotals($totals["gross"], $holeNumber, $gross);
        self::accumulateModeTotals($totals["net"], $holeNumber, $net);
        self::accumulateModeTotals($totals["diff"], $holeNumber, $diff);
        self::accumulateModeTotals($totals["points"], $holeNumber, $points);

        $cells["h" . $holeNumber] = [
          "hole" => $holeNumber,
          "gross" => $gross,
          "net" => $net,
          "diff" => $diff,
          "points" => $points,
          "declared" => $declared,
          "strokeMarks" => $strokeCount,
          "shape" => self::classifyScoreShape($diff),
          "par" => $par,
          "display" => [
            "gross"  => self::formatMaybeNumber($gross),
            "net"    => self::formatMaybeNumber($net),
            "diff"   => self::formatDiffDisplay($diff),
            "points" => self::formatMaybeNumber($points),
          ]
        ];
      }

      $out[] = array_merge($player, [
        "playerId" => self::playerIdentity($player),
        "holes" => $cells,
        "totals" => [
          "gross" => self::finalizeNumericTotals($totals["gross"], false),
          "net" => self::finalizeNumericTotals($totals["net"], false),
          "diff" => self::finalizeNumericTotals($totals["diff"], true),
          "points" => self::finalizeNumericTotals($totals["points"], false),
        ],
      ]);
    }

    return $out;
  }

  private static function extractScoreJson($playerOrValue): array {
    $value = $playerOrValue;
    if (is_array($playerOrValue)) {
      $candidates = [
        $playerOrValue["dbPlayers_Scores"] ?? null,
        $playerOrValue["dbPlayers_ScoreJson"] ?? null,
        $playerOrValue["dbPlayers_ScoreJSON"] ?? null,
        $playerOrValue["dbPlayers_ScoreCard"] ?? null,
      ];
      $value = null;
      foreach ($candidates as $candidate) {
        if (is_array($candidate) || (is_string($candidate) && trim($candidate) !== "")) {
          $value = $candidate;
          break;
        }
      }
    }

    if (is_array($value)) return $value;
    if (is_string($value) && trim($value) !== "") {
      $decoded = json_decode($value, true);
      if (is_array($decoded)) return $decoded;
    }

    return ["Scores" => [["hole_details" => []]]];
  }

  private static function extractHoleDetailsByNumber(array $scoreJson): array {
    $summary = (isset($scoreJson["Scores"][0]) && is_array($scoreJson["Scores"][0])) ? $scoreJson["Scores"][0] : [];
    $details = is_array($summary["hole_details"] ?? null) ? $summary["hole_details"] : [];

    $out = [];
    foreach ($details as $detail) {
      if (!is_array($detail)) continue;
      $hole = intval($detail["hole_number"] ?? 0);
      if ($hole > 0) $out[$hole] = $detail;
    }
    return $out;
  }

  private static function holesForGame(array $gameRow): array {
    $holesToPlay = (string)($gameRow["dbGames_Holes"] ?? "All 18");
    if ($holesToPlay === "F9") return range(1, 9);
    if ($holesToPlay === "B9") return range(10, 18);
    return range(1, 18);
  }

  private static function deriveScoringBasis(array $gameRow): string {
    $basis = trim((string)($gameRow["dbGames_ScoringBasis"] ?? ""));
    if ($basis !== "") return $basis;

    $fmt = trim((string)($gameRow["dbGames_GameFormat"] ?? ""));
    return match ($fmt) {
      "Stableford" => "Points",
      "MatchPlay" => "Holes",
      "Skins" => "Skins",
      default => "Strokes",
    };
  }

  private static function parseStablefordMap(array $gameRow): array {
    $default = [-3 => 5, -2 => 4, -1 => 3, 0 => 2, 1 => 1, 2 => 0];
    $raw = $gameRow["dbGames_StablefordPoints"] ?? null;

    if (is_string($raw) && trim($raw) !== "") {
      $decoded = json_decode($raw, true);
      if (is_array($decoded)) $raw = $decoded;
    }
    if (!is_array($raw)) return $default;

    $map = [];
    foreach ($raw as $k => $v) {
      if (is_array($v) && isset($v["relToPar"], $v["points"])) {
        $map[intval($v["relToPar"])] = intval($v["points"]);
      } else {
        $map[intval($k)] = intval($v);
      }
    }

    return $map + $default;
  }

  private static function stablefordPointsForDiff(int $diff, array $map): int {
    if (array_key_exists($diff, $map)) return intval($map[$diff]);
    if ($diff < min(array_keys($map))) return intval($map[min(array_keys($map))] ?? 0);
    if ($diff > max(array_keys($map))) return intval($map[max(array_keys($map))] ?? 0);
    return 0;
  }

  private static function classifyScoreShape($delta): string {
    if ($delta === null || !is_numeric($delta)) return "";
    $d = intval($delta);
    if ($d <= -2) return "eagle";
    if ($d === -1) return "birdie";
    if ($d === 1) return "bogey";
    if ($d >= 2) return "bogeyplus";
    return "par";
  }

  private static function accumulateModeTotals(array &$totals, int $holeNumber, $value): void {
    if ($value === null || $value === "") return;
    $num = floatval($value);
    $bucket = ($holeNumber <= 9) ? "out" : "in";
    $playedKey = ($holeNumber <= 9) ? "playedOut" : "playedIn";
    $totals[$bucket] += $num;
    $totals["tot"] += $num;
    $totals[$playedKey] += 1;
    $totals["playedTot"] += 1;
  }

  private static function finalizeNumericTotals(array $totals, bool $diffMode): array {
    return [
      "out" => ($totals["playedOut"] > 0)
        ? ($diffMode ? self::formatDiffDisplay($totals["out"]) : self::formatMaybeNumber($totals["out"]))
        : "",
      "in" => ($totals["playedIn"] > 0)
        ? ($diffMode ? self::formatDiffDisplay($totals["in"]) : self::formatMaybeNumber($totals["in"]))
        : "",
      "tot" => ($totals["playedTot"] > 0)
        ? ($diffMode ? self::formatDiffDisplay($totals["tot"]) : self::formatMaybeNumber($totals["tot"]))
        : "",
    ];
  }

  private static function formatMaybeNumber($value): string {
    if ($value === null || $value === "") return "";
    if (!is_numeric($value)) return (string)$value;
    $f = floatval($value);
    if (abs($f - round($f)) < 0.00001) return (string)intval(round($f));
    return number_format($f, 1);
  }

  private static function formatDiffDisplay($value): string {
    if ($value === null || $value === "") return "";
    if (!is_numeric($value)) return (string)$value;
    $n = intval(round(floatval($value)));
    if ($n === 0) return "E";
    return ($n > 0 ? "+" : "") . (string)$n;
  }

  private static function buildColumnTotals(array $gameRow, array $players): array {
    $holes = self::holesForGame($gameRow);
    $totals = [];
    $competition = trim((string)($gameRow["dbGames_Competition"] ?? "PairField"));

    if ($competition === "PairPair") {
      $sides = [];
      foreach ($players as $p) {
        $side = self::normStr($p["dbPlayers_FlightPos"] ?? "A", "A");
        $sides[$side][] = $p;
      }
      ksort($sides);
      foreach ($sides as $label => $sidePlayers) {
        $totals[] = [
          "label" => "TEAM " . $label . " TOTAL",
          "cells" => self::calculateToParRow($gameRow, $holes, $sidePlayers)
        ];
      }
    } else {
      $totals[] = [
        "label" => "GROUP TOTAL",
        "cells" => self::calculateToParRow($gameRow, $holes, $players)
      ];
    }
    return $totals;
  }

  private static function calculateToParRow(array $gameRow, array $holes, array $players): array {
    $rowCells = [];
    $isNet = (trim((string)($gameRow["dbGames_ScoringMethod"] ?? "NET")) !== "ADJ GROSS");

    $sumOutScore = 0.0; $sumOutPar = 0.0; $outPlayed = false;
    $sumInScore = 0.0;  $sumInPar = 0.0;  $inPlayed = false;
    $sumTotScore = 0.0; $sumTotPar = 0.0; $totPlayed = false;

    foreach ($holes as $h) {
      $hScore = 0.0; $hPar = 0.0; $hPlayed = false;
      foreach ($players as $p) {
        $cell = $p["holes"]["h" . $h] ?? null;
        if ($cell && !empty($cell["declared"]) && $cell["gross"] !== null) {
          $val = $isNet ? floatval($cell["net"] ?? $cell["gross"]) : floatval($cell["gross"]);
          $hScore += $val;
          $hPar += floatval($cell["par"] ?? 0);
          $hPlayed = true;
        }
      }
      if ($hPlayed) {
        $rowCells["h" . $h] = self::formatDiffDisplay($hScore - $hPar);
        if ($h <= 9) { $sumOutScore += $hScore; $sumOutPar += $hPar; $outPlayed = true; }
        else { $sumInScore += $hScore; $sumInPar += $hPar; $inPlayed = true; }
        $sumTotScore += $hScore; $sumTotPar += $hPar; $totPlayed = true;
      } else {
        $rowCells["h" . $h] = "";
      }
    }

    $rowCells["9a"] = $outPlayed ? self::formatDiffDisplay($sumOutScore - $sumOutPar) : "";
    $rowCells["9b"] = $inPlayed  ? self::formatDiffDisplay($sumInScore - $sumInPar) : "";
    $rowCells["9c"] = $totPlayed ? self::formatDiffDisplay($sumTotScore - $sumTotPar) : "";

    return $rowCells;
  }

  // ==========================================================================
  // 8. Generic Utility Helpers
  // ==========================================================================

  public static function normStr($v, string $fallback = ""): string {
    $s = trim((string)($v ?? ""));
    return $s !== "" ? $s : $fallback;
  }

  public static function normInt($v, int $fallback = 0): int {
    $s = trim((string)($v ?? ""));
    return is_numeric($s) ? (int)$s : $fallback;
  }

  private static function numOrNull($v): ?float {
    if ($v === null || $v === "") return null;
    return is_numeric($v) ? floatval($v) : null;
  }

  private static function numOrZero($v): float {
    return is_numeric($v) ? floatval($v) : 0.0;
  }

  private static function holesStandard(): array {
    return range(1, 18);
  }

  private static function playerIdentity(array $player): string {
    $id = self::normStr($player["dbPlayers_PlayerID"] ?? "");
    if ($id !== "") return $id;
    $ghin = self::normStr($player["dbPlayers_GHIN"] ?? "");
    if ($ghin !== "") return $ghin;
    return self::normStr($player["dbPlayers_PlayerKey"] ?? "");
  }
}