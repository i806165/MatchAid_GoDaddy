<?php
// /public_html/app/event_maintenance/eventmaint_view.php
?>
<div class="maCards" id="emCards">

  <!-- CARD 1 — EVENT -->
  <section class="maCard" aria-label="Event">
    <header class="maCard__hdr">
      <div class="maCard__title">EVENT<span id="emEidLabel"></span></div>
    </header>

    <div class="maCard__body">
      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel" for="emTitle">Event Title</label>
          <input id="emTitle" class="maTextInput" type="text" maxlength="140" autocomplete="off" placeholder="Enter event title" />
        </div>
      </div>

      <div class="maFieldRow emTwoCol">
        <div class="maField">
          <label class="maLabel" for="emEventType">Event Type</label>
          <select id="emEventType" class="maTextInput">
            <option value="Tournament">Tournament</option>
            <option value="League">League</option>
            <option value="Interclub">Interclub</option>
            <option value="RyderCup">Ryder Cup</option>
            <option value="MemberMember">Member-Member</option>
            <option value="MemberGuest">Member-Guest</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div class="maField">
          <label class="maLabel" for="emFacilityName">Facility</label>
          <input id="emFacilityName" class="maTextInput" type="text" maxlength="140" autocomplete="off" placeholder="Facility name" />
        </div>
      </div>

      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel" for="emDescription">Description</label>
          <textarea id="emDescription" class="maTextInput emTextarea" rows="3" placeholder="Optional event notes"></textarea>
        </div>
      </div>
    </div>
  </section>

  <!-- CARD 2 — SCHEDULE -->
  <section class="maCard" aria-label="Schedule">
    <header class="maCard__hdr">
      <div class="maCard__title">SCHEDULE</div>
    </header>

    <div class="maCard__body">
      <div class="maFieldRow emTwoCol">
        <div class="maField">
          <label class="maLabel" for="emStartDate">Start Date</label>
          <input id="emStartDate" class="maTextInput" type="date" />
        </div>

        <div class="maField">
          <label class="maLabel" for="emEndDate">End Date</label>
          <input id="emEndDate" class="maTextInput" type="date" />
        </div>
      </div>

      <div class="emHint" id="emScheduleHint"></div>
    </div>
  </section>

  <!-- CARD 3 — EVENT SETTINGS -->
  <section class="maCard" aria-label="Event Settings">
    <header class="maCard__hdr">
      <div class="maCard__title">EVENT SETTINGS</div>
    </header>

    <div class="maCard__body">

      <!-- Pairing Mode removed — the on/off toggle now lives inside
           module_createEventPairings.js itself (Event Roster → Manage
           Pairings), bundled into that module's own Save. Team and
           Flight's mode toggles live inside their own modules the same
           way (Manage Teams / Define Flights). Event Maintenance no
           longer owns any cascade-mode field.

           HC Effectivity removed the same way — now owned by
           module_defineHandicapSettings.js (Event Roster → Define
           Handicaps), bundled with Method/Allowance/Mode into that
           module's own Apply. Event Maintenance no longer owns any
           handicap field at all. -->

      <!-- Event Competition -->
      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel">Event Competition</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
            <button id="emBtnDefineKPI" class="btn btnSecondary" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px;vertical-align:-2px;"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
              Configure Competitions
            </button>
            <span id="emKPICountLabel" class="emHint" style="margin:0;"></span>
          </div>
          <div class="emHint" id="emKPIHint" style="margin-top:6px;">No competitions configured for this event.</div>
        </div>
      </div>

    </div>
  </section>

</div>
