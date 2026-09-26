/* /assets/modules/score_GISMap.js
 * MA.scoreGISMap — Leaflet-based OSM course GIS renderer.
 *
 * Host-owned responsibilities (same split as score_entry.js/scoreentry_view.php):
 *   - course/game context
 *   - database/API acquisition
 *   - page chrome/navigation
 *   - loading Leaflet (assets/vendor/leaflet) before this module runs
 *   - declaring the static Prev/Next/hole-<select> controls in
 *     scoregis_view.php's .maControlArea band, and passing them into
 *     mount() — this module wires behavior to them, it doesn't build them
 *
 * Module responsibilities:
 *   - parse/index OSM features
 *   - associate a numbered hole with nearby green/pin/tee/bunker geometry
 *   - render hole/green/pin/tee/bunker geometry as Leaflet overlays on
 *     satellite imagery
 *   - previous/next/jump-to hole navigation, via the host's controls
 *
 * No live OSM/Overpass request is made here.
 */
(function () {
    "use strict";

    const MA = (window.MA = window.MA || {});
    MA.scoreGISMap = MA.scoreGISMap || {};

    const _states = new WeakMap();
    const STYLE_ID = "maScoreGisMapStyles";

    // Esri World Imagery — free, no API key required.
    const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    const TILE_ATTRIBUTION = "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics";
    const METERS_TO_YARDS = 1.0936133;
    const MAX_ON_COURSE_METERS = 750 / METERS_TO_YARDS;

    function n(v) {
        const x = Number(v);
        return Number.isFinite(x) ? x : null;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .gisMapStack{display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-height:0}
            .gisWaypointBar{display:flex;flex-direction:row;flex:0 0 auto;padding:0 var(--spaceMd)}
            .gisWaypointCell{flex:1 1 0;padding:4px 6px;text-align:center;border-right:1px solid var(--borderSubtle)}
            .gisWaypointCell:last-child{border-right:none}
            .gisWaypointLabel{font-size:10px;font-weight:700;color:var(--mutedText);text-transform:uppercase;letter-spacing:.03em}
            .gisWaypointValue{font-size:26px;font-weight:900;line-height:1.15;color:#111}
            .gisWaypointCell--primary .gisWaypointLabel,.gisWaypointCell--primary .gisWaypointValue{color:#2e7d32}
            .gisMapWrap{position:relative;flex:1;min-width:0;min-height:0}
            .gisMapHost{width:100%;height:100%;min-height:300px;overflow:hidden}
            .gisMeasureIcon__dot{width:22px;height:22px;border-radius:50%;background:#ff8f00;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:grab}
            .gisMeasureLabel__text{display:inline-block;white-space:nowrap;background:#fff;padding:4px 14px;border-radius:14px;border:2px solid #ff8f00;font-weight:900;font-size:26px;color:#e65100;box-shadow:0 1px 4px rgba(0,0,0,.4)}
            .gisRecenterCtl.isHidden{display:none}
            /* !important beats Leaflet's own .leaflet-bar a / .leaflet-touch
               .leaflet-bar a rules (higher specificity: class+element, and
               class+class+element on touch devices) that would otherwise
               force display:block and a fixed 26-30px box, leaving our icon
               unstyled by the flex-centering below. */
            .gisRecenterCtl__btn{display:flex !important;align-items:center;justify-content:center;width:30px !important;height:30px !important;color:#1565c0}
            .gisWindBadge{position:absolute;top:16px;right:14px;z-index:1000;background:#fff;border-radius:14px;box-shadow:0 1px 5px rgba(0,0,0,.5);padding:8px 12px;display:flex;align-items:center;gap:8px}
            .gisWindBadge.isHidden{display:none}
            .gisWindBadge [data-gis-wind-arrow]{transition:transform .3s ease;flex:0 0 auto}
            .gisWindBadge__speed{font-size:18px;font-weight:900;line-height:1;color:#111}
            .gisWindBadge__unit{font-size:11px;font-weight:700;color:var(--mutedText);margin-left:2px}
        `;
        document.head.appendChild(style);
    }

    function tag(feature, key) {
        return String(feature?.tags?.[key] ?? "");
    }

    function golfType(feature) {
        return tag(feature, "golf").toLowerCase();
    }

    function parseOsm(raw) {
        let data = raw;
        if (typeof raw === "string") {
            data = JSON.parse(raw);
        }
        if (!data || !Array.isArray(data.elements)) {
            throw new Error("OSM payload does not contain elements[].");
        }
        return data;
    }

    function buildNodeIndex(elements) {
        const map = new Map();
        elements.forEach((e) => {
            if (e?.type === "node" && n(e.lat) !== null && n(e.lon) !== null) {
                map.set(Number(e.id), { lat: Number(e.lat), lon: Number(e.lon) });
            }
        });
        return map;
    }

    function geometryPoints(feature, nodeIndex) {
        if (!feature) return [];

        if (Array.isArray(feature.geometry)) {
            return feature.geometry
                .map((p) => ({ lat: n(p.lat), lon: n(p.lon) }))
                .filter((p) => p.lat !== null && p.lon !== null);
        }

        if (Array.isArray(feature.nodes) && nodeIndex) {
            return feature.nodes
                .map((id) => nodeIndex.get(Number(id)) || null)
                .filter(Boolean);
        }

        if (feature.type === "node" && n(feature.lat) !== null && n(feature.lon) !== null) {
            return [{ lat: Number(feature.lat), lon: Number(feature.lon) }];
        }

        if (feature.center && n(feature.center.lat) !== null && n(feature.center.lon) !== null) {
            return [{ lat: Number(feature.center.lat), lon: Number(feature.center.lon) }];
        }

        return [];
    }

    function centroid(points) {
        if (!points.length) return null;
        let lat = 0, lon = 0;
        points.forEach((p) => { lat += p.lat; lon += p.lon; });
        return { lat: lat / points.length, lon: lon / points.length };
    }

    function featureCenter(feature, nodeIndex) {
        return centroid(geometryPoints(feature, nodeIndex));
    }

    function distanceMeters(a, b) {
        if (!a || !b) return Infinity;
        const R = 6371000;
        const toRad = (x) => x * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat);
        const dLon = toRad(b.lon - a.lon);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    // Compass bearing (0-360, 0 = north) from point a to point b.
    function bearingDegrees(a, b) {
        const toRad = (x) => x * Math.PI / 180;
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const dLon = toRad(b.lon - a.lon);
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    // leaflet-rotate applies setBearing(t) as a direct clockwise CSS rotation
    // of the map content (traced through its rotateFrom()/setTransform()
    // internals) — passing a world compass bearing straight in therefore
    // points that direction at the BOTTOM of the screen, not the top. Every
    // setBearing() call in this module goes through this so "point world
    // direction X at the top of the screen" actually does that.
    function screenBearing(worldBearingDeg) {
        return (360 - (((worldBearingDeg % 360) + 360) % 360)) % 360;
    }

    // Inverse of bearingDegrees — walks `distanceMeters` from `from` along
    // `bearingDeg` and returns the resulting lat/lon (standard great-circle
    // destination-point formula).
    function destinationPoint(from, bearingDeg, distanceMeters) {
        const R = 6371000;
        const brng = bearingDeg * Math.PI / 180;
        const lat1 = from.lat * Math.PI / 180;
        const lon1 = from.lon * Math.PI / 180;
        const dr = distanceMeters / R;

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(brng));
        const lon2 = lon1 + Math.atan2(
            Math.sin(brng) * Math.sin(dr) * Math.cos(lat1),
            Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
        );

        return { lat: lat2 * 180 / Math.PI, lon: ((lon2 * 180 / Math.PI) + 540) % 360 - 180 };
    }

    // Perpendicular-distance-to-segment projection, in a local equirectangular
    // approximation (fine at course scale) — used only to find *where* along
    // the segment the closest point falls; the reported distance itself still
    // goes through the accurate haversine distanceMeters().
    function projectPointOnSegment(p, a, b) {
        const kx = Math.cos(a.lat * Math.PI / 180);
        const ax = a.lon * kx, ay = a.lat;
        const bx = b.lon * kx, by = b.lat;
        const px = p.lon * kx, py = p.lat;
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
        return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
    }

    // Minimum distance from a point to a whole polyline (nearest point on any
    // segment) — this is the "corridor" check: how far off the hole's own
    // tee-to-green line a candidate feature sits, as opposed to how far it
    // sits from a single endpoint.
    function distanceToPolyline(point, points) {
        if (!points || !points.length) return Infinity;
        if (points.length === 1) return distanceMeters(point, points[0]);

        let best = Infinity;
        for (let i = 0; i < points.length - 1; i++) {
            const proj = projectPointOnSegment(point, points[i], points[i + 1]);
            const d = distanceMeters(point, proj);
            if (d < best) best = d;
        }
        return best;
    }

    // Standard 2D segment/segment intersection, in the same local
    // equirectangular approximation as projectPointOnSegment — returns the
    // lat/lon intersection point (interpolated on the true geodesic segment)
    // or null if the segments don't cross.
    function segmentIntersection(a1, a2, b1, b2) {
        const kx = Math.cos(a1.lat * Math.PI / 180);
        const toXY = (p) => ({ x: p.lon * kx, y: p.lat });
        const A = toXY(a1), B = toXY(a2), C = toXY(b1), D = toXY(b2);
        const r = { x: B.x - A.x, y: B.y - A.y };
        const s = { x: D.x - C.x, y: D.y - C.y };
        const denom = r.x * s.y - r.y * s.x;
        if (Math.abs(denom) < 1e-12) return null;

        const t = ((C.x - A.x) * s.y - (C.y - A.y) * s.x) / denom;
        const u = ((C.x - A.x) * r.y - (C.y - A.y) * r.x) / denom;
        if (t < 0 || t > 1 || u < 0 || u > 1) return null;

        return { lat: a1.lat + t * (a2.lat - a1.lat), lon: a1.lon + t * (a2.lon - a1.lon) };
    }

    function indexFeatures(elements) {
        const out = { holes: [], greens: [], pins: [], tees: [], bunkers: [], otherGolf: [] };
        elements.forEach((feature) => {
            switch (golfType(feature)) {
                case "hole": out.holes.push(feature); break;
                case "green": out.greens.push(feature); break;
                case "pin": out.pins.push(feature); break;
                case "tee": out.tees.push(feature); break;
                case "bunker": out.bunkers.push(feature); break;
                default:
                    if (golfType(feature)) out.otherGolf.push(feature);
            }
        });
        return out;
    }

    function buildHoleIndex(holes) {
        const map = new Map();
        holes.forEach((hole) => {
            const ref = parseInt(tag(hole, "ref"), 10);
            if (!Number.isFinite(ref)) return;
            if (!map.has(ref)) map.set(ref, hole);
        });
        return map;
    }

    function holeGeometry(st, hole) {
        const points = geometryPoints(hole, st.nodeIndex);
        return {
            points,
            start: points[0] || null,
            end: points.length ? points[points.length - 1] : null
        };
    }

    // Applied to every "find the feature that belongs to this hole" lookup
    // below. This is a perpendicular-distance-to-the-hole's-own-line check
    // (a corridor), not a radius from a single point — on courses with
    // tight/parallel routing, a neighboring hole's bunker or tee can easily
    // be the closest thing to *this* hole's endpoint, even though it sits
    // well off to the side of this hole's actual line. Measuring against the
    // whole polyline instead of one endpoint is what excludes it.
    const MAX_CORRIDOR_METERS = 45;

    // Filters `features` down to those within the corridor of `holePoints`,
    // annotated with each survivor's center point (reused by callers for a
    // secondary nearest-to-reference-point tie-break).
    function corridorFilter(st, features, holePoints, maxCorridorMeters = MAX_CORRIDOR_METERS) {
        return features
            .map((feature) => {
                const center = featureCenter(feature, st.nodeIndex);
                return {
                    feature,
                    center,
                    corridorMeters: center ? distanceToPolyline(center, holePoints) : Infinity
                };
            })
            .filter((x) => x.center && x.corridorMeters <= maxCorridorMeters);
    }

    function nearestTo(candidates, refPoint) {
        let winner = null;
        let best = Infinity;
        candidates.forEach((x) => {
            const d = distanceMeters(refPoint, x.center);
            if (d < best) {
                best = d;
                winner = { feature: x.feature, distanceMeters: d };
            }
        });
        return winner;
    }

    function resolveHoleContext(st, holeNo) {
        const hole = st.holeIndex.get(holeNo) || null;
        if (!hole) return { hole: null, geometry: null, green: null, pin: null, tees: [], bunkers: [] };

        const geometry = holeGeometry(st, hole);
        const corridorGreens = corridorFilter(st, st.features.greens, geometry.points);
        const corridorPins = corridorFilter(st, st.features.pins, geometry.points);
        const green = nearestTo(corridorGreens, geometry.end);
        const pin = nearestTo(corridorPins, geometry.end);

        const tees = corridorFilter(st, st.features.tees, geometry.points)
            .map((x) => ({ feature: x.feature, distanceMeters: distanceMeters(geometry.start, x.center) }))
            .sort((a, b) => a.distanceMeters - b.distanceMeters)
            .slice(0, 8);

        const bunkers = corridorFilter(st, st.features.bunkers, geometry.points)
            .map((x) => ({
                feature: x.feature,
                distanceMeters: Math.min(
                    distanceMeters(geometry.start, x.center),
                    distanceMeters(geometry.end, x.center)
                )
            }))
            .sort((a, b) => a.distanceMeters - b.distanceMeters)
            .slice(0, 16);

        return { hole, geometry, green, pin, tees, bunkers };
    }

    // True when there's no way to know (GPS not active/denied, or the hole
    // has no usable reference point) — in that case we don't block anything,
    // since the tee-fallback measure tool works fine without GPS. Only
    // returns false once we positively know the player is far from the hole.
    function isWithinCourseRange(st, ctx) {
        if (!st.myPosition) return true;

        const ref = ctx.geometry?.start
            || (ctx.pin?.feature && featureCenter(ctx.pin.feature, st.nodeIndex))
            || (ctx.green?.feature && featureCenter(ctx.green.feature, st.nodeIndex));
        if (!ref) return true;

        return distanceMeters(st.myPosition, ref) <= MAX_ON_COURSE_METERS;
    }

    // Bare number, no unit suffix — matches the waypoint bar's own
    // convention (everything on this screen is yards; context already
    // establishes that without repeating it on every label).
    function yardsText(meters) {
        return Number.isFinite(meters) ? `${Math.round(meters * METERS_TO_YARDS)}` : "—";
    }

    // Same fallback chain as the old tee-based orientToPin, just reusable
    // from any origin: pin, then green centroid, then the hole line's own
    // end point. This is what both the live rotation bearing and the green
    // waypoints aim at, so the on-map line and the F/M/B numbers always
    // agree on what "the target" is.
    function resolveAimTarget(st, ctx) {
        if (ctx.pin?.feature) return featureCenter(ctx.pin.feature, st.nodeIndex);
        if (ctx.green?.feature) return featureCenter(ctx.green.feature, st.nodeIndex);
        return ctx.geometry?.end || null;
    }

    // Front/middle/back-of-green distances, measured along the same
    // origin->target aim line as the live rotation — not the green's raw
    // centroid, so the three numbers stay consistent with each other and
    // with what's pointing "up" on screen. Extends the aim line a generous
    // 80m past the target so it's guaranteed to clear the green's far edge
    // even when the target (the pin) sits short of it.
    function computeGreenWaypoints(st, ctx, origin) {
        if (!origin || !ctx.green?.feature) return null;

        const target = resolveAimTarget(st, ctx);
        if (!target) return null;

        const ring = geometryPoints(ctx.green.feature, st.nodeIndex);
        if (ring.length < 3) return null;

        const bearing = bearingDegrees(origin, target);
        const reach = distanceMeters(origin, target) + 80;
        const far = destinationPoint(origin, bearing, reach);

        const closed = (ring[0].lat === ring[ring.length - 1].lat && ring[0].lon === ring[ring.length - 1].lon)
            ? ring
            : ring.concat([ring[0]]);

        const hits = [];
        for (let i = 0; i < closed.length - 1; i++) {
            const hit = segmentIntersection(origin, far, closed[i], closed[i + 1]);
            if (hit) hits.push(distanceMeters(origin, hit));
        }
        if (!hits.length) return null;

        hits.sort((a, b) => a - b);
        const front = hits[0];
        const back = hits[hits.length - 1];
        return { front, middle: (front + back) / 2, back };
    }

    // Draws/updates the wind badge overlay (top-right of the map). The arrow
    // is rotated relative to the CURRENT screen-up direction (whatever
    // bearing orientToPin()/applyFollowView() last set), not true north —
    // since the map itself is continuously re-rotated to point at the
    // target, the badge is a plain fixed-position DOM overlay outside the
    // rotated Leaflet panes, so it has to do its own counter-rotation to
    // stay meaningful relative to the shot line (0deg = wind helping,
    // 180deg = wind into, matching how a golfer actually thinks about it).
    function renderWindBadge(st) {
        if (!st.windBadge || !st.wind) return;

        // Reads the map's ACTUAL current bearing rather than whichever
        // variable our own follow/orient code last set — that tracked value
        // never gets updated by a manual touch-rotate gesture, since that
        // goes straight through leaflet-rotate's own gesture handler.
        // screenBearing() is its own inverse, so applying it to the map's
        // (screen-convention) bearing recovers our world-bearing convention.
        const liveBearing = st.map.getBearing ? screenBearing(st.map.getBearing()) : (st._lastFramedBearing || 0);

        const blowingToward = (st.wind.windDirectionDeg + 180) % 360;
        const relative = ((blowingToward - liveBearing) % 360 + 360) % 360;

        const arrow = st.windBadge.querySelector("[data-gis-wind-arrow]");
        if (arrow) arrow.style.transform = `rotate(${relative}deg)`;

        const speedEl = st.windBadge.querySelector("[data-gis-wind-speed]");
        if (speedEl) speedEl.textContent = Math.round(st.wind.windSpeedMph);
    }

    // Public: score_gis.js owns fetching (polling on its own timer,
    // independent of hole changes — wind is course-wide, not per-hole) and
    // hands the result here to render. A falsy `wind` hides the badge
    // instead of showing a stale/placeholder value.
    function updateWind(hostEl, wind) {
        const st = _states.get(hostEl);
        if (!st || !st.map) return;

        st.wind = wind || null;

        if (!st.wind) {
            if (st.windBadge) st.windBadge.classList.add("isHidden");
            return;
        }

        if (!st.windBadge) {
            st.windBadge = document.createElement("div");
            st.windBadge.className = "gisWindBadge";
            st.windBadge.innerHTML = `
                <svg viewBox="0 0 24 24" width="22" height="22" data-gis-wind-arrow>
                    <path d="M12 2 L12 20 M12 2 L7 8 M12 2 L17 8" stroke="#1565c0" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
                <div class="gisWindBadge__speed"><span data-gis-wind-speed></span><span class="gisWindBadge__unit">mph</span></div>
            `;
            const mapWrap = st.hostEl.querySelector(".gisMapWrap");
            (mapWrap || st.hostEl).appendChild(st.windBadge);
        }

        st.windBadge.classList.remove("isHidden");
        renderWindBadge(st);
    }

    // Renders the horizontal waypoint bar above the map.
    function renderWaypoints(st, wp) {
        const bar = st.hostEl.querySelector("[data-gis-waypoints]");
        if (!bar) return;

        const cells = [
            { label: "Green Back", value: wp?.back },
            { label: "Green Center", value: wp?.middle, primary: true },
            { label: "Green Front", value: wp?.front }
        ];

        bar.innerHTML = cells.map((c) => `
            <div class="gisWaypointCell${c.primary ? " gisWaypointCell--primary" : ""}">
                <div class="gisWaypointLabel">${c.label}</div>
                <div class="gisWaypointValue">${Number.isFinite(c.value) ? Math.round(c.value * METERS_TO_YARDS) : "—"}</div>
            </div>
        `).join("");
    }

    function availableHoleNumbers(st) {
        return Array.from(st.holeIndex.keys()).sort((a, b) => a - b);
    }

    function llFromPoint(p) {
        return [p.lat, p.lon];
    }

    function llFromPoints(points) {
        return points.map(llFromPoint);
    }

    // Rotates the map so the tee→pin direction (falling back to tee→green,
    // then tee→hole-end) points to the top of the screen, computed once per
    // hole rather than continuously chasing the live GPS bearing — a fixed
    // per-hole rotation avoids the map spinning/jittering as GPS updates.
    function orientToPin(st, ctx) {
        if (!st.map.setBearing) return;

        const from = ctx.geometry?.start;
        const to = (ctx.pin?.feature && featureCenter(ctx.pin.feature, st.nodeIndex))
            || (ctx.green?.feature && featureCenter(ctx.green.feature, st.nodeIndex))
            || ctx.geometry?.end;

        const bearing = (from && to) ? bearingDegrees(from, to) : 0;
        // setBearing() fires the map's own "rotate" event synchronously,
        // which re-renders the wind badge (onMapRotate) — no separate call
        // needed here.
        st.map.setBearing(screenBearing(bearing));
    }

    // Player-anchored "you are here" framing: rotates so the live
    // player->target bearing points up, and centers on a virtual point
    // offset behind the player (along that same bearing) so the player lands
    // near the bottom of the screen and the target near the top, instead of
    // dead-center. Damped against GPS jitter via FRAME_MOVE_THRESHOLD_M /
    // FRAME_BEARING_THRESHOLD_DEG unless `force` is set (hole just loaded,
    // or the player tapped recenter).
    const PLAYER_ANCHOR_FRAC = 0.82;
    const TARGET_ANCHOR_FRAC = 0.15;
    const MIN_FOLLOW_ZOOM = 15;
    const MAX_FOLLOW_ZOOM = 20;
    const FRAME_MOVE_THRESHOLD_M = 3;
    const FRAME_BEARING_THRESHOLD_DEG = 4;

    function applyFollowView(st, ctx, opts) {
        const force = !!(opts && opts.force);
        if (!st.myPosition || !st.map.setBearing) return false;

        const target = resolveAimTarget(st, ctx);
        if (!target) return false;

        const bearing = bearingDegrees(st.myPosition, target);

        if (!force && st._lastFramedPos) {
            const moved = distanceMeters(st._lastFramedPos, st.myPosition);
            const turned = Math.abs(((bearing - st._lastFramedBearing + 540) % 360) - 180);
            if (moved < FRAME_MOVE_THRESHOLD_M && turned < FRAME_BEARING_THRESHOLD_DEG) return false;
        }

        const size = st.map.getSize();
        const targetDistance = distanceMeters(st.myPosition, target);
        const spanPx = size.y * (PLAYER_ANCHOR_FRAC - TARGET_ANCHOR_FRAC);

        let zoom = MAX_FOLLOW_ZOOM;
        if (targetDistance > 0 && spanPx > 0) {
            const metersPerPixelAtZ0 = 156543.03392804097 * Math.cos(st.myPosition.lat * Math.PI / 180);
            const neededZoom = Math.log2((spanPx * metersPerPixelAtZ0) / targetDistance);
            zoom = Math.max(MIN_FOLLOW_ZOOM, Math.min(MAX_FOLLOW_ZOOM, neededZoom));
        }

        const metersPerPixel = 156543.03392804097 * Math.cos(st.myPosition.lat * Math.PI / 180) / Math.pow(2, zoom);
        const offsetMeters = (size.y * PLAYER_ANCHOR_FRAC - size.y / 2) * metersPerPixel;
        const virtualCenter = destinationPoint(st.myPosition, bearing, offsetMeters);

        st._programmaticUpdate = true;
        st.map.setBearing(screenBearing(bearing));
        st.map.setView([virtualCenter.lat, virtualCenter.lon], zoom, { animate: false });
        requestAnimationFrame(() => { st._programmaticUpdate = false; });

        st._lastFramedPos = { lat: st.myPosition.lat, lon: st.myPosition.lon };
        st._lastFramedBearing = bearing;
        // setBearing() above already fired "rotate" synchronously, which
        // re-renders the wind badge (onMapRotate) — no separate call needed.
        return true;
    }

    function setRecenterVisible(st, visible) {
        if (st.recenterBtn) st.recenterBtn.classList.toggle("isHidden", !visible);
    }

    // Manual pan/rotate/zoom, or dragging the measure marker, drops follow
    // mode — otherwise the next GPS fix would yank the view out from under
    // whatever the player was just doing. A recenter button reappears so
    // they can explicitly opt back in, matching standard nav-app behavior.
    function pauseFollow(st) {
        if (!st.followMode) return;
        st.followMode = false;
        setRecenterVisible(st, true);
    }

    function resumeFollow(st) {
        st.followMode = true;
        setRecenterVisible(st, false);
        st._lastFramedPos = null;
        st._lastFramedBearing = null;
        applyFollowView(st, resolveHoleContext(st, st.selectedHole), { force: true });
    }

    function renderHole(st) {
        const ctx = resolveHoleContext(st, st.selectedHole);

        st.layerGroup.clearLayers();

        // A hole change always re-engages follow mode and forces a fresh
        // frame — any pause left over from the previous hole shouldn't carry
        // forward onto a view the player hasn't looked at yet.
        st.followMode = true;
        st._lastFramedPos = null;
        st._lastFramedBearing = null;
        setRecenterVisible(st, false);

        // Fresh hole, fresh read on the remaining-to-green line — don't
        // carry over whichever side of the show/hide hysteresis the
        // previous hole last landed on.
        st._showRemainingLine = false;

        if (!ctx.hole) {
            renderWaypoints(st, null);
            return;
        }

        placeMeasureAtPin(st, ctx);

        const boundsPts = [];

        if (ctx.geometry.points.length >= 2) {
            L.polyline(llFromPoints(ctx.geometry.points), { color: "#111", weight: 5 }).addTo(st.layerGroup);
            boundsPts.push(...ctx.geometry.points);
        }

        ctx.bunkers.forEach((x) => {
            const pts = geometryPoints(x.feature, st.nodeIndex);
            if (pts.length >= 3) {
                L.polygon(llFromPoints(pts), { color: "#9b8248", weight: 2, fillColor: "#e8d39c", fillOpacity: 0.85 }).addTo(st.layerGroup);
                boundsPts.push(...pts);
            }
        });

        ctx.tees.forEach((x) => {
            const pts = geometryPoints(x.feature, st.nodeIndex);
            if (pts.length >= 3) {
                L.polygon(llFromPoints(pts), { color: "#2e7d32", weight: 2, fillColor: "#66bb6a", fillOpacity: 0.65 }).addTo(st.layerGroup);
                boundsPts.push(...pts);
            }
        });

        if (ctx.green?.feature) {
            const pts = geometryPoints(ctx.green.feature, st.nodeIndex);
            if (pts.length >= 3) {
                L.polygon(llFromPoints(pts), { color: "#33691e", weight: 3, fillColor: "#9ccc65", fillOpacity: 0.85 }).addTo(st.layerGroup);
                boundsPts.push(...pts);
            }
        }

        if (ctx.geometry.start) {
            L.circleMarker(llFromPoint(ctx.geometry.start), { radius: 7, color: "#fff", weight: 2, fillColor: "#1565c0", fillOpacity: 1 }).addTo(st.layerGroup);
            boundsPts.push(ctx.geometry.start);
        }

        if (ctx.geometry.end) {
            L.circleMarker(llFromPoint(ctx.geometry.end), { radius: 7, color: "#fff", weight: 2, fillColor: "#111", fillOpacity: 1 }).addTo(st.layerGroup);
            boundsPts.push(ctx.geometry.end);
        }

        if (ctx.pin?.feature) {
            const p = featureCenter(ctx.pin.feature, st.nodeIndex);
            if (p) {
                L.circleMarker(llFromPoint(p), { radius: 8, color: "#fff", weight: 2, fillColor: "#d32f2f", fillOpacity: 1 }).addTo(st.layerGroup);
                boundsPts.push(p);
            }
        }

        const origin = st.myPosition || ctx.geometry.start;
        renderWaypoints(st, computeGreenWaypoints(st, ctx, origin));

        // Live player-anchored/rotated view when GPS is already active
        // (it usually is — geolocation stays running across hole changes);
        // otherwise fall back to the old whole-hole overview until the
        // first fix arrives, at which point onPosition() switches over.
        const followed = st.myPosition && applyFollowView(st, ctx, { force: true });
        if (!followed) {
            orientToPin(st, ctx);
            if (boundsPts.length) {
                st.map.fitBounds(L.latLngBounds(llFromPoints(boundsPts)), { padding: [30, 30], maxZoom: 20 });
            }
        }

        refreshMeasure(st);
    }

    function onPosition(st, pos) {
        // startLocate() sets "Locating..." once and nothing else ever clears
        // it on success — only onPositionError() touches this text again,
        // for error cases. Without this, the message would sit there forever
        // once GPS is actually working.
        MA.setStatus("", "info");

        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Number(pos.coords.accuracy) || 0;
        st.myPosition = { lat, lon };

        if (!st.myMarker) {
            st.myMarker = L.circleMarker([lat, lon], { radius: 8, color: "#fff", weight: 2, fillColor: "#1e88e5", fillOpacity: 1 }).addTo(st.map);
            st.myAccuracy = L.circle([lat, lon], { radius: accuracy, color: "#1e88e5", weight: 1, fillColor: "#1e88e5", fillOpacity: 0.12 }).addTo(st.map);
        } else {
            st.myMarker.setLatLng([lat, lon]);
            st.myAccuracy.setLatLng([lat, lon]);
            st.myAccuracy.setRadius(accuracy);
        }

        // If GPS just brought the player within range and no measure point
        // exists yet, seed it at the pin — same as on hole load. Only when
        // no marker exists yet, so this never clobbers a manual drag.
        const ctx = resolveHoleContext(st, st.selectedHole);
        if (!st.measureMarker && isWithinCourseRange(st, ctx)) {
            placeMeasureAtPin(st, ctx);
        }

        if (st.followMode) {
            applyFollowView(st, ctx);
        }

        renderWaypoints(st, computeGreenWaypoints(st, ctx, st.myPosition));

        refreshMeasure(st);
    }

    function onPositionError(st, err) {
        if (err?.code === 1) {
            // Permission denied — the watch will never succeed; fully reset.
            stopLocate(st);
            MA.setStatus("Location permission denied. Enable location access for this site.", "danger");
            return;
        }

        const messages = {
            2: "Location unavailable right now.",
            3: "Location request timed out."
        };
        MA.setStatus(messages[err?.code] || "Unable to get your location.", "warn");
    }

    function stopLocate(st) {
        if (st.watchId != null) {
            navigator.geolocation.clearWatch(st.watchId);
            st.watchId = null;
        }
        if (st.myMarker) { st.map.removeLayer(st.myMarker); st.myMarker = null; }
        if (st.myAccuracy) { st.map.removeLayer(st.myAccuracy); st.myAccuracy = null; }
        st.myPosition = null;
    }

    // Auto-starts once on page load — this page exists specifically for
    // GPS play, so there's no manual on/off control. A denied/failed
    // permission just leaves the status message showing; refreshing the
    // page is the retry path.
    function startLocate(st) {
        if (st.watchId != null) return;

        if (!navigator.geolocation) {
            MA.setStatus("Geolocation is not supported on this device.", "danger");
            return;
        }

        MA.setStatus("Locating…", "info");

        st.watchId = navigator.geolocation.watchPosition(
            (pos) => onPosition(st, pos),
            (err) => onPositionError(st, err),
            { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
        );
    }

    function measureIcon() {
        return L.divIcon({
            className: "gisMeasureIcon",
            html: '<div class="gisMeasureIcon__dot"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
    }

    function measureAnchor(st) {
        if (st.myPosition) return st.myPosition;
        const ctx = resolveHoleContext(st, st.selectedHole);
        return ctx.geometry?.start || null;
    }

    const ROTATE_SETTLE_MS = 250;

    // In practice, every overlay we draw (hole outline, green/bunker/tee
    // shapes, the position/pin/measure dots, and the measure line + label)
    // visibly lags during an active rotate gesture and snaps to its correct
    // spot once rotation stops — regardless of layer type. Rather than chase
    // per-layer timing inside the plugin, hide the two whole Leaflet panes
    // that hold all of it (overlayPane: paths/polygons/circleMarkers,
    // markerPane: the L.marker-based measure dot + label) while "rotate"
    // events are firing in a burst, and reveal both once the gesture
    // settles, by which point everything has already snapped into place.
    function onMapRotate(st) {
        const overlayPane = st.map.getPane("overlayPane");
        const markerPane = st.map.getPane("markerPane");
        if (overlayPane) overlayPane.style.opacity = "0";
        if (markerPane) markerPane.style.opacity = "0";

        clearTimeout(st._rotateSettleTimer);
        st._rotateSettleTimer = setTimeout(() => {
            if (overlayPane) overlayPane.style.opacity = "1";
            if (markerPane) markerPane.style.opacity = "1";
        }, ROTATE_SETTLE_MS);

        // "rotate" fires for every bearing change regardless of source —
        // programmatic (applyFollowView/orientToPin) or a manual touch-rotate
        // gesture, which never goes through our own code at all. Re-reading
        // the map's live bearing here (rather than relying on whichever
        // variable our own code last set) is what keeps the badge correct
        // through a manual rotate.
        renderWindBadge(st);
    }

    // Second-leg "to green" line only earns its keep as a full-shot planning
    // aid — inside this range you're already chipping/pitching, where exact
    // yardage stops being decision-relevant and the line is just noise.
    // Two thresholds rather than one cutoff give it hysteresis, so dragging
    // the marker back and forth near 50 yards doesn't flicker the line
    // on/off; between the two, it just keeps whatever state it was already in.
    const REMAINING_HIDE_BELOW_METERS = 45 / METERS_TO_YARDS;
    const REMAINING_SHOW_ABOVE_METERS = 55 / METERS_TO_YARDS;

    // Re-evaluates the range gate and redraws the on-map lines/labels. No text
    // readout anymore — the on-map marker/lines/labels are the only feedback.
    function refreshMeasure(st) {
        const ctx = resolveHoleContext(st, st.selectedHole);

        if (!isWithinCourseRange(st, ctx) && st.measureMarker) {
            st.map.removeLayer(st.measureMarker);
            st.measureMarker = null;
        }

        updateMeasureVisuals(st, ctx);
    }

    function removeRemainingVisuals(st) {
        if (st.remainingLine) { st.map.removeLayer(st.remainingLine); st.remainingLine = null; }
        if (st.remainingLabel) { st.map.removeLayer(st.remainingLabel); st.remainingLabel = null; }
    }

    // The dashed marker->green-center leg — shown only once there's enough
    // remaining distance for it to be a meaningful next-shot number (see
    // REMAINING_HIDE_BELOW_METERS/REMAINING_SHOW_ABOVE_METERS above). Label
    // sits close to the marker end, not the green end, since that's where
    // attention actually is while dragging the marker around.
    function updateRemainingVisuals(st, ctx, fromLL) {
        const greenPoint = ctx.green?.feature ? featureCenter(ctx.green.feature, st.nodeIndex) : null;
        if (!greenPoint) {
            removeRemainingVisuals(st);
            return;
        }

        const remainingMeters = distanceMeters({ lat: fromLL.lat, lon: fromLL.lng }, greenPoint);

        if (st._showRemainingLine === undefined) st._showRemainingLine = false;
        if (remainingMeters < REMAINING_HIDE_BELOW_METERS) st._showRemainingLine = false;
        else if (remainingMeters > REMAINING_SHOW_ABOVE_METERS) st._showRemainingLine = true;

        if (!st._showRemainingLine) {
            removeRemainingVisuals(st);
            return;
        }

        const greenLL = L.latLng(greenPoint.lat, greenPoint.lon);

        if (!st.remainingLine) {
            st.remainingLine = L.polyline([fromLL, greenLL], { color: "#ff8f00", weight: 3, dashArray: "6 6" }).addTo(st.map);
        } else {
            st.remainingLine.setLatLngs([fromLL, greenLL]);
        }

        // Midpoint of the marker->green leg.
        const t = 0.5;
        const labelLatLng = L.latLng(
            fromLL.lat + (greenLL.lat - fromLL.lat) * t,
            fromLL.lng + (greenLL.lng - fromLL.lng) * t
        );
        const text = yardsText(remainingMeters);

        if (!st.remainingLabel) {
            st.remainingLabel = L.marker(labelLatLng, {
                icon: L.divIcon({
                    className: "gisMeasureLabel",
                    html: `<div class="gisMeasureLabel__text" data-gis-measure-label-text>${text}</div>`,
                    iconSize: [96, 36],
                    iconAnchor: [48, 18]
                }),
                interactive: false,
                zIndexOffset: 1001
            }).addTo(st.map);
        } else {
            st.remainingLabel.setLatLng(labelLatLng);
            const textEl = st.remainingLabel.getElement()?.querySelector("[data-gis-measure-label-text]");
            if (textEl) textEl.textContent = text;
        }
    }

    // Draws a solid line from the reference point to the measure marker (the
    // shot about to be hit) with its own floating yardage label, then hands
    // off to updateRemainingVisuals() for the second, dashed marker->green
    // leg.
    function updateMeasureVisuals(st, ctx) {
        const anchor = st.measureMarker ? measureAnchor(st) : null;

        if (!st.measureMarker || !anchor) {
            if (st.measureLine) { st.map.removeLayer(st.measureLine); st.measureLine = null; }
            if (st.measureLabel) { st.map.removeLayer(st.measureLabel); st.measureLabel = null; }
            removeRemainingVisuals(st);
            return;
        }

        const anchorLL = L.latLng(anchor.lat, anchor.lon);
        const targetLL = st.measureMarker.getLatLng();

        if (!st.measureLine) {
            st.measureLine = L.polyline([anchorLL, targetLL], { color: "#ff8f00", weight: 3 }).addTo(st.map);
        } else {
            st.measureLine.setLatLngs([anchorLL, targetLL]);
        }

        // 75% of the way from the anchor to the marker — close to it without
        // the (now larger, 26px) label crowding the dot itself.
        const t = 0.75;
        const labelLatLng = L.latLng(
            anchorLL.lat + (targetLL.lat - anchorLL.lat) * t,
            anchorLL.lng + (targetLL.lng - anchorLL.lng) * t
        );
        const text = yardsText(distanceMeters(anchor, { lat: targetLL.lat, lon: targetLL.lng }));

        if (!st.measureLabel) {
            st.measureLabel = L.marker(labelLatLng, {
                icon: L.divIcon({
                    className: "gisMeasureLabel",
                    html: `<div class="gisMeasureLabel__text" data-gis-measure-label-text>${text}</div>`,
                    iconSize: [96, 36],
                    iconAnchor: [48, 18]
                }),
                interactive: false,
                zIndexOffset: 1001
            }).addTo(st.map);
        } else {
            st.measureLabel.setLatLng(labelLatLng);
            const textEl = st.measureLabel.getElement()?.querySelector("[data-gis-measure-label-text]");
            if (textEl) textEl.textContent = text;
        }

        updateRemainingVisuals(st, ctx, targetLL);
    }

    function placeMeasureMarker(st, latlng) {
        if (!st.measureMarker) {
            st.measureMarker = L.marker(latlng, {
                draggable: true,
                icon: measureIcon(),
                zIndexOffset: 1000
            }).addTo(st.map);
            st.measureMarker.on("dragstart", () => pauseFollow(st));
            st.measureMarker.on("drag", () => refreshMeasure(st));
            st.measureMarker.on("dragend", () => refreshMeasure(st));
        } else {
            st.measureMarker.setLatLng(latlng);
        }
    }

    function onMeasureMapClick(st, e) {
        const ctx = resolveHoleContext(st, st.selectedHole);
        if (!isWithinCourseRange(st, ctx)) return;

        placeMeasureMarker(st, e.latlng);
        refreshMeasure(st);
    }

    // Pre-seeds the measure marker on the pin every time a hole loads, so the
    // orange dot starts exactly on top of the red pin dot — the golfer then
    // drags it off from there (e.g. to clear a bunker) instead of having to
    // tap the map first. Skipped entirely when GPS shows the player is far
    // from the hole (see MAX_ON_COURSE_METERS) — no point pre-seeding a
    // measurement that's about to be hidden anyway.
    function placeMeasureAtPin(st, ctx) {
        const p = (isWithinCourseRange(st, ctx) && ctx.pin?.feature)
            ? featureCenter(ctx.pin.feature, st.nodeIndex)
            : null;

        if (!p) {
            if (st.measureMarker) { st.map.removeLayer(st.measureMarker); st.measureMarker = null; }
            return;
        }

        placeMeasureMarker(st, L.latLng(p.lat, p.lon));
    }

    function selectHole(st, holeNo) {
        st.selectedHole = Number(holeNo);
        if (st.holeSelect) st.holeSelect.value = String(st.selectedHole);
        renderHole(st);

        // Only fires on genuine player navigation (Prev/Next/select) — never
        // on mount()'s own initial hole resolution, which sets
        // st.selectedHole directly rather than going through here.
        if (typeof st.onHoleChange === "function") st.onHoleChange(st.selectedHole);
    }

    // Fills the host page's <select> with this course's actual traced holes
    // (from OSM data), not a fixed 1-18/F9/B9 range — a course trace can be
    // missing holes or numbered differently than the game's format.
    function populateHoleSelect(st) {
        if (!st.holeSelect) return;

        st.holeSelect.innerHTML = "";
        availableHoleNumbers(st).forEach((h) => {
            const opt = document.createElement("option");
            opt.value = String(h);
            opt.textContent = String(h);
            if (h === st.selectedHole) opt.selected = true;
            st.holeSelect.appendChild(opt);
        });
    }

    // Binds the host page's Prev/Next buttons + hole <select> once — they're
    // static elements owned by scoregis_view.php, not rebuilt per render.
    function wireExternalControls(st) {
        if (st._controlsBound) return;
        st._controlsBound = true;

        st.prevBtn?.addEventListener("click", () => previousHole(st));
        st.nextBtn?.addEventListener("click", () => nextHole(st));
        st.holeSelect?.addEventListener("change", (e) => {
            const h = parseInt(e.target.value, 10);
            if (Number.isInteger(h)) selectHole(st, h);
        });
    }

    function previousHole(st) {
        const nums = availableHoleNumbers(st);
        if (!nums.length) return;
        const i = nums.indexOf(st.selectedHole);
        selectHole(st, nums[i <= 0 ? nums.length - 1 : i - 1]);
    }

    function nextHole(st) {
        const nums = availableHoleNumbers(st);
        if (!nums.length) return;
        const i = nums.indexOf(st.selectedHole);
        selectHole(st, nums[i < 0 || i >= nums.length - 1 ? 0 : i + 1]);
    }

    // Leaflet caches its own pixel size and doesn't notice a CSS-driven
    // container resize on its own. Sizing itself is now entirely CSS's job —
    // #scoreGisModuleHost's flex-fill chain (score_gis.css) stretches
    // .gisMapHost to fill the viewport down to the bottom nav — so this just
    // has to nudge Leaflet to re-measure after that layout settles or
    // changes (initial mount, window resize, orientation change).
    function nudgeMapSize(st) {
        if (st.map) st.map.invalidateSize();
    }

    // Docks under Leaflet's own zoom +/- control (same "topleft" corner —
    // Leaflet stacks multiple controls added to one corner automatically,
    // with its own default spacing, so no manual offset math is needed).
    // Icon-only, reusing Leaflet's own leaflet-bar button chrome instead of
    // a hand-styled floating button.
    const GisRecenterControl = L.Control.extend({
        options: { position: "topleft" },
        onAdd: function (map) {
            const container = L.DomUtil.create("div", "leaflet-bar gisRecenterCtl isHidden");
            const link = L.DomUtil.create("a", "gisRecenterCtl__btn", container);
            link.href = "#";
            link.title = "Recenter on my position";
            link.setAttribute("role", "button");
            link.setAttribute("aria-label", "Recenter on my position");
            link.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="7"></circle>
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"></circle>
                <line x1="12" y1="2" x2="12" y2="5"></line>
                <line x1="12" y1="19" x2="12" y2="22"></line>
                <line x1="2" y1="12" x2="5" y2="12"></line>
                <line x1="19" y1="12" x2="22" y2="12"></line>
            </svg>`;

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(link, "click", (e) => {
                L.DomEvent.preventDefault(e);
                resumeFollow(map._gisState);
            });

            return container;
        }
    });

    function renderShell(st) {
        if (st.map) {
            st.map.remove();
            st.map = null;
        }
        // A remount tears down the Leaflet map (and any position layers tied
        // to it) — drop the stale layer refs so the next GPS fix rebuilds
        // them cleanly against the new map instance.
        st.myMarker = null;
        st.myAccuracy = null;
        st.measureMarker = null;
        st.measureLine = null;
        st.measureLabel = null;
        st.remainingLine = null;
        st.remainingLabel = null;
        st._showRemainingLine = false;
        clearTimeout(st._rotateSettleTimer);

        st.hostEl.innerHTML = `
            <div class="gisMapStack">
                <div class="gisWaypointBar" data-gis-waypoints></div>
                <div class="gisMapWrap">
                    <div class="gisMapHost" data-gis-map-host></div>
                </div>
            </div>`;

        const mapHost = st.hostEl.querySelector("[data-gis-map-host]");
        st.map = L.map(mapHost, {
            zoomControl: true,
            attributionControl: true,
            rotate: true,
            rotateControl: false,
            touchRotate: true,
            bearing: 0
        });
        // The recenter control's onAdd (map-level, not st-level) needs a way
        // back to this render's state.
        st.map._gisState = st;
        // leaflet-rotate's fitBounds path needs the map to already have a
        // view (it calls getPixelOrigin(), which throws pre-setView) —
        // vanilla Leaflet tolerates fitBounds() on a viewless map, this
        // plugin doesn't. This is overwritten by the real fitBounds() call
        // in renderHole() before anything paints.
        st.map.setView([0, 0], 2);
        L.tileLayer(TILE_URL, { maxZoom: 21, attribution: TILE_ATTRIBUTION }).addTo(st.map);
        st.layerGroup = L.layerGroup().addTo(st.map);

        const recenterControl = new GisRecenterControl().addTo(st.map);
        st.recenterBtn = recenterControl.getContainer();

        st.map.on("click", (e) => onMeasureMapClick(st, e));
        st.map.on("rotate", () => onMapRotate(st));

        // Manual gestures pause auto-follow. "dragstart" only ever fires for
        // a user-driven pan (Leaflet's Draggable), so it needs no extra
        // guard; "rotate"/"zoomstart" fire for both user gestures and our
        // own programmatic setBearing()/setView() calls, so those are
        // gated on the _programmaticUpdate flag set around applyFollowView().
        st.map.on("dragstart", () => pauseFollow(st));
        st.map.on("rotate", () => { if (!st._programmaticUpdate) pauseFollow(st); });
        st.map.on("zoomstart", () => { if (!st._programmaticUpdate) pauseFollow(st); });

        startLocate(st);

        // Container isn't guaranteed to have final layout size on the same
        // tick it's inserted — re-measure and nudge Leaflet once fonts/layout
        // settle, or tiles render at the wrong size/offset.
        requestAnimationFrame(() => nudgeMapSize(st));

        if (!st._resizeBound) {
            st._resizeBound = true;
            window.addEventListener("resize", () => nudgeMapSize(st));
        }

        renderHole(st);
    }

    function mount(cfg) {
        const hostEl = cfg?.hostEl;
        if (!hostEl) throw new Error("scoreGISMap.mount() requires hostEl.");
        if (!window.L) throw new Error("Leaflet (window.L) is not loaded.");

        injectStyles();

        let st = _states.get(hostEl);
        if (!st) {
            st = { hostEl };
            _states.set(hostEl, st);
        }

        st.course = cfg.course || {};
        st.game = cfg.game || {};
        st.osm = parseOsm(cfg.osmData);
        st.nodeIndex = buildNodeIndex(st.osm.elements);
        st.features = indexFeatures(st.osm.elements);
        st.holeIndex = buildHoleIndex(st.features.holes);

        // Static controls owned by the host page (scoregis_view.php) — same
        // split as score_entry.js: PHP declares the shell, this module wires
        // behavior to it instead of building its own hole-nav markup.
        st.controlArea = cfg.controlArea || null;
        st.prevBtn = cfg.prevBtn || null;
        st.nextBtn = cfg.nextBtn || null;
        st.holeSelect = cfg.holeSelect || null;
        st.onHoleChange = typeof cfg.onHoleChange === "function" ? cfg.onHoleChange : null;

        const requested = Number(cfg.hole || 1);
        const available = availableHoleNumbers(st);
        st.selectedHole = st.holeIndex.has(requested) ? requested : (available[0] || 1);

        populateHoleSelect(st);
        wireExternalControls(st);
        renderShell(st);

        st.controlArea?.classList.remove("isHidden");
    }

    MA.scoreGISMap.mount = mount;
    MA.scoreGISMap.updateWind = updateWind;
})();
