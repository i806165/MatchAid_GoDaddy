<!-- /app/game_slotting/gameslotting_view.php -->
<!DOCTYPE html>
<html lang="en">
<head>
  <?php require MA_INCLUDES . "/head.php"; ?>
  <link rel="stylesheet" href="/assets/css/game_slotting.css">
  <script>window.__MA_INIT__ = <?php echo json_encode($init); ?>;</script>
</head>
<body class="maPage--slotting">
  <?php require MA_INCLUDES . "/chrome_header.php"; ?>

  <main class="maPage maPage--multi">
    <div class="maPanels maPanels--2" id="gsTabPanels">
      
      <!-- PANEL: THE TRAY (Uncarded Blocks) -->
      <section class="maPanel gsTrayPanel" id="gsTrayPanel">
        <header class="maPanel__hdr">
          <div class="gpPanelHdr">
            <div class="gpPanelHdr__left gpMobileCloseBtn">
              <button class="iconBtn btnSecondary" type="button" aria-label="Close Tray">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div class="gpPanelHdr__title">UNCARDED</div>
            <div class="gpPanelHdr__actions">
              <div class="gpCount" id="gsTrayCount">0</div>
              <div class="gpMasterCheck" id="gsTrayMasterCheck"></div>
            </div>
          </div>
        </header>

        <div class="maPanel__controls">
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
              <div class="gpHint" id="gsTrayHint">Select blocks to slot.</div>
            </div>
            <div class="gpFooter__right">
              <button class="btn btnSecondary gpMobileAddBtn" id="gsBtnDrawerAssign" type="button">Assign</button>
              <button class="btn btnSecondary" id="gsBtnAssign" type="button">Assign &gt;&gt;</button>
            </div>
          </div>
        </footer>
      </section>

      <!-- PANEL: THE CANVAS (Physical Slots) -->
      <section class="maPanel maPanel--primary" id="gsCanvasPanel">
        <header class="maPanel__hdr">
          <div class="gpPanelHdr">
            <button class="iconBtn btnSecondary gpGlobalToggleBtn" id="gsBtnToggleAll" type="button" title="Collapse All">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <div class="gpPanelHdr__title">COURSE SLOTS</div>
            <div class="gpPanelHdr__actions">
              <button class="btn btnSecondary gpMobileAddBtn" id="gsBtnTrayOpen" type="button">Add to Slot</button>
            </div>
          </div>
        </header>

        <div class="maPanel__body maCards" id="gsCanvas">
          <!-- Slot Cards Rendered Here -->
        </div>
      </section>

    </div>
  </main>

  <?php require MA_INCLUDE . "/chrome_footer.php"; ?>

  <!-- Removal Confirmation Dialog -->
  <dialog id="gsConfirmDialog" class="maModal" style="max-width:320px;">
    <div class="maModal__body" style="padding:20px; text-align:center;">
      <p id="gsConfirmMsg">Remove this pairing from the slot?</p>
      <div class="maModal__ftrActions" style="margin-top:20px; justify-content:center;">
        <button class="btn btnSecondary" value="cancel" type="button">Cancel</button>
        <button class="btn btnPrimary" value="confirm" type="button">Remove</button>
      </div>
    </div>
  </dialog>

  <script src="/assets/pages/game_slotting.js"></script>
</body>
</html>