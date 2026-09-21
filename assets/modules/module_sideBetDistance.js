/* /assets/modules/module_sideBetDistance.js
 *
 * MA.sideBetDistance — the distance popup for measured side bets
 * (Closest to the Pin in feet + inches, Longest Drive in yards).
 *
 * It owns only the popup: it holds no claim state and never talks to the
 * server. MA.scoreSideBets opens it, then applies whichever callback fires.
 * Callbacks fire AFTER the overlay has closed.
 *
 * ── Behaviour ───────────────────────────────────────────────────────────
 *   Save     — writes the typed distance (both fields blank = no distance).
 *              Enter key does the same.
 *   Skip     — (new claim) keeps the claim with no distance.
 *   Remove   — (editing) removes the claim.
 *   X / Esc  — closes with no change at all.
 *   Backdrop — ignored; a stray tap must not dismiss a half-typed entry.
 *
 * ── Units ───────────────────────────────────────────────────────────────
 *   ftin -> stored as whole INCHES, unit "in"   (bounds 1..2400)
 *   yd   -> stored as whole YARDS,  unit "yd"   (bounds 1..600)
 *   Inches typed as 12 or more carry into feet (14 in = 1 ft 2 in).
 *
 * ── Public API ──────────────────────────────────────────────────────────
 *   MA.sideBetDistance.open({
 *     betName, measure, playerLabel, hole,
 *     current,   // { feet, inches } | { yards } | null   (prefill)
 *     editing,   // boolean — true: Remove; false: Skip
 *     onSave,    // (distance:int|null, unit:"in"|"yd"|null) => void
 *     onSkip, onRemove, onDismiss   // () => void
 *   });
 *   MA.sideBetDistance.close();
 *
 * Shared classes only (maModalOverlay / maModal / maFtrBtn ...); the input
 * sizing lives in score_entry.css (.scoreSbDist*).
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.sideBetDistance = MA.sideBetDistance || {};

  const OVERLAY_ID  = "maSideBetDistanceOverlay";
  const MAX_INCHES  = 2400;
  const MAX_YARDS   = 600;

  let _overlay = null;
  let _opts    = null;
  let _onKey   = null;
  let _locked  = false;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function ensureOverlay() {
    if (_overlay && document.body.contains(_overlay)) return _overlay;

    _overlay = document.createElement("div");
    _overlay.id = OVERLAY_ID;
    _overlay.className = "maModalOverlay";
    document.body.appendChild(_overlay);

    // Digits only, three at most.
    _overlay.addEventListener("input", e => {
      const el = e.target.closest("[data-pf]");
      if (el) el.value = el.value.replace(/[^0-9]/g, "").slice(0, 3);
    });

    _overlay.addEventListener("click", e => {
      // Backdrop taps are deliberately ignored.
      if (e.target.closest("[data-pclose]")) { finish("onDismiss"); return; }
      if (e.target.closest("[data-psave]"))  { save(); return; }
      if (e.target.closest("[data-palt]"))   { finish(_opts && _opts.editing ? "onRemove" : "onSkip"); }
    });

    return _overlay;
  }

  function valueOf(field) {
    const el = _overlay && _overlay.querySelector(`[data-pf="${field}"]`);
    return el ? el.value.trim() : "";
  }

  function showError(message) {
    const el = _overlay && _overlay.querySelector('[data-role="err"]');
    if (el) el.textContent = message || "";
  }

  // Reads the typed distance. A blank or zero entry means "no distance".
  function readDistance() {
    if (_opts.measure === "ftin") {
      const ft = valueOf("ft");
      const inch = valueOf("inch");
      if (ft === "" && inch === "") return { ok: true, distance: null, unit: null };

      const total = (parseInt(ft || "0", 10) * 12) + parseInt(inch || "0", 10);
      if (total <= 0) return { ok: true, distance: null, unit: null };
      if (total > MAX_INCHES) return { ok: false, message: `Enter ${MAX_INCHES / 12} ft or less.` };
      return { ok: true, distance: total, unit: "in" };
    }

    const yd = valueOf("yd");
    if (yd === "") return { ok: true, distance: null, unit: null };

    const n = parseInt(yd, 10);
    if (!(n > 0)) return { ok: true, distance: null, unit: null };
    if (n > MAX_YARDS) return { ok: false, message: `Enter ${MAX_YARDS} yards or less.` };
    return { ok: true, distance: n, unit: "yd" };
  }

  function save() {
    if (!_opts) return;
    const d = readDistance();
    if (!d.ok) { showError(d.message); return; }
    finish("onSave", d.distance, d.unit);
  }

  // Closes first, then fires the callback, so callers may re-render freely.
  function finish(cb, ...args) {
    const opts = _opts;
    MA.sideBetDistance.close();
    if (opts && typeof opts[cb] === "function") opts[cb](...args);
  }

  function inputHtml(field, placeholder, wide, value) {
    return `<input class="maTextInput scoreSbDistInput${wide ? " scoreSbDistInput--wide" : ""}"
              type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3"
              data-pf="${field}" value="${esc(value)}" placeholder="${placeholder}" aria-label="${placeholder}">`;
  }

  MA.sideBetDistance.open = function (options) {
    MA.sideBetDistance.close();
    _opts = options || {};

    const cur = _opts.current || {};
    const fields = _opts.measure === "ftin"
      ? `${inputHtml("ft", "ft", false, cur.feet ?? "")}<span class="scoreSbDistUnit">ft</span>
         ${inputHtml("inch", "in", false, cur.inches ?? "")}<span class="scoreSbDistUnit">in</span>`
      : `${inputHtml("yd", "yds", true, cur.yards ?? "")}<span class="scoreSbDistUnit">yards</span>`;

    const overlay = ensureOverlay();
    overlay.innerHTML = `
      <div class="maModal" role="dialog" aria-modal="true" aria-label="${esc(_opts.betName)} distance">
        <div class="maModal__hdr">
          <div>
            <div class="maModal__title">${esc(_opts.betName)}</div>
            <div class="maModal__subtitle">${esc(_opts.playerLabel)} · Hole ${esc(_opts.hole)}</div>
          </div>
          <button class="iconBtn btnPrimary" type="button" data-pclose aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="maModal__body">
          <div class="maLabel">Distance (optional)</div>
          <div class="scoreSbDistRow">${fields}</div>
          <div class="maHintText" data-role="err" role="alert"></div>
        </div>
        <div class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button class="maFtrBtn maFtrBtn--cancel" type="button" data-palt>${_opts.editing ? "Remove" : "Skip"}</button>
            <button class="maFtrBtn maFtrBtn--save" type="button" data-psave>Save</button>
          </div>
        </div>
      </div>`;

    overlay.classList.add("is-open");
    if (!document.documentElement.classList.contains("maOverlayOpen")) {
      document.documentElement.classList.add("maOverlayOpen");
      _locked = true;
    }

    _onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); save(); }
      else if (e.key === "Escape") { e.preventDefault(); finish("onDismiss"); }
    };
    document.addEventListener("keydown", _onKey);

    const first = overlay.querySelector("[data-pf]");
    if (first) first.focus();
  };

  MA.sideBetDistance.close = function () {
    if (_onKey) { document.removeEventListener("keydown", _onKey); _onKey = null; }
    if (_overlay) { _overlay.classList.remove("is-open"); _overlay.innerHTML = ""; }
    if (_locked) { document.documentElement.classList.remove("maOverlayOpen"); _locked = false; }
    _opts = null;
  };
})();
