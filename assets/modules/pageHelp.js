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

  document.addEventListener("click", function (event) {
    var openBtn  = event.target.closest("[data-help-open]");
    var closeBtn = event.target.closest("[data-help-close]");

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