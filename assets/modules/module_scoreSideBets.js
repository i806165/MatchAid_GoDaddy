/* /assets/modules/module_scoreSideBets.js
 *
 * MA.scoreSideBets — the Side Bets view on Score Entry.
 *
 * Records, by hand, which player earned which side bet on which hole. Nothing
 * here derives, awards or checks a claim against a hole score, and no claim is
 * ever recalculated.
 *
 * ── Data ────────────────────────────────────────────────────────────────
 * Definitions (read only): payload.gameRow.dbGames_CustomScores
 *   { version, status, bets[] } — self-describing snapshots; the catalog is
 *   never loaded on this page. Side bets are in play only while the top-level
 *   status is "active"; only bets whose own status is "active" are shown.
 * Claims (one document per player): the launch wrapper's
 *   originalCustomScoresJson, hydrated server-side exactly like scores
 *   (NULL -> { version:1, claims:[] }, in memory only).
 *   { version:1, claims:[ { betKey, hole, status:"active"|"removed",
 *                           distance:int|null, unit:"in"|"yd"|null, recordedAt } ] }
 * A claim is identified by betKey + hole within a player. Removing a claim
 * that was ever saved marks it "removed" (history); removing one created this
 * session just deletes it. Everything the view does not show — other holes,
 * removed claims, claims for bets since disabled — is carried through every
 * save untouched.
 *
 * ── Claim rules ─────────────────────────────────────────────────────────
 * Achievement bets: any number of players may hold one on a hole.
 * Competitive bets: one holder per hole across the pod — selecting it for a
 *   player takes it from whoever held it (a "move"). Measured competitive
 *   bets (data measure "ftin"/"yd") open the distance popup automatically.
 *
 * ── Saving ──────────────────────────────────────────────────────────────
 * Not per tap. Score Entry calls save() before a hole change and when leaving
 * the Side Bets tab; only players whose claims changed are sent. A 409 means
 * someone else changed a player's claims: state is replaced with the fresh
 * data returned and { ok:false, conflict:true } comes back.
 *
 * ── Public API ──────────────────────────────────────────────────────────
 *   init({ rootEl, tabsHost, getPayload, getPlayers, getHole, getPlayerKey,
 *          getScorerGhin, getPairingId, getSaveUrl, onDirtyChange })
 *   refreshFromPayload()   re-parse definitions + claims (after every launch)
 *   render()               draw the view for the current hole
 *   hasActiveBets()        side bets on and at least one active bet
 *   claimCountForHole()    active visible claims on the current hole
 *   isDirty(), discard()
 *   save()                 Promise<{ ok, conflict?, message? }>
 *
 * Players are listed in exactly the order getPlayers() returns them (the
 * Scores view's order); this module never sorts them.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.scoreSideBets = MA.scoreSideBets || {};

  let _cfg      = null;
  let _bets     = [];   // active, well-formed bets in stored order; [] when side bets are off
  let _players  = {};   // ghin -> { claims, original, persisted:Set, loadedSig }
  let _dirty    = false;
  let _saving   = false;
  let _openGhin = null; // one player card open at a time; none at first

  // ── Small helpers ────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function ghinOf(wrapper) { return String(wrapper?.playerRow?.dbPlayers_PlayerGHIN || "").trim(); }
  function claimKey(c) { return `${c.betKey}|${Number(c.hole)}`; }

  function formatDistance(measure, n) {
    if (n == null) return "";
    if (measure === "ftin") return `${Math.floor(n / 12)}′${n % 12}″`;
    return `${n} yd`;
  }

  // ── Parsing (tolerant: string, object, blank, or malformed) ──────────
  function parseJson(raw) {
    if (typeof raw !== "string") return raw;
    const t = raw.trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  function parseDoc(raw) {
    const p = parseJson(raw);
    // Claims are kept exactly as delivered (no filtering) so what is sent back as
    // "original" always matches what is stored.
    return { version: 1, claims: (isObj(p) && Array.isArray(p.claims)) ? p.claims : [] };
  }

  function parseBets(gameRow) {
    const defs = parseJson(gameRow?.dbGames_CustomScores);
    if (!isObj(defs) || defs.status !== "active" || !Array.isArray(defs.bets)) return [];

    return defs.bets.filter(b =>
      isObj(b) &&
      typeof b.key === "string" && b.key &&
      (b.type === "achievement" || b.type === "competitive") &&
      typeof b.name === "string" && b.name.trim() &&
      b.status === "active"
    ).map(b => ({
      key: b.key,
      name: b.name.trim(),
      type: b.type,
      measure: (b.measure === "ftin" || b.measure === "yd") ? b.measure : "",
    }));
  }

  // Comparison form of a claims list (order and key order do not matter).
  function sig(claims) {
    return JSON.stringify(
      claims.filter(isObj)
        .map(c => [String(c.betKey), Number(c.hole), c.status, c.distance ?? null, c.unit ?? null, c.recordedAt ?? null])
        .map(t => JSON.stringify(t))
        .sort()
    );
  }

  function loadPlayer(doc) {
    return {
      claims: clone(doc.claims),
      original: clone(doc),
      persisted: new Set(doc.claims.filter(c => isObj(c) && c.betKey != null).map(claimKey)),
      loadedSig: sig(doc.claims),
    };
  }

  // ── State ────────────────────────────────────────────────────────────
  function setDirty(flag) {
    _dirty = !!flag;
    if (_cfg && typeof _cfg.onDirtyChange === "function") _cfg.onDirtyChange(_dirty);
  }

  function findClaim(p, betKey, hole) {
    return p.claims.find(c => isObj(c) && c.betKey === betKey && Number(c.hole) === hole);
  }
  function isActiveClaim(p, betKey, hole) {
    const c = findClaim(p, betKey, hole);
    return !!c && c.status === "active";
  }

  function activate(p, betKey, hole) {
    const c = findClaim(p, betKey, hole);
    if (!c) {
      p.claims.push({ betKey, hole, status: "active", distance: null, unit: null });
    } else {
      c.status = "active";
      c.distance = null;
      c.unit = null;
    }
  }

  // A claim that was ever saved is kept as "removed"; one made this session is dropped.
  function deactivate(p, betKey, hole) {
    const c = findClaim(p, betKey, hole);
    if (!c) return;
    if (p.persisted.has(claimKey(c))) {
      c.status = "removed";
      c.distance = null;
      c.unit = null;
    } else {
      p.claims.splice(p.claims.indexOf(c), 1);
    }
  }

  function holderOf(betKey, hole) {
    return Object.keys(_players).find(g => isActiveClaim(_players[g], betKey, hole)) || null;
  }

  // ── Roster (same order as the Scores view) ───────────────────────────
  function roster() {
    const payload = _cfg.getPayload() || {};
    const net = String(payload.gameRow?.dbGames_ScoringMethod || "").toUpperCase() === "NET";

    return _cfg.getPlayers().map(w => {
      const row = w.scoreEntryRow || {};
      const full = String(row.playerName || w.playerRow?.dbPlayers_Name || "").trim();
      const parts = full.split(/\s+/).filter(Boolean);
      const first = parts[0] || "";
      const last = parts.length > 1 ? parts.slice(1).join(" ") : (parts[0] || "");
      const hc = (net && row.effectiveHC != null) ? ` (${row.effectiveHC})` : "";

      return { wrapper: w, ghin: ghinOf(w), first, last, hc };
    }).filter(r => r.ghin && _players[r.ghin]);
  }

  // ── Tab strip ────────────────────────────────────────────────────────
  function claimCountForHole() {
    if (!_cfg) return 0;
    const hole = _cfg.getHole();
    const keys = new Set(_bets.map(b => b.key));
    let n = 0;

    Object.values(_players).forEach(p => {
      p.claims.forEach(c => {
        if (isObj(c) && c.status === "active" && Number(c.hole) === hole && keys.has(c.betKey)) n += 1;
      });
    });

    return n;
  }

  function applyTabs() {
    if (!_cfg || !_cfg.tabsHost) return;
    _cfg.tabsHost.hidden = !_bets.length;

    const btn = _cfg.tabsHost.querySelector('[data-view="sidebets"]');
    if (btn) {
      const n = claimCountForHole();
      btn.textContent = n ? `Side Bets · ${n}` : "Side Bets";
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────
  function summaryOf(ghin, hole) {
    const p = _players[ghin];
    const parts = _bets.filter(b => isActiveClaim(p, b.key, hole)).map(b => {
      const c = findClaim(p, b.key, hole);
      const d = (b.measure && c && c.distance != null) ? ` ${formatDistance(b.measure, c.distance)}` : "";
      return b.name + d;
    });
    return parts.length ? parts.join(" · ") : "No claims";
  }

  function chipHtml(ghin, bet, hole, byGhin) {
    const p = _players[ghin];
    const mine = isActiveClaim(p, bet.key, hole);
    let detail = "";

    if (bet.type === "competitive") {
      const holder = holderOf(bet.key, hole);
      if (holder && holder !== ghin) {
        detail = `Held by ${byGhin[holder] ? byGhin[holder].last : ""}`;
      } else if (mine && bet.measure) {
        const c = findClaim(p, bet.key, hole);
        detail = (c && c.distance != null) ? `${formatDistance(bet.measure, c.distance)} · tap to edit` : "Tap to add distance";
      } else if (!holder) {
        detail = "One winner";
      }
    }

    return `<button type="button" class="maChoiceChip maChoiceChip--touch${mine ? " is-selected" : ""}"
              data-chip="${esc(bet.key)}" data-player="${esc(ghin)}" aria-pressed="${mine}">
              <span class="maChoiceChip__label">${mine ? "✓ " : ""}${esc(bet.name)}</span>${detail ? `<span class="maChoiceChip__detail">${esc(detail)}</span>` : ""}
            </button>`;
  }

  function cardHtml(r, hole, byGhin) {
    const open = _openGhin === r.ghin;
    const n = _bets.filter(b => isActiveClaim(_players[r.ghin], b.key, hole)).length;

    return `
      <section class="maCard" data-card="${esc(r.ghin)}">
        <header class="maCard__hdr maCard__hdr--l3 scoreSbHdr" data-row="${esc(r.ghin)}"
                role="button" tabindex="0" aria-expanded="${open}">
          <div class="scoreSbHdr__main">
            <div class="maCard__title">${esc(r.last)} <span class="scoreSbHdr__first">${esc(r.first + r.hc)}</span></div>
            <div class="maListRow__subline">${esc(summaryOf(r.ghin, hole))}</div>
          </div>
          <div class="maCard__actions">
            ${n ? `<span class="maPill">${n}</span>` : ""}
            <span class="maHubRow__arrow" aria-hidden="true">&rsaquo;</span>
          </div>
        </header>
        ${open ? `<div class="maCard__body"><div class="maChoiceChips">${_bets.map(b => chipHtml(r.ghin, b, hole, byGhin)).join("")}</div></div>` : ""}
      </section>`;
  }

  function render() {
    if (!_cfg || !_cfg.rootEl) return;
    const root = _cfg.rootEl;

    if (!_bets.length) {
      root.innerHTML = "";
      applyTabs();
      return;
    }

    const hole = _cfg.getHole();
    const rows = roster();
    const byGhin = {};
    rows.forEach(r => { byGhin[r.ghin] = r; });

    // Same pairing divider the Scores view draws between pairings.
    let prevPairing = "";
    const html = rows.map((r, idx) => {
      const pairing = typeof _cfg.getPairingId === "function" ? _cfg.getPairingId(r.wrapper) : "";
      const divider = (idx > 0 && pairing && pairing !== prevPairing)
        ? '<div class="scorePairingDivider" aria-hidden="true"></div>' : "";
      prevPairing = pairing;
      return divider + cardHtml(r, hole, byGhin);
    }).join("");

    root.innerHTML = `<div class="maCards">${html}</div>`;
    applyTabs();
  }

  function focusChip(ghin, betKey) {
    if (!_cfg || !_cfg.rootEl) return;
    const el = _cfg.rootEl.querySelector(`[data-chip="${CSS.escape(betKey)}"][data-player="${CSS.escape(ghin)}"]`);
    if (el) el.focus();
  }

  // ── Interaction ──────────────────────────────────────────────────────
  function toggleOpen(ghin) {
    _openGhin = (_openGhin === ghin) ? null : ghin;
    render();
  }

  function markDirty() {
    setDirty(true);
  }

  function labelOf(ghin) {
    const r = roster().find(x => x.ghin === ghin);
    return r ? `${r.last}, ${r.first}` : "";
  }

  function openPopup(ghin, bet, editing) {
    const hole = _cfg.getHole();
    const p = _players[ghin];
    const entry = findClaim(p, bet.key, hole);

    let current = null;
    if (entry && entry.distance != null) {
      current = bet.measure === "ftin"
        ? { feet: Math.floor(entry.distance / 12), inches: entry.distance % 12 }
        : { yards: entry.distance };
    }

    const done = () => { render(); focusChip(ghin, bet.key); };

    MA.sideBetDistance.open({
      betName: bet.name,
      measure: bet.measure,
      playerLabel: labelOf(ghin),
      hole,
      current,
      editing,
      onSave: (distance, unit) => {
        const c = findClaim(p, bet.key, hole);
        if (c && c.status === "active") { c.distance = distance; c.unit = unit; markDirty(); }
        done();
      },
      onSkip: done,
      onRemove: () => { deactivate(p, bet.key, hole); markDirty(); done(); },
      onDismiss: done,
    });
  }

  function toggleClaim(ghin, betKey) {
    const bet = _bets.find(b => b.key === betKey);
    const p = _players[ghin];
    if (!bet || !p) return;

    const hole = _cfg.getHole();
    const mine = isActiveClaim(p, betKey, hole);
    const hasPopup = !!bet.measure && MA.sideBetDistance && typeof MA.sideBetDistance.open === "function";

    // A measured bet you already hold: edit or remove through the popup.
    if (hasPopup && mine) { openPopup(ghin, bet, true); return; }

    if (mine) {
      deactivate(p, betKey, hole);
    } else {
      // One winner per hole: taking it removes it from whoever held it.
      if (bet.type === "competitive") {
        Object.keys(_players).forEach(g => {
          if (g !== ghin && isActiveClaim(_players[g], betKey, hole)) deactivate(_players[g], betKey, hole);
        });
      }
      activate(p, betKey, hole);
    }

    markDirty();
    render();

    // Ask for the distance while the reading is fresh.
    if (hasPopup && !mine) openPopup(ghin, bet, false);
  }

  function wire(root) {
    root.addEventListener("click", e => {
      const chip = e.target.closest("[data-chip]");
      if (chip) { toggleClaim(chip.getAttribute("data-player"), chip.getAttribute("data-chip")); return; }

      const hdr = e.target.closest("[data-row]");
      if (hdr) toggleOpen(hdr.getAttribute("data-row"));
    });

    root.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const hdr = e.target.closest("[data-row]");
      if (hdr && e.target === hdr) { e.preventDefault(); toggleOpen(hdr.getAttribute("data-row")); }
    });
  }

  // ── Save ─────────────────────────────────────────────────────────────
  function applyReturned(players) {
    (Array.isArray(players) ? players : []).forEach(u => {
      const ghin = String(u?.ghin || "");
      if (ghin && _players[ghin]) _players[ghin] = loadPlayer(parseDoc(u.customScores));
    });
  }

  const GENERIC_FAIL = "Side bets couldn't be saved. Please try again.";

  MA.scoreSideBets.save = async function () {
    if (!_cfg || !_dirty) return { ok: true };
    if (_saving) return { ok: false, message: GENERIC_FAIL };

    const changed = Object.keys(_players).filter(g => sig(_players[g].claims) !== _players[g].loadedSig);
    if (!changed.length) { setDirty(false); return { ok: true }; }

    _saving = true;
    try {
      const res = await fetch(_cfg.getSaveUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerKey: _cfg.getPlayerKey(),
          scorerGHIN: _cfg.getScorerGhin(),
          hole: _cfg.getHole(),
          players: changed.map(g => ({
            ghin: g,
            originalCustomScores: _players[g].original,
            customScores: { version: 1, claims: _players[g].claims },
          })),
        }),
      });

      let json = null;
      try { json = JSON.parse(await res.text()); } catch (e) { json = null; }

      if (json && json.ok) {
        applyReturned(json.players || json.payload?.players);
        setDirty(false);
        render();
        return { ok: true };
      }

      if (json && json.conflict) {
        // Someone else changed these claims: take theirs, drop our stale edits.
        applyReturned(json.players);
        setDirty(false);
        render();
        return { ok: false, conflict: true, message: json.message };
      }

      return { ok: false, message: (json && json.message) || GENERIC_FAIL };
    } catch (err) {
      console.error("[MA.scoreSideBets] save failed", err);
      return { ok: false, message: GENERIC_FAIL };
    } finally {
      _saving = false;
    }
  };

  // ── Public API ───────────────────────────────────────────────────────
  MA.scoreSideBets.init = function (cfg) {
    _cfg = cfg || null;
    if (_cfg && _cfg.rootEl) wire(_cfg.rootEl);
  };

  MA.scoreSideBets.refreshFromPayload = function () {
    if (!_cfg) return;

    const payload = _cfg.getPayload() || {};
    _bets = parseBets(payload.gameRow);
    _players = {};

    _cfg.getPlayers().forEach(w => {
      const ghin = ghinOf(w);
      if (!ghin) return;
      const raw = (w.originalCustomScoresJson !== undefined) ? w.originalCustomScoresJson : w.playerRow?.dbPlayers_CustomScores;
      _players[ghin] = loadPlayer(parseDoc(raw));
    });

    _openGhin = null; // every player starts collapsed
    setDirty(false);
    applyTabs();
    render();
  };

  MA.scoreSideBets.render = render;
  MA.scoreSideBets.hasActiveBets = function () { return _bets.length > 0; };
  MA.scoreSideBets.claimCountForHole = claimCountForHole;
  MA.scoreSideBets.isDirty = function () { return _dirty; };
  MA.scoreSideBets.discard = function () { MA.scoreSideBets.refreshFromPayload(); };
})();
