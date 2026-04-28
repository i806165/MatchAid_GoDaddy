<?php
// public_html/api/config.php
declare(strict_types=1);

return [
  "db" => [
    "host" => "localhost",
    "name" => "MatchAid",
    "user" => "wvq7mv6kutbx",
    "pass" => "Ef3Uu!l3pNYzbovk",
    "charset" => "utf8mb4"
  ],

  // GHIN endpoints (fill in with your known-good URLs from your Wix backend)
  "ghin" => [
    "login_url" => "https://api2.ghin.com/api/v1/golfer_login.json",
    "players_by_id_url" => "https://api.ghin.com/api/v1/golfers/search.json",
    "user_facility_url" => "https://api.ghin.com/api/v1/golfers/"
  ],
  
  "app" => [                                        
    "site_url" => "https://www.matchaid.org"        
  ]  
];