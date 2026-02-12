<?php
// /public_html/app/game_pairings/gamepairings_view.php
// Pure markup only (no business logic).
?>

<!-- Tab Panels -->
<div class="gpTabPanels" id="gpTabPanels">

  <!-- Pair Players Tab -->
  <section class="gpTabPanel is-active" data-tab-panel="pair">
    <div class="maPanels maPanels--2">

      <!-- Secondary: Unpaired tray (Now on LEFT) -->
      <section class="maPanel maPanel--secondary gpTrayPanel" aria-label="Unpaired players tray">
        <header class="maPanel__hdr">
          <div class="gpPanelHdr">
            <div class="gpPanelHdr__title">Unpaired</div>
            <div class="gpPanelHdr__actions">
              <span class="gpCount" id="gpUnpairedCount"></span>
              <button class="maBtn maBtn--sm" type="button" id="gpBtnAssignToPairing">Assign &gt;&gt;</button>
            </div>
          </div>
        </header>
        <div class="maPanel__controls">
          <input class="maTextInput" id="gpUnpairedSearch" type="text" placeholder="Search" autocomplete="off" />
          <!-- Sort Control -->
          <div class="gpSortControl" id="gpUnpairedSort">
            <button class="gpSortBtn is-active" type="button" data-sort="lname">Name</button>
            <button class="gpSortBtn" type="button" data-sort="hi">HI</button>
            <button class="gpSortBtn" type="button" data-sort="ch">CH</button>
            <button class="gpSortBtn" type="button" data-sort="so">SO</button>
          </div>
        </div>
        <div class="maPanel__body">
          <div class="maListRows" id="gpUnpairedList"></div>
        </div>
        <footer class="maPanel__ftr">
          <div class="gpFooter">
            <div class="gpFooter__left" id="gpUnpairedFooterLeft"></div>
            <div class="gpFooter__right">
              <button class="maBtn maBtn--ghost" type="button" id="gpBtnClearTraySelection">Clear</button>
            </div>
          </div>
        </footer>
      </section>

      <!-- Primary: Pairings canvas (Now on RIGHT) -->
      <section class="maPanel maPanel--primary" aria-label="Pairings canvas">
        <header class="maPanel__hdr">
          <div class="gpPanelHdr">
            <div class="gpPanelHdr__title">Pairings</div>
            <div class="gpPanelHdr__actions">
            </div>
          </div>
        </header>
        <div class="maPanel__controls">
          <div class="gpHint" id="gpHintPair"></div>
        </div>
        <div class="maPanel__body">
          <div class="maCards" id="gpPairingsCanvas"></div>
        </div>
        <footer class="maPanel__ftr">
          <div class="gpFooter">
            <div class="gpFooter__left" id="gpPairFooterLeft"></div>
            <div class="gpFooter__right">
            </div>
          </div>
        </footer>
      </section>

    </div>
  </section>

  <!-- Match Pairings Tab -->
  <section class="gpTabPanel" data-tab-panel="match">
    <div class="maPanels maPanels--2">

      <!-- Secondary: Unmatched tray (Now on LEFT) -->
      <section class="maPanel maPanel--secondary gpTrayPanel" aria-label="Unmatched pairings tray">
        <header class="maPanel__hdr">
          <div class="gpPanelHdr">
            <div class="gpPanelHdr__title">Unmatched</div>
            <div class="gpPanelHdr__actions">
              <span class="gpCount" id="gpUnmatchedCount"></span>
              <button class="maBtn maBtn--sm" type="button" id="gpBtnAssignToFlight">Assign &gt;&gt;</button>
            </div>
          </div>
        </header>
        <div class="maPanel__controls">
          <input class="maTextInput" id="gpUnmatchedSearch" type="text" placeholder="Search" autocomplete="off" />
        </div>
        <div class="maPanel__body">
          <div class="maListRows" id="gpUnmatchedList"></div>
        </div>
        <footer class="maPanel__ftr">
          <div class="gpFooter">
            <div class="gpFooter__left" id="gpUnmatchedFooterLeft"></div>
            <div class="gpFooter__right">
              <button class="maBtn maBtn--ghost" type="button" id="gpBtnClearTraySelection2">Clear</button>
            </div>
          </div>
        </footer>
      </section>

      <!-- Primary: Matches canvas (Now on RIGHT) -->
      <section class="maPanel maPanel--primary" aria-label="Matches canvas">
        <header class="maPanel__hdr">
          <div class="gpPanelHdr">
            <div class="gpPanelHdr__title">Matches (Flights)</div>
            <div class="gpPanelHdr__actions">
            </div>
          </div>
        </header>
        <div class="maPanel__controls">
          <div class="gpHint" id="gpHintMatch"></div>
        </div>
        <div class="maPanel__body">
          <div class="maCards" id="gpFlightsCanvas"></div>
        </div>
        <footer class="maPanel__ftr">
          <div class="gpFooter">
            <div class="gpFooter__left" id="gpMatchFooterLeft"></div>
            <div class="gpFooter__right">
            </div>
          </div>
        </footer>
      </section>

    </div>
  </section>

</div>

<!-- Mobile Drawer (Tray) -->
<div class="maDrawerOverlay" id="gpDrawerOverlay" aria-hidden="true">
  <section class="maDrawer" role="dialog" aria-modal="true" aria-label="Tray">
    <header class="maPanel__hdr">
      <div class="gpPanelHdr">
        <div class="gpPanelHdr__title" id="gpDrawerTitle">Tray</div>
        <div class="gpPanelHdr__actions">
          <button class="maBtn maBtn--ghost" type="button" id="gpBtnCloseDrawer">Close</button>
        </div>
      </div>
    </header>
    <div class="maPanel__controls">
      <input class="maTextInput" id="gpDrawerSearch" type="text" placeholder="Search" autocomplete="off" />
    </div>
    <div class="maPanel__body">
      <div class="maListRows" id="gpDrawerList"></div>
    </div>
    <footer class="maPanel__ftr">
      <div class="gpFooter">
        <div class="gpFooter__left" id="gpDrawerFooterLeft"></div>
        <div class="gpFooter__right">
          <button class="maBtn maBtn--ghost" type="button" id="gpBtnDrawerClear">Clear</button>
        </div>
      </div>
    </footer>
  </section>
</div>
