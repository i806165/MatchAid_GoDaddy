/* /assets/pages/club_home.js
 * Club Admin Home page
 *
 * Architecture:
 *   - Resolves facility context from window.__INIT__.facility
 *   - Renders correct facility picker state in controls area
 *   - Tiles remain disabled until a facility is confirmed
 *   - On facility selection, POSTs to setFacility.php to persist session
 *   - No other DB calls
 *
 * Follows club_demand.js patterns:
 *   IIFE · strict mode · state · el DOM map
 *   applyInit() → applyChrome() → wireEvents() → boot()
 */
(function () {
  "use strict";

  const MA        = window.MA      || {};
  const chrome    = MA.chrome      || {};
  const postJson  = typeof MA.postJson === "function" ? MA.postJson : null;
  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : function (m, lvl) { if (m) console.log("[STATUS]", lvl || "info", m); };

  // ── State ──────────────────────────────────────────────────────
  const state = {
    facilityId:       "",
    facilityName:     "",
    facilityOptions:  [],
    canSelectFacility: false,
    canSearch:        false,
    authorized:       false,
    searchResults:    [],
  };

  // ── DOM map ────────────────────────────────────────────────────
  const el = {
    // Facility picker states
    facilityChip:        document.getElementById("chFacilityChip"),
    facilityChipName:    document.getElementById("chFacilityChipName"),
    facilityDropdown:    document.getElementById("chFacilityDropdown"),
    facilitySelect:      document.getElementById("chFacilitySelect"),
    facilitySearch:      document.getElementById("chFacilitySearch"),
    facilitySearchInput: document.getElementById("chFacilitySearchInput"),
    facilitySearchClear: document.getElementById("chFacilitySearchClear"),
    searchResults:       document.getElementById("chSearchResults"),
    selectedBanner:      document.getElementById("chSelectedBanner"),
    selectedBannerName:  document.getElementById("chSelectedBannerName"),
    facilityNone:        document.getElementById("chFacilityNone"),

    // Tiles
    tileDemand: document.getElementById("chTileDemand"),
    tileUsers:  document.getElementById("chTileUsers"),
  };

  // ── Utility ────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function safeStr(v) { return String(v ?? "").trim(); }

  // ── Tiles ──────────────────────────────────────────────────────
  function enableTiles() {
    [el.tileDemand, el.tileUsers].forEach(t => {
      if (t) t.classList.remove("chTile--disabled");
    });
  }

  function disableTiles() {
    [el.tileDemand, el.tileUsers].forEach(t => {
      if (t) t.classList.add("chTile--disabled");
    });
  }

  // ── Facility picker rendering ──────────────────────────────────
  function hideAllPickers() {
    [
      el.facilityChip,
      el.facilityDropdown,
      el.facilitySearch,
      el.facilityNone,
    ].forEach(e => { if (e) e.style.display = "none"; });
  }

  function renderPicker() {
    hideAllPickers();

    if (!state.authorized) {
      if (el.facilityNone) el.facilityNone.style.display = "";
      disableTiles();
      return;
    }

    const count = state.facilityOptions.length;

    if (state.canSearch) {
      if (el.facilitySearch) el.facilitySearch.style.display = "";
      renderSearchBanner();

    } else if (count <= 1) {
      if (el.facilityChip) el.facilityChip.style.display = "";
      if (el.facilityChipName) {
        el.facilityChipName.textContent = state.facilityName || "—";
      }
      enableTiles();

    } else {
      if (el.facilityDropdown) el.facilityDropdown.style.display = "";
      renderDropdown();
    }
  }

  function renderDropdown() {
    if (!el.facilitySelect) return;

    el.facilitySelect.innerHTML = state.facilityOptions
      .map(f => `<option value="${esc(f.facilityId)}"
        ${f.facilityId === state.facilityId ? "selected" : ""}>
        ${esc(f.facilityName)}
      </option>`)
      .join("");

    // If a facility is already selected, enable tiles immediately
    if (state.facilityId) enableTiles();
  }

  function renderSearchResults(query) {
    if (!el.searchResults) return;

    const q = query.toLowerCase();
    state.searchResults = q.length >= 1
      ? state.facilityOptions.filter(f =>
          safeStr(f.facilityName).toLowerCase().includes(q)
        )
      : [];

    if (state.searchResults.length === 0 || q === "") {
      el.searchResults.style.display = "none";
      el.searchResults.innerHTML = "";
      return;
    }

    el.searchResults.innerHTML = state.searchResults
      .slice(0, 8)
      .map(f => `
        <div class="chSearchResult" data-facility-id="${esc(f.facilityId)}"
             data-facility-name="${esc(f.facilityName)}">
          ${esc(f.facilityName)}
        </div>
      `).join("");

    el.searchResults.style.display = "";
  }

  function renderSearchBanner() {
    if (!el.selectedBanner || !el.selectedBannerName) return;

    if (state.facilityId && state.facilityName) {
      el.selectedBannerName.textContent = state.facilityName;
      el.selectedBanner.style.display = "";
      enableTiles();
    } else {
      el.selectedBanner.style.display = "none";
      disableTiles();
    }
  }

  // ── Facility selection ─────────────────────────────────────────
  async function selectFacility(facilityId, facilityName) {
    if (!facilityId) return;

    setStatus("Saving facility…", "info");

    try {
      const apiUrl = window.MA?.routes?.setFacility
        || "/api/club_home/setFacility.php";

      const res = postJson
        ? await postJson(apiUrl, { facilityId })
        : await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ facilityId }),
          }).then(r => r.json());

      if (!res || !res.ok) {
        throw new Error(res?.error || "Failed to set facility.");
      }

      state.facilityId   = safeStr(res.facilityId   || facilityId);
      state.facilityName = safeStr(res.facilityName || facilityName);

      renderSearchBanner();
      setStatus("", "info");

    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  // ── Wire events ────────────────────────────────────────────────
  function wireEvents() {

    // Tile navigation — only fires when tiles are enabled
    el.tileDemand?.addEventListener("click", () => {
      if (el.tileDemand.classList.contains("chTile--disabled")) return;
      window.location.assign(window.MA.paths.demandReport);
    });

    el.tileUsers?.addEventListener("click", () => {
      if (el.tileUsers.classList.contains("chTile--disabled")) return;
      window.location.assign(window.MA.paths.clubUsers);
    });

    // Dropdown change
    el.facilitySelect?.addEventListener("change", async () => {
      const selected = el.facilitySelect.options[el.facilitySelect.selectedIndex];
      if (!selected) return;
      await selectFacility(selected.value, selected.text);
    });

    // Search input
    el.facilitySearchInput?.addEventListener("input", () => {
      const val = safeStr(el.facilitySearchInput.value);
      if (el.facilitySearchClear) {
        el.facilitySearchClear.classList.toggle("isHidden", !val);
      }
      // Clear confirmed selection when user starts a new search
      state.facilityId   = "";
      state.facilityName = "";
      renderSearchBanner();
      disableTiles();
      renderSearchResults(val);
    });

    // Search clear
    el.facilitySearchClear?.addEventListener("click", () => {
      if (el.facilitySearchInput) {
        el.facilitySearchInput.value = "";
        el.facilitySearchInput.focus();
      }
      el.facilitySearchClear.classList.add("isHidden");
      state.facilityId   = "";
      state.facilityName = "";
      if (el.searchResults) el.searchResults.style.display = "none";
      renderSearchBanner();
      disableTiles();
    });

    // Search result selection (event delegation)
    el.searchResults?.addEventListener("click", async (e) => {
      const row = e.target.closest(".chSearchResult");
      if (!row) return;

      const facilityId   = safeStr(row.dataset.facilityId);
      const facilityName = safeStr(row.dataset.facilityName);

      if (el.facilitySearchInput) el.facilitySearchInput.value = facilityName;
      if (el.facilitySearchClear) el.facilitySearchClear.classList.remove("isHidden");
      if (el.searchResults) el.searchResults.style.display = "none";

      await selectFacility(facilityId, facilityName);
    });
  }

  // ── Chrome ─────────────────────────────────────────────────────
  function applyChrome() {
    const clubName = safeStr(window.__INIT__?.clubName ?? "");

    if (typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Club Admin", clubName]);
    }
    if (typeof chrome.setActions === "function") {
      chrome.setActions({
        left:  { show: false },
        right: { show: false },
      });
    }
    if (typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible:    ["home", "clubhome", "clubdemand"],
        active:     "clubhome",
        onNavigate: (id) => (typeof MA.routerGo === "function" ? MA.routerGo(id) : null),
      });
    }
  }

  // ── Apply init payload ─────────────────────────────────────────
  function applyInit(init) {
    if (!init || !init.ok) throw new Error("Missing or invalid init payload.");

    const f = init.facility || {};

    state.authorized        = Boolean(f.authorized);
    state.facilityId        = safeStr(f.facilityId);
    state.facilityName      = safeStr(f.facilityName);
    state.facilityOptions   = Array.isArray(f.facilityOptions) ? f.facilityOptions : [];
    state.canSelectFacility = Boolean(f.canSelectFacility);
    state.canSearch         = Boolean(f.canSearch);
  }

  // ── Boot ───────────────────────────────────────────────────────
  function boot() {
    try {
      const init = window.__INIT__ || window.__MA_INIT__ || null;
      if (!init || !init.ok) throw new Error("Missing or invalid init payload.");

      applyInit(init);
      applyChrome();
      wireEvents();
      renderPicker();

      setStatus("", "info");
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  boot();
})();