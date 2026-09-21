/* /assets/modules/module_renderSideBets.js
 *
 * MA.renderSideBets — read-only Side Bets results (By Bet / By Player).
 *
 * Nothing is declared or calculated beyond counting: results are the claims
 * scorers recorded on Score Entry, grouped and sorted for reading. Data
 * ACQUISITION is host-owned (score_skins.js): the host hands in the game row,
 * which carries the bet definitions, and an already flight-filtered flat player
 * array, each row carrying its claims.
 *
 * ── Data ────────────────────────────────────────────────────────────────
 * Definitions: game.dbGames_CustomScores  { version, status, bets[] }
 *   Side bets show only while the top-level status is "active", and only bets
 *   whose own status is "active" (stored order — the catalog's order).
 * Claims:      player.dbPlayers_CustomScores  { version, claims[] }
 *   Only claims with status "active" count; "removed" claims and claims for
 *   bets no longer active are ignored.
 * Par:         player.holes.h{n}.par  (the scorecard payload every player carries)
 *
 * ── Views (cfg.view) ────────────────────────────────────────────────────
 *   "bet"    one collapsible card per active bet, in catalog order. A bet with
 *            no claims is a header only. Expanded: hole-by-hole rows.
 *              achievement / no distance: Hole | Earned by (last-name order)
 *              measured competitive:      Hole | Player | Distance, best first
 *                (feet-inches ascending, yards descending, no distance last)
 *   "player" one collapsible card per player WITH claims, by last name.
 *            Expanded: Hole | what they earned.
 * Every card starts collapsed. Values are FACE value (claim count x payout),
 * points and dollars tallied separately and never added together — no
 * settlement between players is implied.
 *
 * ── Public API ──────────────────────────────────────────────────────────
 *   MA.renderSideBets.hasSideBets(game)   side bets on and >= 1 active bet
 *   MA.renderSideBets.mount({ hostEl, view, game, players })
 *
 * Shared classes only (maCard--collapsible, maTable, maPill ...).
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.renderSideBets = MA.renderSideBets || {};

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

  function parseJson(raw) {
    if (typeof raw !== "string") return raw;
    const t = raw.trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  const ICON_MINUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
  const ICON_PLUS  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  // ── Definitions ──────────────────────────────────────────────────────
  function parseDefs(game) {
    const defs = parseJson(game && game.dbGames_CustomScores);
    if (!isObj(defs) || defs.status !== "active" || !Array.isArray(defs.bets)) return [];

    return defs.bets.filter((b) =>
      isObj(b) &&
      typeof b.key === "string" && b.key &&
      (b.type === "achievement" || b.type === "competitive") &&
      typeof b.name === "string" && b.name.trim() &&
      b.status === "active"
    ).map((b) => ({
      key: b.key,
      name: b.name.trim(),
      type: b.type,
      measure: (b.measure === "ftin" || b.measure === "yd") ? b.measure : "",
      unit: (isObj(b.payout) && b.payout.unit === "dollars") ? "dollars" : "points",
      value: (isObj(b.payout) && Number.isFinite(Number(b.payout.value))) ? Number(b.payout.value) : 0,
    }));
  }

  MA.renderSideBets.hasSideBets = function (game) { return parseDefs(game).length > 0; };

  // ── Formatting ───────────────────────────────────────────────────────
  function num(v) {
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  }

  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  function moneyText(unit, v) {
    if (unit === "dollars") return `$${num(v)}`;
    return `${num(v)} ${v === 1 ? "pt" : "pts"}`;
  }

  function payoutText(bet) {
    const amt = bet.unit === "dollars" ? `$${num(bet.value)}` : `${num(bet.value)} ${bet.value === 1 ? "point" : "points"}`;
    return `${amt} ${bet.type === "competitive" ? "per win" : "per claim"}`;
  }

  function distanceText(measure, n) {
    if (n == null || !Number.isFinite(n)) return "—";
    if (measure === "ftin") return `${Math.floor(n / 12)}′${n % 12}″`;
    return `${n} yd`;
  }

  // ── Players ──────────────────────────────────────────────────────────
  function nameParts(p) {
    const full = String(p.dbPlayers_Name || p.playerName || "").trim();
    let last = String(p.dbPlayers_LName || "").trim();
    let first = full;

    if (last && full.toLowerCase().endsWith(last.toLowerCase())) {
      first = full.slice(0, full.length - last.length).trim();
    } else if (!last) {
      const parts = full.split(/\s+/).filter(Boolean);
      last = parts.length > 1 ? parts[parts.length - 1] : full;
      first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
    }

    return { last, first };
  }

  function byName(a, b) {
    return a.last.localeCompare(b.last, undefined, { sensitivity: "base" })
        || a.first.localeCompare(b.first, undefined, { sensitivity: "base" });
  }

  function activeClaims(p, betByKey) {
    const doc = parseJson(p.dbPlayers_CustomScores);
    const list = (isObj(doc) && Array.isArray(doc.claims)) ? doc.claims : [];

    return list.filter((c) =>
      isObj(c) && c.status === "active" && betByKey.has(c.betKey) && Number.isInteger(Number(c.hole))
    ).map((c) => ({
      betKey: c.betKey,
      hole: Number(c.hole),
      distance: (c.distance == null || c.distance === "") ? null : Number(c.distance),
    }));
  }

  function parByHole(players) {
    const par = {};
    players.forEach((p) => {
      for (let h = 1; h <= 18; h++) {
        const v = p.holes && p.holes["h" + h] && p.holes["h" + h].par;
        if (par[h] == null && v != null && v !== "") par[h] = v;
      }
    });
    return par;
  }

  // Everything both views need, computed once.
  function buildData(game, players) {
    const bets = parseDefs(game);
    const betByKey = new Map(bets.map((b) => [b.key, b]));

    const people = players.map((p) => {
      const n = nameParts(p);
      return { p, last: n.last, first: n.first, claims: activeClaims(p, betByKey) };
    });

    const withClaims = people.filter((x) => x.claims.length);

    // "Last F." only where two claimants share a last name.
    const lastCount = {};
    withClaims.forEach((x) => { lastCount[x.last.toLowerCase()] = (lastCount[x.last.toLowerCase()] || 0) + 1; });
    withClaims.forEach((x) => {
      x.short = lastCount[x.last.toLowerCase()] > 1 && x.first ? `${x.last} ${x.first.charAt(0)}.` : x.last;
    });

    return { bets, betByKey, withClaims, par: parByHole(players) };
  }

  function holeLabel(par, h) {
    return `Hole ${h}${par[h] != null ? ` Par ${par[h]}` : ""}`;
  }

  // ── Card shell: the shared collapsible card, same markup as scorecards ─
  function hdrInner(title, sub, icon, pill) {
    return (icon ? `<button class="iconBtn btnSecondary" type="button" aria-label="Expand or collapse">${icon}</button>` : "") +
      `<div class="maCard__title"><div>${esc(title)}</div><div class="maListRow__subline">${esc(sub)}</div></div>` +
      (pill ? `<div class="maCard__actions"><span class="maPill">${esc(pill)}</span></div>` : "");
  }

  function cardHtml(o) {
    if (o.empty) {
      // Header only: collapsed look, no toggle, nothing to open.
      return `<section class="maCard maCard--collapsible is-collapsed"><div class="maCard__hdr maCard__hdr--collapsed">${hdrInner(o.title, o.sub, "", "")}</div></section>`;
    }

    return `<section class="maCard maCard--collapsible is-collapsed">
      <div class="maCard__hdr maCard__hdr--expanded">${hdrInner(o.title, o.sub, ICON_MINUS, o.pill)}</div>
      <div class="maCard__hdr maCard__hdr--collapsed">${hdrInner(o.title, o.sub, ICON_PLUS, o.pill)}</div>
      <div class="maCard__body">${o.body}</div>
    </section>`;
  }

  function tableHtml(heads, rows) {
    return `<table class="maTable maTable--fontLg"><thead><tr>${
      heads.map((h, i) => `<th class="${i === 0 ? "maTable__labelCol" : "maTable__valueCol"}">${esc(h)}</th>`).join("")
    }</tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ── By Bet ───────────────────────────────────────────────────────────
  function betCard(bet, data) {
    const entries = [];
    data.withClaims.forEach((x) => {
      x.claims.forEach((c) => { if (c.betKey === bet.key) entries.push({ x, c }); });
    });

    if (!entries.length) {
      return cardHtml({ title: bet.name, sub: "No claims yet", empty: true });
    }

    const noun = bet.type === "competitive" ? plural(entries.length, "win", "wins") : plural(entries.length, "claim", "claims");
    const total = entries.length * bet.value;
    const sub = total > 0 ? `${noun} · ${moneyText(bet.unit, total)}` : noun;

    const byHole = {};
    entries.forEach((e) => { (byHole[e.c.hole] = byHole[e.c.hole] || []).push(e); });
    const holes = Object.keys(byHole).map(Number).sort((a, b) => a - b);

    let heads, rows = "";

    if (bet.type === "competitive" && bet.measure) {
      heads = ["Hole / Par", "Player", "Distance"];
      const dir = bet.measure === "ftin" ? 1 : -1; // closest first / longest first

      holes.forEach((h) => {
        const list = byHole[h].slice().sort((a, b) => {
          const ad = a.c.distance, bd = b.c.distance;
          if (ad == null && bd == null) return byName(a.x, b.x);
          if (ad == null) return 1;   // no distance: last
          if (bd == null) return -1;
          return (ad - bd) * dir || byName(a.x, b.x);
        });

        list.forEach((e, i) => {
          rows += `<tr><td class="maTable__labelCol">${i === 0 ? esc(holeLabel(data.par, h)) : "&nbsp;"}</td>` +
                  `<td class="maTable__valueCol">${esc(e.x.short)}</td>` +
                  `<td class="maTable__valueCol">${esc(distanceText(bet.measure, e.c.distance))}</td></tr>`;
        });
      });
    } else {
      heads = ["Hole / Par", bet.type === "competitive" ? "Won by" : "Earned by"];

      holes.forEach((h) => {
        const names = byHole[h].slice().sort((a, b) => byName(a.x, b.x)).map((e) => e.x.short);
        rows += `<tr><td class="maTable__labelCol">${esc(holeLabel(data.par, h))}</td>` +
                `<td class="maTable__valueCol">${esc(names.join(", "))}</td></tr>`;
      });
    }

    const hint = `${payoutText(bet)} · face value${(bet.type === "competitive" && bet.measure) ? " · best distance first" : ""}`;

    return cardHtml({
      title: bet.name,
      sub,
      pill: "",
      body: `<div class="maHintText">${esc(hint)}</div>${tableHtml(heads, rows)}`,
    });
  }

  // ── By Player ────────────────────────────────────────────────────────
  function playerCard(x, data) {
    let points = 0, dollars = 0;

    x.claims.forEach((c) => {
      const bet = data.betByKey.get(c.betKey);
      if (!bet) return;
      if (bet.unit === "dollars") dollars += bet.value; else points += bet.value;
    });

    const parts = [plural(x.claims.length, "claim", "claims")];
    if (points > 0) parts.push(moneyText("points", points));
    if (dollars > 0) parts.push(moneyText("dollars", dollars));

    const byHole = {};
    x.claims.forEach((c) => { (byHole[c.hole] = byHole[c.hole] || []).push(c); });
    const order = new Map(data.bets.map((b, i) => [b.key, i]));

    let rows = "";
    Object.keys(byHole).map(Number).sort((a, b) => a - b).forEach((h) => {
      const text = byHole[h].slice().sort((a, b) => order.get(a.betKey) - order.get(b.betKey)).map((c) => {
        const bet = data.betByKey.get(c.betKey);
        return bet.measure ? `${bet.name} ${distanceText(bet.measure, c.distance)}` : bet.name;
      }).join(" · ");

      rows += `<tr><td class="maTable__labelCol">${esc(holeLabel(data.par, h))}</td><td class="maTable__valueCol">${esc(text)}</td></tr>`;
    });

    return cardHtml({
      title: x.first ? `${x.last}, ${x.first}` : x.last,
      sub: parts.join(" · "),
      pill: String(x.claims.length),
      body: `<div class="maHintText">Face value. Points and dollars are tallied separately.</div>${tableHtml(["Hole / Par", "Earned"], rows)}`,
    });
  }

  // ── Mount ────────────────────────────────────────────────────────────
  function bindToggle(hostEl) {
    if (hostEl._sbToggleBound) return;
    hostEl._sbToggleBound = true;

    hostEl.addEventListener("click", (e) => {
      const hdr = e.target.closest(".maCard--collapsible .maCard__hdr");
      if (!hdr) return;

      const card = hdr.closest(".maCard--collapsible");
      if (card && card.querySelector(".maCard__body")) card.classList.toggle("is-collapsed");
    });
  }

  MA.renderSideBets.mount = function (cfg) {
    const hostEl = cfg && cfg.hostEl;
    if (!hostEl) return;

    bindToggle(hostEl);

    const players = Array.isArray(cfg.players) ? cfg.players : [];
    const data = buildData(cfg.game, players);

    if (!data.bets.length) {
      hostEl.innerHTML = `<div class="maEmptyState">No side bets are set up for this game.</div>`;
      return;
    }

    if (cfg.view === "player") {
      if (!data.withClaims.length) {
        hostEl.innerHTML = `<div class="maEmptyState">No side bets recorded yet.</div>`;
        return;
      }

      const sorted = data.withClaims.slice().sort(byName);
      hostEl.innerHTML = `<div class="maCards">${sorted.map((x) => playerCard(x, data)).join("")}</div>`;
      return;
    }

    hostEl.innerHTML = `<div class="maCards">${data.bets.map((b) => betCard(b, data)).join("")}</div>`;
  };
})();
