<?php
// /public_html/app/game_maintenance/gamemaint_view.php
?>
  <div class="maCards" id="gmCards">

    <!-- CARD 1 — GAME -->
    <section class="maCard" aria-label="Game">
      <header class="maCard__hdr">
        <div class="maCard__title">GAME<span id="gmGgidLabel"></span></div>
        <div class="maCard__actions">
        </div>
      </header>

      <div class="maCard__body">

        <div class="maFieldRow">
          <div class="maField">
            <input id="gmTitle" class="maTextInput" type="text" maxlength="120" autocomplete="off" placeholder="Enter game title" />
          </div>
        </div>

        <div class="gmCourseRow" style="margin-top:12px;">
          <button type="button" class="gmCoursePicker" id="gmPickCourseBtn" aria-label="Choose course">
            <div class="gmCoursePickerContent">
              <div class="gmCourseLine1" id="gmCourseLine1">Click to choose course</div>
              <div class="gmCourseLine2" id="gmCourseLine2"></div>
            </div>
            <div class="gmCoursePickerChevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--brandColor3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </button>
          <button type="button" class="btn btnTentative" id="gmCourseConfirmBtn">Tentative</button>
        </div>


      </div>
    </section>

    <!-- CARD 2 — LOGISTICS -->
    <section class="maCard" aria-label="Logistics">
      <header class="maCard__hdr">
        <div class="maCard__title">LOGISTICS</div>
      </header>

      <div class="maCard__body">

        <div class="gmLogisticsTwoCol">

          <div class="gmLogisticsWhen">
            <div class="maField gmDateField">
              <label class="maLabel" for="gmPlayDate">Play Date</label>
              <input id="gmPlayDate" class="maTextInput" type="date" />
            </div>

            <div class="maField gmPlayTimeField">
              <label class="maLabel">Play Time</label>
              <div class="gmTimeRow">
                <select id="gmPlayHour" class="maTextInput gmTimeSel" aria-label="Hour"></select>
                <select id="gmPlayMin" class="maTextInput gmTimeSel" aria-label="Minute"></select>
                <select id="gmPlayAmpm" class="maTextInput gmTimeSel" aria-label="AM/PM">
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            <div class="maField gmHolesField">
              <label class="maLabel">Holes</label>
              <div class="gmChoiceRow" id="gmHolesRow" role="group" aria-label="Holes">
                <button type="button" class="gmChoiceBtn" data-value="All 18">All 18</button>
                <button type="button" class="gmChoiceBtn" data-value="F9">F9</button>
                <button type="button" class="gmChoiceBtn" data-value="B9">B9</button>
              </div>
            </div>
          </div>

          <div class="gmLogisticsDivider" aria-hidden="true"></div>

          <div class="gmLogisticsHow">
            <div class="maField gmLogisticsField gmLogisticsField--method">
              <label class="maLabel" for="gmTOMethod">Tee Off Method</label>
              <select id="gmTOMethod" class="maTextInput">
                <option value="TeeTimes">Tee Times</option>
                <option value="ShotGun">ShotGun</option>
              </select>
            </div>

            <div class="gmStepperRow">
              <div class="maField gmLogisticsField gmLogisticsField--count">
                <label class="maLabel" for="gmTeeCount" id="gmCountLabel">Tee Time Count</label>
                <div class="gmStepper">
                  <button type="button" class="btn btnTertiary gmStepBtn" data-step="-1" data-target="gmTeeCount" aria-label="Decrement">−</button>
                  <input id="gmTeeCount" class="maTextInput gmStepInput" type="number" min="1" max="50" step="1" />
                  <button type="button" class="btn btnTertiary gmStepBtn" data-step="1" data-target="gmTeeCount" aria-label="Increment">+</button>
                </div>
              </div>

              <div class="maField gmLogisticsField gmLogisticsField--interval" id="gmIntervalField">
                <label class="maLabel" for="gmTeeInterval" id="gmIntervalLabel">Tee Time Interval</label>
                <div class="gmStepper">
                  <button type="button" class="btn btnTertiary gmStepBtn" data-step="-1" data-target="gmTeeInterval" aria-label="Decrement">−</button>
                  <input id="gmTeeInterval" class="maTextInput gmStepInput" type="number" min="1" max="60" step="1" />
                  <button type="button" class="btn btnTertiary gmStepBtn" data-step="1" data-target="gmTeeInterval" aria-label="Increment">+</button>
                </div>
              </div>
            </div>

            <div class="gmHint" id="gmTeePreviewHint"></div>
          </div>

        </div>

      </div>
    </section>

    <!-- CARD 3 — VISIBILITY -->
    <section class="maCard" aria-label="Visibility">
      <header class="maCard__hdr">
        <div class="maCard__title">VISIBILITY</div>
      </header>

      <div class="maCard__body">
        <div class="maFieldRow">
          <div class="maField">
            <label class="maLabel">This game can be viewed by</label>
            <div class="gmChoiceRow" id="gmPrivacyRow" role="group" aria-label="Visibility">
              <button type="button" class="gmChoiceBtn" data-value="Only Me">Only Me</button>
              <button type="button" class="gmChoiceBtn" data-value="Players">Players</button>
              <button type="button" class="gmChoiceBtn" data-value="Buddies">Buddies</button>
              <button type="button" class="gmChoiceBtn" data-value="Club">Club</button>
            </div>
          </div>
        </div>
        <div class="gmHint" id="gmPrivacyHint"></div>
      </div>
    </section>

    <!-- (Hidden) HANDICAPS — keep DOM IDs for now so JS doesn’t break -->
    <section class="maCard" aria-label="Handicaps" style="display:none;">
      <header class="maCard__hdr">
        <div class="maCard__title">HANDICAPS</div>
        <div class="maCard__actions">
          <button type="button" class="btn btnSecondary" id="gmRefreshHcBtn">Refresh</button>
        </div>
      </header>
      <div class="maCard__body">
        <div class="maFieldRow">
          <div class="maField">
            <label class="maLabel">Effectivity</label>
            <div class="gmChoiceRow" id="gmHcEffRow" role="group" aria-label="Handicap Effectivity">
              <button type="button" class="gmChoiceBtn" data-value="Latest">Latest</button>
              <button type="button" class="gmChoiceBtn" data-value="Date">Date</button>
            </div>
          </div>

          <div class="maField">
            <label class="maLabel" for="gmHcDate">Effectivity Date</label>
            <input id="gmHcDate" class="maTextInput" type="date" />
          </div>
        </div>

        <div class="gmHint" id="gmHcHint"></div>
      </div>
    </section>

    <!-- CARD 4 — COMMENTS -->
    <section class="maCard" aria-label="Comments">
      <header class="maCard__hdr">
        <div class="maCard__title">COMMENTS</div>
      </header>
      <div class="maCard__body">
        <textarea id="gmComments" class="maTextArea" rows="4" placeholder="Optional notes…"></textarea>
      </div>
    </section>

  </div>


  <!-- Course Picker Modal -->
  <div id="gmCourseModal" class="maModalOverlay" aria-hidden="true">
    <div class="maModal" role="dialog" aria-modal="true" aria-label="Select Course">

      <header class="maModal__hdr">
        <div class="maModal__title">Select Course</div>
        <button type="button" class="iconBtn btnPrimary" id="gmCourseCloseBtn" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <div class="maModal__controls">
        <div class="maSeg" id="gmCourseTabs" role="tablist" aria-label="Course Tabs">
          <button type="button" class="maSegBtn is-active" data-tab="recent" role="tab" aria-selected="true">Recent</button>
          <button type="button" class="maSegBtn" data-tab="search" role="tab" aria-selected="false">Search</button>
        </div>

        <div id="gmCourseSearchControls" class="gmCourseSearchControls" style="display:none;">
          <div class="gmCourseSearchRow">
            <div class="maField">
              <label class="maLabel" for="gmSearchText">Facility / Course</label>
              <input id="gmSearchText" class="maTextInput" type="text" autocomplete="off" />
            </div>
            <div class="maField gmStateField">
              <label class="maLabel" for="gmSearchState">State</label>
              <input id="gmSearchState" class="maTextInput" type="text" maxlength="2" placeholder="NY" autocomplete="off" />
            </div>
            <div class="gmSearchBtnWrap">
              <button type="button" class="btn btnPrimary" id="gmSearchBtn">Search</button>
            </div>
          </div>
        </div>
      </div>

      <div class="maModal__body">
        <div class="gmListHdr">
          <div class="gmColFac">Facility</div>
          <div class="gmColCourse">Course</div>
          <div class="gmColCity">City</div>
        </div>

        <div id="gmCourseRows" class="maListRows" aria-label="Courses"></div>

        <div id="gmCourseEmpty" class="gmEmpty" style="display:none;">No courses found.</div>
      </div>
    </div>
  </div>
  <!-- Buddy Groups Modal -->
  <div id="gmBuddyGroupsModal" class="maModalOverlay" aria-hidden="true">
    <div class="maModal" role="dialog" aria-modal="true" aria-labelledby="gmBuddyGroupsTitle">

      <header class="maModal__hdr">
        <div class="maModal__title" id="gmBuddyGroupsTitle">Select buddy groups</div>
        <button type="button" class="iconBtn btnPrimary" id="gmBuddyGroupsCloseBtn" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <div class="maModal__controls">
        <button type="button" class="btn btnLink" id="gmBuddySelectAllBtn">Select all</button>
        <span id="gmBuddySelectedCount" style="font-size:11px;font-weight:800;color:var(--mutedText);"></span>
      </div>

      <div class="maModal__body maModal__body--flush" id="gmBuddyTagRows">
        <!-- Tag rows injected by JS -->
      </div>

      <footer class="maModal__ftr">
        <div class="maModal__ftrActions">
          <button type="button" class="btn btnPrimary" id="gmBuddyGroupsCancelBtn">Cancel</button>
          <button type="button" class="btn btnSecondary" id="gmBuddyGroupsApplyBtn">Apply</button>
        </div>
      </footer>

    </div>
  </div>