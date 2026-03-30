/* /assets/modules/actions_menu.js
 * Shared Actions Menu module.
 * - Renders a bottom-sheet/modal menu for actions.
 * - Exposed as MA.ui.openActionsMenu(title, items, subtitle)
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.ui = MA.ui || {};

  // Internal: Ensure the overlay DOM elements exist
function ensureOverlay() {
  let overlay = document.getElementById("maActionMenuOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "maActionMenuOverlay";
    overlay.className = "maModalOverlay";
    overlay.innerHTML = '<div id="maActionMenuHost"></div>';
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) MA.ui.closeActionsMenu();
    });
  }
  return {
    overlay,
    host: document.getElementById("maActionMenuHost")
  };
}

  // Internal: Lock body scroll
  function setOverlayLock(on) {
    const root = document.documentElement;
    if (root) root.classList.toggle("maOverlayOpen", !!on);
  }

  // Public: Close the menu
  MA.ui.closeActionsMenu = function () {
    const el = document.getElementById("maActionMenuOverlay");
    if (el) {
      el.classList.remove("open");
      el.setAttribute("aria-hidden", "true");
      const host = document.getElementById("maActionMenuHost");
      if (host) host.innerHTML = "";
    }
    setOverlayLock(false);
  };

  /**
   * Open the Actions Menu
   * @param {string} title - Menu title
   * @param {Array} items - Array of objects: { label, action, danger, separator }
   * @param {string} [subtitle] - Optional subtitle
   */
  MA.ui.openActionsMenu = function (title, items, subtitle) {
    const { overlay, host } = ensureOverlay();
    if (!host) return;

    // Build Items HTML
    const rows = (Array.isArray(items) ? items : []).map((item, idx) => {
      if (item.separator) {
        return `<div class="actionMenu_divider"></div>`;
      }
      const label = String(item.label || "");
      const dangerClass = item.danger ? "danger" : "";
      // Store index to retrieve action callback later
      return `<button class="actionMenu_item ${dangerClass}" type="button" data-idx="${idx}">${escapeHtml(label)}</button>`;
    }).join("");

    // Build Full HTML
    const html = `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || "Actions")}">
        <header class="maModal__hdr">
          <div class="maModal__title">${escapeHtml(title || "Actions")}</div>
          <button class="iconBtn btnPrimary" type="button" data-close="1" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </header>
        <div class="maModal__body">
          ${subtitle ? `<div class="actionMenu_subtitle">${escapeHtml(subtitle)}</div>` : ""}
          ${rows}
        </div>
      </section>
    `;

    host.innerHTML = html;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    setOverlayLock(true);

    // Wire Events
    // 1. Close button
    const closeBtn = host.querySelector("[data-close='1']");
    if (closeBtn) {
      closeBtn.addEventListener("click", MA.ui.closeActionsMenu);
    }

    // 2. Item clicks
    host.querySelectorAll(".actionMenu_item[data-idx]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const item = items[idx];
        
        // Close menu immediately on selection
        MA.ui.closeActionsMenu();

        if (item && item.action) {
          if (typeof item.action === "function") {
            item.action();
          } else if (typeof item.action === "string") {
            // Support string actions for router or standard behaviors
            if (MA.routerGo) MA.routerGo(item.action, item.params);
            else if (item.action === "back") window.history.back();
          }
        }
      });
    });
  };

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

})();