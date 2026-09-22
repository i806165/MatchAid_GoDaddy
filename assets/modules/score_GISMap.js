/* /assets/modules/score_GISMap.js
 * MA.scoreGISMap — self-contained OSM course GIS renderer.
 *
 * Host-owned responsibilities:
 *   - course/game context
 *   - database/API acquisition
 *   - page chrome/navigation
 *
 * Module responsibilities:
 *   - parse/index OSM features
 *   - associate a numbered hole with nearby green/pin/tee/bunker geometry
 *   - render diagnostics + selected-hole SVG
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
    const MAP_W = 1000;
    const MAP_H = 700;
    const MAX_ZOOM_SCALE = 6;

    function esc(s) {
        return String(s ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function n(v) {
        const x = Number(v);
        return Number.isFinite(x) ? x : null;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .gisSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:10px}
            .gisStat{padding:8px;border:1px solid var(--borderSubtle);border-radius:var(--radiusMd);background:var(--layer3-bg);text-align:center}
            .gisStat__label{font-size:10px;font-weight:800;color:var(--mutedText)}
            .gisStat__value{margin-top:2px;font-size:16px;font-weight:900;color:var(--ink)}
            .gisHoleNav{display:flex;align-items:center;gap:10px;margin-bottom:10px}
            .gisHoleNav__title{flex:1 1 auto;text-align:center;font-size:18px;font-weight:900}
            .gisViewport{position:relative;width:100%;min-height:440px;border:1px solid var(--borderSubtle);border-radius:var(--radiusLg);background:#f4f4f1;overflow:hidden}
            .gisViewport svg{display:block;width:100%;height:440px;touch-action:none;cursor:grab}
            .gisViewport svg.is-panning{cursor:grabbing}
            .gisZoomCtrls{position:absolute;top:10px;right:10px;z-index:2;display:flex;flex-direction:column;gap:6px}
            .gisZoomBtn{width:36px;height:36px;border-radius:50%;border:1px solid var(--borderSubtle);background:rgba(255,255,255,.92);color:var(--ink);font-size:20px;font-weight:900;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.25);padding:0}
            .gisZoomBtn:active{background:#fff;transform:scale(.96)}
            .gisZoomBtn--reset{font-size:14px}
            .gisDiag{margin-top:10px;font-size:12px;line-height:1.4}
            .gisDiag table{width:100%;border-collapse:collapse}
            .gisDiag td{padding:5px 6px;border-bottom:1px solid var(--borderSubtle);vertical-align:top}
            .gisDiag td:first-child{font-weight:800;width:45%}
            .gisHint{margin-top:10px;font-size:11px;color:var(--mutedText)}
            @media (max-width:600px){.gisSummary{grid-template-columns:repeat(2,minmax(0,1fr))}.gisViewport,.gisViewport svg{height:390px;min-height:390px}}
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

    function collectPoints(st, ctx) {
        const out = [];
        if (ctx.geometry?.points) out.push(...ctx.geometry.points);
        if (ctx.green?.feature) out.push(...geometryPoints(ctx.green.feature, st.nodeIndex));
        if (ctx.pin?.feature) out.push(...geometryPoints(ctx.pin.feature, st.nodeIndex));
        ctx.tees.forEach((x) => out.push(...geometryPoints(x.feature, st.nodeIndex)));
        ctx.bunkers.forEach((x) => out.push(...geometryPoints(x.feature, st.nodeIndex)));
        return out;
    }

    function makeProjector(points) {
        if (!points.length) return null;
        let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
        points.forEach((p) => {
            minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
            minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
        });

        let latSpan = maxLat - minLat;
        let lonSpan = maxLon - minLon;
        if (!latSpan) latSpan = 0.0001;
        if (!lonSpan) lonSpan = 0.0001;

        const width = MAP_W, height = MAP_H, pad = 45;
        return {
            width,
            height,
            project(p) {
                return {
                    x: pad + ((p.lon - minLon) / lonSpan) * (width - pad * 2),
                    y: height - pad - ((p.lat - minLat) / latSpan) * (height - pad * 2)
                };
            }
        };
    }

    function pointsAttr(points, projector) {
        return points.map((p) => {
            const q = projector.project(p);
            return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
        }).join(" ");
    }

    function polygon(feature, st, projector, cls) {
        const pts = geometryPoints(feature, st.nodeIndex);
        if (pts.length < 3) return "";
        return `<polygon class="${cls}" points="${pointsAttr(pts, projector)}"></polygon>`;
    }

    function polyline(points, projector, cls) {
        if (points.length < 2) return "";
        return `<polyline class="${cls}" points="${pointsAttr(points, projector)}" fill="none"></polyline>`;
    }

    function circle(point, projector, cls, r) {
        if (!point) return "";
        const q = projector.project(point);
        return `<circle class="${cls}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${r}"></circle>`;
    }

    function bytesLabel(bytes) {
        const x = Number(bytes || 0);
        if (x < 1024) return `${x} B`;
        if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
        return `${(x / 1024 / 1024).toFixed(2)} MB`;
    }

    function summaryHtml(st) {
        const stats = [
            ["Holes", st.features.holes.length],
            ["Greens", st.features.greens.length],
            ["Pins", st.features.pins.length],
            ["Tees", st.features.tees.length],
            ["Bunkers", st.features.bunkers.length],
            ["JSON", bytesLabel(st.course.jsonBytes)]
        ];
        return `<div class="gisSummary">${stats.map(([label, value]) => `
            <div class="gisStat"><div class="gisStat__label">${esc(label).toUpperCase()}</div><div class="gisStat__value">${esc(value)}</div></div>
        `).join("")}</div>`;
    }

    function holeNavHtml(st, ctx) {
        const par = ctx.hole ? tag(ctx.hole, "par") : "";
        return `
            <div class="gisHoleNav">
                <button type="button" class="btn btnSecondary" data-gis-prev aria-label="Previous hole">‹</button>
                <div class="gisHoleNav__title">Hole ${st.selectedHole}${par ? ` • Par ${esc(par)}` : ""}</div>
                <button type="button" class="btn btnSecondary" data-gis-next aria-label="Next hole">›</button>
            </div>`;
    }

    function mapHtml(st, ctx) {
        st.view = null;

        if (!ctx.hole) {
            return `<div class="gisViewport"><div class="maEmptyState" style="padding:30px;">Hole ${st.selectedHole} was not found.</div></div>`;
        }

        const projector = makeProjector(collectPoints(st, ctx));
        if (!projector) {
            return `<div class="gisViewport"><div class="maEmptyState" style="padding:30px;">No geometry is available for this hole.</div></div>`;
        }

        st.view = { x: 0, y: 0, w: projector.width, h: projector.height };

        let shapes = "";
        ctx.bunkers.forEach((x) => { shapes += polygon(x.feature, st, projector, "gisSvgBunker"); });
        ctx.tees.forEach((x) => { shapes += polygon(x.feature, st, projector, "gisSvgTee"); });
        if (ctx.green?.feature) shapes += polygon(ctx.green.feature, st, projector, "gisSvgGreen");
        shapes += polyline(ctx.geometry.points, projector, "gisSvgHole");
        shapes += circle(ctx.geometry.start, projector, "gisSvgStart", 8);
        shapes += circle(ctx.geometry.end, projector, "gisSvgEnd", 8);
        if (ctx.pin?.feature) shapes += circle(featureCenter(ctx.pin.feature, st.nodeIndex), projector, "gisSvgPin", 9);

        return `
            <div class="gisViewport">
                <svg data-gis-svg viewBox="0 0 ${projector.width} ${projector.height}" role="img" aria-label="Hole ${st.selectedHole} GIS geometry">
                    <style>
                        .gisSvgHole{stroke:#111;stroke-width:7;stroke-linecap:round;stroke-linejoin:round}
                        .gisSvgGreen{fill:#9ccc65;stroke:#33691e;stroke-width:3;opacity:.9}
                        .gisSvgTee{fill:#66bb6a;stroke:#2e7d32;stroke-width:2;opacity:.68}
                        .gisSvgBunker{fill:#e8d39c;stroke:#9b8248;stroke-width:2;opacity:.86}
                        .gisSvgPin{fill:#d32f2f;stroke:#fff;stroke-width:3}
                        .gisSvgStart{fill:#1565c0;stroke:#fff;stroke-width:3}
                        .gisSvgEnd{fill:#111;stroke:#fff;stroke-width:3}
                    </style>
                    ${shapes}
                </svg>
                <div class="gisZoomCtrls">
                    <button type="button" class="gisZoomBtn" data-gis-zoom-in aria-label="Zoom in">+</button>
                    <button type="button" class="gisZoomBtn" data-gis-zoom-out aria-label="Zoom out">&minus;</button>
                    <button type="button" class="gisZoomBtn gisZoomBtn--reset" data-gis-zoom-reset aria-label="Reset zoom">&#10021;</button>
                </div>
            </div>`;
    }

    function clampView(view) {
        const w = Math.min(Math.max(view.w, MAP_W / MAX_ZOOM_SCALE), MAP_W);
        const h = w * (MAP_H / MAP_W);
        const x = Math.min(Math.max(view.x, 0), MAP_W - w);
        const y = Math.min(Math.max(view.y, 0), MAP_H - h);
        return { x, y, w, h };
    }

    function zoomViewAt(view, ux, uy, factor) {
        const newW = view.w / factor;
        const newH = newW * (view.h / view.w);
        const x = ux - (ux - view.x) * (newW / view.w);
        const y = uy - (uy - view.y) * (newH / view.h);
        return clampView({ x, y, w: newW, h: newH });
    }

    function applyViewBox(st) {
        const svg = st.hostEl.querySelector("[data-gis-svg]");
        if (!svg || !st.view) return;
        svg.setAttribute("viewBox", `${st.view.x.toFixed(2)} ${st.view.y.toFixed(2)} ${st.view.w.toFixed(2)} ${st.view.h.toFixed(2)}`);
    }

    function wireZoomPan(st) {
        const svg = st.hostEl.querySelector("[data-gis-svg]");
        if (!svg || !st.view) return;

        const pointers = new Map();
        let dragLast = null;
        let pinchLastDist = null;

        function userPointFromClient(clientX, clientY) {
            const rect = svg.getBoundingClientRect();
            const relX = rect.width ? (clientX - rect.left) / rect.width : 0;
            const relY = rect.height ? (clientY - rect.top) / rect.height : 0;
            return {
                x: st.view.x + relX * st.view.w,
                y: st.view.y + relY * st.view.h
            };
        }

        function centerZoom(factor) {
            const cx = st.view.x + st.view.w / 2;
            const cy = st.view.y + st.view.h / 2;
            st.view = zoomViewAt(st.view, cx, cy, factor);
            applyViewBox(st);
        }

        function onPointerDown(e) {
            svg.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.size === 1) {
                dragLast = { x: e.clientX, y: e.clientY };
                svg.classList.add("is-panning");
            } else if (pointers.size === 2) {
                const pts = Array.from(pointers.values());
                pinchLastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                dragLast = null;
            }
        }

        function onPointerMove(e) {
            if (!pointers.has(e.pointerId)) return;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (pointers.size === 2) {
                const pts = Array.from(pointers.values());
                const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                if (pinchLastDist) {
                    const factor = dist / pinchLastDist;
                    const midX = (pts[0].x + pts[1].x) / 2;
                    const midY = (pts[0].y + pts[1].y) / 2;
                    const u = userPointFromClient(midX, midY);
                    st.view = zoomViewAt(st.view, u.x, u.y, factor);
                    applyViewBox(st);
                }
                pinchLastDist = dist;
                return;
            }

            if (pointers.size === 1 && dragLast) {
                const rect = svg.getBoundingClientRect();
                const dxScreen = e.clientX - dragLast.x;
                const dyScreen = e.clientY - dragLast.y;
                const factorX = rect.width ? st.view.w / rect.width : 0;
                const factorY = rect.height ? st.view.h / rect.height : 0;
                st.view = clampView({
                    x: st.view.x - dxScreen * factorX,
                    y: st.view.y - dyScreen * factorY,
                    w: st.view.w,
                    h: st.view.h
                });
                applyViewBox(st);
                dragLast = { x: e.clientX, y: e.clientY };
            }
        }

        function onPointerUp(e) {
            pointers.delete(e.pointerId);
            if (pointers.size === 1) {
                dragLast = Array.from(pointers.values())[0];
                pinchLastDist = null;
            } else if (pointers.size === 0) {
                dragLast = null;
                pinchLastDist = null;
                svg.classList.remove("is-panning");
            }
        }

        svg.addEventListener("pointerdown", onPointerDown);
        svg.addEventListener("pointermove", onPointerMove);
        svg.addEventListener("pointerup", onPointerUp);
        svg.addEventListener("pointercancel", onPointerUp);

        svg.addEventListener("wheel", (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
            const u = userPointFromClient(e.clientX, e.clientY);
            st.view = zoomViewAt(st.view, u.x, u.y, factor);
            applyViewBox(st);
        }, { passive: false });

        st.hostEl.querySelector("[data-gis-zoom-in]")?.addEventListener("click", () => centerZoom(1.4));
        st.hostEl.querySelector("[data-gis-zoom-out]")?.addEventListener("click", () => centerZoom(1 / 1.4));
        st.hostEl.querySelector("[data-gis-zoom-reset]")?.addEventListener("click", () => {
            st.view = { x: 0, y: 0, w: MAP_W, h: MAP_H };
            applyViewBox(st);
        });
    }

    function metersText(value) {
        return Number.isFinite(value) ? `${Math.round(value)} m` : "—";
    }

    function diagnosticsHtml(st, ctx) {
        return `
            <div class="gisDiag">
                <table><tbody>
                    <tr><td>Facility</td><td>${esc(st.course.facilityName || "")}</td></tr>
                    <tr><td>Course</td><td>${esc(st.course.courseName || "")}</td></tr>
                    <tr><td>Selected Hole</td><td>${st.selectedHole}</td></tr>
                    <tr><td>Hole OSM ID</td><td>${esc(ctx.hole?.id ?? "—")}</td></tr>
                    <tr><td>Green OSM ID</td><td>${esc(ctx.green?.feature?.id ?? "—")}</td></tr>
                    <tr><td>Green from hole end</td><td>${esc(metersText(ctx.green?.distanceMeters))}</td></tr>
                    <tr><td>Pin OSM ID</td><td>${esc(ctx.pin?.feature?.id ?? "—")}</td></tr>
                    <tr><td>Pin from hole end</td><td>${esc(metersText(ctx.pin?.distanceMeters))}</td></tr>
                    <tr><td>Candidate tees</td><td>${ctx.tees.length}</td></tr>
                    <tr><td>Nearby bunkers</td><td>${ctx.bunkers.length}</td></tr>
                </tbody></table>
            </div>`;
    }

    function availableHoleNumbers(st) {
        return Array.from(st.holeIndex.keys()).sort((a, b) => a - b);
    }

    function selectHole(st, holeNo) {
        st.selectedHole = Number(holeNo);
        render(st);
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

    function render(st) {
        const ctx = resolveHoleContext(st, st.selectedHole);
        st.hostEl.innerHTML = `
            ${summaryHtml(st)}
            ${holeNavHtml(st, ctx)}
            ${mapHtml(st, ctx)}
            ${diagnosticsHtml(st, ctx)}
            <div class="gisHint">Stored OSM geometry only. Green/pin/tee associations are diagnostic heuristics at this stage.</div>`;

        st.hostEl.querySelector("[data-gis-prev]")?.addEventListener("click", () => previousHole(st));
        st.hostEl.querySelector("[data-gis-next]")?.addEventListener("click", () => nextHole(st));
        wireZoomPan(st);
    }

    function mount(cfg) {
        const hostEl = cfg?.hostEl;
        if (!hostEl) throw new Error("scoreGISMap.mount() requires hostEl.");

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

        render(st);
    }

    MA.scoreGISMap.mount = mount;
})();
