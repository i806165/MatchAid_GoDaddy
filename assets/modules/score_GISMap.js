/* /assets/modules/score_GISMap.js
 * MA.scoreGISMap — Leaflet-based OSM course GIS renderer.
 *
 * Host-owned responsibilities:
 *   - course/game context
 *   - database/API acquisition
 *   - page chrome/navigation
 *   - loading Leaflet (assets/vendor/leaflet) before this module runs
 *
 * Module responsibilities:
 *   - parse/index OSM features
 *   - associate a numbered hole with nearby green/pin/tee/bunker geometry
 *   - render hole/green/pin/tee/bunker geometry as Leaflet overlays on
 *     satellite imagery
 *   - previous/next hole navigation
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

    function n(v) {
        const x = Number(v);
        return Number.isFinite(x) ? x : null;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .gisHoleNav{display:flex;align-items:center;gap:10px;margin-bottom:10px}
            .gisHoleNav__title{flex:1 1 auto;text-align:center;font-size:18px;font-weight:900}
            .gisMapHost{width:100%;height:440px;border:1px solid var(--borderSubtle);border-radius:var(--radiusLg);overflow:hidden}
            .gisLocateRow{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
            .gisYardages{font-size:14px;font-weight:800;color:var(--ink)}
            .gisMeasureRow{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
            .gisMeasureRow__text{font-size:14px;font-weight:800;color:#e65100}
            .gisMeasureIcon__dot{width:22px;height:22px;border-radius:50%;background:#ff8f00;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:grab}
            @media (max-width:600px){.gisMapHost{height:390px}}
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

    function nearestFeature(st, features, point) {
        let winner = null;
        let best = Infinity;
        features.forEach((feature) => {
            const center = featureCenter(feature, st.nodeIndex);
            const d = distanceMeters(point, center);
            if (d < best) {
                best = d;
                winner = feature;
            }
        });
        return winner ? { feature: winner, distanceMeters: best } : null;
    }

    function resolveHoleContext(st, holeNo) {
        const hole = st.holeIndex.get(holeNo) || null;
        if (!hole) return { hole: null, geometry: null, green: null, pin: null, tees: [], bunkers: [] };

        const geometry = holeGeometry(st, hole);
        const green = nearestFeature(st, st.features.greens, geometry.end);
        const pin = nearestFeature(st, st.features.pins, geometry.end);

        const tees = st.features.tees
            .map((feature) => ({
                feature,
                distanceMeters: distanceMeters(geometry.start, featureCenter(feature, st.nodeIndex))
            }))
            .filter((x) => Number.isFinite(x.distanceMeters))
            .sort((a, b) => a.distanceMeters - b.distanceMeters)
            .slice(0, 8);

        const bunkers = st.features.bunkers
            .map((feature) => {
                const c = featureCenter(feature, st.nodeIndex);
                return {
                    feature,
                    distanceMeters: Math.min(
                        distanceMeters(geometry.start, c),
                        distanceMeters(geometry.end, c)
                    )
                };
            })
            .filter((x) => Number.isFinite(x.distanceMeters) && x.distanceMeters <= 500)
            .sort((a, b) => a.distanceMeters - b.distanceMeters)
            .slice(0, 16);

        return { hole, geometry, green, pin, tees, bunkers };
    }

    function holeNavHtml(st) {
        return `
            <div class="gisHoleNav">
                <button type="button" class="btn btnSecondary" data-gis-prev aria-label="Previous hole">‹</button>
                <div class="gisHoleNav__title" data-gis-title>Hole ${st.selectedHole}</div>
                <button type="button" class="btn btnSecondary" data-gis-next aria-label="Next hole">›</button>
            </div>`;
    }

    function yardsText(meters) {
        return Number.isFinite(meters) ? `${Math.round(meters * METERS_TO_YARDS)} yds` : "—";
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

    function renderHole(st) {
        const ctx = resolveHoleContext(st, st.selectedHole);

        const titleEl = st.hostEl.querySelector("[data-gis-title]");
        if (titleEl) {
            const par = ctx.hole ? tag(ctx.hole, "par") : "";
            titleEl.textContent = `Hole ${st.selectedHole}${par ? ` • Par ${par}` : ""}`;
        }

        st.layerGroup.clearLayers();

        if (!ctx.hole) return;

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

        if (boundsPts.length) {
            st.map.fitBounds(L.latLngBounds(llFromPoints(boundsPts)), { padding: [30, 30], maxZoom: 20 });
        }

        updateYardages(st);
        updateMeasureReadout(st);
    }

    function setYardageMessage(st, message) {
        const el = st.hostEl.querySelector("[data-gis-yardages]");
        if (el) el.textContent = message || "";
    }

    function updateYardages(st) {
        if (!st.myPosition) {
            setYardageMessage(st, "");
            return;
        }

        const ctx = resolveHoleContext(st, st.selectedHole);
        const parts = [];

        if (ctx.pin?.feature) {
            const p = featureCenter(ctx.pin.feature, st.nodeIndex);
            if (p) parts.push(`Pin ${yardsText(distanceMeters(st.myPosition, p))}`);
        }
        if (ctx.green?.feature) {
            const g = featureCenter(ctx.green.feature, st.nodeIndex);
            if (g) parts.push(`Green ${yardsText(distanceMeters(st.myPosition, g))}`);
        }

        setYardageMessage(st, parts.length ? parts.join(" • ") : "No pin/green geometry for this hole.");
    }

    function onPosition(st, pos) {
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

        updateYardages(st);
    }

    function onPositionError(st, err) {
        if (err?.code === 1) {
            // Permission denied — the watch will never succeed; fully reset
            // rather than leaving the button stuck on "Stop Location".
            stopLocate(st);
            setYardageMessage(st, "Location permission denied. Enable location access for this site.");
            return;
        }

        const messages = {
            2: "Location unavailable right now.",
            3: "Location request timed out."
        };
        setYardageMessage(st, messages[err?.code] || "Unable to get your location.");
    }

    function stopLocate(st) {
        if (st.watchId != null) {
            navigator.geolocation.clearWatch(st.watchId);
            st.watchId = null;
        }
        if (st.myMarker) { st.map.removeLayer(st.myMarker); st.myMarker = null; }
        if (st.myAccuracy) { st.map.removeLayer(st.myAccuracy); st.myAccuracy = null; }
        st.myPosition = null;

        const btn = st.hostEl.querySelector("[data-gis-locate]");
        if (btn) btn.textContent = "Locate Me";
        setYardageMessage(st, "");
    }

    function toggleLocate(st) {
        if (st.watchId != null) {
            stopLocate(st);
            return;
        }

        if (!navigator.geolocation) {
            setYardageMessage(st, "Geolocation is not supported on this device.");
            return;
        }

        const btn = st.hostEl.querySelector("[data-gis-locate]");
        if (btn) btn.textContent = "Stop Location";
        setYardageMessage(st, "Locating…");

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

    function updateMeasureReadout(st) {
        const el = st.hostEl.querySelector("[data-gis-measure]");
        if (!el) return;

        if (!st.measureMarker) {
            el.textContent = "Tap the map to drop a measure point.";
            return;
        }

        const anchor = measureAnchor(st);
        if (!anchor) {
            el.textContent = "No reference point available to measure from.";
            return;
        }

        const ll = st.measureMarker.getLatLng();
        const dist = distanceMeters(anchor, { lat: ll.lat, lon: ll.lng });
        const from = st.myPosition ? "from you" : "from the tee";
        el.textContent = `Measure: ${yardsText(dist)} (${from})`;
    }

    function onMeasureMapClick(st, e) {
        if (!st.measureMarker) {
            st.measureMarker = L.marker(e.latlng, {
                draggable: true,
                icon: measureIcon(),
                zIndexOffset: 1000
            }).addTo(st.map);
            st.measureMarker.on("drag", () => updateMeasureReadout(st));
            st.measureMarker.on("dragend", () => updateMeasureReadout(st));
        } else {
            st.measureMarker.setLatLng(e.latlng);
        }
        updateMeasureReadout(st);
    }

    function clearMeasure(st) {
        if (st.measureMarker) {
            st.map.removeLayer(st.measureMarker);
            st.measureMarker = null;
        }
        updateMeasureReadout(st);
    }

    function selectHole(st, holeNo) {
        st.selectedHole = Number(holeNo);
        renderHole(st);
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

    function renderShell(st) {
        if (st.map) {
            st.map.remove();
            st.map = null;
        }
        // A remount tears down the Leaflet map (and any position layers tied
        // to it) — drop the stale layer refs so the next GPS fix/toggle click
        // rebuilds them cleanly against the new map instance.
        st.myMarker = null;
        st.myAccuracy = null;
        st.measureMarker = null;

        st.hostEl.innerHTML = `
            ${holeNavHtml(st)}
            <div class="gisMapHost" data-gis-map-host></div>
            <div class="gisLocateRow">
                <button type="button" class="btn btnSecondary" data-gis-locate>${st.watchId != null ? "Stop Location" : "Locate Me"}</button>
                <div class="gisYardages" data-gis-yardages></div>
            </div>
            <div class="gisMeasureRow">
                <button type="button" class="btn btnSecondary" data-gis-measure-clear>Clear Measure</button>
                <div class="gisMeasureRow__text" data-gis-measure></div>
            </div>`;

        st.hostEl.querySelector("[data-gis-prev]")?.addEventListener("click", () => previousHole(st));
        st.hostEl.querySelector("[data-gis-next]")?.addEventListener("click", () => nextHole(st));
        st.hostEl.querySelector("[data-gis-locate]")?.addEventListener("click", () => toggleLocate(st));
        st.hostEl.querySelector("[data-gis-measure-clear]")?.addEventListener("click", () => clearMeasure(st));

        const mapHost = st.hostEl.querySelector("[data-gis-map-host]");
        st.map = L.map(mapHost, { zoomControl: true, attributionControl: true });
        L.tileLayer(TILE_URL, { maxZoom: 21, attribution: TILE_ATTRIBUTION }).addTo(st.map);
        st.layerGroup = L.layerGroup().addTo(st.map);
        st.map.on("click", (e) => onMeasureMapClick(st, e));

        // Container isn't guaranteed to have final layout size on the same
        // tick it's inserted — Leaflet needs an explicit nudge or tiles render
        // at the wrong size/offset.
        requestAnimationFrame(() => st.map.invalidateSize());

        if (!st._resizeBound) {
            st._resizeBound = true;
            window.addEventListener("resize", () => st.map && st.map.invalidateSize());
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

        const requested = Number(cfg.hole || 1);
        const available = availableHoleNumbers(st);
        st.selectedHole = st.holeIndex.has(requested) ? requested : (available[0] || 1);

        renderShell(st);
    }

    MA.scoreGISMap.mount = mount;
})();
