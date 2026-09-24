<?php
declare(strict_types=1);

// /public_html/services/weather/service_Wind.php
// Current weather conditions for a course, via the NOAA/NWS API (no key
// required). The course coordinate is derived from the same OSM data
// already stored for GIS play (service_dbCourseOSM.php) rather than a
// separate geocode.
//
// Caching (APCu, no DB table — see conversation): the course -> grid
// resolution never changes for a fixed coordinate, so it's cached with no
// expiry; losing it (APCu eviction, PHP restart) just costs one extra NOAA
// /points lookup on the next request, not a failure. The live observation
// is cached with a short TTL, keyed by courseId so every player looking at
// the same course shares one cached reading instead of triggering a NOAA
// call each.

require_once MA_API_LIB . "/HttpClient.php";
require_once MA_API_LIB . "/Logger.php";
require_once MA_SVC_DB . "/service_dbCourseOSM.php";

final class ServiceWind
{
    private const USER_AGENT = "MatchAidScoreGIS/1.0 (+https://matchaid.org)";
    private const HTTP_TIMEOUT_SECONDS = 5;
    private const MAX_STATION_CANDIDATES = 4;
    private const OBS_CACHE_TTL_SECONDS = 240;  // ~4 minutes
    private const OBS_MAX_AGE_SECONDS = 5400;   // 90 minutes — older than this, treat as unusable
    private const KMH_TO_MPH = 0.62137119;
    private const PA_TO_INHG = 1 / 3386.389;
    private const METERS_TO_MILES = 1 / 1609.344;

    public static function getCurrentConditions(string $courseId): array
    {
        $courseId = trim($courseId);
        if ($courseId === "") {
            return ["ok" => false, "message" => "CourseID is required."];
        }

        $obsKey = "gisWind_obs_" . $courseId;
        $cached = self::cacheFetch($obsKey);
        if (is_array($cached)) {
            return ["ok" => true, "wind" => $cached];
        }

        $coord = self::resolveCourseCoordinate($courseId);
        if (!$coord) {
            return ["ok" => false, "message" => "No location data available for this course."];
        }

        try {
            $stationIds = self::resolveStationCandidates($courseId, $coord);
            $conditions = self::fetchFreshObservation($stationIds);
        } catch (Throwable $e) {
            Logger::error("WIND_FETCH_FAIL", [
                "courseId" => $courseId,
                "err" => $e->getMessage()
            ]);
            return ["ok" => false, "message" => "Unable to fetch current conditions."];
        }

        if (!$conditions) {
            return ["ok" => false, "message" => "No current conditions available for this course."];
        }

        self::cacheStore($obsKey, $conditions, self::OBS_CACHE_TTL_SECONDS);
        return ["ok" => true, "wind" => $conditions];
    }

    // Centroid of every hole/tee/green node in the course's stored OSM data
    // — reuses data already collected for GIS play instead of a separate
    // geocode, and is specific to the actual course rather than a city-level
    // approximation. Mirrors score_GISMap.js's geometryPoints() exactly,
    // including the "nodes": [id,...] case (a way referencing separate
    // "type":"node" elements elsewhere in the same response, rather than
    // carrying inline geometry) — Overpass's default "out body" shape, and
    // the one real course data has turned out to use.
    private static function resolveCourseCoordinate(string $courseId): ?array
    {
        $row = ServiceDbCourseOSM::getByCourseId($courseId);
        if (!$row) return null;

        $osm = json_decode((string)($row["dbCourseOSM_Data"] ?? ""), true);
        $elements = is_array($osm["elements"] ?? null) ? $osm["elements"] : [];
        if (!$elements) return null;

        $nodeIndex = [];
        foreach ($elements as $el) {
            if (($el["type"] ?? "") === "node" && isset($el["id"], $el["lat"], $el["lon"])) {
                $nodeIndex[(int)$el["id"]] = [(float)$el["lat"], (float)$el["lon"]];
            }
        }

        $latSum = 0.0;
        $lonSum = 0.0;
        $count = 0;

        foreach ($elements as $el) {
            $golf = strtolower((string)($el["tags"]["golf"] ?? ""));
            if (!in_array($golf, ["hole", "tee", "green"], true)) continue;

            $points = [];
            if (is_array($el["geometry"] ?? null)) {
                foreach ($el["geometry"] as $p) {
                    if (isset($p["lat"], $p["lon"])) $points[] = [(float)$p["lat"], (float)$p["lon"]];
                }
            } elseif (is_array($el["nodes"] ?? null)) {
                foreach ($el["nodes"] as $nid) {
                    if (isset($nodeIndex[(int)$nid])) $points[] = $nodeIndex[(int)$nid];
                }
            } elseif (($el["type"] ?? "") === "node" && isset($el["lat"], $el["lon"])) {
                $points[] = [(float)$el["lat"], (float)$el["lon"]];
            } elseif (isset($el["center"]["lat"], $el["center"]["lon"])) {
                $points[] = [(float)$el["center"]["lat"], (float)$el["center"]["lon"]];
            }

            foreach ($points as [$plat, $plon]) {
                $latSum += $plat;
                $lonSum += $plon;
                $count++;
            }
        }

        if ($count === 0) return null;
        return ["lat" => $latSum / $count, "lon" => $lonSum / $count];
    }

    // The grid ({gridId,gridX,gridY}) is cached with no expiry — it's
    // derived purely from the course's fixed coordinate and never changes.
    // The station list itself is re-fetched on every cache-miss (a light
    // call) rather than long-cached, since which stations are actively
    // reporting can drift over time and we don't want to freeze on
    // whichever list happened to be seen first.
    private static function resolveStationCandidates(string $courseId, array $coord): array
    {
        $gridKey = "gisWind_grid_" . $courseId;
        $grid = self::cacheFetch($gridKey);

        if (!is_array($grid) || !isset($grid["gridId"], $grid["gridX"], $grid["gridY"])) {
            // NOAA's /points endpoint expects ~4 decimal places of precision
            // and 301-redirects to the canonical rounded URL if given more —
            // our centroid comes straight from raw OSM node coordinates
            // (6-7 decimals), and HttpClient::getJson() doesn't follow
            // redirects, so this rounds before calling rather than relying
            // on a redirect that never gets followed.
            $pointsUrl = sprintf(
                "https://api.weather.gov/points/%s,%s",
                rawurlencode(number_format((float)$coord["lat"], 4, ".", "")),
                rawurlencode(number_format((float)$coord["lon"], 4, ".", ""))
            );
            $points = HttpClient::getJson($pointsUrl, self::headers(), self::HTTP_TIMEOUT_SECONDS);
            $props = $points["properties"] ?? [];

            $grid = [
                "gridId" => (string)($props["gridId"] ?? ""),
                "gridX"  => (int)($props["gridX"] ?? 0),
                "gridY"  => (int)($props["gridY"] ?? 0),
            ];
            if ($grid["gridId"] === "") {
                throw new RuntimeException("NOAA /points did not return a grid for this course.");
            }
            self::cacheStore($gridKey, $grid, 0);
        }

        $stationsUrl = sprintf(
            "https://api.weather.gov/gridpoints/%s/%d,%d/stations",
            rawurlencode($grid["gridId"]),
            $grid["gridX"],
            $grid["gridY"]
        );
        $stations = HttpClient::getJson($stationsUrl, self::headers(), self::HTTP_TIMEOUT_SECONDS);

        $ids = [];
        foreach (($stations["features"] ?? []) as $feature) {
            $sid = (string)($feature["properties"]["stationIdentifier"] ?? "");
            if ($sid !== "") $ids[] = $sid;
        }
        return $ids;
    }

    // Walks candidates in the order NOAA returned them (nearest first)
    // until one has a complete, recent reading — plenty of NWS stations
    // report infrequently or have gone dark, so trusting the nearest one
    // blindly risks silently serving stale or missing data.
    private static function fetchFreshObservation(array $stationIds): ?array
    {
        foreach (array_slice($stationIds, 0, self::MAX_STATION_CANDIDATES) as $stationId) {
            $url = "https://api.weather.gov/stations/" . rawurlencode($stationId) . "/observations/latest";

            try {
                $resp = HttpClient::getJson($url, self::headers(), self::HTTP_TIMEOUT_SECONDS);
            } catch (Throwable $e) {
                continue;
            }

            $normalized = self::normalize($resp["properties"] ?? [], $stationId);
            if ($normalized) return $normalized;
        }
        return null;
    }

    // Flattens NOAA's verbose {value,unitCode,qualityControl} fields into
    // plain imperial-unit values. Returns null (skip this station) when the
    // reading is stale or missing the fields the wind display actually
    // needs — temperature/humidity/etc. are allowed to be missing without
    // disqualifying the station, since those aren't required for today's UI.
    private static function normalize(array $props, string $stationId): ?array
    {
        $timestamp = (string)($props["timestamp"] ?? "");
        $ts = $timestamp !== "" ? strtotime($timestamp) : false;
        if ($ts === false || (time() - $ts) > self::OBS_MAX_AGE_SECONDS) {
            return null;
        }

        $windSpeedKmh = $props["windSpeed"]["value"] ?? null;
        $windDirDeg   = $props["windDirection"]["value"] ?? null;
        if ($windSpeedKmh === null || $windDirDeg === null) {
            return null;
        }

        $gustKmh    = $props["windGust"]["value"] ?? null;
        $tempC      = $props["temperature"]["value"] ?? null;
        $humidity   = $props["relativeHumidity"]["value"] ?? null;
        $pressurePa = $props["barometricPressure"]["value"] ?? null;
        $visM       = $props["visibility"]["value"] ?? null;

        return [
            "stationId"        => $stationId,
            "asOf"             => date(DATE_ATOM, $ts),
            "description"      => (string)($props["textDescription"] ?? ""),
            "windSpeedMph"     => round(((float)$windSpeedKmh) * self::KMH_TO_MPH, 1),
            "windDirectionDeg" => (float)$windDirDeg,
            "windGustMph"      => $gustKmh !== null ? round(((float)$gustKmh) * self::KMH_TO_MPH, 1) : null,
            "temperatureF"     => $tempC !== null ? round(((float)$tempC) * 9 / 5 + 32, 1) : null,
            "humidityPct"      => $humidity !== null ? round((float)$humidity, 0) : null,
            "pressureInHg"     => $pressurePa !== null ? round(((float)$pressurePa) * self::PA_TO_INHG, 2) : null,
            "visibilityMiles"  => $visM !== null ? round(((float)$visM) * self::METERS_TO_MILES, 1) : null,
        ];
    }

    private static function headers(): array
    {
        return [
            "User-Agent: " . self::USER_AGENT,
            "Accept: application/geo+json",
        ];
    }

    // APCu-backed, with a bare-bones fallback (always miss, always fetch
    // fresh) if the extension isn't loaded in some environment — the
    // feature still works end to end, just without the shared-cache benefit.
    private static function cacheFetch(string $key)
    {
        if (!function_exists("apcu_fetch")) return false;
        $value = apcu_fetch($key);
        return $value === false ? null : $value;
    }

    private static function cacheStore(string $key, $value, int $ttl): void
    {
        if (!function_exists("apcu_store")) return;
        apcu_store($key, $value, $ttl);
    }
}
