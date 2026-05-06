<?php
// /public_html/includes/help/playerhome_help.php
declare(strict_types=1);

return [
    'title' => 'Player Portal Help',
    'intro' => 'Find games, register to play, manage your tee set, and access scoring tools.',
    'tabs'  => [

        // ── OVERVIEW ──────────────────────────────────────────────────────────
        [
            'label'    => 'Overview',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'The Player Portal is your entry point to the games available for your to become part of. Players may search for, review, register and interact with the games in the list.',
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Prerequisites',
                    'bullets' => [
                        'Games in the list are pre-defined by various golf administrators. You may use the filter capabilities to adjust the games that appear in the list',
                        'Entry to Game Scoring may only occur once the Game Administrator has defined the pairings and the set the tee times.',
                        'A game may show as available even if registration rules, capacity, or timing affect whether you can join.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'The default list of games displays games from your Favorite Game Administrator. Use the Actions button to widen the filter criteria using pre-sets or using advanced criteria',
                        'Tap or click any game card — or the Manage button — to open the Game Action menu.',
                        'The Game Action menu offers the user the ability to quickly register for a game, or flag a Game Administrator as a Favorite.',
                        'The default view shows available upcoming games based on the current date window.',
                        'Use the Actions menu to quickly switch between My Upcoming Games, My Past Games Played, Games from Favorite Admins, and All Available Games.',
                        'Use Advanced List Filters when you need a specific date range or want to filter by game administrator.',
                    ],
                ],
            ],
        ],

        // ── GAMES LIST ────────────────────────────────────────────────────────
        [
            'label'    => 'Games List',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Each card represents one golf game. The card gives you the key details at a glance. Tap a card to see Manage interactions with the game.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        'Date badge — shows the month, day, and weekday for the game.',
                        'Game title and GGID — the game name and unique game identifier.',
                        'Course and facility — where the game is scheduled to be played.',
                        'Admin name — the person administering the game.',
                        'Play time and holes — the scheduled time and hole configuration.',
                        'Player count — shows how many players are currently registered compared with the available slots when slot count is known.',
                        'Handicap range — shows the range of player handicaps when available.',
                        'Registration status — shows whether the game is open, closed, locked, full, or otherwise unavailable.',
                        'Registered indicator — appears when you are already registered for the game.',
                        'Tee time and tee set — shown on the card when you are registered and that information is available.',
                        'Course not confirmed warning — appears when the game administrator has not yet confirmed the course.',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        [
                            'bullet'     => 'Game action menu — tap or click the card or Manage button to open actions for that game.',
                            'subbullets' => [
                                'Register for this Game — adds you to the game and lets you select a tee set.',
                                'Change your Tee Set — available when you are already registered.',
                                'Unregister yourself — removes you from the game when unregistering is allowed.',
                                'Add a Player or Guest — opens the Game Roster to allow you to enroll a player other than yourself.',
                                'Review Game Players — opens the game summary or player review view.',
                                'Open Scoring Portal — opens score entry after the Game Administrator has activated scoring.',
                                'Scoring Leaderboard — opens the scoring summary for the game.',
                                'Post Score to GHIN — launches GHIN score posting when available and not already posted.',
                                'Add Game to your Calendar — creates a calendar entry for the game.',
                                'Add or Remove Admin from Favorites — updates your favorite administrator list.',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Tagging Favorite admininstrators makes it easier to find games from the people or groups you play with most often.',
                        'If you are registered, the card shows your registered status and may show your tee time and tee set.',
                        'If the course is marked as "not confirmed", the game administrator has not yet confirmed Course and Game Times with the club. You may register for the game, but check back later to reconfirm course, times and tee selection.',
                    ],
                ],
            ],
        ],

        // ── FILTERS ───────────────────────────────────────────────────────────
        [
            'label'    => 'List Filters',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Filters control which games appear in your Player Portal list. Use quick presets for common views or Advanced List Filters for custom date and administrator selections.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Filter Presets',
                    'bullets' => [
                        [
                            'bullet'     => 'Actions menu presets.',
                            'subbullets' => [
                                'My Upcoming Games — shows games you are registered for from today forward.',
                                'My Past Games Played — shows your recent past games.',
                                'Games from my Favorite Admins — shows upcoming games created by administrators you have favorited.',
                                'All Available Games — shows available games in the current upcoming date window.',
                                'Advanced List Filters — opens the custom filter modal.',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Advanced Filters',
                    'bullets' => [
                        [
                            'bullet'     => 'Date tab.',
                            'subbullets' => [
                                'From / To — choose the date window for the games list.',
                                'Calendar buttons — open the native date picker for each field.',
                                'Apply — refreshes the list using the selected date range.',
                                'Cancel / Close — exits the modal without applying unsaved changes.',
                            ],
                        ],
                        [
                            'bullet'     => 'Admin tab.',
                            'subbullets' => [
                                'Search — narrows the administrator list by name.',
                                'Admin rows — tap an administrator to include or exclude that admin’s games.',
                                'Select All — selects or clears all administrators in the list.',
                                'Heart shortcut — selects your favorite administrators.',
                                'Heart icon on a row — adds or removes that administrator from your favorites.',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Apply — saves the filter selections and refreshes the games list.',
                        'Cancel — closes the filter modal and restores the previous filter state.',
                        'Switch tabs — use Date and Admin inside the modal to move between filter types.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'If you cannot find a game, first check the date range.',
                        'Use Games from my Favorite Admins when you usually play with the same groups or organizers.',
                        'Favorite admin changes are persistent and will be remembered for later sessions.',
                        'Advanced admin selections are not applied until you tap Apply.',
                    ],
                ],
            ],
        ],

        // ── REGISTRATION & SCORING ────────────────────────────────────────────
        [
            'label'    => 'Registration',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Registration adds you to a game roster with the tee set you select. Tee sets help the golf administrator arrange pairings more effectively.  Players may adjust their tee selections at any time.',
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Register for this Game — opens tee set selection and adds you to the roster.',
                        'Change your Tee Set — updates your selected tee set for a game you are already registered for.',
                        'Unregister yourself — removes you from the game when allowed.',
                        'Open Scoring Portal — opens score entry when your player scoring record is available.',
                        'Post Score to GHIN — submits your score when score posting is available.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Choose the tee set you expect to play so course handicap and scoring can be calculated correctly.',
                        'If you change tee sets, refresh or reopen the game card to confirm the new tee is shown.',
                        'Scoring and GHIN posting actions may not be available until after the administrator has completed setup.',
                        'Unregistering may be disabled when a game is closed, locked, or full-management actions have already started.',
                    ],
                ],
            ],
        ],

    ],
];