<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ProcessPlayers.php
// Player business logic: handicap resolution, tee set selection,
// profile enrichment, PH calculation, and field assembly.
// Called by upsertGamePlayers.php and any future player-related workflows.

require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Handicaps.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Players.php";
require_once MA_SERVICES . "/GHIN/GHIN_API_Courses.php";

final class WorkflowProcessPlayers
{
  // -----------------------------
  // Public API
  // -----------------------------

  /**
   * Full player upsert orchestration.
   * Resolves handicap, selects tee, enriches profile, assembles fields.
   * Returns the saved player row from the DB.
   *
   * $playerInput  — raw player data from the request (ghin, first_name, last_name, gender, hi, etc.)
   * $selectedTee  — tee selection from the request (teeSetID or value)
   * $game         — hydrated game row from session context
   * $ggid         — game GGID from session context
   * $token        — admin or user token from auth
   * $creatorGHIN  — session GHIN of the person making the request
   * $creatorName  — session name of the person making the request
   */
  public static function upsertPlayer(
    array  $playerInput,
    array  $selectedTee,
    array  $game,
    string $ggid,
    string $token,
    string $creatorGHIN,
    string $creatorName
  ): array
  {
    $ghin     = trim((string)($playerInput["ghin"]       ?? ""));
    $first    = trim((string)($playerInput["first_name"] ?? ""));
    $last     = trim((string)($playerInput["last_name"]  ?? ""));
    $gender   = trim((string)($playerInput["gender"]     ?? ""));
    $manualHi = trim((string)($playerInput["hi"]         ?? ""));

    // 1) Resolve effective handicap index
    $effectiveHI = self::resolveHandicap($ghin, $manualHi, $game, $token);

    // 2) Build available tee sets and select the requested one
    $teeSets = be_buildTeeSetTags("Index", $effectiveHI, $gender, $game, $token);
    $teeId   = trim((string)($selectedTee["teeSetID"] ?? $selectedTee["value"] ?? ""));
    $tee     = self::pickTee($teeSets, $teeId);

    if (!$tee) {
      throw new RuntimeException("Selected tee is no longer available.");
    }

    // 3) Fetch rich tee details (raw GHIN format with holes)
    $teeSetId       = (string)($tee["teeSetID"] ?? "");
    $richTeeDetails = ($teeSetId !== "") ? be_getTeeSetByID($teeSetId, $token) : $tee;

    // 4) Load existing player row (preserves pairing/flight/key if already on roster)
    $existing = ServiceDbPlayers::getPlayerByGGIDGHIN($ggid, $ghin);

    // 5) Enrich profile — UI values > GHIN profile > existing DB values
    $profile = self::fetchPlayerProfile($ghin, $token, $creatorGHIN);
    $localId  = self::resolveField(
      $playerInput,  ["local_number", "memberId"],
      $profile,      ["local_number", "member_number", "memberId"],
      $existing,     "dbPlayers_LocalID"
    );
    $clubId   = self::resolveField(
      $playerInput,  ["club_id"],
      $profile,      ["club_id", "primary_club_id", "home_club_id"],
      $existing,     "dbPlayers_ClubID"
    );
    $clubName = self::resolveField(
      $playerInput,  ["club_name"],
      $profile,      ["club_name", "primary_club_name", "home_club_name"],
      $existing,     "dbPlayers_ClubName"
    );

    // 6) Calculate baseline PH (Pass-A: PH = CH * Allowance / 100)
    $ch        = (int)($tee["playerCH"] ?? 0);
    $allowance = (float)($game["dbGames_Allowance"] ?? 100);
    $ph        = self::calculatePH($ch, $allowance);

    // 7) Assemble fields for DB write
    $fields = [
      "dbPlayers_Name"         => trim($first . " " . $last),
      "dbPlayers_LName"        => $last,
      "dbPlayers_HI"           => $effectiveHI,
      "dbPlayers_CH"           => (string)$ch,
      "dbPlayers_PH"           => (string)$ph,
      "dbPlayers_SO"           => "0",
      "dbPlayers_CourseID"     => (string)($game["dbGames_CourseID"] ?? ""),
      "dbPlayers_TeeSetID"     => (string)($tee["teeSetID"]    ?? ""),
      "dbPlayers_TeeSetName"   => (string)($tee["teeSetName"]  ?? ""),
      "dbPlayers_TeeSetSlope"  => (string)($tee["teeSetSlope"] ?? ""),
      "dbPlayers_TeeSetDetails"=> json_encode($richTeeDetails),
      "dbPlayers_PairingID"    => (string)($existing["dbPlayers_PairingID"]  ?? "000"),
      "dbPlayers_PairingPos"   => (string)($existing["dbPlayers_PairingPos"] ?? ""),
      "dbPlayers_FlightID"     => (string)($existing["dbPlayers_FlightID"]   ?? ""),
      "dbPlayers_FlightPos"    => (string)($existing["dbPlayers_FlightPos"]  ?? ""),
      "dbPlayers_PlayerKey"    => (string)($existing["dbPlayers_PlayerKey"]  ?? ""),
      // Team key: caller-supplied value takes priority (copy-from-game carries source team assignment).
      // Falls back to existing row value on re-enrollment so team is never overwritten by a tee update.
      // Empty string = unassigned — safe default if neither source is present.
      "dbPlayers_TeamKey"      => trim((string)($playerInput["teamKey"] ?? $existing["dbPlayers_TeamKey"] ?? "")),
      "dbPlayers_Gender"       => $gender,
      "dbPlayers_CreatorID"    => $creatorGHIN,
      "dbPlayers_CreatorName"  => $creatorName,
      "dbPlayers_LocalID"      => $localId,
      "dbPlayers_ClubID"       => $clubId,
      "dbPlayers_ClubName"     => $clubName,
    ];

    // 8) Persist and return saved row
    return ServiceDbPlayers::upsertGamePlayer($ggid, $ghin, $fields);
  }

  // -----------------------------
  // Handicap resolution
  // -----------------------------

  /**
   * Resolve the effective handicap index for a player given game HC effectivity rules.
   * Non-Rated players (NH prefix) use manual HI or default to "0".
   */
  public static function resolveHandicap(
    string $ghin,
    string $manualHi,
    array  $game,
    string $token
  ): string
  {
    if (str_starts_with($ghin, "NH")) {
      return ($manualHi !== "") ? $manualHi : "0";
    }

    $hce     = trim((string)($game["dbGames_HCEffectivity"] ?? ""));
    $payload = null;

    if (in_array($hce, ["Low3", "Low6", "Low12"], true)) {
      $payload = be_getHandicapbyPeriod($hce, null, null, $ghin, $token);
    } elseif ($hce === "PlayDate") {
      $d       = self::toYMD($game["dbGames_PlayDate"] ?? null);
      $payload = be_getHandicapbyPeriod("Range", $d, $d, $ghin, $token);
    } elseif ($hce === "Date") {
      $d       = self::toYMD($game["dbGames_HCEffectivityDate"] ?? null);
      $payload = be_getHandicapbyPeriod("Range", $d, $d, $ghin, $token);
    }

    $row = (is_array($payload["d"] ?? null) && isset($payload["d"][0]) && is_array($payload["d"][0]))
      ? $payload["d"][0]
      : null;

    if (is_array($row) &&
        array_key_exists("LowHIValue", $row) &&
        $row["LowHIValue"] !== null &&
        $row["LowHIValue"] !== "") {
      return (string)$row["LowHIValue"];
    }

    // Fallback — latest index from GHIN
    $byId = be_getPlayersByID($ghin, $token);
    return (string)($byId["golfers"][0]["handicap_index"] ?? "0");
  }

  // -----------------------------
  // Tee set selection
  // -----------------------------

  /**
   * Find the matching tee from an available tee set list by ID.
   * Matches on teeSetID or legacy value key.
   */
  public static function pickTee(array $teeSets, string $selectedId): ?array
  {
    foreach ($teeSets as $row) {
      if ((string)($row["teeSetID"] ?? "") === $selectedId ||
          (string)($row["value"]    ?? "") === $selectedId) {
        return $row;
      }
    }
    return null;
  }

  // -----------------------------
  // Profile enrichment
  // -----------------------------

  /**
   * Fetch golfer profile from GHIN.
   * Non-Rated players (NH prefix) use the template GHIN (the session user)
   * since they have no persistent GHIN identity.
   */
  public static function fetchPlayerProfile(
    string $ghin,
    string $token,
    string $templateGhin
  ): array
  {
    $fetch = str_starts_with($ghin, "NH") ? $templateGhin : $ghin;
    $fetch = trim($fetch);
    if ($fetch === "") return [];

    $res  = be_getPlayersByID($fetch, $token);
    $golf = (is_array($res["golfers"] ?? null) &&
             isset($res["golfers"][0]) &&
             is_array($res["golfers"][0]))
      ? $res["golfers"][0]
      : [];

    return is_array($golf) ? $golf : [];
  }

  // -----------------------------
  // PH calculation
  // -----------------------------

  /**
   * Calculate baseline Playing Handicap.
   * Pass-A logic: PH = CH * (Allowance / 100), rounded to nearest integer.
   */
  public static function calculatePH(int $ch, float $allowance): int
  {
    return (int)round($ch * ($allowance / 100.0));
  }

  // -----------------------------
  // Private helpers
  // -----------------------------

  /**
   * Resolve a field value using three-tier priority:
   * 1. UI input (caller-supplied keys)
   * 2. GHIN profile (profile keys)
   * 3. Existing DB row (single db column key)
   */
  private static function resolveField(
    array   $input,
    array   $inputKeys,
    array   $profile,
    array   $profileKeys,
    ?array  $existing,
    string  $dbKey
  ): string
  {
    foreach ($inputKeys as $k) {
      $v = trim((string)($input[$k] ?? ""));
      if ($v !== "") return $v;
    }
    foreach ($profileKeys as $k) {
      $v = trim((string)($profile[$k] ?? ""));
      if ($v !== "") return $v;
    }
    if (is_array($existing)) {
      return (string)($existing[$dbKey] ?? "");
    }
    return "";
  }

  /**
   * Normalize a date value to YYYY-MM-DD string or null.
   */
  public static function toYMD($d): ?string
  {
    if (!$d) return null;
    $s = trim((string)$d);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return $s;
    $ts = strtotime($s);
    if ($ts === false) return null;
    return date('Y-m-d', $ts);
  }
}