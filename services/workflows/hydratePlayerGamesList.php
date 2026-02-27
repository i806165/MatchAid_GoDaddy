<?php
// /services/workflows/hydratePlayerGamesList.php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Db.php';
require_once MA_API_LIB . '/Logger.php';

/**
 * hydratePlayerGamesList
 * Shared workflow to fetch games for the Player Portal.
 */
function hydratePlayerGamesList(string $userGHIN, array $filters, string $userClubId = ''): array {
  $today = new DateTimeImmutable('today');
  $defFrom = $today->format('Y-m-d');
  $defTo = $today->modify('+30 days')->format('Y-m-d');

  $dateFrom = trim((string)($filters['dateFrom'] ?? $defFrom));
  $dateTo   = trim((string)($filters['dateTo'] ?? $defTo));
  $selectedAdminKeys = array_values(array_unique(array_filter(array_map('strval', (array)($filters['selectedAdminKeys'] ?? [])))));
  $quickPreset = trim((string)($filters['quickPreset'] ?? ''));

  $pdo = Db::pdo();

  // 1) Admin list candidates
  $sqlAdmins = "
    SELECT DISTINCT
      CAST(dbGames_AdminGHIN AS CHAR) AS adminKey,
      COALESCE(NULLIF(dbGames_AdminName,''), CONCAT('Admin ', dbGames_AdminGHIN)) AS adminName
    FROM db_Games
    WHERE (:df = '' OR dbGames_PlayDate >= :df)
      AND (:dt = '' OR dbGames_PlayDate <= :dt)
      AND dbGames_AdminGHIN IS NOT NULL
      AND dbGames_AdminGHIN <> ''
    ORDER BY adminName ASC
    LIMIT 500
  ";
  $stA = $pdo->prepare($sqlAdmins);
  $stA->execute([':df' => $dateFrom, ':dt' => $dateTo]);
  $adminsRows = $stA->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // Favorites
  $favSet = [];
  try {
    $stFav = $pdo->prepare("SELECT CAST(dbFavAdmin_AdminGHIN AS CHAR) AS adminKey FROM db_FavAdmins WHERE dbFavAdmin_UserGHIN = :u LIMIT 1000");
    $stFav->execute([':u' => $userGHIN]);
    foreach (($stFav->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
      $k = trim((string)($r['adminKey'] ?? ''));
      if ($k !== '') $favSet[$k] = true;
    }
  } catch (Throwable $e) {
    Logger::info('PLAYERGAMES_FAVS_WARN', ['msg' => $e->getMessage()]);
  }

  $admins = array_map(static function(array $r) use ($selectedAdminKeys, $favSet): array {
    $k = trim((string)($r['adminKey'] ?? ''));
    return [
      'key' => $k,
      'name' => (string)($r['adminName'] ?? $k),
      'isFavorite' => !empty($favSet[$k]),
      'isSelected' => in_array($k, $selectedAdminKeys, true),
    ];
  }, $adminsRows);

  // 2) Base games query
  $params = [':df' => $dateFrom, ':dt' => $dateTo];
  $where = ["(:df = '' OR g.dbGames_PlayDate >= :df)", "(:dt = '' OR g.dbGames_PlayDate <= :dt)"];
  if (!empty($selectedAdminKeys)) {
    $inParts = [];
    foreach ($selectedAdminKeys as $i => $k) {
      $ph = ':a' . $i;
      $inParts[] = $ph;
      $params[$ph] = $k;
    }
    $where[] = 'CAST(g.dbGames_AdminGHIN AS CHAR) IN (' . implode(',', $inParts) . ')';
  }

  $sqlGames = "
    SELECT *
    FROM db_Games g
    WHERE " . implode(' AND ', $where) . "
    ORDER BY g.dbGames_PlayDate ASC, g.dbGames_PlayTime ASC
    LIMIT 1000
  ";

  $stG = $pdo->prepare($sqlGames);
  $stG->execute($params);
  $gamesRaw = $stG->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // 3) Player enrollment set
  $myGGIDs = [];
  $myPlayerData = [];
  try {
    $stP = $pdo->prepare("SELECT * FROM db_Players WHERE CAST(dbPlayers_PlayerGHIN AS CHAR)=:u LIMIT 2000");
    $stP->execute([':u' => $userGHIN]);
    foreach (($stP->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
      $ggid = trim((string)($r['dbPlayers_GGID'] ?? ''));
      if ($ggid === '') continue;
      $myGGIDs[$ggid] = true;
      $myPlayerData[$ggid] = $r;
    }
  } catch (Throwable $e) {
    Logger::info('PLAYERGAMES_DBPLAYERS_WARN', ['msg' => $e->getMessage()]);
  }

  // 4) Buddy-admin set
  $buddyAdmins = [];
  try {
    $stB = $pdo->prepare("SELECT CAST(dbFav_UserGHIN AS CHAR) AS adminKey FROM db_FavPlayers WHERE CAST(dbFav_PlayerGHIN AS CHAR)=:u LIMIT 2000");
    $stB->execute([':u' => $userGHIN]);
    foreach (($stB->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
      $k = trim((string)($r['adminKey'] ?? ''));
      if ($k !== '') $buddyAdmins[$k] = true;
    }
  } catch (Throwable $e) {
    Logger::info('PLAYERGAMES_BUDDIES_WARN', ['msg' => $e->getMessage()]);
  }

  // 5) Roster counts + HI stats
  $statsByGGID = [];
  $ggids = array_values(array_unique(array_filter(array_map(static fn($g) => trim((string)($g['dbGames_GGID'] ?? '')), $gamesRaw))));
  if (!empty($ggids)) {
    $in = [];
    $ps = [];
    foreach ($ggids as $i => $ggid) { $ph = ':g' . $i; $in[] = $ph; $ps[$ph] = $ggid; }
    try {
      $sqlStats = "SELECT CAST(dbPlayers_GGID AS CHAR) AS ggid, COUNT(*) AS cnt, MIN(CASE WHEN dbPlayers_HI REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(dbPlayers_HI AS DECIMAL(6,2)) END) AS min_hi, AVG(CASE WHEN dbPlayers_HI REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(dbPlayers_HI AS DECIMAL(6,2)) END) AS avg_hi, MAX(CASE WHEN dbPlayers_HI REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(dbPlayers_HI AS DECIMAL(6,2)) END) AS max_hi FROM db_Players WHERE CAST(dbPlayers_GGID AS CHAR) IN (" . implode(',', $in) . ") GROUP BY CAST(dbPlayers_GGID AS CHAR)";
      $stS = $pdo->prepare($sqlStats);
      $stS->execute($ps);
      foreach (($stS->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
        $statsByGGID[(string)$r['ggid']] = $r;
      }
    } catch (Throwable $e) {
      Logger::info('PLAYERGAMES_STATS_WARN', ['msg' => $e->getMessage()]);
    }
  }

  // 6) Apply visibility (security) + derive VM
  $todayYmd = (new DateTimeImmutable('today'))->format('Y-m-d');
  $vm = [];
  $rawVisible = [];

  foreach ($gamesRaw as $g) {
    $ggid = trim((string)($g['dbGames_GGID'] ?? ''));
    $admin = trim((string)($g['dbGames_AdminGHIN'] ?? ''));

    $privacy = trim((string)($g['dbGames_Privacy'] ?? 'Club'));
    if ($privacy === '') $privacy = 'Club';

    // Legacy compatibility: "Players" is retired; treat it as "Club"
    if ($privacy === 'Players') $privacy = 'Club';

    // Canonical game club field (fallback chain for compatibility)
    $gameClubId = trim((string)(
      $g['dbGames_AdminClubID'] ??
      $g['dbGames_ClubID'] ??
      $g['dbGames_ClubId'] ??
      ''
    ));

    // Core relation flags
    $isAdminSelf  = ($admin !== '' && $admin === $userGHIN);
    $isEnrolled   = ($ggid !== '' && !empty($myGGIDs[$ggid])); // enrollment overrides privacy
    $isBuddyAdmin = ($admin !== '' && !empty($buddyAdmins[$admin]));
    $isSameClub   = ($gameClubId !== '' && $userClubId !== '' && $gameClubId === $userClubId);

    // Visibility decision (security gate)
    $allowByAdmin = $isAdminSelf;
    $allowByEnrollment = $isEnrolled;
    $allowByClubPrivacy = false;

    if ($isSameClub) {
      if ($privacy === 'Club') {
        $allowByClubPrivacy = true;
      } elseif ($privacy === 'Buddies') {
        $allowByClubPrivacy = $isBuddyAdmin;
      } elseif ($privacy === 'Only Me') {
        $allowByClubPrivacy = false;
      } else {
        // Safe default for unknown privacy values
        $allowByClubPrivacy = false;
      }
    }

    $visible = ($allowByAdmin || $allowByEnrollment || $allowByClubPrivacy);
    if (!$visible) continue;

    $playDate = substr((string)($g['dbGames_PlayDate'] ?? ''), 0, 10);
    $isCurrent = ($playDate !== '' && $playDate >= $todayYmd);

    $daysUntil = null;
    if ($playDate !== '') {
      try {
        $daysUntil = (int)((new DateTimeImmutable('today'))->diff(new DateTimeImmutable($playDate))->format('%r%a'));
      } catch (Throwable $e) {
        $daysUntil = null;
      }
    }

    $stats = $statsByGGID[$ggid] ?? null;
    $playerCount = (int)($stats['cnt'] ?? 0);

    $teeTimeCnt = (int)($g['dbGames_TeeTimeCnt'] ?? 0);
    $slotCount = max(0, $teeTimeCnt * 4);

    $registrationStatus = 'Open';
    if (!$isCurrent) $registrationStatus = 'Closed';
    elseif ($daysUntil !== null && $daysUntil < 3) $registrationStatus = 'Locked';
    elseif ($slotCount > 0 && $playerCount >= $slotCount) $registrationStatus = 'Full';

    $playerHIStats = 'No Data';
    if ($stats && $stats['min_hi'] !== null && $stats['avg_hi'] !== null && $stats['max_hi'] !== null) {
      $playerHIStats =
        number_format((float)$stats['min_hi'], 1) . ' / ' .
        number_format((float)$stats['avg_hi'], 1) . ' / ' .
        number_format((float)$stats['max_hi'], 1);
    }

    $vm[] = [
      'ggid' => $ggid,
      'title' => (string)($g['dbGames_Title'] ?? 'Game'),
      'playDate' => $playDate,
      'playTimeText' => substr((string)($g['dbGames_PlayTime'] ?? ''), 0, 5),
      'courseName' => (string)($g['dbGames_CourseName'] ?? ''),
      'courseId' => (string)($g['dbGames_CourseID'] ?? ''),
      'facilityName' => (string)($g['dbGames_FacilityName'] ?? ''),
      'adminName' => (string)($g['dbGames_AdminName'] ?? ''),
      'privacy' => $privacy,
      'playerCount' => $playerCount,
      'playerHIStats' => $playerHIStats,
      'yourTeeTime' => (string)($myPlayerData[$ggid]['dbPlayers_TeeTime'] ?? ''),
      'yourTeeSetId' => (string)($myPlayerData[$ggid]['dbPlayers_TeeSetID'] ?? ''),
      'yourTeeSetName' => (string)($myPlayerData[$ggid]['dbPlayers_TeeSetName'] ?? ''),

      // FIX: use $isEnrolled (was undefined $isRegistered)
      'isRegistered' => $isEnrolled,
      'enrollmentStatus' => $isEnrolled ? 'Registered' : 'Not Registered',

      'registrationStatus' => $registrationStatus,
      'holes' => (string)($g['dbGames_Holes'] ?? ''),
      'teeTimeCnt' => $teeTimeCnt,
    ];

    $rawVisible[] = $g;
  }

  $subtitle = 'Games • ' . count($vm);
  return [
    'header' => [ 'title' => 'PLAYER PORTAL', 'subtitle' => $subtitle ],
    'filters' => [ 'dateFrom' => $dateFrom, 'dateTo' => $dateTo, 'selectedAdminKeys' => $selectedAdminKeys, 'quickPreset' => $quickPreset ],
    'admins' => $admins,
    'games' => [ 'vm' => $vm, 'raw' => $rawVisible ],
  ];
}