/* /assets/pages/club_home.js
 * Club Admin Home page
 *
 * Facility selector:
 *   - Zero/single facility → read-only chip, tiles enabled immediately
 *   - Multiple/00000 → chip + Change button → modal picker
 *   - No access → lock message, tiles stay disabled
 *
 * Modal:
 *   - Current selection floated to top, checked
 *   - Remaining options sorted alphabetically below a divider
 *   - Search filters client-side, no API calls
 *   - Selection calls setFacility.php, then enables tiles
 */
(function () {
  "use strict";

  const MA        = window.MA      || {};
  const chrome    = MA.chrome      || {};
  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : function (m, lvl) { if (m) console.log("[STATUS]", lvl || "info", m); };

  // ── State ──────────────────────────────────────────────────────
  const state = {
    facilityId:       "",
    facilityName:     "",
    facilityOptions:  [],
    canSelectFacility: false,
    authorized:       false,
    modalSearch:      "",
  };

  // ── DOM map ────────────────────────────────────────────────────
  const el = {
    facilityName:      document.getElementById("chFacilityName"),
    facilityChangeBtn: document.getElementById("chFacilityChangeBtn"),
    facilityModal:     document.getElementById("chFacilityModal"),
    modalClose:        document.getElementById("chModalClose"),
    modalCancel:       document.getElementById("chModalCancel"),
    modalSearch:       document.getElementById("chModalSearch"),
    modalList:         document.getElementById("chModalList"),
    tileDemand:        document.getElementById("chTileDemand"),
    tileUsers:         document.getElementById("chTileUsers"),
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

  // ── Facility bar ───────────────────────────────────────────────
  function renderFacilityBar() {
    if (!state.authorized) {
      if (el.facilityName) {
        el.facilityName.textContent = "No facility access configured for your account.";
        el.facilityName.style.color = "var(--mutedText)";
        el.facilityName.style.fontWeight = "600";
      }
      if (el.facilityChangeBtn) el.facilityChangeBtn.style.display = "none";
      disableTiles();
      return;
    }

    if (el.facilityName) {
      el.facilityName.textContent = state.facilityName || "—";
      el.facilityName.style.color = "";
      el.facilityName.style.fontWeight = "";
    }

    if (el.facilityChangeBtn) {
      el.facilityChangeBtn.style.display = state.canSelectFacility ? "" : "none";
    }

    if (state.facilityId) enableTiles();
    else disableTiles();
  }

  // ── Modal ──────────────────────────────────────────────────────
  function openModal() {
    if (!el.facilityModal) return;
    state.modalSearch = "";
    if (el.modalSearch) el.modalSearch.value = "";
    renderModalList("");
    el.facilityModal.removeAttribute("aria-hidden");
    el.facilityModal.style.display = "";
    if (el.modalSearch) el.modalSearch.focus();
  }

  function closeModal() {
    if (!el.facilityModal) return;
    el.facilityModal.setAttribute("aria-hidden", "true");
    el.facilityModal.style.display = "none";
  }

  function renderModalList(query) {
    if (!el.modalList) return;

    const q = query.toLowerCase();
    const all = state.facilityOptions;

    // Filter by search
    const filtered = q
      ? all.filter(f => safeStr(f.facilityName).toLowerCase().includes(q)
                     || safeStr(f.facilityId).includes(q))
      : all;

    // Float current selection to top — only when no search active
    const current  = !q ? filtered.filter(f => f.facilityId === state.facilityId) : [];
    const rest     = !q ? filtered.filter(f => f.facilityId !== state.facilityId) : filtered;

    let html = "";

    // Current selection — floated to top
    if (current.length > 0) {
      html += current.map(f => renderModalRow(f, true)).join("");
      if (rest.length > 0) {
        html += `<div class="chModalDivider"></div>`;
      }
    }

    // Remaining options
    html += rest.map(f => renderModalRow(f, false)).join("");

    if (html === "") {
      html = `<div style="padding:12px 14px; font-size:13px; color:var(--mutedText);">No facilities match.</div>`;
    }

    el.modalList.innerHTML = html;

    // Wire row clicks
    el.modalList.querySelectorAll(".chModalRow").forEach(row => {
      row.addEventListener("click", async () => {
        const facilityId   = safeStr(row.dataset.facilityId);
        const facilityName = safeStr(row.dataset.facilityName);
        await selectFacility(facilityId, facilityName);
      });
    });
  }

  function renderModalRow(f, isSelected) {
    return `
      <div class="chModalRow${isSelected ? " is-selected" : ""}"
           data-facility-id="${esc(f.facilityId)}"
           data-facility-name="${esc(f.facilityName)}">
        <div class="chModalCheck">
          <div class="chModalCheck__tick"></div>
        </div>
        <div class="chModalRowBody">
          <div class="chModalRowName">${esc(f.facilityName)}</div>
          <div class="chModalRowId">${esc(f.facilityId)}</div>
        </div>
      </div>`;
  }

  // ── Facility selection ─────────────────────────────────────────
  async function selectFacility(facilityId, facilityName) {
    if (!facilityId) return;

    setStatus("Saving facility…", "info");

    try {
      const apiUrl = window.MA?.routes?.setFacility
        || "/api/club_home/setFacility.php";

      let res;
      if (typeof MA.postJson === "function") {
        res = await MA.postJson(apiUrl, { facilityId });
      } else {
        res = await fetch(apiUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ facilityId }),
        }).then(r => r.json());
      }

      if (!res || !res.ok) throw new Error(res?.error || "Failed to set facility.");

      state.facilityId   = safeStr(res.facilityId   || facilityId);
      state.facilityName = safeStr(res.facilityName || facilityName);

      closeModal();
      renderFacilityBar();
      setStatus("", "info");

    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  // ── Wire events ────────────────────────────────────────────────
  function wireEvents() {

    // Tile navigation
    el.tileDemand?.addEventListener("click", () => {
      if (!el.tileDemand.classList.contains("chTile--disabled")) {
        window.location.assign(window.MA.paths.demandReport);
      }
    });

    el.tileUsers?.addEventListener("click", () => {
      if (!el.tileUsers.classList.contains("chTile--disabled")) {
        window.location.assign(window.MA.paths.clubUsers);
      }
    });

    // Change button → open modal
    el.facilityChangeBtn?.addEventListener("click", openModal);

    // Modal close
    el.modalClose?.addEventListener("click",  closeModal);
    el.modalCancel?.addEventListener("click", closeModal);

    // Click outside modal to close
    el.facilityModal?.addEventListener("click", (e) => {
      if (e.target === el.facilityModal) closeModal();
    });

    // Modal search
    el.modalSearch?.addEventListener("input", () => {
      state.modalSearch = safeStr(el.modalSearch.value);
      renderModalList(state.modalSearch);
    });
  }

  // ── Chrome ─────────────────────────────────────────────────────
  function applyChrome() {
    const clubName = safeStr(window.__INIT__?.clubName ?? "");

    if (typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Club Admin", clubName]);
    }
    if (typeof chrome.setActions === "function") {
      chrome.setActions({ left: { show: false }, right: { show: false } });
    }
    if (typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible:    ["home", "clubhome", "clubdemand", "clubusers"],
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
  }

  // ── Boot ───────────────────────────────────────────────────────
  function boot() {
    try {
      const init = window.__INIT__ || window.__MA_INIT__ || null;
      if (!init || !init.ok) throw new Error("Missing or invalid init payload.");

      applyInit(init);
      applyChrome();
      wireEvents();
      renderFacilityBar();

      setStatus("", "info");
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  boot();
})();