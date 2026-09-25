# Game Tee Sheet Export — Template & Implementation Spec (v1)

Template: `templates/excel/MatchAid_GameTeeSheet_Template.xlsx`
Consumers (to be built): shared module `assets/modules/module_exportGameTeeSheet.js` → endpoint `api/shared/sharedapi_exportGameTeeSheet.php` → service `services/workflows/workflow_TeeSheet.php` (see §5)

## 1. Feature summary

- **Entry point:** a standalone module, so any page can offer it. Each page adds ACTIONS → a new first category **"Print"** → **"Print Tee Sheet"**. It starts on **Game Summary**; see §5.4 for the rollout order.
- **Access:** available to every user who can open a page that offers it. No admin gate.
- **No completeness gate:** the export is available at every stage of game setup (roster only, paired, partly or fully slotted). There is no prompt or confirmation. An incomplete sheet says so itself (§4.0).
- **Data freshness:** the export reads saved data from the database. The page that offers the menu item is responsible for making sure no unsaved changes are pending (§5.4). The module does not check this.
- **Output:** one `.xlsx` file, `MatchAid_TeeSheet_{GGID}.xlsx`, with two tabs:
  1. **By Playing Group** (active tab when opened)
  2. **By Individual**
- **Format:** portrait, Letter, fit to 1 page wide; the same heading repeats on every page in Excel, Google Sheets and Apple Numbers (§2). Users may reformat to taste in their own app.
- **Content scope:** logistics only (who, when, where). No sides, matches, pairings, handicaps or scoring format.

## 2. Template conventions (fixed capacity)

The template is **fit for purpose, with a fixed capacity**, in the same spirit as the point-scorecard templates. Every band and row up to capacity is pre-built and pre-styled in the workbook, and the export **never inserts or copies rows**. It only:
1. writes values into named cells
2. hides the unused bands and rows, and any columns that aren't needed
3. sets each sheet's print area to end at the last used row

Other conventions:
- All cells are addressed through **worksheet-scoped named ranges**, never hard-coded addresses. The template can be restyled and rearranged freely as long as the names survive.
- All sample values are placeholders. The export overwrites or clears every one.
- All data cells are formatted as **Text** (`@`), so hole `"1A"`, cart `"007"` and time `"07:36 AM"` stay exactly as written.
- Font: Arial 10, for Google Sheets and Apple Numbers compatibility.
- **The same output in every app:** there is **no Excel header or footer**, because Sheets and Numbers drop them on import. All heading content lives in rows 1–4. Those rows are both the **frozen panes** and Excel's **Print Titles**, so Excel, Sheets and Numbers all repeat the same heading on every printed page.
- **Portrait, Letter, fit to 1 page wide.** Users are expected to adjust formatting in their own spreadsheet app. The template is a good starting point, not a locked layout.
- **Capacity (v1):** 20 bands (40 groups, 160 players) on By Playing Group, and 160 rows on By Individual. If a game exceeds capacity, the export fails with a clear message (§5.2). To raise capacity, extend the pre-built rows, then extend `GroupBands` / `DetailRows` and the `Col_*` ranges to match.

### Heading rows (both tabs)
| Row | Name | Content |
|---|---|---|
| 1 | `Hdr_Title` (merged across) | Game title |
| 2 | `Hdr_SubLine` (merged across) | `[*Partial Tee Sheet • ]{course} • {date} • {start info}` (§4.1) |
| 3 | (none) | Thin spacer |
| 4 | (none) | Column headings |

### Sheet: `By Playing Group`
| Name | Address (v1) | Purpose |
|---|---|---|
| `GroupBand` | A5:I8 | Band 1: one row of **two** groups, 4 player lines each. Defines the band **height** (4 rows) and, via the `Band_*` names, the cell positions. |
| `GroupBands` | A5:I84 | All 20 pre-built bands (capacity). Shading alternates plain/shaded, band by band. |
| `Band_L_Time`, `Band_R_Time` | A5, F5 | Tee time (top line of the band) |
| `Band_L_Hole`, `Band_R_Hole` | B5, G5 | Start hole incl. suffix |
| `Band_L_Player1..4`, `Band_R_Player1..4` | C5:C8, H5:H8 | "Last, First" |
| `Band_L_Cart1..4`, `Band_R_Cart1..4` | D5:D8, I5:I8 | Cart number per player |
| `Col_L_Time`, `Col_R_Time` | A4:A84, F4:F84 | Columns hidden for Shotgun games |
| `Col_L_Cart`, `Col_R_Cart` | D4:D84, I4:I84 | Columns hidden when no cart data |

- Band *k* (0-based) occupies rows `top(GroupBand) + 4k … + 3`. Each cell's position is its `Band_*` cell plus `4k` rows.
- Column E is a narrow gutter between the left and right groups.
- **Page breaks are part of the template:** a manual break after every 10th band. Calibrated in Excel: with rows 1–4 repeating, exactly 10 bands fit per page. Adjust them in Page Break Preview after any restyle, keeping them **between** bands.

### Sheet: `By Individual`
| Name | Address (v1) | Purpose |
|---|---|---|
| `DetailRow` | A5:G5 | Row 1. **Column positions are read from this row.** |
| `DetailRows` | A5:G164 | All 160 pre-built rows (capacity). Shading alternates plain/shaded. |
| `Det_Player` | A5 | "Last, First" |
| `Det_TeeTime` | B5 | Tee time or `Cfg_EmptyValue`. Kept for Shotgun games too. |
| `Det_Hole` | C5 | Start hole incl. suffix, or `Cfg_EmptyValue` |
| `Det_Tee` | D5 | `dbPlayers_TeeSetName`, as stored |
| `Det_Cart` | E5 | Cart number |
| `Det_Flight` | F5 | Flight name |
| `Det_OtherPlayers` | G5 | Groupmates, "Last, First" joined with `" + "` |
| `Col_Cart`, `Col_Flight` | E4:E164, F4:F164 | Columns that can be hidden |

- No manual page breaks; single-line rows paginate naturally.

### Sheet: `Template Config`
This sheet is read by the export and then **removed** from the downloaded file. It also holds a short "how this template works" guide.

| Name | Default | Meaning |
|---|---|---|
| `Cfg_EmptyValue` | — | Tee Time / Hole placeholder for unslotted players on By Individual |

## 3. Data source and shared rules

**Source:** the service loads its own data. Nothing comes from the calling page.
- Players: `ServiceDbPlayers::getGamePlayers($ggid)`. This is `SELECT *`, so `dbPlayers_CartID` is picked up automatically once the column exists.
- `$ggid`: the session game, from `ServiceContextGame::getStoredGGID()`.
- Game row: `ServiceContextGame::getGameContext()`.
- Event row: looked up when `dbGames_EID` is set, for the flight check in §3.8.

**Data shaping lives in the roster service, built on the shared sort.** Add a new method, `ServiceGameRosterViews::buildGameTeeSheetView($players, $game, $teamsActive, $flightsActive)`, in `services/roster/service_GameRosterViews.php`. The goal is **one** sort and grouping, shared by the Summary page, the "Send Tee Sheet" email and this export, so that they cannot drift apart.

- **Ordering and grouping:** reuse the class's existing `sortForPlayingGroup()` and `groupByPlayerKey()`, the same code behind `buildByPlayingGroupView()`.
  - Call the sort with `$flightsActive = false`, which gives one flat list rather than flight sections. Flight is a column on the tee sheet, not a section (§3.8).
  - With flights off, the sort already orders by tee time (or hole, then suffix, for shotgun), then playing group. Match, side and pairing only decide the order inside a group. That is the tee sheet order.
  - The unslotted players end up in one group whose key is `"—"`. The tee sheet leaves it out of `groups` but keeps its players in `individuals`.
- **Game stage:** take it from `ma_getGameAdministrationStatus()` in `services/shared/ma_SharedBusLogic.php`. It holds the single definition of rostered, paired and slotted, and the "Send Tee Sheet" email uses the same function. Do not count players separately.
- **Tee-sheet-only additions:** "Last, First" (§3.1), other players (§4.3) and flight names (§3.8).
- **No rendering:** the method returns data only, with no Excel or HTML. The same convention as `buildByPlayingGroupView()`: the service shapes the data, and each consumer renders it.
- **Helpers:** it can use the class's existing private helpers (`parseTimeToMinutes()`, `formatTimeAmPm()`, `getFormattedStartHole()`, `resolveFlightName()`) directly. None need to become public.

**Two changes to shared roster-service code.** These also change the Summary page and the "Send Tee Sheet" email, so both must be retested:
1. **`sortForPlayingGroup()`:** for Tee Times games, add a start hole → suffix tie-break after tee time (§3.4). Split-tee games with the same time on holes 1 and 10 then sort by hole instead of by scorecard ID. This matches what Game Slotting already does.
2. **`formatTimeAmPm()`:** always read the time and re-format it to the zero-padded form "07:36 AM" (§3.6), rather than passing through stored text that already contains AM/PM. Stored times vary: Slotting writes "07:36 AM", while older rows can hold "7:36 AM". The visible format of padded rows is unchanged; only unpadded or 24-hour stored values change.

Suggested return shape:
```
[
  'isShotgun'   => bool,
  'startInfo'   => string,          // "Tee Times from 07:36 AM" | "Shotgun Start 08:30 AM"
  'showFlight'  => bool,
  'showCart'    => bool,
  'status'      => array,           // ma_getGameAdministrationStatus() result
  'isPartial'   => bool,            // slottedCount < totalPlayers
  'groups'      => [                // shared sort order (§3.4); "—" group excluded
    [ 'playerKey' => string, 'teeTime' => string, 'hole' => string /* §3.5 */,
      'players' => [ ['display' => 'Last, First', 'cart' => string], ... ] /* §3.2 order */ ],
  ],
  'individuals' => [                // sorted per §4.3; includes unslotted players
    [ 'display', 'teeTime', 'hole', 'tee', 'cart', 'flight', 'otherPlayers' /* already joined */ ],
  ],
]
```

### 3.1 Display name — "Last, First"
`dbPlayers_Name` is stored as "First Last" and `dbPlayers_LName` holds the last name only.

```
first = Name with a trailing LName removed (case-insensitive), trimmed
display = first !== "" ? "LName, first" : LName
fallback: if Name does not end with LName → display Name unchanged
```
Example: "C. Ryan Haffey" / "Haffey" → "Haffey, C. Ryan".

### 3.2 Playing group
- A playing group is all players sharing a non-empty `dbPlayers_PlayerKey`.
- A player is **unslotted** when `dbPlayers_PlayerKey` is empty. This is the definition used by `ma_getGameAdministrationStatus()`.
- **Order of players within a group:** inherited from the shared sort (match → side/team → `PairingID` → `PairingPos` → last name), so partners sit together. It is not redefined here.

### 3.3 Start method
Shotgun when `dbGames_TOMethod === "ShotGun"`; otherwise Tee Times.

### 3.4 Group sort order (By Playing Group)
Implemented by the shared `sortForPlayingGroup()`, called with flights off:
- **Tee Times:** tee time in minutes → start hole (numeric) → `dbPlayers_StartHoleSuffix`. The hole and suffix tie-break is the new addition from §3.
- **Shotgun:** start hole (numeric) → `dbPlayers_StartHoleSuffix`. This is existing behavior.
- **Then:** playing group, so that groups with identical time and hole still stay together.

The suffix is always part of the sort, so 2A comes before 2B.

### 3.5 Hole display
- **Shotgun:** always show `StartHole + StartHoleSuffix` (e.g. "1A" even when there is no "1B").
- **Tee Times:** show `StartHole` only.
- This is the rule already implemented by `ServiceGameRosterViews::getFormattedStartHole()`. Reuse it; do not add new logic. (Decided 2026-09-25: the earlier "hide A unless B exists" idea was dropped.)

### 3.6 Tee time display
- Uses the shared `formatTimeAmPm()`: parse to minutes, then format as `HH:MM AM`, zero-padded (e.g. "07:36 AM"), whatever the stored format is. This matches what Slotting, the Summary page and the email show today (decided 2026-09-25: keep "07:36 AM" everywhere for now).
- Because the formatter is shared, the Summary page and the email change the same way (§3).

### 3.7 Cart
- Source: `dbPlayers_CartID`. **This column does not exist yet** and will be added later.
- The export reads the value if present and writes it as text, unchanged.
- **Hide all Cart columns when no player in the game has a non-empty cart value.** This makes the feature switch on automatically once cart data exists, with no export change needed.

### 3.8 Flight
- Source: `dbPlayers_FlightKey`, resolved to a name via the game's `dbGames_FlightConfig`.
- Shown only on By Individual, and only when flights are active (`ServiceDbEvents::isDimensionActive("flight", …)`) and at least one player has a flight. Otherwise hide `Col_Flight`.

### 3.9 Tee
`dbPlayers_TeeSetName`, exactly as stored.

## 4. Fill rules

### 4.0 Game stage behavior (no gating)
The export always produces a file. The only errors are a game with no players, and a game larger than the template's capacity (§5.2). The stage comes from `ma_getGameAdministrationStatus()`, and **partial** means `slottedCount < totalPlayers`. The "*Partial Tee Sheet" label in the heading is the only completeness signal: there is no separate note row.

| Game stage | By Playing Group | By Individual | Partial label |
|---|---|---|---|
| Roster only | No bands: heading only | Everyone; Time/Hole = `Cfg_EmptyValue`; Other Players blank | Yes |
| Paired, not slotted | Same as roster only | Same as roster only. Other Players stays blank: it means players on the same scorecard ID, not pairing partners. | Yes |
| Partly slotted | The slotted groups | Everyone; unslotted players get `Cfg_EmptyValue` | Yes |
| Fully slotted | All groups | Everyone | No |

### 4.1 Heading (both tabs)
| Name | Value |
|---|---|
| `Hdr_Title` | `dbGames_Title` |
| `Hdr_SubLine` | `{partial}{course} • {date} • {start info}` |

- `{partial}` is `"*Partial Tee Sheet • "` when the export is partial (§4.0), otherwise empty. The wording matches the "*Partial Tee Sheet" marker on the "Send Tee Sheet" email, so a printed sheet and an emailed one for the same game say the same thing.
- `{course}` is `dbGames_CourseName`.
- `{date}` uses the same format as the scorecards: `Sat 10/03/26`.
- `{start info}`:
  - Tee Times: `Tee Times from {earliest slotted tee time}`. Falls back to `dbGames_PlayTime` if no one is slotted.
  - Shotgun: `Shotgun Start {dbGames_PlayTime}`.
  - Times are formatted per §3.6, e.g. "07:36 AM".

### 4.2 By Playing Group
1. **Read the layout:** band height = rows in `GroupBand`, capacity = rows in `GroupBands` ÷ band height, and each `Band_*` cell's column and row offset from `GroupBand`'s top row.
2. Take `groups` from `buildGameTeeSheetView()`, which is already sorted and excludes unslotted players. Bands needed = `ceil(groups / 2)`. If that exceeds capacity, fail (§5.2).
3. **Fill band *k*** (0-based): left half ← `g[2k]`, right half ← `g[2k+1]`. Each value goes at its `Band_*` cell + `4k` rows.
   - Time and hole go on the top line only.
   - Players 1–4 go on lines 1–4, with carts alongside.
   - Blank player lines stay blank (room for write-ins).
4. **Odd group count:** clear the last band's right half and remove its borders, so it reads as empty space.
5. **More than 4 players in a group:** slotting enforces a maximum of 4, so this is defensive only. Write the first 4 players and log a warning.
6. **Hide unused bands:** hide every row of bands `bands … capacity−1`. If there are no groups, all bands are hidden and the heading stands alone.
7. **Columns:**
   - Shotgun: hide `Col_L_Time` and `Col_R_Time`; the start time is in `Hdr_SubLine`.
   - Cart: hide `Col_L_Cart` and `Col_R_Cart` per §3.7.
8. **Print area:** `A1` to the last column of `GroupBands`, ending at the last row of the last used band (row 4 if there are no bands). The template's page breaks are left as they are. Any that fall after the print area simply have no effect.

### 4.3 By Individual
1. Rows: **every** player in the game, including unslotted ones. If that exceeds the rows in `DetailRows`, fail (§5.2).
2. **Sort:** `dbPlayers_LName` (case-insensitive) → the first-name part from §3.1 → `dbPlayers_PlayerGHIN` (stable tiebreak).
3. Player *i* (0-based) is written to row `top(DetailRow) + i`, at the columns of the `Det_*` names. Shading is already in the template.
4. **Values:**
   - Player, Tee and Flight per §3.
   - Tee Time and Hole per §3.5–3.6. For unslotted players, use `Cfg_EmptyValue`. Tee Time is **kept for Shotgun games**.
   - Cart per §3.7.
   - Other Players: other members of the same `PlayerKey`, "Last, First", sorted by LName, joined with `" + "`. Blank when unslotted.
5. **Hide** the unused rows of `DetailRows`, and hide `Col_Cart` / `Col_Flight` per §3.7 and §3.8.
6. **Print area:** `A1` to the last column of `DetailRows`, ending at the last written row.

### 4.4 Finish
- Remove the `Template Config` sheet and set the active sheet to `By Playing Group`.
- Leave Print Titles (rows 1–4), frozen panes (A5), page setup and page breaks as they are in the template.

## 5. Module, endpoint & page wiring

The tee sheet follows the same pattern as `recalculate_handicaps.js`, `addCalendar.js` and `player_notifications.js`: one shared module that each page loads and calls from its own ACTIONS menu.

### 5.1 Layers

| Layer | File | Role |
|---|---|---|
| JS module | `assets/modules/module_exportGameTeeSheet.js` | `MA.exportGameTeeSheet()`: a single request (fetch, then blob, then download), with status messages. Modeled on `downloadPointScorecards()` in `game_scorecards.js`. **Knows nothing about page state, and does no completeness check or prompt** (§4.0). |
| Route constant | `MA_ROUTE_API_GAME_TEE_SHEET` in `bootstrap.php` | `/api/shared/sharedapi_exportGameTeeSheet.php`. Each hosting page passes it to JS as `$paths["apiGameTeeSheet"]`. The module reads `MA.paths.apiGameTeeSheet` and falls back to the same literal address, the same pattern `recalculate_handicaps.js` uses with `MA.paths.apiGHIN`. |
| Endpoint | `api/shared/sharedapi_exportGameTeeSheet.php` | Thin wrapper: `ma_api_require_auth()`, GGID from the session, stream the xlsx. `api/shared/` is a **new directory** for APIs that back modules called from multiple pages. Files there use the `sharedapi_` prefix. |
| Workflow | `services/workflows/workflow_TeeSheet.php` → `exportGameTeeSheet(string $ggid): Spreadsheet` | Loads the data (§3), calls `buildGameTeeSheetView()`, and fills the template (§4). No HTTP concerns. The file is named for the **subject**; each action is one function inside it. |
| View builder | `services/roster/service_GameRosterViews.php` → `buildGameTeeSheetView()` | Data shaping only (§3). Shared by every output format. |
| Excel helpers | `api/lib/ExcelTemplate.php` | Small named-cell helpers (§5.3). |

**Naming convention: Game vs Event.**
- Everything scoped to a single game carries **"Game"** in its name: the module, endpoint, route constant, view builder, workflow function, template, spec and log key.
- The workflow **file** carries neither word, because it is the home for the tee sheet subject at both levels.
- This leaves a clean slot for a future consolidated **Event** tee sheet across rounds: `exportEventTeeSheet()` in the same `workflow_TeeSheet.php`, alongside `module_exportEventTeeSheet.js`, `sharedapi_exportEventTeeSheet.php` and `MatchAid_EventTeeSheet_Template.xlsx`.
- Future non-Excel actions on a game tee sheet (email attachment, HTML view, PDF) are added as further functions in `workflow_TeeSheet.php`, each built on `buildGameTeeSheetView()`.

### 5.2 Endpoint behavior
- Same response pattern as `exportPointScorecards.php`: xlsx body with `Content-Disposition: attachment`, and a JSON `{ ok:false, message }` with status 500 on error.
- Logs with `Logger::error('GAME_TEE_SHEET_EXPORT_FAIL', …)`.
- Error when the game has no players: "No players are enrolled in this game."
- Error when the game exceeds the template capacity, e.g. "This game has 44 playing groups; the tee sheet template holds 40." Raising capacity is a template edit (§2); no code change is needed.

### 5.3 Excel helpers
The fixed-capacity template needs only small helpers. They go in a new `api/lib/ExcelTemplate.php`:
- find a worksheet-scoped name and turn it into an address
- set a named cell's value
- read a named range's size (rows and columns), used for capacity and band height
- hide rows and hide columns
- set the print area

**No row insertion or copying.** `exportPointScorecards.php` already has private copies of the first two helpers. It is **left untouched in phase 1**, as part of the Scorecards deferral. It moves to the shared file when Scorecards gets its regression pass.

### 5.4 Page wiring and the unsaved-changes rule

The check for unsaved changes is **the page's job, not the module's**. Every page that offers the item:

1. Loads the module: `<script src="<?= ma_asset('/assets/modules/module_exportGameTeeSheet.js') ?>"></script>`, and adds `"apiGameTeeSheet" => MA_ROUTE_API_GAME_TEE_SHEET` to the page's `$paths`.
2. Adds the item as the first category in its `openActionsMenu()`:
   ```js
   { category: "Print" },
   { label: "Print Tee Sheet", action: onPrintTeeSheet, indent: true },
   ```
3. Owns the unsaved-changes check in `onPrintTeeSheet`, if the page can have unsaved changes while ACTIONS is visible. It shows the standard OK-only message and does not print:
   ```js
   async function onPrintTeeSheet() {
     if (state.dirty.size > 0) {
       await MA.ui.confirm({
         title: "Unsaved changes",
         message: "Save or cancel your changes before printing the tee sheet.",
         confirmLabel: "OK",
         okOnly: true
       });
       return;
     }
     MA.exportGameTeeSheet();
   }
   ```

| Page | Rollout | Unsaved-changes check needed? |
|---|---|---|
| Game Summary (`game_summary.js`) | **Phase 1 (first).** Read-only, and already uses the roster-service views. | No. `action: () => MA.exportGameTeeSheet()`. |
| Roster modal (`game_players_display.js`, Admin/Player Home) | Optional, alongside its planned move to the roster-service views. | No. Read-only. |
| Game Pairings (`game_pairings.js`) | Later. | **Yes.** ACTIONS stays visible while there are unsaved changes; use the OK-only message above. |
| Game Slotting (`game_slotting.js`) | **Deferred**, together with that page's regression pass. | No. ACTIONS is already hidden while there are unsaved changes. |
| Game Scorecards (`game_scorecards.js`) | **Deferred**, together with that page's regression pass. | No. Read-only. |
| Score Home (player-facing) | Only if players should be able to print. | No. |

For each page, adding the item is one script tag plus one menu item.

**Known difference until Scorecards is revisited:** the scorecard exports order groups by comparing the scorecard ID as text (`ServiceScoreCard::buildGroupIds()`), and that ID is random. The tee sheet orders groups by time or hole. Printed scorecards and tee sheets will not line up until scorecards adopt the shared sort.

### 5.5 Regression scope
- **New code (module, endpoint, workflow, `buildGameTeeSheetView()`, Excel helpers):** test the export against each game stage in §4.0, for both Tee Times and Shotgun games, with and without flights. Also test an odd group count, a game above 10 bands (to check the page break), and one over capacity (the error message). Open the result in Excel, Google Sheets and Apple Numbers.
- **Shared roster-service changes (§3: tee-time tie-break, time re-formatting):** retest the Game Summary page (all three tabs, CSV and clipboard) and the "Send Tee Sheet" email body.
- **Game Slotting and Game Scorecards pages:** untouched in phase 1.

## 6. Deferred: Cart number

`dbPlayers_CartID` is a planned 3-character text field, kept as text so leading zeros survive. Adding it requires:

- the DB column
- the save and load paths (`savePairings.php` payload and `normalizePlayers()` in `game_slotting.js`)
- a UI for entry on the slotting page

The template and export already reserve the Cart columns and hide them until data exists (§3.7).

Two notes on the future work:
- Cart-number entry lives on the slotting page, so it waits for that page's regression pass.
- Choose the column name with care. Score Home already has a `cartAssignments` concept, derived from `PairingID`/`PairingPos` (who rides together). Consider `dbPlayers_CartNumber` so the physical cart number is not confused with that pairing-based concept.

## 7. Known limits
- Manual page breaks are an Excel feature. Google Sheets and Apple Numbers ignore them and paginate on their own, so a group can split across pages there. The repeated heading (rows 1–4) still appears on every page in all three apps.
- The two-per-row group layout is static; changing fonts after download does not re-flow it. Users are expected to adjust formatting in their own app. The template is a good starting point.
- Capacity is fixed (40 groups / 160 players in v1). Raising it is a template edit (§2).
