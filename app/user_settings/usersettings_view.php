<?php
// /public_html/app/user_settings/usersettings_view.php
?>
<div class="maCards" id="usCards">

  <section class="maCard" aria-label="Profile and Contact">
    <header class="maCard__hdr">
      <div class="maCard__title">PROFILE & CONTACT</div>
    </header>

    <div class="maCard__body">
      <div class="usNote" id="usNote">
        These settings are used by your game administrator to contact you.
      </div>

      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel" for="usFName">First Name</label>
          <input id="usFName" class="maTextInput" type="text" maxlength="60" autocomplete="given-name" />
        </div>

        <div class="maField">
          <label class="maLabel" for="usLName">Last Name</label>
          <input id="usLName" class="maTextInput" type="text" maxlength="60" autocomplete="family-name" />
        </div>
      </div>

      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel" for="usEMail">Email</label>
          <input id="usEMail" class="maTextInput" type="email" maxlength="120" autocomplete="email" />
        </div>
      </div>

        <div class="maFieldRow">
        <div class="maField">
            <label class="maLabel" for="usMobilePhone">Mobile Phone</label>
            <input id="usMobilePhone" class="maTextInput" type="tel" maxlength="14" autocomplete="tel" placeholder="555-555-5555" />
        </div>

      <div class="maFieldRow">
        <div class="maField">
            <label class="maLabel" for="usMobileCarrier">Mobile Carrier</label>
            <select id="usMobileCarrier" class="maTextInput">
            <option value="">Select carrier</option>
            </select>
            <div class="usHint" id="usSmsHint"></div>
        </div>
        </div>

        <div class="maFieldRow">
        <div class="maField">
            <label class="maLabel" for="usContactMethod">Preferred Communications Method</label>
            <select id="usContactMethod" class="maTextInput">
            <option value="">Select method</option>
            </select>
        </div>
        </div>

        <div class="maFieldRow">
          <div class="maField">
            <label class="maLabel" for="usPreferenceYards">Preferred Playing Yardage (18 holes)</label>
            <select id="usPreferenceYards" class="maTextInput">
              <option value="">Select yardage</option>
            </select>
            <div class="usHint" id="usYardsHint">
              <strong>USGA Tee Selection Guidance:</strong>
              7-Iron Method— multiply your average 7-iron carry distance by 36 or
              Driver Method— multiply your average driver carry distance by 28.
            </div>
          </div>
        </div>
    </div>
  </section>

</div>