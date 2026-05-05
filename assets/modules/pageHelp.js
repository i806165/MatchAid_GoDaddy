// /public_html/assets/modules/pageHelp.js

(function () {
  "use strict";

  function getOverlay() {
    return document.getElementById("maHelpOverlay");
  }

  function show() {
    var overlay = getOverlay();
    if (!overlay) return;

    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");

    var closeBtn = overlay.querySelector("[data-help-close]");
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  function hide() {
    var overlay = getOverlay();
    if (!overlay) return;

    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");

    var openBtn = document.querySelector("[data-help-open]");
    if (openBtn) {
      openBtn.focus();
    }
  }

  function switchTab(tabBtn) {
    var overlay = getOverlay();
    if (!overlay) return;

    var tabIndex = tabBtn.getAttribute("data-help-tab");
    if (tabIndex === null) return;

    // Update segmented control buttons
    overlay.querySelectorAll("[data-help-tab]").forEach(function (btn) {
      btn.classList.remove("is-active");
      btn.setAttribute("aria-selected", "false");
    });
    tabBtn.classList.add("is-active");
    tabBtn.setAttribute("aria-selected", "true");

    // Update tab panels
    overlay.querySelectorAll(".maHelpTabPanel").forEach(function (panel) {
      panel.classList.remove("is-active");
    });

    var targetPanel = overlay.querySelector("#maHelpPanel-" + tabIndex);
    if (targetPanel) {
      targetPanel.classList.add("is-active");
    }
  }

  // ── Event delegation — open, close, backdrop, tabs, keyboard ──

  document.addEventListener("click", function (event) {
    var openBtn  = event.target.closest("[data-help-open]");
    var closeBtn = event.target.closest("[data-help-close]");
    var tabBtn   = event.target.closest("[data-help-tab]");

    if (openBtn) {
      event.preventDefault();
      show();
      return;
    }

    if (closeBtn) {
      event.preventDefault();
      hide();
      return;
    }

    if (tabBtn) {
      event.preventDefault();
      switchTab(tabBtn);
      return;
    }

    // Backdrop click — only close if the overlay itself was the direct target
    if (event.target && event.target.id === "maHelpOverlay") {
      hide();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      var overlay = getOverlay();
      if (overlay && overlay.classList.contains("is-open")) {
        hide();
      }
    }
  });

  window.MA = window.MA || {};
  window.MA.PageHelp = {
    show: show,
    hide: hide
  };

})();