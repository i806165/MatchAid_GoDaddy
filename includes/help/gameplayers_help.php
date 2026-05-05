<?php
// /public_html/includes/help/gameplayers_help.php
declare(strict_types=1);

return [
    'title' => 'Game Players Help',
    'intro' => 'Manage the roster for this game — add, update, and remove players.',
    'tabs'  => [

        // ── OVERVIEW ──────────────────────────────────────────────────────────
        [
            'label'    => 'Overview',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'This page builds and manages the player roster for the game. Tee-set selection registers a player.  Tee assignments and handicaps help the administrator create pairings and matches more effectively down stream',
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Prerequisites',
                    'bullets' => [
                        'A game must be established before players can be added.',
                        'Game Settings may or may not be configured at this point. A roster can be built in advance of finalizing settings.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Game administrators may add players themselves on this page, or may have participants add themselves via the Player Portal.',
                        'Players must be added before building game pairings, matches, and tee times.',
                        'Use the Favorites tab for regular playing groups; use GHIN search for one-off additions; use Non-Rated for players without a GHIN number.',
                        'Use the Import tab to bring in players from an external source or from another game.',
                    ],
                ],
            ],
        ],

        // ── ROSTER ────────────────────────────────────────────────────────────
        [
            'label'    => 'Roster',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'The Roster tab displays all players who have been added to the game — by the game administrator or by the players themselves via the Player Portal.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        'Each row shows the player name, selected tee set, handicap index, course handicap, playing handicap, and shots off.',
                        'Player handicaps are calculated based on the ruleset chosen in Game Settings.',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Change a tee assignment — tap the player row to launch the tee-set picker and make changes.',
                        'Remove a player — tap the delete icon on any roster row. If the player is in a pairing, shot calculations are automatically recalculated.',
                        'Save / remove a favorite — tap the heart icon on any roster row to add or remove that player from your personal favorites list.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Removing a paired player triggers automatic recalculation but may leave incomplete pairing groups — review pairings after any roster change.',
                    ],
                ],
            ],
        ],

        // ── SELF ──────────────────────────────────────────────────────────────
        [
            'label'    => 'Self',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'A simple affordance to add yourself to the game. Your player record is pre-filled from your logged-in identity.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        'Each course tee set and its slope, rating, yardage and course handicap are pre-filled automatically.',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Add yourself — tap Add to trigger the tee picker and confirm your tee assignment before saving.',
                    ],
                ],
            ],
        ],

        // ── FAVORITES ─────────────────────────────────────────────────────────
        [
            'label'    => 'Favorites',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Displays your personally saved players list. Ideal for quickly adding regular playing groups to a game.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        [
                            'bullet'     => 'Player list — filterable by player name or by favorite group.',
                            'subbullets' => [
                                'Use the name filter to find a specific player quickly.',
                                'Use the group filter to show only players in a particular group.',
                            ],
                        ],
                        'Each row shows the player name, GHIN number, and handicap index.',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Add a single favorite — tap the add icon on any row to trigger the tee picker and confirm before saving.',
                        'Add multiple players — use Multi-Add mode to select multiple rows, then add them in one operation.',
                        [
                            'bullet'     => 'Automated tee set resolution rules.',
                            'subbullets' => [
                                'The tee-set used by the player the last time he/she played the course,',
                                'The tee-set with the yardage that is the closest to the yardage in the players app settings',
                                'The fallback tee-set chosen in the tee set selection is applied to any player whose tee cannot be resolved automatically.',
                                'Use Force Assign in the tee set picker to apply selected players to the same tee and override the rules',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Build favorite groups in advance for regular playing groups — batch add makes roster building fast.',
                    ],
                ],
            ],
        ],

        // ── GHIN ──────────────────────────────────────────────────────────────
        [
            'label'    => 'GHIN',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Search for and add any GHIN-registered player to the game. Use this tab for one-off additions or players not in your favorites list.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        'Search by player name, state abbreviation, or club.',
                        'Results show player name, GHIN number, handicap index, and home club.',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Search — enter the full spelling of the last name or GHIN.  First name, state and club are optional criteria.  Tap Search to retrieve results.',
                        'Add a player — tap the add icon on any search results row to trigger the tee picker.  Select tee set to enroll player to game.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Common names may return many results. Narrow results using state, first name or club.  Only US players supported',
                        'If a player does not appear in the results, confirm their GHIN number is active and their profile is not restricted.',
                        'Refer to Add Non-Rated tab if unable to locate player in GHIN',
                        'Once added, you may save the player to your favorites list from the Roster tab. Makes player enrollment faster later on.',
                    ],
                ],
            ],
        ],

        // ── NON-RATED ─────────────────────────────────────────────────────────
        [
            'label'    => 'Non-Rated',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Add a player who does not have a GHIN number. A synthesized number is assigned automatically.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        'Player name — enter the first and last name of the player.',
                        'Gender —  enter the gender of the player',
                        'Handicap index — enter a known/estimated index. Defaults to 0 if left blank.',
                        'Tee set selection panel generated from the recorded player information',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Add a non-rated player — complete the name fields and tap Add to trigger the tee picker and confirm before saving.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Enter a handicap index if known — accurate values will make pairing and scoring more effective.',
                        'Non-rated players use a synthesized player id.',
                    ],
                ],
            ],
        ],

        // ── IMPORT ────────────────────────────────────────────────────────────
        [
            'label'    => 'Import',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Bulk-add players from an external list or from the roster another game.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        [
                            'bullet'     => 'Import from external list — bulk-add players by entering or pasting GHIN numbers.',
                            'subbullets' => [
                                'Enter one GHIN number per line.',
                                'Validate the list before committing — invalid or unrecognised numbers are flagged.',
                            ],
                        ],
                        [
                            'bullet'     => 'Copy from existing game',
                            'subbullets' => [
                                'select a previous game to copy its entire roster.',
                            ],
                        ],
                        [
                            'bullet'     => 'Automated tee set resolution rules.',
                            'subbullets' => [
                                'The tee-set used by the player the last time he/she played the course,',
                                'The tee-set with the yardage that is the closest to the yardage in the players app settings',
                                'The fallback tee-set chosen in the tee set selection is applied to any player whose tee cannot be resolved automatically.',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Import from GHIN list — paste GHIN numbers, tap Validate, then tap Commit to add all valid players in one step.',
                        'Import from existing game — select a source game from the list, review the resolved roster, then confirm to import.',
                        'Force Assign — available in the tee picker during import to override the tee hierarchy and apply one tee to all players.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'When importing from an existing game, the tee hierarchy attempts to carry over previous tee assignments.',
                        'Use Force Assign to quickly apply one tee to the entire imported group when individual resolution is not needed.',
                    ],
                ],
            ],
        ],

    ],
];