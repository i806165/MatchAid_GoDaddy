<?php
// /public_html/includes/help/playerhome_help.php
declare(strict_types=1);

return [
    'title' => 'Player Portal Help',
    'intro' => 'Find games, register to play and manage game day activities.',
    'tabs'  => [

        // ── OVERVIEW ──────────────────────────────────────────────────────────
        [
            'label'    => 'Overview',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'The Player Portal is your entry point for finding games, registering to play, seeing game details, and accessing scoring tools.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Page Layout',
                    'bullets' => [
                        'Games List — browse the game cards shown in the main part of the page. Each card represents one scheduled golf game.',
                        'Page Actions — use the Actions button to change which games are shown in the list.',
                        'Game Actions — tap a game card or Manage button to open actions for that specific game.',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'How to Use This Page',
                    'bullets' => [
                        'Start by using the Page Actions to narrow the list of games in the Game List.',
                        'Locate the game you want to view or manage. Review the information about the game presented in the game card ',
                        'Tap the game card to show the Game Actions menu in order to act on the selected game.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'The default list defaults to upcoming games you have previously registered for.',
                        'If you cannot find a game, check the date range and administrator filters in Page Actions.',
                        'Game administrators have the ability to control who may see his games; only himself, game players, his favorite players, or all club members. If you can not find a game, check with your game administrator.',
                    ],
                ],
            ],
        ],

        // ── GAME LIST ─────────────────────────────────────────────────────────
        [
            'label'    => 'Game List',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Each card represents one golf game. The card gives you the key details at a glance. Tap a card to open the Game Actions menu for that game.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'What the Card Shows',
                    'bullets' => [
                        'Date badge — shows the month, day, and weekday for the game.',
                        'Game title and GGID — the game name and unique game identifier.',
                        'Course and facility — where the game is scheduled to be played.',
                        'Admin name — the person or group administering the game.',
                        'Play time and holes — the scheduled time and hole configuration.',
                        'Player count — shows how many players are currently registered compared with the available slots when slot count is known.',
                        'Handicap range — shows the range of player handicaps when available.',
                        'Registration status — shows whether the game is open, closed, locked, full, or otherwise unavailable.',
                    ],
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Registered Player Details',
                    'bullets' => [
                        'Registered indicator — appears when you are already registered for the game.',
                        'Tee time — appear on the card after the player has registered for the game.',
                        'Tee set — appear on the card after the player has registered for the game.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Warnings and Status Messages',
                    'bullets' => [
                        'Course not confirmed — the game administrator has not yet confirmed the course or game timing with the club.',
                        'Closed, locked, full, or unavailable — registration or roster changes may be limited or disabled.',
                        'Scoring not available — scoring actions may be hidden until the game administrator activates scoring.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Tap the card or Manage button to open Game Actions for that game.',
                        'If the course is marked as not confirmed, check back later to reconfirm start time, course, and tee selection details.',
                    ],
                ],
            ],
        ],

        // ── PAGE ACTIONS ──────────────────────────────────────────────────────
        [
            'label'    => 'Page Actions',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Page Actions control which games appear in your Player Portal list. Use quick views for common lists or Advanced List Filters for custom date and administrator selections.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Quick Views',
                    'bullets' => [
                        'My Upcoming Games — shows games you are registered for from today forward 30 days.',
                        'My Past Games Played — shows your recently played games in the last 30 days.',
                        'Games from Followed Administrators — shows upcoming games created by administrators you follow or have marked as a favorite.',
                        'All Available Games — shows all available games for all golf administrators at the club ovr the next 30 days.',
                        'Advanced List Filters — opens the custom filter so you may select and filter what shows in the list of games.',
                    ],
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Advanced List Filters',
                    'bullets' => [
                        [
                            'bullet'     => 'Date filters.',
                            'subbullets' => [
                                'From / To — choose the date window for the games list.',
                                'Calendar buttons — open the native date picker for each field.',
                                'Apply — refreshes the list using the selected date range.',
                                'Cancel / Close — exits the modal without applying unsaved changes.',
                            ],
                        ],
                        [
                            'bullet'     => 'Administrator filters.',
                            'subbullets' => [
                                'Search — narrows the administrator list by name.',
                                'Admin rows — tap an administrator to include or exclude that administrator’s games.',
                                'Select All — selects or clears all administrators in the list.',
                                'Heart shortcut — selects your followed or favorite administrators.',
                                'Heart icon on a row — follows, favorites, unfollows, or removes that administrator from your favorites.',
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
                        'Make use of Followed Administrators to quickly find games from golf administrators you frequently play with.',
                        'If you cannot find a game, use the Advance Filter to verify the administrator and date range selections.',
                    ],
                ],
            ],
        ],

        // ── GAME ACTIONS ──────────────────────────────────────────────────────
        [
            'label'    => 'Game Actions',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Game Actions apply to one selected game. Tap a game card or the Manage button to open the actions available for that game.',
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Manage Registrations',
                    'bullets' => [
                        'Register for this Game — adds you to the game roster and lets you select a tee set.',
                        'Change your Tee Set — updates your selected tee set for a game you are already registered for.',
                        'Unregister yourself — removes you from the game when unregistering is allowed.',
                        'Add a Player or Guest — opens the game registration tool so you can enroll another player.',
                    ],
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Review a Game',
                    'bullets' => [
                        'Player Quick View — quickly review players or registration details for the selected game.',
                        'Review Game Details — review the game setup, course, timing, roster, or other available game details.',
                        'Review Game Players — opens the game summary page so you can review the entire game roster and setup.',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Use Game Tools',
                    'bullets' => [
                        'Add Game to your Calendar — creates a calendar entry for the game in your personal calendar- Apple, Google, AOL, Outlook, etc.',
                        'Follow or Unfollow Game Administrator — Toggles the selected game administrator as someone you follow/unfollow.',
                    ],
                ],
                [
                    'icon'    => 'target',
                    'heading' => 'Scoring Tools',
                    'bullets' => [
                        'Scoring Tools are available in the app. They are best used by the entire field of play.',
                        'Open Scoring Portal — opens the scoring portal to allow players to capture scores, see scorecards, leaderboard and skins.',
                        'Scoring Leaderboard — opens a direct link to the scoring leaderboard for the game.',
                        'Post Scores to GHIN — launches GHIN score posting when scores have been captured during play.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Scoring and GHIN posting actions may not appear until after the administrator has completed setup and activated scoring.',
                        'Unregistering may be disabled when a game is closed, locked, full, or when game-management actions have already started.',
                        'Some actions may be unavailable depending on your registration status, game timing, capacity, or administrator settings.',
                    ],
                ],
            ],
        ],

    ],
];
