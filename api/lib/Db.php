<?php
// /public_html/api/lib/Db.php
declare(strict_types=1);

final class Db
{
    // No typed property (PHP < 7.4 compatibility)
    private static $cfg = [];

    /**
     * Optional one-time init (recommended from bootstrap).
     * Call: Db::init(ma_config()['db'] ?? []);
     */
    public static function init(array $cfg): void
    {
        self::$cfg = $cfg;
    }

    /**
     * Get PDO connection.
     * - If $cfg is provided, uses it (backward compatible).
     * - Else uses config set via Db::init().
     * - Else (fallback) pulls from ma_config()['db'] if available.
     */
    public static function pdo(array $cfg = null): PDO
    {
        if ($cfg === null) {
            $cfg = self::$cfg;
        }

        // Fallback to global config accessor if init() wasn't called
        if ((empty($cfg) || !is_array($cfg)) && function_exists('ma_config')) {
            $appConfig = ma_config();
            if (is_array($appConfig) && isset($appConfig['db']) && is_array($appConfig['db'])) {
                $cfg = $appConfig['db'];
            }
        }

        $dsn = "mysql:host={$cfg['host']};dbname={$cfg['name']};charset={$cfg['charset']}";
        return new PDO($dsn, $cfg["user"], $cfg["pass"], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
}
