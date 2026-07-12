<?php
declare(strict_types=1);

// /public_html/services/workflows/workflow_ProcessPlayers.php
// Player business logic: handicap resolution, tee set selection,
// profile enrichment, PH calculation, and field assembly.
// Called by upsertGamePlayers.php and any future player-related workflows.
//
// NOTE — Rounds vs. Flat Games: a "Round" is a db_Games row with
// dbGames_EID set (created under an Event); a "Flat Game" has no EID
// and stands entirely on its own. This same upsertPlayer() workflow is
// called identically for both — the fork below is the one place that
// distinction matters. For a Round, Team/Flight/Pairing are each sourced
// from the event roster (db_EventPlayers) only when that field's own
// event-level mode flag (dbEvents_TeamMode / dbEvents_FlightMode /
// dbEvents_PairingMode) is "fixed" — otherwise the round's own value
// stands, same sticky-per-round behavior as a Flat Game. All three
// default off; a fresh event or a round with cascading turned off
// behaves exactly as it did before this event work existed.

require_once MA_SERVICES . "/database/service_dbPlayers.php";
require_once MA_SERVICES . "/database/service_dbEvents.php";
require_once MA_SERVICES . "/database/service_dbEventPlayers.php";
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
    $ghin     = trim((string)($playerInput["ghin"] ?? ""));
    $manualHi = trim((string)($playerInput["hi"]   ?? ""));

    // Existing row and live GHIN profile are both loaded up front, ahead
    // of the original step numbering below — moved earlier than where
    // this profile fetch used to sit (previously "step 5") because
    // gender is needed immediately by step 2's tee-set lookup, not just
    // at final field assembly. Neither of these two calls depends on
    // anything computed in steps 1-4, so pulling them forward is safe.
    $existing = ServiceDbPlayers::getPlayerByGGIDGHIN($ggid, $ghin);
    $profile  = self::fetchPlayerProfile($ghin, $token, $creatorGHIN);

    // Identity fields — first_name / last_name / gender.
    //
    // This app's own db_Players table has no first-name concept at all
    // (only dbPlayers_Name — a full name string — and dbPlayers_LName
    // exist; see the field assembly in step 7 below). So there is no db
    // column to treat as a source of truth for a first/last split, and
    // none of the tiers below ever derive one by splitting
    // dbPlayers_Name — that would be inventing data this app doesn't
    // actually track.
    //
    // Instead: the live GHIN profile just fetched above is the single
    // trusted source — real GHIN golfer data, fetched fresh for THIS
    // ghin on every call, not a cached/stale value. Caller-supplied
    // $playerInput is only a fallback for the rare case where that
    // profile lookup itself comes back empty (GHIN hiccup, or an NH /
    // non-rated GHIN with no searchable profile). Existing-row data is
    // the last-resort safety net, and even then used whole — the full
    // dbPlayers_Name / dbPlayers_LName pair as already stored, never
    // split apart — purely so a transient lookup failure can't blank
    // out a previously-good name/gender on a routine correction like a
    // tee change.
    $profileFirst  = trim((string)($profile["first_name"] ?? $profile["firstName"] ?? ""));
    $profileLast   = trim((string)($profile["last_name"]  ?? $profile["lastName"]  ?? ""));
    $profileGender = trim((string)($profile["gender"]     ?? ""));

    $first  = $profileFirst  !== "" ? $profileFirst  : trim((string)($playerInput["first_name"] ?? ""));
    $last   = $profileLast   !== "" ? $profileLast   : trim((string)($playerInput["last_name"]  ?? ""));
    $gender = $profileGender !== "" ? $profileGender : trim((string)($playerInput["gender"]     ?? ""));
    if ($gender === "") $gender = trim((string)($existing["dbPlayers_Gender"] ?? ""));

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

    // 4) Existing row and profile already loaded above (moved ahead of
    //    step 2 so gender was available in time — see the block before
    //    step 1).

    // 4a) Round vs. Flat Game — resolve the event roster row once, if applicable.
    //     $eventPlayer stays null for a Flat Game, which is what keeps every
    //     field assignment below identical to pre-event behavior in that case.
    $eid          = (int)($game["dbGames_EID"] ?? 0);
    $event        = null;
    $eventPlayer  = null;
    $fixedPairing = false;
    $fixedTeam    = false;
    $fixedFlight  = false;

    if ($eid > 0) {
      $event        = ServiceDbEvents::getEventByEID($eid);
      $eventPlayer  = ServiceDbEventPlayers::getEventPlayer($eid, $ghin);
      $fixedPairing = (($event["dbEvents_PairingMode"] ?? "") === "fixed");
      $fixedTeam    = (($event["dbEvents_TeamMode"]    ?? "") === "fixed");
      $fixedFlight  = (($event["dbEvents_FlightMode"]  ?? "") === "fixed");
    }

    // 5) Enrich profile — UI values > GHIN profile > existing DB values
    //    ($profile itself already loaded above, ahead of step 1.)
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
      // Reconstructed from resolved first/last only when at least one
      // resolved to something real. If both the live GHIN fetch and any
      // caller-supplied fallback came back empty, reuse the existing
      // row's Name/LName untouched rather than writing a blank — the
      // resolution above never invents a first name, so this guard is
      // what keeps a lookup failure from ever corrupting a good name.
      "dbPlayers_Name"         => ($first !== "" || $last !== "")
        ? trim($first . " " . $last)
        : (string)($existing["dbPlayers_Name"] ?? ""),
      "dbPlayers_LName"        => $last !== "" ? $last : (string)($existing["dbPlayers_LName"] ?? ""),
      "dbPlayers_HI"           => $effectiveHI,
      "dbPlayers_CH"           => (string)$ch,
      "dbPlayers_PH"           => (string)$ph,
      "dbPlayers_SO"           => "0",
      "dbPlayers_CourseID"     => (string)($game["dbGames_CourseID"] ?? ""),
      "dbPlayers_TeeSetID"     => (string)($tee["teeSetID"]    ?? ""),
      "dbPlayers_TeeSetName"   => (string)($tee["teeSetName"]  ?? ""),
      "dbPlayers_TeeSetSlope"  => (string)($tee["teeSetSlope"] ?? ""),
      "dbPlayers_TeeSetDetails"=> json_encode($richTeeDetails),

      // Pairing: Round + Fixed PairingMode → event roster wins outright.
      // Otherwise (Flat Game, or Round with PairingMode != "fixed") →
      // unchanged, sticky-per-round behavior exactly as before.
      "dbPlayers_PairingID"    => ($eventPlayer !== null && $fixedPairing)
        ? (string)($eventPlayer["dbEventPlayers_PairingID"]  ?? "000")
        : (string)($existing["dbPlayers_PairingID"]  ?? "000"),
      "dbPlayers_PairingPos"   => ($eventPlayer !== null && $fixedPairing)
        ? (string)($eventPlayer["dbEventPlayers_PairingPos"] ?? "")
        : (string)($existing["dbPlayers_PairingPos"] ?? ""),

      "dbPlayers_MatchID"     => (string)($existing["dbPlayers_MatchID"]   ?? ""),
      "dbPlayers_MatchPos"    => (string)($existing["dbPlayers_MatchPos"]  ?? ""),
      "dbPlayers_PlayerKey"    => (string)($existing["dbPlayers_PlayerKey"]  ?? ""),

      // Team: Round + TeamMode "fixed" → event roster wins outright.
      // Otherwise (Flat Game, or Round with TeamMode "none") → unchanged:
      // caller-supplied value (copy-from-game carries source team
      // assignment), falling back to the existing row on re-enrollment
      // so team is never overwritten by a tee update.
      "dbPlayers_TeamKey"      => ($eventPlayer !== null && $fixedTeam)
        ? (string)($eventPlayer["dbEventPlayers_TeamKey"] ?? "")
        : trim((string)($playerInput["teamKey"] ?? $existing["dbPlayers_TeamKey"] ?? "")),

      // Flight: Round + FlightMode "fixed" → event roster wins outright.
      // Otherwise → sticky-per-round, same fallback shape as Team's "off"
      // case. There is no caller-supplied flight input path today, so
      // this only ever falls back to whatever's already on the row.
      "dbPlayers_FlightKey"    => ($eventPlayer !== null && $fixedFlight)
        ? (string)($eventPlayer["dbEventPlayers_FlightKey"] ?? "")
        : (string)($existing["dbPlayers_FlightKey"] ?? ""),

      "dbPlayers_Gender"       => $gender !== "" ? $gender : (string)($existing["dbPlayers_Gender"] ?? ""),
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
