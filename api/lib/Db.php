<?php
// /public_html/api/lib/Db.php
declare(strict_types=1);

final class Db
{
    private static $cfg      = [];
    private static $instance = null;  // singleton connection

    /**
     * Optional one-time init (recommended from bootstrap).
     * Call: Db::init(ma_config()['db'] ?? []);
     */
    public static function init(array $cfg): void
    {
        self::$cfg = $cfg;
    }

    /**
     * Get PDO connection — singleton pattern.
     * Returns the same connection for the lifetime of the request.
     * Enforces strict SQL mode to prevent zero-date inserts and
     * other silent data corruption.
     */
    public static function pdo(array $cfg = null): PDO
    {
        // If a config override is passed, bypass singleton and create
        // a fresh connection (backward compatible with legacy callers).
        if ($cfg !== null) {
            return self::_connect($cfg);
        }

        // Return existing singleton if available
        if (self::$instance !== null) {
            return self::$instance;
        }

        $resolved = self::$cfg;

        // Fallback to global config accessor if init() wasn't called
        if ((empty($resolved) || !is_array($resolved)) && function_exists('ma_config')) {
            $appConfig = ma_config();
            if (is_array($appConfig) && isset($appConfig['db']) && is_array($appConfig['db'])) {
                $resolved = $appConfig['db'];
            }
        }

        self::$instance = self::_connect($resolved);
        return self::$instance;
    }

    /**
     * Create a new PDO connection with strict SQL mode enforced.
     *
     * Strict mode prevents:
     *   - Zero dates (0000-00-00) being silently inserted instead of
     *     using column DEFAULT values (current_timestamp)
     *   - Silent truncation of data that exceeds column length
     *   - Division by zero producing NULL silently
     */
    private static function _connect(array $cfg): PDO
    {
        $dsn = "mysql:host={$cfg['host']};dbname={$cfg['name']};charset={$cfg['charset']}";

        $pdo = new PDO($dsn, $cfg["user"], $cfg["pass"], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        // Enforce strict SQL mode — prevents zero-date inserts and other
        // silent data corruption that GoDaddy shared hosting allows by default.
        $pdo->exec(
            "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE," .
            "NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'"
        );

        return $pdo;
    }
}