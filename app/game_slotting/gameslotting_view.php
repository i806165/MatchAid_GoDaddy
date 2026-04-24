<?php
// /public_html/app/game_slotting/gameslotting_view.php
?>
  <div class="gpTabPanels" id="gsTabPanels">
    <div class="gpTabPanel is-active">

      <div class="maPanels maPanels--2">

        <!-- PANEL: THE TRAY (Unassigned Blocks) -->
        <section class="maPanel gsTrayPanel" id="gsTrayPanel">
          <header class="maPanel__hdr">
            <div class="gpPanelHdr">
              <div class="gpPanelHdr__left gpMobileCloseBtn">
                <button class="iconBtn btnSecondary" type="button" aria-label="Close Tray">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div class="gpPanelHdr__title">UNASSIGNED GROUPS</div>
              <div class="gpPanelHdr__actions">
                <div class="gpCount" id="gsTrayCount">0</div>
                <button class="btn btnSecondary" id="gsBtnAssign" type="button">Assign &gt;&gt;</button>
              </div>
            </div>
          </header>

          <div class="maPanel__controls">
            <div class="gpMasterCheck" id="gsTrayMasterCheck"></div>
            <div class="gpInputClearWrap">
              <input type="text" id="gsTraySearch" class="maTextInput" placeholder="Search pairings...">
              <button id="gsTraySearchClear" class="clearBtn isHidden" type="button">×</button>
            </div>
          </div>

          <div class="maPanel__body" id="gsTrayList">
            <!-- Competitive Blocks Rendered Here -->
          </div>

          <footer class="maPanel__ftr">
            <div class="gpFooter">
              <div class="gpFooter__left">
                <div class="gpHint" id="gsTrayHint">Select blocks to assign.</div>
              </div>
            </div>
          </footer>
        </section>

        <!-- PANEL: THE CANVAS (Physical Slots) -->
        <section class="maPanel maPanel--primary" id="gsCanvasPanel">
          <header class="maPanel__hdr">
            <div class="gpPanelHdr">
              <button class="iconBtn btnSecondary gpGlobalToggleBtn" id="gsBtnToggleAll" type="button" title="Collapse All">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <div class="gpPanelHdr__title">ASSIGNED GROUPS</div>
              <div class="gpPanelHdr__actions">
                <button class="btn btnSecondary gpMobileAddBtn" id="gsBtnTrayOpen" type="button">Add Slot</button>
              </div>
            </div>
          </header>

          <div class="maPanel__body maCards" id="gsCanvas">
            <!-- Slot Cards Rendered Here -->
          </div>
        </section>

      </div>
    </div>
  </div>

  <!-- Auto Slot Modal -->
  <dialog id="gsAutoSlotDialog" class="maModalOverlay">
    <section class="maModal gsAutoSlotModal" style="max-width:480px;">
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Auto Slot</div>
          <div class="maModal__subtitle" id="asSubtitle">0 Groups • 0 Golfers</div>
        </div>
        <button id="asBtnClose" class="closeBtn" type="button" aria-label="Close">×</button>
      </header>

      <div class="maModal__controls" id="asControls">
        <div class="maFieldRow" style="margin-top:0;">
          <div class="maField">
            <label class="maLabel" for="asSortOrder">Sort Order</label>
            <select id="asSortOrder" class="maTextInput"></select>
          </div>
        </div>
        <div id="asModeFields"></div>
        <div id="asMsg" class="gpHint" style="margin-top:10px;"></div>
      </div>

      <div class="maModal__body" id="asBody" style="display:none;">
        <div id="asPreviewSummary" class="asStackInfo" style="margin-bottom:10px;"></div>
        <div id="asPreviewList" class="maListRows"></div>
      </div>

      <footer class="maModal__ftr">
        <button id="asBtnCancel" class="btn btnSecondary" type="button">Cancel</button>
        <div class="maModal__ftrActions">
          <button id="asBtnRetry" class="btn btnSecondary" type="button" style="display:none;">Retry</button>
          <button id="asBtnRun" class="btn btnPrimary" type="button">Run</button>
          <button id="asBtnApply" class="btn btnPrimary" type="button" style="display:none;">Apply</button>
        </div>
      </footer>
    </section>
  </dialog>