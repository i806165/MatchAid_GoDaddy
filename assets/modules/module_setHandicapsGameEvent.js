/* /assets/modules/module_setHandicapsGameEvent.js
 *
 * MA.setHandicapsGameEvent — Self-hydrating Handicap Settings editor.
 *
 * Supports two metadata owners:
 *   - target: "game"  → dbGames_* fields and Game/Round save endpoint
 *   - target: "event" → dbEvents_* fields, dbEvents_HandicapMode,
 *                       and Event save endpoint
 *
 * Public API:
 *
 *   MA.setHandicapsGameEvent.open({
 *     target: "game" | "event",
 *     onDone: function
 *   });
 *
 *   MA.setHandicapsGameEvent.close();
 *
 * The caller supplies only the target and completion callback.
 * Current values, identifying context, toggle visibility, hydration
 * endpoint, save endpoint, and payload shape are resolved internally.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;

  MA.setHandicapsGameEvent =
    MA.setHandicapsGameEvent || {};

  // ── Constants ────────────────────────────────────────────────────────

  const OVERLAY_ID =
    "maSetHandicapsGameEventOverlay";

  const NOTICE_ID =
    "sghNoticeSlot";

  /*
   * Confirm the Event hydration endpoint name against your live API.
   *
   * The Game endpoint already exists and is shared with the other
   * self-hydrating Game Settings modules.
   */
  const CONTEXT_ENDPOINTS = {
    game:
      "/api/game_settings/initGameSettings.php",

    event:
      "/api/event_roster/initEventHandicapSettings.php",
  };

  const SAVE_ENDPOINTS = {
    game:
      "/api/game_settings/saveGameHandicapSettings.php",

    event:
      "/api/event_roster/saveEventHandicapSettings.php",
  };

  const EFFECTIVITY_OPTIONS = [
    {
      value: "PlayDate",
      label: "Play Date",
    },
    {
      value: "Low3",
      label: "3-Month Low",
    },
    {
      value: "Low6",
      label: "6-Month Low",
    },
    {
      value: "Low12",
      label: "12-Month Low",
    },
    {
      value: "Date",
      label: "Choose Date",
    },
  ];

  // ── Module state ─────────────────────────────────────────────────────

  let _overlay = null;
  let _ctx = null;
  let _target = "game";
  let _onDone = null;
  let _onEsc = null;
  let _busy = false;
  let _lockDepth = 0;

  let _method = "CH";
  let _allowance = 100;
  let _effectivity = "PlayDate";
  let _effDate = "";
  let _mode = "none";

  // ── Helpers ──────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
    );
  }

  function safe(v) {
    return String(v ?? "").trim();
  }

  function isEventTarget() {
    return _target === "event";
  }

  function allowanceOptions() {
    const out = [];

    for (
      let value = 100;
      value >= 0;
      value -= 5
    ) {
      out.push(value);
    }

    return out;
  }

  function isValidEffectivity(value) {
    return EFFECTIVITY_OPTIONS.some(
      (option) =>
        option.value === value
    );
  }

  function _lockScroll(on) {
    _lockDepth = Math.max(
      0,
      _lockDepth + (on ? 1 : -1)
    );

    document.documentElement.classList.toggle(
      "maOverlayOpen",
      _lockDepth > 0
    );
  }

  function _showModalNotice(
    message,
    level
  ) {
    const slot =
      _overlay?.querySelector(
        `#${NOTICE_ID}`
      );

    if (!slot) {
      MA.setStatus?.(
        message,
        level
      );
      return;
    }

    if (
      MA.ui?.showModalNotice
    ) {
      MA.ui.showModalNotice(
        slot,
        {
          message,
          tone: level,
        }
      );
      return;
    }

    slot.textContent =
      message;
  }

  function _hideModalNotice() {
    const slot =
      _overlay?.querySelector(
        `#${NOTICE_ID}`
      );

    if (!slot) {
      return;
    }

    if (
      MA.ui?.hideModalNotice
    ) {
      MA.ui.hideModalNotice(
        slot
      );
      return;
    }

    slot.textContent = "";
  }

  // ── Context hydration ────────────────────────────────────────────────

  async function _fetchContext() {
    if (
      typeof MA.postJson !==
      "function"
    ) {
      throw new Error(
        "ma_shared.js not loaded (MA.postJson missing)."
      );
    }

    const endpoint =
      CONTEXT_ENDPOINTS[
        _target
      ];

    if (!endpoint) {
      throw new Error(
        `No context endpoint configured for target "${_target}".`
      );
    }

    const res =
      await MA.postJson(
        endpoint,
        {}
      );

    if (!res?.ok) {
      throw new Error(
        res?.message ||
          `Failed to load ${
            isEventTarget()
              ? "event"
              : "game"
          } handicap settings.`
      );
    }

    return (
      res.payload || {}
    );
  }

  function _hydrateState(ctx) {
    if (isEventTarget()) {
      const event =
        ctx.event || {};

      _method =
        event.dbEvents_HCMethod ===
        "SO"
          ? "SO"
          : "CH";

      _allowance =
        Number.isFinite(
          +event.dbEvents_Allowance
        )
          ? +event.dbEvents_Allowance
          : 100;

      _effectivity =
        isValidEffectivity(
          event.dbEvents_HCEffectivity
        )
          ? event.dbEvents_HCEffectivity
          : "PlayDate";

      _effDate = safe(
        event.dbEvents_HCEffectivityDate
      );

      _mode =
        event.dbEvents_HandicapMode ===
        "fixed"
          ? "fixed"
          : "none";

      return;
    }

    const game =
      ctx.game || {};

    _method =
      game.dbGames_HCMethod ===
      "SO"
        ? "SO"
        : "CH";

    _allowance =
      Number.isFinite(
        +game.dbGames_Allowance
      )
        ? +game.dbGames_Allowance
        : 100;

    _effectivity =
      isValidEffectivity(
        game.dbGames_HCEffectivity
      )
        ? game.dbGames_HCEffectivity
        : "PlayDate";

    _effDate = safe(
      game.dbGames_HCEffectivityDate
    );

    /*
     * Game/Round records do not own the
     * Event inheritance mode.
     */
    _mode = "none";
  }

  // ── Rendering ────────────────────────────────────────────────────────

  function _renderModal() {
    return `
      <section
        class="maModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sghTitle"
      >

        <header
          class="maModal__hdr${
            isEventTarget()
              ? " is-event-context"
              : ""
          }"
        >
          <div class="maModal__titles">
            <div
              class="maModal__title"
              id="sghTitle"
            >
              Define Handicaps
            </div>
          </div>

          <button
            type="button"
            class="iconBtn btnPrimary"
            id="sghBtnClose"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line
                x1="18"
                y1="6"
                x2="6"
                y2="18"
              ></line>

              <line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
              ></line>
            </svg>
          </button>
        </header>

        <div
          class="maModal__controls"
          id="sghControls"
        ></div>

        <div
          id="${NOTICE_ID}"
        ></div>

        <div class="maModal__body">

          ${_renderApplyToggle()}

          <div
            style="${
              isEventTarget()
                ? "border-top:1px solid var(--border); margin-top:12px; padding-top:12px;"
                : ""
            }"
          >
            ${_renderMethodField()}
            ${_renderAllowanceField()}
            ${_renderEffectivityField()}
          </div>

        </div>

        <footer class="maModal__ftr">
          <div class="maModal__ftrActions">

            <button
              type="button"
              class="maFtrBtn maFtrBtn--cancel"
              id="sghBtnCancel"
            >
              Cancel
            </button>

            <button
              type="button"
              class="maFtrBtn maFtrBtn--save"
              id="sghBtnApply"
            >
              Save
            </button>

          </div>
        </footer>

      </section>
    `;
  }

  function _renderApplyToggle() {
    if (!isEventTarget()) {
      return "";
    }

    const yesActive =
      _mode === "fixed";

    return `
      <div>

        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
          "
        >
          <span
            class="maListRow__col"
            style="
              flex:0 0 auto;
              white-space:nowrap;
            "
          >
            Apply to all rounds?
          </span>

          <div
            class="maSeg"
            id="sghModeToggle"
            style="
              width:auto;
              flex:0 0 auto;
            "
            role="group"
            aria-label="Apply this handicap configuration to all rounds"
          >

            <button
              type="button"
              class="maSegBtn${
                yesActive
                  ? " is-active-accent"
                  : ""
              }"
              data-mode="fixed"
              aria-pressed="${yesActive}"
            >
              Yes
            </button>

            <button
              type="button"
              class="maSegBtn${
                !yesActive
                  ? " is-active-accent"
                  : ""
              }"
              data-mode="none"
              aria-pressed="${!yesActive}"
            >
              No
            </button>

          </div>
        </div>

        <div
          class="maHintText"
          id="sghModeHint"
        >
          ${esc(
            _applyHintText()
          )}
        </div>

      </div>
    `;
  }

  function _applyHintText() {
    return _mode === "fixed"
      ? "This handicap configuration will apply to every round in this event."
      : "Each round can set its own handicap rules. Changing this does not refresh existing handicaps.";
  }

  function _renderMethodField() {
    return `
      <div
        style="margin-top:12px;"
      >
        <div
          style="
            font-size:11px;
            font-weight:700;
            color:var(--mutedText);
            margin-bottom:6px;
          "
        >
          Method
        </div>

        <div
          class="maChoiceChips"
          id="sghMethodChips"
          role="group"
          aria-label="Handicap method"
        >

          <button
            type="button"
            class="maChoiceChip${
              _method === "CH"
                ? " is-selected"
                : ""
            }"
            style="
              flex:1;
              text-align:center;
            "
            data-method="CH"
            aria-pressed="${
              _method === "CH"
            }"
          >
            CH with Allowance
          </button>

          <button
            type="button"
            class="maChoiceChip${
              _method === "SO"
                ? " is-selected"
                : ""
            }"
            style="
              flex:1;
              text-align:center;
            "
            data-method="SO"
            aria-pressed="${
              _method === "SO"
            }"
          >
            Shots-Off
          </button>

        </div>
      </div>
    `;
  }

  function _renderAllowanceField() {
    const options =
      allowanceOptions()
        .map(
          (value) => `
            <option
              value="${value}"
              ${
                value ===
                _allowance
                  ? "selected"
                  : ""
              }
            >
              ${value}%
            </option>
          `
        )
        .join("");

    return `
      <div
        style="margin-top:12px;"
      >
        <div
          style="
            font-size:11px;
            font-weight:700;
            color:var(--mutedText);
            margin-bottom:6px;
          "
        >
          Allowance
        </div>

        <select
          class="maTextInput"
          id="sghAllowanceSelect"
          style="
            width:100%;
            height:34px;
            font-size:13px !important;
          "
          aria-label="Allowance"
        >
          ${options}
        </select>
      </div>
    `;
  }

  function _renderEffectivityField() {
    const options =
      EFFECTIVITY_OPTIONS
        .map(
          (option) => `
            <option
              value="${esc(
                option.value
              )}"
              ${
                option.value ===
                _effectivity
                  ? "selected"
                  : ""
              }
            >
              ${esc(
                option.label
              )}
            </option>
          `
        )
        .join("");

    return `
      <div
        style="margin-top:12px;"
      >
        <div
          style="
            font-size:11px;
            font-weight:700;
            color:var(--mutedText);
            margin-bottom:6px;
          "
        >
          Handicap effective as of
        </div>

        <select
          class="maTextInput"
          id="sghEffectivitySelect"
          style="
            width:100%;
            height:34px;
            font-size:13px !important;
          "
          aria-label="Handicap effective as of"
        >
          ${options}
        </select>
      </div>

      <div
        id="sghEffDateWrap"
        style="
          margin-top:12px;
          display:${
            _effectivity === "Date"
              ? "block"
              : "none"
          };
        "
      >
        <div
          style="
            font-size:11px;
            font-weight:700;
            color:var(--mutedText);
            margin-bottom:6px;
          "
        >
          Date
        </div>

        <input
          type="date"
          class="maTextInput"
          id="sghEffDateInput"
          value="${esc(
            _effDate
          )}"
          style="
            width:100%;
            height:34px;
            font-size:13px !important;
            padding:0 8px;
          "
          aria-label="Handicap effective date"
        >
      </div>
    `;
  }

  function _renderControls() {
    const el =
      _overlay?.querySelector(
        "#sghControls"
      );

    if (!el || !_ctx) {
      return;
    }

    if (isEventTarget()) {
      const event =
        _ctx.event || {};

      const title = safe(
        event.dbEvents_Title ||
          `EID ${
            _ctx.eid || ""
          }`
      );

      const line1 = [
        title,
        `EID ${esc(
          _ctx.eid ?? ""
        )}`,
      ].join(" · ");

      const line2 = [
        event.dbEvents_StartDate,
        event.dbEvents_EndDate,
      ]
        .filter(Boolean)
        .join(" • ");

      const line3 = [
        event.dbEvents_FacilityName,
      ]
        .filter(Boolean)
        .join(" • ");

      el.innerHTML = `
        <div class="maListRow__col">
          ${esc(line1)}
        </div>

        ${
          line2
            ? `
              <div class="maListRow__subline">
                ${esc(line2)}
              </div>
            `
            : ""
        }

        ${
          line3
            ? `
              <div class="maListRow__subline">
                ${esc(line3)}
              </div>
            `
            : ""
        }
      `;

      return;
    }

    const game =
      _ctx.game || {};

    const title = safe(
      game.dbGames_Title ||
        `GGID ${
          _ctx.ggid || ""
        }`
    );

    const line1 = [
      title,
      `GGID ${esc(
        _ctx.ggid ?? ""
      )}`,
    ].join(" · ");

    const line2 = [
      game.dbGames_CourseName,
      game.dbGames_PlayDate,
    ]
      .filter(Boolean)
      .join(" • ");

    const line3 =
      game.dbGames_EID
        ? [
            game.dbEvents_Title,
            `EID ${
              game.dbGames_EID
            }`,
          ]
            .filter(Boolean)
            .join(" · ")
        : "";

    el.innerHTML = `
      <div class="maListRow__col">
        ${esc(line1)}
      </div>

      ${
        line2
          ? `
            <div class="maListRow__subline">
              ${esc(line2)}
            </div>
          `
          : ""
      }

      ${
        line3
          ? `
            <div class="maListRow__subline">
              ${esc(line3)}
            </div>
          `
          : ""
      }
    `;
  }

  // ── Event wiring ─────────────────────────────────────────────────────

  function _wireEvents() {
    if (!_overlay) {
      return;
    }

    _overlay
      .querySelector(
        "#sghBtnClose"
      )
      ?.addEventListener(
        "click",
        () => {
          if (!_busy) {
            _dismiss();
          }
        }
      );

    _overlay
      .querySelector(
        "#sghBtnCancel"
      )
      ?.addEventListener(
        "click",
        () => {
          if (!_busy) {
            _dismiss();
          }
        }
      );

    _overlay
      .querySelector(
        "#sghBtnApply"
      )
      ?.addEventListener(
        "click",
        _applyChanges
      );

    _overlay
      .querySelector(
        "#sghModeToggle"
      )
      ?.addEventListener(
        "click",
        (event) => {
          const button =
            event.target.closest(
              "[data-mode]"
            );

          if (
            !button ||
            _busy
          ) {
            return;
          }

          _mode =
            button.dataset.mode ===
            "fixed"
              ? "fixed"
              : "none";

          _refreshModeToggle();
        }
      );

    _overlay
      .querySelector(
        "#sghMethodChips"
      )
      ?.addEventListener(
        "click",
        (event) => {
          const chip =
            event.target.closest(
              "[data-method]"
            );

          if (
            !chip ||
            _busy
          ) {
            return;
          }

          _method =
            chip.dataset.method ===
            "SO"
              ? "SO"
              : "CH";

          _overlay
            .querySelectorAll(
              "#sghMethodChips [data-method]"
            )
            .forEach(
              (button) => {
                const selected =
                  button.dataset
                    .method ===
                  _method;

                button.classList.toggle(
                  "is-selected",
                  selected
                );

                button.setAttribute(
                  "aria-pressed",
                  String(selected)
                );
              }
            );
        }
      );

    _overlay
      .querySelector(
        "#sghAllowanceSelect"
      )
      ?.addEventListener(
        "change",
        (event) => {
          _allowance =
            parseInt(
              event.target.value,
              10
            ) || 0;
        }
      );

    _overlay
      .querySelector(
        "#sghEffectivitySelect"
      )
      ?.addEventListener(
        "change",
        (event) => {
          _effectivity =
            isValidEffectivity(
              event.target.value
            )
              ? event.target.value
              : "PlayDate";

          const wrap =
            _overlay?.querySelector(
              "#sghEffDateWrap"
            );

          if (wrap) {
            wrap.style.display =
              _effectivity ===
              "Date"
                ? "block"
                : "none";
          }
        }
      );

    _overlay
      .querySelector(
        "#sghEffDateInput"
      )
      ?.addEventListener(
        "change",
        (event) => {
          _effDate = safe(
            event.target.value
          );
        }
      );

    _overlay.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
            _overlay &&
          !_busy
        ) {
          _dismiss();
        }
      }
    );
  }

  function _refreshModeToggle() {
    const wrap =
      _overlay?.querySelector(
        "#sghModeToggle"
      );

    if (!wrap) {
      return;
    }

    wrap
      .querySelectorAll(
        "[data-mode]"
      )
      .forEach(
        (button) => {
          const selected =
            button.dataset.mode ===
            _mode;

          button.classList.toggle(
            "is-active-accent",
            selected
          );

          button.setAttribute(
            "aria-pressed",
            String(selected)
          );
        }
      );

    const hint =
      _overlay?.querySelector(
        "#sghModeHint"
      );

    if (hint) {
      hint.textContent =
        _applyHintText();
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────

  function _buildSaveBody() {
    const body = {
      method:
        _method,

      allowance:
        _allowance,

      effectivity:
        _effectivity,
    };

    if (
      _effectivity ===
      "Date"
    ) {
      body.effDate =
        _effDate;
    }

    if (isEventTarget()) {
      body.mode =
        _mode;
    }

    return body;
  }

  async function _applyChanges() {
    if (_busy) {
      return;
    }

    _busy = true;

    _hideModalNotice();

    MA.ui?.showBusy?.({
      title:
        "Define Handicaps",

      message:
        "Saving handicap settings — please wait...",
    });

    try {
      const endpoint =
        SAVE_ENDPOINTS[
          _target
        ];

      if (!endpoint) {
        throw new Error(
          `No save endpoint configured for target "${_target}".`
        );
      }

      const res =
        await MA.postJson(
          endpoint,
          _buildSaveBody()
        );

      if (!res?.ok) {
        _showModalNotice(
          res?.message ||
            "Unable to save handicap settings.",
          "danger"
        );

        return;
      }

      MA.ui?.notify?.(
        "Handicap settings saved.",
        "success"
      );

      /*
       * _dismiss() refuses to run while busy,
       * so release the flag before closing
       * after a successful save.
       */
      _busy = false;

      _dismiss();

    } catch (error) {
      console.error(
        "[MA.setHandicapsGameEvent]",
        error
      );

      _showModalNotice(
        error?.message ||
          "Error saving handicap settings.",
        "danger"
      );

    } finally {
      MA.ui?.hideBusy?.();

      _busy = false;
    }
  }

  // ── Exit and teardown ────────────────────────────────────────────────

  function _dismiss() {
    if (_busy) {
      return;
    }

    const done =
      _onDone;

    MA.setHandicapsGameEvent.close();

    if (
      typeof done ===
      "function"
    ) {
      done();
    }
  }

  MA.setHandicapsGameEvent.close =
    function () {
      if (_overlay) {
        _overlay.remove();
        _overlay = null;
      }

      if (_onEsc) {
        document.removeEventListener(
          "keydown",
          _onEsc
        );

        _onEsc = null;
      }

      _ctx = null;
      _onDone = null;
      _busy = false;

      _method = "CH";
      _allowance = 100;
      _effectivity = "PlayDate";
      _effDate = "";
      _mode = "none";

      _lockScroll(false);
    };

  // ── Public open ──────────────────────────────────────────────────────

  MA.setHandicapsGameEvent.open =
    async function (
      options = {}
    ) {
      if (_overlay) {
        MA.setHandicapsGameEvent.close();
      }

      _target =
        options.target ===
        "event"
          ? "event"
          : "game";

      _onDone =
        typeof options.onDone ===
        "function"
          ? options.onDone
          : null;

      _busy = false;

      MA.ui?.showBusy?.({
        title:
          "Define Handicaps",

        message:
          "Loading...",
      });

      try {
        _ctx =
          await _fetchContext();

        _hydrateState(
          _ctx
        );

      } catch (error) {
        MA.ui?.hideBusy?.();

        MA.setStatus?.(
          error?.message ||
            `Failed to load ${
              isEventTarget()
                ? "event"
                : "game"
            } handicap settings.`,
          "error"
        );

        return;
      }

      MA.ui?.hideBusy?.();

      _overlay =
        document.createElement(
          "div"
        );

      _overlay.id =
        OVERLAY_ID;

      _overlay.className =
        "maModalOverlay is-open";

      _overlay.setAttribute(
        "aria-hidden",
        "false"
      );

      _overlay.innerHTML =
        _renderModal();

      document.body.appendChild(
        _overlay
      );

      _lockScroll(true);

      _renderControls();
      _wireEvents();

      _onEsc =
        (event) => {
          if (
            event.key ===
              "Escape" &&
            !_busy
          ) {
            _dismiss();
          }
        };

      document.addEventListener(
        "keydown",
        _onEsc
      );
    };

})();