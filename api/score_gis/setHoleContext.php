<?php
declare(strict_types=1);
// /public_html/api/score_gis/setHoleContext.php
// Persists this session's last-viewed GIS hole. Deliberately separate from
// score_entry's SessionCurrentHole (api/score_entry/setHoleContext.php) —
// GIS's own Prev/Next/select is a personal browsing action, not a scoring
// one, and should never move the group's official current hole. scoregis.php
// only falls back to this value when SessionCurrentHole isn't set (i.e. this
// session hasn't used score_entry at all).
require_once __DIR__ . "/../../bootstrap.php";
$input = ma_json_in();
$hole = (int)($input['hole'] ?? 1);

$_SESSION['SessionGisCurrentHole'] = $hole;
ma_respond(200, ['ok' => true]);
