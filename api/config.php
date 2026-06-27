<?php
// /public_html/api/config.php
declare(strict_types=1);

require_once dirname(__DIR__) . "/services/_core/secrets.php";

$db = ma_secret_json("db");

if (!is_array($db) || empty($db["user"]) || empty($db["pass"])) {
    throw new RuntimeException("Database credentials missing or incomplete.");
}

return [
  "app" => [
    "env" => "production",

    // null means bootstrap.php can derive this dynamically from the current host
    "site_url" => null
  ],

  "db" => [
    "host" => "localhost",
    "name" => "MatchAid",
    "user" => $db["user"],
    "pass" => $db["pass"],
    "charset" => "utf8mb4"
  ],

  "ghin" => [
    "login_url" => "https://api2.ghin.com/api/v1/golfer_login.json",
    "players_by_id_url" => "https://api.ghin.com/api/v1/golfers/search.json",
    "user_facility_url" => "https://api.ghin.com/api/v1/golfers/"
  ]
];