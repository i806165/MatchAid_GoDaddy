<?php
// /public_html/includes/kpi_catalog.php
// System-defined KPI library. Developer-editable only — never admin-editable.
// To add a new KPI: add a key here + implement the algorithm in ServiceEventSummary.
// This file is required by eventmaint.php and passed to the client via initPayload.

return [

  // ── Stroke competitions ───────────────────────────────────────────────────

  "LOW_GROSS" => [
    "label"       => "Low gross",
    "section"     => "stroke",
    "inputSource" => "gross",
    "requiresTeam"=> false,
    "hasConfig"   => false,
    "sortOrder"   => 10,
    "segments"    => ["individual", "pairing", "team", "flight"],
    "description" => "Lowest total gross score across all rounds. Lower is better.",
  ],

  "LOW_NET" => [
    "label"       => "Low net",
    "section"     => "stroke",
    "inputSource" => "net",
    "requiresTeam"=> false,
    "hasConfig"   => false,
    "sortOrder"   => 20,
    "segments"    => ["individual", "pairing", "team", "flight"],
    "description" => "Lowest total net score across all rounds. Lower is better.",
  ],

  // ── Points competitions ───────────────────────────────────────────────────

  "PLACEMENT_POINTS" => [
    "label"       => "Placement points",
    "section"     => "points",
    "inputSource" => "placement",
    "requiresTeam"=> false,
    "hasConfig"   => true,
    "sortOrder"   => 30,
    "segments"    => ["individual", "pairing", "team", "flight"],
    "description" => "Points awarded per finishing position per round, summed across rounds.",
  ],

  "PERF_POINTS" => [
    "label"       => "Performance points",
    "section"     => "points",
    "inputSource" => "scoreBasis",
    "requiresTeam"=> false,
    "hasConfig"   => false,
    "sortOrder"   => 40,
    "segments"    => ["individual", "pairing", "team", "flight"],
    "description" => "Score-based points flow directly from each round (Stableford, match points, game points).",
  ],

  // ── Special competitions ──────────────────────────────────────────────────

  "RINGER" => [
    "label"       => "Ringer / eclectic",
    "section"     => "special",
    "inputSource" => "hole_gross",
    "requiresTeam"=> false,
    "hasConfig"   => false,
    "sortOrder"   => 50,
    "segments"    => ["individual"],
    "description" => "Each player's personal best score per hole across their own rounds.",
  ],

  "HOLE_CHAMPIONS" => [
    "label"       => "Hole champions",
    "section"     => "special",
    "inputSource" => "hole_gross",
    "requiresTeam"=> false,
    "hasConfig"   => false,
    "sortOrder"   => 60,
    "segments"    => ["gross", "net"],
    "description" => "Best score per hole across all players across all rounds. Same player cannot tie themselves.",
  ],

];
