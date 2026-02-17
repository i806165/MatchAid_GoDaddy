/* /assets/modules/ghin_player_search.js
 * Shared GHIN search overlay for MatchAid pages.
 *
 * Canonical requirements (Favorites + Registrations):
 * - Same UI + same logic for numeric GHIN# lookup vs alpha last-name search
 * - Same truncation policy: threshold = 90 (show "Results truncated..." when >= 90)
 * - Ineligible rows are marked with trailing check icon and are not selectable
 * - Host supplies: existingGHINs Set + onSelect handler
 *
 * Dependencies:
 * - ma_shared.js loaded first (MA.postJson, MA.setStatus, MA.chrome helpers, etc.)
 * - MA.paths.ghinPlayerSearch set by the hosting page (see favorites.php + init endpoint)
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.ghinSearch = MA.ghinSearch || {};

  const TRUNCATION_THRESHOLD = 90;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function safeStr(v) { return (v == null) ? "" : String(v); }
  function isAllDigits(s) { return /^[0-9]+$/.test(s); }

  // --- Overlay DOM (created once) ---
let _mounted = false;
let _root, _panel, _title, _status, _form, _stateSel, _lastInp, _firstInp, _btnSearch, _btnClose, _controls, _resultsHdr, _results, _hint;

function mountOnce() {
  if (_mounted) return;

  // Use global modal overlay pattern from ma_shared.css
  _root = el("div", "maModalOverlay", "");
  _root.id = "ghinSearchModal";

  _panel = el("div", "maModal", "");

  // --- Header (pinned) ---
  const hdr = el("div", "maModal__hdr", "");
  _title = el("div", "maModal__title", "GHIN Player Search");

  _btnClose = el("button", "btn btnSecondary", "Close");
  _btnClose.type = "button";

  hdr.appendChild(_title);
  hdr.appendChild(_btnClose);

  // --- Controls (pinned peer of body) ---
  _controls = el("div", "maModal__controls", "");

  // Controls row (use standard field layout)
  _form = el("div", "maFieldRow ghinSearchRow", "");

  // State
  const fState = el("div", "maField ghinFieldState", "");
  const wState = el("div", "maInputWrap", "");
  _stateSel = el("input", "maTextInput", "");
  _stateSel.placeholder = "State (e.g., FL)";
  _stateSel.maxLength = 2;
  wState.appendChild(_stateSel);
  fState.appendChild(wState);

  // Last name / GHIN
  const fLast = el("div", "maField ghinFieldLast", "");
  const wLast = el("div", "maInputWrap", "");
  _lastInp = el("input", "maTextInput", "");
  _lastInp.placeholder = "Last name or GHIN# (required)";
  wLast.appendChild(_lastInp);
  fLast.appendChild(wLast);

  // First name
  const fFirst = el("div", "maField ghinFieldFirst", "");
  const wFirst = el("div", "maInputWrap", "");
  _firstInp = el("input", "maTextInput", "");
  _firstInp.placeholder = "First name (optional)";
  wFirst.appendChild(_firstInp);
  fFirst.appendChild(wFirst);

  // Search button
  const fBtn = el("div", "maField ghinFieldBtn", "");
  fBtn.style.flex = "0 0 auto";
  _btnSearch = el("button", "btn btnPrimary", "Search");
  _btnSearch.type = "button";
  fBtn.appendChild(_btnSearch);

  _form.appendChild(fLast);
  _form.appendChild(fState);
  _form.appendChild(fFirst);
  _form.appendChild(fBtn);


  _status = el("div", "maHelpText", "");
  _status.style.marginTop = "6px";

  _controls.appendChild(_form);

  // --- Body (scrolling results only) ---
  const body = el("div", "maModal__body", "");

  // Pinned results header (sticky within scroll body)
  _resultsHdr = el("div", "maResultsHdr maListRow maListRow--hdr", "");
  const h1 = el("div", "maListRow__col ghinColName", "Name");
  const h2 = el("div", "maListRow__col ghinColHI", "HI");
  const h3 = el("div", "maListRow__col ghinColG", "G");
  const h4 = el("div", "maListRow__col maListRow__col--right ghinColMark", ""); // for ✓ column
  _resultsHdr.appendChild(h1);
  _resultsHdr.appendChild(h2);
  _resultsHdr.appendChild(h3);
  _resultsHdr.appendChild(h4);


  _results = el("div", "maListRows", "");
  _results.style.marginTop = "0";

  body.appendChild(_resultsHdr);
  body.appendChild(_results);

    // --- Footer (pinned) ---
  const ftr = el("footer", "maModal__ftr", "");
  ftr.appendChild(_status);

  // Assemble modal
  _panel.appendChild(hdr);
  _panel.appendChild(_controls);
  _panel.appendChild(body);
  _panel.appendChild(ftr);

  _root.appendChild(_panel);
  document.body.appendChild(_root);

  // Prevent outside click close (per spec)
  _root.addEventListener("click", (e) => {
    if (e.target === _root) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  _btnClose.addEventListener("click", () => close());
  _btnSearch.addEventListener("click", () => doSearch());
  [_stateSel, _lastInp, _firstInp].forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });
  });

  _mounted = true;
}

  // --- Runtime state for an open session ---
  let _cfg = null;

  function open(cfg) {
    mountOnce();
    _cfg = Object.assign({
      title: "GHIN Player Search",
      defaultState: "",
      existingGHINs: new Set(),
      onSelect: null, // function(row) {}
    }, cfg || {});

    _title.textContent = safeStr(_cfg.title || "GHIN Player Search");
    _stateSel.value = safeStr(_cfg.defaultState || "").toUpperCase();
    _lastInp.value = "";
    _firstInp.value = "";
    _status.textContent = "";
    _results.innerHTML = "";
    _root.classList.add("is-open");
    document.body.classList.add("maOverlayOpen");
    // focus AFTER the DOM paints the open state (prevents Safari jitter)
    setTimeout(() => { _lastInp && _lastInp.focus(); }, 0);    
    _lastInp.focus();
  }

  function close() {
    if (!_mounted) return;
    _root.classList.remove("is-open");
    document.body.classList.remove("maOverlayOpen");
    _cfg = null;
  }


  async function doSearch() {
    if (!_cfg) return;
    const st = safeStr(_stateSel.value).trim().toUpperCase();
    const lastOrId = safeStr(_lastInp.value).trim();
    const first = safeStr(_firstInp.value).trim();

    if (!lastOrId) {
      setLocalStatus("Enter last name or GHIN#.", "warn");
      return;
    }

    if (!MA.paths || !MA.paths.ghinPlayerSearch) {
      setLocalStatus("GHIN search API path not configured.", "error");
      return;
    }

    setLocalStatus("Searching…", "info");
    _results.innerHTML = "";

      try {
        const mode = isAllDigits(lastOrId) ? "id" : "name";
        const payload = (mode === "id")
          ? { mode, ghin: lastOrId }
          : { mode, state: st, lastName: lastOrId, firstName: first };

        console.log("[GHIN_SEARCH] request", {
          url: MA?.paths?.ghinPlayerSearch,
          payload
        });

        const res = await MA.postJson(MA.paths.ghinPlayerSearch, payload);

        console.log("[GHIN_SEARCH] response", res);

        if (!res || !res.ok) {
          throw new Error(res?.message || "Search failed.");
        }

        const rows = Array.isArray(res.payload?.rows) ? res.payload.rows : [];
        const truncated = !!res.payload?.truncated || rows.length >= TRUNCATION_THRESHOLD;

        renderRows(rows, truncated);

        if (!rows.length) {
          setLocalStatus("Results: 0 found", "info");
        } else if (truncated) {
          setLocalStatus(`Results: ${rows.length}+ found (truncated)`, "warn");
        } else {
          setLocalStatus(`Results: ${rows.length} found`, "success");
        }


      } catch (e) {
        console.error("[GHIN_SEARCH] catch", {
          message: e?.message,
          error: e,
          url: MA?.paths?.ghinPlayerSearch,
          inputs: { st, lastOrId, first }
        });

        setLocalStatus(String(e?.message || e), "error");
      }
  }

  function setLocalStatus(msg, level) {
    _status.textContent = safeStr(msg);
    _status.setAttribute("data-level", safeStr(level || ""));
  }

function renderRows(rows, truncated) {
  _results.innerHTML = "";

  if (truncated) {
    const t = el("div", "maInlineAlert maInlineAlert--warn",
      "Results truncated. Please refine your search.");
    _results.appendChild(t);
  }

  rows.forEach(row => {
    const ghin = safeStr(row.ghin).trim();         // keep for identity + existing set, but DO NOT display
    const name = safeStr(row.name).trim();         // display
    const hi = safeStr(row.hi).trim();             // display
    const gender = safeStr(row.gender).trim();     // display
    const club = safeStr(row.club_name || row.clubName).trim(); // display

    const already = _cfg.existingGHINs && _cfg.existingGHINs.has(ghin);

    const item = el("div", "maListRow ghinRow", "");
    item.setAttribute("data-ghin", ghin);

    const nameLine = club ? `${name} • ${club}` : name;
    // Columns
    const c1 = el("div", "maListRow__col ghinColName", nameLine);  // NO GHIN fallback
    const c2 = el("div", "maListRow__col ghinColHI", hi);
    const c3 = el("div", "maListRow__col ghinColG", gender);

    //const c4 = el("div", "maListRow__col maListRow__col--right ghinColMark", "");
    //if (already) {
    //  const pill = el("span", "maPill", "✓");
    //  pill.setAttribute("aria-label", "Already added");
    //  c4.appendChild(pill);
    //  item.classList.add("is-disabled");
    //}

    const c4 = el("div", "maListRow__col maListRow__col--right ghinColMark", "");
    if (already) {
      const checkMarkInCircle = "☑"; 
      c4.textContent = checkMarkInCircle;          // <-- THIS is the missing line
      c4.classList.add("blue-checkmark");
      item.classList.add("is-disabled");
    }

    item.appendChild(c1);
    item.appendChild(c2);
    item.appendChild(c3);
    item.appendChild(c4);

    if (!already) {
      item.addEventListener("click", () => {
        if (!_cfg || typeof _cfg.onSelect !== "function") return;
        _cfg.onSelect(Object.assign({}, row));
      });
    }

    _results.appendChild(item);
  });
}


  // Public API
  MA.ghinSearch.open = open;
  MA.ghinSearch.close = close;
})();
