<?php
declare(strict_types=1);

// /public_html/services/context/service_ContextGame.php
// Game context management (SessionStoredGGID) + hydrated game retrieval.
// NOTE: This file is designed to be callable from APIs and other services.

require_once MA_SVC_DB . "/service_dbGames.php";
require_once MA_API_LIB . "/Db.php";
require_once MA_API_LIB . "/Logger.php";

final class ServiceContextGame
{
  private const SESSION_KEY = "SessionStoredGGID";

  public static function setGameContext(int $ggid): void
  {
    $_SESSION[self::SESSION_KEY] = $ggid;
  }

  public static function clearGameContext(): void
  {
    unset($_SESSION[self::SESSION_KEY]);
  }

  public static function getStoredGGID(): ?int
  {
    $v = $_SESSION[self::SESSION_KEY] ?? null;
    if ($v === null || $v === "") return null;
    return (int)$v;
  }

  /**
   * Return hydrated game context for the current session.
   * - Uses SessionStoredGGID (set by Admin Games list for Edit mode).
   */
  public static function getGameContext(): array
  {
    $pdo = Db::pdo();

    $ggid = self::getStoredGGID();
    if (!$ggid) {
      throw new RuntimeException("No game is selected (SessionStoredGGID not set).");
    }

    $game = ServiceDbGames::getGameByGGID($pdo, $ggid);
    if (!$game) {
      throw new RuntimeException("Selected game not found.");
    }

    return [
      "ggid" => $ggid,
      "game" => self::hydrateForUi($game),
      "authorizations" => self::getGameAuthorizations()
    ];
  }

  /**
   * Minimal authorizations placeholder.
   * Extend later with club/role logic.
   */
  public static function getGameAuthorizations(): array
  {
    return [
      "canEdit" => true,
      "canDelete" => true
    ];
  }

    /**
   * Wix-canonical authorization rules.
   * Returns: {status: Authorized|Unauthorized|Error, role: ...}
   */
  public static function computeGameAuthorizations(PDO $pdo, array $args): array
  {
    $userGHIN = trim((string)($args["userGHIN"] ?? ""));
    $ggid = (int)($args["ggid"] ?? 0);
    $userFacilityId = trim((string)($args["userFacilityId"] ?? ""));
    $action = trim((string)($args["action"] ?? ""));

    if ($userGHIN === "" || $ggid <= 0) {
      return [
        "status" => "Error",
        "role" => "Error",
        "action" => $action,
        "message" => "Missing userGHIN or GGID."
      ];
    }

    $game = ServiceDbGames::getGameByGGID($pdo, $ggid);
    if (!$game) {
      return [
        "status" => "Error",
        "role" => "Error",
        "action" => $action,
        "message" => "Game not found."
      ];
    }

    $facilityId = trim((string)($game["dbGames_FacilityID"] ?? ""));
    $privacy    = trim((string)($game["dbGames_Privacy"] ?? ""));
    $adminGHIN  = trim((string)($game["dbGames_AdminGHIN"] ?? ""));

    try {
      // 1) Site Admin (FacilityID = "00000")
      $stmt = $pdo->prepare("
        SELECT 1
        FROM db_UserRoles
        WHERE dbUserRoles_UserGHIN = :u
          AND dbUserRoles_FacilityID = '00000'
        LIMIT 1
      ");
      $stmt->execute([":u" => $userGHIN]);
      if ($stmt->fetchColumn()) {
        return self::authResult("Authorized", "Site Admin", $action);
      }

      // 2) Facility Admin (FacilityID = game facility)
      if ($facilityId !== "") {
        $stmt = $pdo->prepare("
          SELECT 1
          FROM db_UserRoles
          WHERE dbUserRoles_UserGHIN = :u
            AND dbUserRoles_FacilityID = :fid
          LIMIT 1
        ");
        $stmt->execute([":u" => $userGHIN, ":fid" => $facilityId]);
        if ($stmt->fetchColumn()) {
          return self::authResult("Authorized", "Facility Admin", $action);
        }
      }

      // 3) Game Admin
      if ($adminGHIN !== "" && $userGHIN === $adminGHIN) {
        return self::authResult("Authorized", "Game Admin", $action);
      }

      // 4) Player in the game
      $stmt = $pdo->prepare("
        SELECT 1
        FROM db_Players
        WHERE dbPlayers_GGID = :ggid
          AND dbPlayers_PlayerGHIN = :u
        LIMIT 1
      ");
      $stmt->execute([":ggid" => $ggid, ":u" => $userGHIN]);
      if ($stmt->fetchColumn()) {
        return self::authResult("Authorized", "Player", $action);
      }

      // 5) Favorite of the Game Admin
      if ($adminGHIN !== "") {
        $stmt = $pdo->prepare("
          SELECT 1
          FROM db_FavPlayers
          WHERE dbFav_UserGHIN = :admin
            AND dbFav_PlayerGHIN = :u
          LIMIT 1
        ");
        $stmt->execute([":admin" => $adminGHIN, ":u" => $userGHIN]);
        if ($stmt->fetchColumn()) {
          return self::authResult("Authorized", "Player", $action);
        }
      }

      // 6) Same facility + Open game
      if ($facilityId !== "" && $userFacilityId !== "" && $facilityId === $userFacilityId && $privacy === "Club") {
        return self::authResult("Authorized", "Player", $action);
      }

      return self::authResult("Unauthorized", "User", $action);

    } catch (Throwable $e) {
      error_log("[MA][computeGameAuthorizations] EX " . $e->getMessage());
      return [
        "status" => "Error",
        "role" => "Error",
        "action" => $action,
        "message" => "Authorization error."
      ];
    }
  }

  private static function authResult(string $status, string $role, string $action): array
  {
    // Optional convenience booleans (safe for future use)
    $canEdit = ($status === "Authorized");
    $canDelete = ($status === "Authorized") && in_array($role, ["Site Admin", "Facility Admin", "Game Admin"], true);

    return [
      "status" => $status,
      "role" => $role,
      "action" => $action,
      "canEdit" => $canEdit,
      "canDelete" => $canDelete
    ];
  }


  /**
   * Add derived fields used by UI.
   */
  public static function hydrateForUi(array $game): array
  {
    // Normalize PlayDate to ISO if needed
    if (!empty($game["dbGames_PlayDate"])) {
      $game["playDateISO"] = substr((string)$game["dbGames_PlayDate"], 0, 10);
    }

    if (!empty($game["dbGames_PlayTime"])) {
      // "HH:MM:SS" -> "HH:MM"
      $game["playTimeText"] = substr((string)$game["dbGames_PlayTime"], 0, 5);
    }


    return $game;
  }

  /**
   * Default game shell for Add mode.
   * The Save endpoint will apply all required defaults server-side.
   */
    public static function defaultGameForAdd(): array
    {
      $today = (new DateTimeImmutable("today"))->format("Y-m-d");

      // Start with a minimal shell for screen-driven fields.
      // NOTE: any additional DB fields not shown on screen will be filled by applyAddDefaults().
      $record = [
        "dbGames_GGID" => null,

        // screen fields (typical)
        "dbGames_Title" => "",
        "dbGames_PlayDate" => $today,
        "dbGames_PlayTime" => "08:00:00",
        "dbGames_Privacy" => "Club",
        "dbGames_Comments" => null,

        "dbGames_TeeTimeCnt" => 16,
        "dbGames_TeeTimeInterval" => 9,
        "dbGames_TeeTimeList" => "",

        "dbGames_Holes" => "All 18",

        "dbGames_FacilityID" => "",
        "dbGames_FacilityName" => "",
        "dbGames_CourseID" => "",
        "dbGames_CourseName" => "",

        // admin identity (best effort from session)
        "dbGames_AdminGHIN" => (string)($_SESSION["SessionGHINLogonID"] ?? ""),
        "dbGames_AdminName" => (string)($_SESSION["SessionUserName"] ?? $_SESSION["SessionGHINUserName"] ?? ""),
        "dbGames_AdminClubID" => (string)($_SESSION["SessionClubID"] ?? ""),
        "dbGames_AdminClubName" => (string)($_SESSION["SessionClubName"] ?? ""),
      ];

      // Apply Wix-canonical defaults for non-screen fields
      self::applyAddDefaults($record);

      // Align HCEffectivity/HCEffectivityDate rules (applies to both Add/Edit)
      self::alignHCEffectivity($record);

      // UI helper fields (optional convenience)
      $record["playDateISO"] = self::toYMD($record["dbGames_PlayDate"]);
      $record["playTimeText"] = substr((string)($record["dbGames_PlayTime"] ?? ""), 0, 5);

      return $record;
    }

    private static function applyAddDefaults(array &$record): void
    {
      // ---- Numeric defaults ----
      if (!isset($record["dbGames_Allowance"]) || $record["dbGames_Allowance"] === null) {
        $record["dbGames_Allowance"] = 100;
      }
      if (!isset($record["dbGames_BestBall"]) || $record["dbGames_BestBall"] === null || $record["dbGames_BestBall"] === "") {
        // legacy stored as string in some datasets
        $record["dbGames_BestBall"] = "4";
      }
      if (!isset($record["dbGames_PlayerDeclaration"]) || $record["dbGames_PlayerDeclaration"] === null || $record["dbGames_PlayerDeclaration"] === "") {
        $record["dbGames_PlayerDeclaration"] = "11";
      }
      if (!isset($record["dbGames_Segments"]) || $record["dbGames_Segments"] === null || $record["dbGames_Segments"] === "") {
        // stored as string in legacy data
        $record["dbGames_Segments"] = "9";
      }

      // ---- String enum defaults ----
      if (empty($record["dbGames_Competition"]))        $record["dbGames_Competition"] = "PairField";
      if (empty($record["dbGames_GameFormat"]))         $record["dbGames_GameFormat"] = "StrokePlay";
      if (empty($record["dbGames_HCMethod"]))           $record["dbGames_HCMethod"] = "CH";
      if (empty($record["dbGames_RotationMethod"]))     $record["dbGames_RotationMethod"] = "None";
      if (empty($record["dbGames_ScoringBasis"]))       $record["dbGames_ScoringBasis"] = "Strokes";
      if (empty($record["dbGames_ScoringMethod"]))      $record["dbGames_ScoringMethod"] = "NET";
      if (empty($record["dbGames_ScoringSystem"]))      $record["dbGames_ScoringSystem"] = "BestBall";
      if (empty($record["dbGames_StrokeDistribution"])) $record["dbGames_StrokeDistribution"] = "Standard";
      if (empty($record["dbGames_TOMethod"]))           $record["dbGames_TOMethod"] = "TeeTimes";

      // ---- Array defaults ----
      if (!isset($record["dbGames_BlindPlayers"]) || !is_array($record["dbGames_BlindPlayers"])) {
        $record["dbGames_BlindPlayers"] = [];
      }
      if (!isset($record["dbGames_HoleDeclaration"]) || !is_array($record["dbGames_HoleDeclaration"])) {
        $record["dbGames_HoleDeclaration"] = [];
      }
      if (!isset($record["dbGames_StablefordPoints"]) || !is_array($record["dbGames_StablefordPoints"])) {
        $record["dbGames_StablefordPoints"] = [];
      }

      // ---- Nullable / derived defaults ----
      if (!array_key_exists("dbGames_Comments", $record)) {
        $record["dbGames_Comments"] = null;
      }
    }

    
    private static function alignHCEffectivity(array &$record): void
    {
      $hcEff = $record["dbGames_HCEffectivity"] ?? null;
      $playYMD = self::toYMD($record["dbGames_PlayDate"] ?? null);

      // If play date is missing, we can’t align; just null out effectivity date
      if (!$playYMD) {
        $record["dbGames_HCEffectivityDate"] = null;
        return;
      }

      switch ($hcEff) {
        case null:
        case "":
          $record["dbGames_HCEffectivity"] = "PlayDate";
          $record["dbGames_HCEffectivityDate"] = $playYMD;
          break;

        case "PlayDate":
          $record["dbGames_HCEffectivityDate"] = $playYMD;
          break;

        case "Date":
          $effYMD = self::toYMD($record["dbGames_HCEffectivityDate"] ?? null);
          if (!$effYMD || $effYMD > $playYMD) {
            $record["dbGames_HCEffectivityDate"] = $playYMD;
          } else {
            $record["dbGames_HCEffectivityDate"] = $effYMD;
          }
          break;

        default:
          // “Latest” or other values: null effectivity date
          $record["dbGames_HCEffectivityDate"] = null;
          break;
      }
    }



    private static function toYMD($v): ?string
    {
      if ($v === null) return null;
      $s = trim((string)$v);
      if ($s === "") return null;

      // If already YYYY-MM-DD or YYYY-MM-DDTHH:MM..., normalize
      if (preg_match('/^\d{4}-\d{2}-\d{2}/', $s, $m)) {
        return substr($s, 0, 10);
      }

      $ts = strtotime($s);
      if ($ts === false) return null;
      return date("Y-m-d", $ts);
    }



}
