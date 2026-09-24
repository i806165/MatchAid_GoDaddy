/* /assets/pages/score_gis.js
 * Standalone Course GIS page controller.
 * Owns page chrome + data acquisition; score_GISMap.js owns GIS rendering.
 */
(function () {
    "use strict";

    const MA = window.MA || {};
    const init = window.__INIT__ || window.__MA_INIT__ || {};

    const postJson = typeof MA.postJson === "function" ? MA.postJson : null;

    const el = {
        moduleHost: document.getElementById("scoreGisModuleHost"),
        controlArea: document.getElementById("gisControlArea"),
        prevHoleBtn: document.getElementById("gisPrevHoleBtn"),
        nextHoleBtn: document.getElementById("gisNextHoleBtn"),
        holeSelect: document.getElementById("gisHoleSelect")
    };

    const state = {
        game: init.game || {},
        courseId: String(init.courseId || ""),
        payload: null
    };

    function escapeHtml(s) {
        return String(s ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function applyChrome(courseName) {
        const game = state.game || {};
        const line2 = String(game.dbGames_Title || "Course GIS");
        const line3 = String(courseName || game.dbGames_CourseName || "");

        if (MA.chrome && typeof MA.chrome.setHeaderLines === "function") {
            MA.chrome.setHeaderLines([
                "Play with GPS",
                line2,
                line3
            ]);
        }

        if (MA.chrome && typeof MA.chrome.setActions === "function") {
            MA.chrome.setActions({
                left: { show: false },
                right: { show: false }
            });
        }

        if (MA.chrome && typeof MA.chrome.setBottomNav === "function") {
            MA.chrome.setBottomNav({
                visible: [
                    "scorehome",
                    "scoreentry",
                    "scoregis",
                    "scorecardShared",
                    "scoresummary",
                    "scoresidegames"
                ],
                root: ["scorehome"],
                active: "scoregis",
                onNavigate: (id) => MA.routerGo?.(id)
            });
        }
    }

    function renderMessage(message, danger) {
        if (!el.moduleHost) return;
        el.moduleHost.innerHTML = `
            <div class="maEmptyState" style="padding:18px;${danger ? "color:var(--danger);font-weight:700;" : ""}">
                ${escapeHtml(message)}
            </div>`;
    }

    async function loadCourseOsm() {
        if (!state.courseId) {
            throw new Error(init.error || "No CourseID is available.");
        }

        const apiUrl = MA.paths?.apiCourseOSM || "/api/score_gis/getCourseOSM.php";

        if (postJson) {
            return postJson(apiUrl, {
                payload: { courseId: state.courseId }
            });
        }

        // Fallback keeps the page usable even if loaded outside the shared
        // postJson environment during early standalone validation.
        const response = await fetch(`${apiUrl}?courseId=${encodeURIComponent(state.courseId)}`, {
            credentials: "same-origin"
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || "OSM request failed.");
        return data;
    }

    function mountMap(payload) {
        if (!MA.scoreGISMap || typeof MA.scoreGISMap.mount !== "function") {
            throw new Error("score_GISMap.js is not loaded.");
        }

        MA.scoreGISMap.mount({
            hostEl: el.moduleHost,
            course: payload.course || {},
            game: state.game,
            osmData: payload.osmData,
            hole: 1,
            controlArea: el.controlArea,
            prevBtn: el.prevHoleBtn,
            nextBtn: el.nextHoleBtn,
            holeSelect: el.holeSelect
        });
    }

    // Wind is course-wide, not per-hole — polled independently of hole
    // navigation on its own timer, matching the server's own short cache
    // TTL (no point polling faster than the shared cache actually refreshes).
    const WIND_POLL_MS = 4 * 60 * 1000;
    let windTimer = null;

    async function loadCourseWind() {
        const apiUrl = MA.paths?.apiCourseWind || "/api/score_gis/getCourseWind.php";

        if (postJson) {
            return postJson(apiUrl, {
                payload: { courseId: state.courseId }
            });
        }

        const response = await fetch(`${apiUrl}?courseId=${encodeURIComponent(state.courseId)}`, {
            credentials: "same-origin"
        });
        return response.json();
    }

    // Wind is a nice-to-have overlay, not core to the page — a failed or
    // unavailable fetch just means the badge stays hidden, never a page
    // error or a notification the golfer has to dismiss.
    function pollWind() {
        loadCourseWind()
            .then((result) => {
                if (result?.ok && MA.scoreGISMap?.updateWind) {
                    MA.scoreGISMap.updateWind(el.moduleHost, result.wind);
                }
            })
            .catch((err) => console.warn("[SCORE_GIS] wind poll failed", err));
    }

    // Phones lock screens constantly between shots — pausing the interval
    // while the tab/page isn't visible avoids wasted battery/network for a
    // page nobody's looking at, and refreshes immediately on waking up.
    function onWindVisibilityChange() {
        if (document.hidden) {
            clearInterval(windTimer);
            windTimer = null;
            return;
        }
        pollWind();
        if (!windTimer) windTimer = setInterval(pollWind, WIND_POLL_MS);
    }

    function startWindPolling() {
        pollWind();
        windTimer = setInterval(pollWind, WIND_POLL_MS);
        document.addEventListener("visibilitychange", onWindVisibilityChange);
    }

    async function boot() {
        applyChrome("");

        if (!el.moduleHost) {
            throw new Error("scoreGisModuleHost not found.");
        }

        if (!init.ok) {
            renderMessage(init.error || "Course GIS is unavailable.", true);
            return;
        }

        renderMessage("Loading course GIS data…", false);

        const payload = await loadCourseOsm();
        if (!payload || !payload.ok) {
            throw new Error(payload?.message || "Unable to load course OSM data.");
        }

        state.payload = payload;
        applyChrome(payload.course?.courseName || "");
        mountMap(payload);
        startWindPolling();
    }

    boot().catch((err) => {
        console.error("[SCORE_GIS] boot error", err);
        renderMessage(err?.message || "Failed to initialize Course GIS.", true);

        if (MA.ui && typeof MA.ui.notify === "function") {
            MA.ui.notify("Failed to initialize Course GIS.", "danger");
        }
    });
})();
