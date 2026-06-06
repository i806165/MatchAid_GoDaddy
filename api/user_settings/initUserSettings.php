<?php
declare(strict_types=1);

//  /api/user_settings/initUserSettings.php

require_once __DIR__ . '/../../bootstrap.php';
require_once MA_API_LIB . '/Logger.php';
require_once MA_SERVICES . '/context/service_ContextUser.php';
require_once MA_SERVICES . '/database/service_dbGames.php';
require_once MA_SERVICES . '/database/service_dbFavPlayers.php';

header('Content-Type: application/json; charset=utf-8');

// ---------------------------------------------------------------------------
// Session keys to NEVER expose — tokens, raw credentials, internal auth state
// ---------------------------------------------------------------------------
const SS_EXCLUDE = [
    'SessionUserToken',
    'SessionAdminToken',
    'SessionGHINLogonID',
    'SessionLastActivity',   // re-added below as formatted timestamp
    'SessionLoginTime',      // re-added below as formatted timestamp
];

// ---------------------------------------------------------------------------
// Humanize a session key name into a readable label.
// Strips known prefixes, splits on camelCase / underscores.
// e.g. "SessionClubName"        => "Club Name"
//      "AP_FILTERDATEFROM"      => "Filter Date From"
//      "clubhomeSession_CanSearch" => "Can Search"
// ---------------------------------------------------------------------------
function humanizeSessionKey(string $key): string
{
    $prefixes = [
        'clubhomeSession_',
        'clubhomeSession',
        'SessionAdmin',
        'SessionUser',
        'SessionFav',
        'SessionFacility',
        'SessionClub',
        'SessionAccess',
        'SessionPortal',
        'SessionLogin',
        'SessionStored',
        'SessionPreference',
        'Session',
        'AP_FILTER',
        'AP_',
    ];

    $label = $key;
    foreach ($prefixes as $prefix) {
        if (stripos($label, $prefix) === 0) {
            $label = substr($label, strlen($prefix));
            break;
        }
    }

    $label = str_replace('_', ' ', $label);
    $label = preg_replace('/([a-z])([A-Z])/', '$1 $2', $label);
    $label = ucwords(strtolower(trim($label)));

    return $label ?: $key;
}

// ---------------------------------------------------------------------------
// Format a raw session value for readable display.
// ---------------------------------------------------------------------------
function formatSessionValue(mixed $value): string
{
    if (is_bool($value)) return $value ? 'Yes' : 'No';

    if (is_int($value)) {
        // Unix timestamp between 2000 and 2100
        if ($value > 946684800 && $value < 4102444800) {
            $dt = new DateTime('@' . $value);
            $dt->setTimezone(new DateTimeZone('America/New_York'));
            return $dt->format('M j, Y g:i A');
        }
        return (string) $value;
    }

    if (is_float($value)) return (string) $value;

    if (is_array($value)) {
        if (isset($value['min']) && isset($value['max'])) {
            return number_format((int)$value['min']) . ' – ' . number_format((int)$value['max']);
        }
        $parts = [];
        foreach ($value as $k => $v) {
            $parts[] = is_string($k) ? "$k: $v" : (string)$v;
        }
        return implode(', ', $parts);
    }

    if (is_string($value)) {
        $trimmed = trim($value);

        // JSON arrays/objects stored as strings (e.g. AP_FILTER_ADMINS)
        if (str_starts_with($trimmed, '[') || str_starts_with($trimmed, '{')) {
            $decoded = json_decode($trimmed, true);
            if (is_array($decoded)) {
                $scalars = array_filter($decoded, fn($v) => is_scalar($v));
                if (count($scalars) === count($decoded)) {
                    return implode(', ', $decoded);
                }
            }
        }

        // Dates stored as YYYY-MM-DD
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed)) {
            $d = DateTime::createFromFormat('Y-m-d', $trimmed);
            return $d ? $d->format('M j, Y') : $trimmed;
        }

        return $value;
    }

    return '—';
}

try {
    $ctx = ServiceUserContext::getUserContext();
    if (!$ctx || empty($ctx["ok"])) {
        throw new Exception("Authentication required.", 401);
    }

    $ghinId = trim((string)($_SESSION["SessionGHINLogonID"] ?? ""));
    if ($ghinId === "") {
        throw new Exception("Missing session GHIN.", 401);
    }

    // -------------------------------------------------------------------
    // Core user settings payload (existing)
    // -------------------------------------------------------------------
    $payload = ServiceUserContext::buildUserSettingsPayload($ghinId);

    // -------------------------------------------------------------------
    // Data Usage — service methods only, no raw SQL in this endpoint
    // -------------------------------------------------------------------
    $payload['dataUsage'] = [
        'totalGames'      => ServiceDbGames::getGameCountForAdmin($ghinId),
        'favoritePlayers' => service_dbFavPlayers::getFavPlayerCountForUser($ghinId),
    ];

    // -------------------------------------------------------------------
    // Session info — scrub excluded keys, humanize labels, format values
    // -------------------------------------------------------------------
    $sessionInfo = [];
    foreach ($_SESSION as $key => $value) {
        if (in_array($key, SS_EXCLUDE, true)) continue;
        if (str_starts_with($key, '__')) continue;

        $sessionInfo[] = [
            'key'   => $key,
            'label' => humanizeSessionKey($key),
            'value' => formatSessionValue($value),
        ];
    }

    // Re-add timestamps in a controlled, formatted form at the top
    foreach (['SessionLastActivity' => 'Last Activity', 'SessionLoginTime' => 'Login Time'] as $sKey => $sLabel) {
        $ts = (int)($_SESSION[$sKey] ?? 0);
        if ($ts > 0) {
            $dt = new DateTime('@' . $ts);
            $dt->setTimezone(new DateTimeZone('America/New_York'));
            array_unshift($sessionInfo, [
                'key'   => $sKey,
                'label' => $sLabel,
                'value' => $dt->format('M j, Y g:i A'),
            ]);
        }
    }

    $payload['sessionInfo'] = $sessionInfo;

    echo json_encode([
        "ok"      => true,
        "payload" => $payload,
    ], JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    $code = (int)$e->getCode();
    if ($code < 400 || $code > 599) $code = 500;
    http_response_code($code);
    Logger::error("API_INIT_USERSETTINGS_FAIL", ["err" => $e->getMessage()]);
    echo json_encode([
        "ok"      => false,
        "message" => $e->getMessage(),
    ], JSON_UNESCAPED_SLASHES);
}
