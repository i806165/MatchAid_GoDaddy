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

  <!-- CARD 3 — EVENT SCORING -->
  <section class="maCard" aria-label="Event Scoring">
    <header class="maCard__hdr">
      <div class="maCard__title">EVENT SCORING</div>
    </header>

    <div class="maCard__body">
      <div class="maFieldRow emTwoCol">
        <div class="maField">
          <label class="maLabel" for="emScoringMethod">Scoring Method</label>
          <select id="emScoringMethod" class="maTextInput">
            <option value="">Not configured</option>
            <option value="AggregatePoints">Aggregate Points</option>
            <option value="PlacementPoints">Placement Points</option>
            <option value="MatchPoints">Match Points</option>
            <option value="ManualPoints">Manual Points</option>
          </select>
        </div>

        <div class="maField">
          <label class="maLabel" for="emTiebreakMethod">Tiebreak Method</label>
          <select id="emTiebreakMethod" class="maTextInput">
            <option value="">Not configured</option>
            <option value="TotalEventPoints">Total Event Points</option>
            <option value="TeamPoints">Team Points</option>
            <option value="BestFinalRound">Best Final Round</option>
            <option value="MostRoundsPlayed">Most Rounds Played</option>
            <option value="ManualReview">Manual Review</option>
          </select>
        </div>
      </div>

      <div class="emScoringPreview" id="emScoringPreview"></div>
    </div>
  </section>

</div>
