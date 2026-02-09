/* /assets/pages/registrations_ghin_hooks.js
 * Hooks to use the shared GHIN Search overlay from Registrations.
 *
 * This file is intentionally "hook-only" so you can include it AFTER your existing
 * registrations page script without rewriting that file immediately.
 *
 * Requirements:
 * - Same GHIN search as Favorites (numeric id OR name search, threshold=90, ineligible rows marked with check icon)
 * - In Registrations: GHIN modal remains open; tee picker overlay opens above it
 * - Ineligible = already enrolled in game; selection suppressed
 * - On eligible selection: set state.pendingPlayer and invoke existing tee picker flow (SELECT_PLAYER style)
 *
 * Integration points you must wire:
 *  1) provide getEnrolledGHINSet(): returns Set of GHINs currently in roster
 *  2) provide openTeePickerForGHIN(row): opens the shared tee picker overlay above current UI
 *
 * If your Registrations page already has state.pendingPlayer + tee drawer (#teeBackdrop),
 * then openTeePickerForGHIN(row) should map row -> pendingPlayer and call your existing
 * "select player" / "load tee options" handler.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  if (!MA.ghinSearch) return;

  // ---- STUBS: replace these with your registrations page functions ----
  function getEnrolledGHINSet() {
    // TODO: replace with your canonical roster state (client-side loaded list)
    return new Set();
  }

  function openTeePickerForGHIN(row) {
    // TODO: replace with your existing tee drawer flow.
    // Expected: tee picker overlay opens above GHIN UI; GHIN search stays visible behind.
    console.warn("openTeePickerForGHIN not wired", row);
  }

  // Public helper you can call from your GHIN-tab Add button
  MA.reg = MA.reg || {};
  MA.reg.openSharedGHINSearch = function (cfg) {
    const enrolled = getEnrolledGHINSet();

    MA.ghinSearch.open({
      title: (cfg && cfg.title) ? cfg.title : "Add GHIN Player",
      defaultState: (cfg && cfg.defaultState) ? cfg.defaultState : "",
      existingGHINs: enrolled,
      onSelect: (row) => {
        // IMPORTANT: do NOT close GHIN search overlay (per requirements).
        // Open tee picker overlay above it.
        openTeePickerForGHIN(row);
      }
    });
  };
})();
