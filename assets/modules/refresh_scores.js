/* /assets/modules/refresh_scores.js
 * MA.refreshScores — headless declare-flag reconciliation, callable from any
 * page. Reuses MA.resolveDeclaredIndices (declare_logic.js) as the one true
 * declare algorithm; this module only handles fetching, grouping, comparing,
 * and saving. No declare-logic of its own.
 *
 * Usage:
 *   await MA.refreshScores({ ggid, gameRow, scorecardKey })  // playing-group scope
 *   await MA.refreshScores({ ggid, gameRow })                 // whole-game scope
 *
 * Runs unconditionally — no relevance gate, no game-day gate. Purely local
 * recompute, safe to run any time, on every launch / every settings save.
 *
 * Rotation-aware PairPair games (COD, 1324, 1423) are fully handled —
 * getPlayersForRefresh.php resolves the correct per-hole pairing via
 * ServiceScoreRotation::buildNormalizedContexts() (the same public entry
 * point service_ScoreCardRotation.php already uses for the live scorecard),
 * and returns it as holePairingMap. resolveHolePairingId() below consumes
 * that map when present, falling back to static dbPlayers_PairingID only
 * for non-rotating games, where the static value is already correct.
 */
(function (global) {
  "use strict";

  const MA = global.MA = global.MA || {};

  // Delegates to MA.ui (ma_shared.js) instead of building its own overlay —
  // same shell recalculate_handicaps.js now uses.
  function showModal(msg) {
    MA.ui.showBusy({ title: "Working", message: msg || "Processing..." });
  }

  function hideModal() {
    MA.ui.hideBusy();
  }

  function parseScores(raw) {
    if (!raw) return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return null;
    }
  }

  // Rotation-aware: use the server-resolved effective pairing for this exact
  // hole when available. Falls back to the static column, which is correct
  // as-is for every non-rotating game.
  function resolveHolePairingId(player, holePairingMap, holeNumber) {
    const ghin = String(player.dbPlayers_PlayerGHIN || '');
    const resolved = holePairingMap?.[ghin]?.[holeNumber];
    return resolved || String(player.dbPlayers_PairingID || '000');
  }

  function resolvePairingPos(player) {
    return parseInt(player.dbPlayers_PairingPos || '99', 10);
  }

  /**
   * Builds { holeNumber: { pairingId: [{ idx, raw, net, pos }] } }
   * from raw player rows — idx is the position in the `players` array, so
   * results map back to a specific player unambiguously.
   */
  function buildHolePartitions(players, holePairingMap) {
    const partitions = {};

    players.forEach((player, idx) => {
      const parsed = parseScores(player.dbPlayers_Scores);
      const holeDetails = parsed?.Scores?.[0]?.hole_details || [];
      const pos = resolvePairingPos(player);

      holeDetails.forEach((hole) => {
        const holeNumber = parseInt(hole.hole_number, 10);
        if (!holeNumber) return;

        const pairingId = resolveHolePairingId(player, holePairingMap, holeNumber);
        const raw = (typeof hole.adjusted_gross_score === 'number') ? hole.adjusted_gross_score : null;
        const net = (raw !== null) ? raw - Number(hole.stroke_allocation || 0) : null;

        if (!partitions[holeNumber]) partitions[holeNumber] = {};
        if (!partitions[holeNumber][pairingId]) partitions[holeNumber][pairingId] = [];

        partitions[holeNumber][pairingId].push({
          idx, raw, net, pos,
          ghin: String(player.dbPlayers_PlayerGHIN || ''),
          holeNumber,
        });
      });
    });

    return partitions;
  }

  /**
   * Compares stored declared flags against a fresh MA.resolveDeclaredIndices
   * recompute for every hole/pairing. Returns a per-player list of corrected
   * hole_details arrays, ready to serialize back — only for players that
   * actually changed.
   */
  function computeCorrections(players, gameRow, holePairingMap) {
    const partitions = buildHolePartitions(players, holePairingMap);
    const parsedByIdx = players.map(p => parseScores(p.dbPlayers_Scores));
    const changedIdx = new Set();

    Object.keys(partitions).forEach((holeNumberStr) => {
      const holeNumber = parseInt(holeNumberStr, 10);
      const pairings = partitions[holeNumberStr];

      Object.values(pairings).forEach((rows) => {
        const declaredIndices = MA.resolveDeclaredIndices(rows, gameRow, holeNumber);
        if (declaredIndices === null) return; // manual-declare system — nothing to reconcile

        rows.forEach((row) => {
          const parsed = parsedByIdx[row.idx];
          const holeDetails = parsed?.Scores?.[0]?.hole_details || [];
          const holeEntry = holeDetails.find(h => parseInt(h.hole_number, 10) === holeNumber);
          if (!holeEntry) return;

          const shouldBeDeclared = declaredIndices.includes(row.idx);
          const currentlyDeclared = !!holeEntry.declared;

          if (shouldBeDeclared !== currentlyDeclared) {
            holeEntry.declared = shouldBeDeclared;
            changedIdx.add(row.idx);
          }
        });
      });
    });

    const corrections = [];
    changedIdx.forEach((idx) => {
      corrections.push({
        ghin: String(players[idx].dbPlayers_PlayerGHIN || ''),
        scoresJson: parsedByIdx[idx],
      });
    });
    return corrections;
  }

  MA.refreshScores = async function ({ ggid, gameRow, scorecardKey } = {}) {
    if (!ggid) {
      console.error('MA.refreshScores: ggid required.');
      return { ok: false, message: 'ggid required.' };
    }
    if (typeof MA.postJson !== 'function') {
      console.error('MA.refreshScores: MA.postJson not found.');
      return { ok: false, message: 'MA.postJson not found.' };
    }
    if (typeof MA.resolveDeclaredIndices !== 'function') {
      console.error('MA.refreshScores: declare_logic.js not loaded.');
      return { ok: false, message: 'declare_logic.js not loaded.' };
    }

    try {
      showModal('Processing...');

      const fetchRes = await MA.postJson('/api/score_home/getPlayersForRefresh.php', {
        ggid: String(ggid),
        scorecardKey: scorecardKey || '',
      });
      if (!fetchRes || !fetchRes.ok) {
        throw new Error(fetchRes?.message || 'Unable to fetch players for refresh.');
      }

      const players = fetchRes.players || [];
      if (!players.length) {
        hideModal();
        return { ok: true, updated: 0 };
      }

      const holePairingMap = fetchRes.holePairingMap || {};
      const corrections = computeCorrections(players, gameRow || {}, holePairingMap);
      if (!corrections.length) {
        hideModal();
        return { ok: true, updated: 0 };
      }

      const saveRes = await MA.postJson('/api/score_home/saveDeclaredCorrections.php', {
        ggid: String(ggid),
        updates: corrections,
      });
      hideModal();

      if (!saveRes || !saveRes.ok) {
        throw new Error(saveRes?.message || 'Unable to save declare corrections.');
      }

      return { ok: true, updated: saveRes.updated ?? corrections.length };

    } catch (e) {
      hideModal();
      console.error('MA.refreshScores error:', e);
      return { ok: false, message: e.message || String(e) };
    }
  };

})(window);
