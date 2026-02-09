<?php
declare(strict_types=1);

final class Logger {
  public static function info(string $tag, array $ctx = []): void {
    self::write("INFO", $tag, $ctx);
  }
  public static function warn(string $tag, array $ctx = []): void {
    self::write("WARN", $tag, $ctx);
  }
  public static function error(string $tag, array $ctx = []): void {
    self::write("ERROR", $tag, $ctx);
  }

  private static function write(string $lvl, string $tag, array $ctx): void {
    // Safe context (avoid dumping tokens/passwords)
    $ctxStr = $ctx ? json_encode($ctx, JSON_UNESCAPED_SLASHES) : "";
    error_log("[MA][$lvl][$tag] " . $ctxStr);
  }
}
