<?php
// /public_html/includes/help/gamesettings_help.php
declare(strict_types=1);

return [
    'title' => 'Game Settings Help',
    'intro' => 'Configure scoring format, handicap rules, and competition structure.',
    'tabs'  => [
        [
            'label'    => 'Overview',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'This page controls the game format, game setup, handicapping and scoring. The settings page is organized into a 4-step wizard. A live Current Settings panel on the right shows your selections at all times. Complete all four steps and save before entering scores.',
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Prerequisites',
                    'bullets' => [
                        'The game shell must be saved in Game Maintenance before settings can be configured.',
                        'Settings should be established BEFORE competitive pairings/matches are defined in the pairings page.',
                        'Games can be set to where player pairings compete aganst the field of all players, or set to compete against one another in head to head match ups',
                        'Scoring can be set to calculate winners based on strokes, holes won, skins or points',
                        'Settings can be configured before or after player enrollment, however setting the game handicap rules make player enrollment more accurate',
                    ],
                ],
            ],
        ],
        [
            'label'    => 'Format',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Step 1 — Game Format',
                    'bullets' => [
                        [
                            'bullet'     => 'Pairing Strategy — how players compete against each other.',
                            'subbullets' => [
                                'Pair vs. Field: Pairings of 1-4 players compete against the entire field. Most common for casual games.',
                                'Pair vs. Pair: Pairings of 1-2 players compete head to head in match style play. This form of play can also be configured with segments where players rotate partners every 3 holes, 6 holes or 9 holes.',
                            ],
                        ],
                        [
                            'bullet'     => 'The type of game being played is driven by the Pairing Strategy.',
                            'subbullets' => [
                                'Stroke Play, Stableford, Match Play, Skins, Scramble, Shamble, Alt-Shot, or Chapman.',
                                'Compete in terms of Strokes, Points, Holes, or Skins.',
                            ],
                        ],
                    ],
                ],
            ],
        ],
        [
            'label'    => 'Setup',
            'sections' => [
                [
                    'icon'    => 'list',
                    'heading' => 'Step 2 — Setup',
                    'bullets' => [
                        [
                            'bullet'     => 'Segments (Pair vs. Pair only) — splits the round into independent scoring periods.',
                            'subbullets' => [
                                '3\'s: three 3-hole segments (9-hole games only).',
                                '6\'s: three 6-hole segments. 9\'s: two 9-hole segments (18-hole games).',
                            ],
                        ],
                        [
                            'bullet'     => 'Rotation Method (Pair vs. Pair only) — controls how pairs rotate opponents across segments.',
                            'subbullets' => [
                                'None: pairs play the same opponents throughout.',
                                'Carts-Opposites-Drivers (COD), 1-3-2-4, or 1-4-2-3: pairs rotate by position each segment.',
                            ],
                        ],
                        [
                            'bullet'     => 'Blind Player (Pair vs. Field only) — designates an enrolled player whose score fills an incomplete group.',
                            'subbullets' => [
                                'Configure the blind player and target group size here.',
                                'Use Apply Blind Player only after all scores have been entered in order to merge the blind players final scores into incomplete group(s).',
                            ],
                        ],
                    ],
                ],
            ],
        ],
        [
            'label'    => 'Scoring',
            'sections' => [
                [
                    'icon'    => 'score',
                    'heading' => 'Step 3 — Scoring',
                    'bullets' => [
                        [
                            'bullet'     => 'Scoring Method — whether handicaps are applied to scores.  Refer to Step-4',
                            'subbullets' => [
                                'NET: handicap-adjusted scores using Course handicap, or shots off, and handicap allowances.',
                                'GROSS: Raw scores, no handicap adjustments.',
                            ],
                        ],
                        [
                            'bullet'     => 'Scoring System — what scores are to be counted.',
                            'subbullets' => [
                                'All scores, Best N Balls on every hole, Best N Balls varied per hole',
                                'Balls counted discretionally, usually to achieve Best N balls per game',
                            ],
                        ],
                        [
                            'bullet'     => 'Points Strategy — available for Points-based scoring systems.',
                            'subbullets' => [
                                'Stableford: points awarded per hole based on score relative to par.',
                                '9\'s: a pool of 9 points distributed per hole by finish position.',
                                'Low-Ball / Low-Total or Low-Ball / High-Ball: two-category point systems (Pair vs. Pair only).',
                                'Vegas: combined two-digit scores determine points won or lost per hole (Pair vs. Pair only).',
                                'Chicago: each player has a quota based on handicap; the winner most exceeds their quota (Pair vs. Field only).',
                            ],
                        ],
                    ],
                ],
            ],
        ],
        [
            'label'    => 'Handicaps',
            'sections' => [
                [
                    'icon'    => 'people',
                    'heading' => 'Step 4 — Handicaps',
                    'bullets' => [
                        [
                            'bullet'     => 'Handicap Method — how handicap strokes are applied.',
                            'subbullets' => [
                                'CH with Allowance: Course handicap with allowance.',
                                'Shots-Off: handicap strokes given to players relative to the best player in the group.',
                            ],
                        ],
                        'Allowance — percentage of full handicap applied (100% down to 0% in 5% increments).',
                        [
                            'bullet'     => 'Stroke Distribution — how strokes are assigned for games set with segment rotations.',
                            'subbullets' => [
                                'Standard: strokes assigned as per the course scorecard.',
                                'Balanced: player strokes are redistributed evenly across rotational segments. ',
                                'Balanced-Rounded: player strokes are rounded up/down and redistributed across rotational segments.',
                            ],
                        ],
                        [
                            'bullet'     => 'HC Effectivity — which handicap index snapshot to use.',
                            'subbullets' => [
                                'Play Date: the index active on the day of the game.',
                                '3-Month Low, 6-Month Low, or 12-Month Low: the lowest index over the period.',
                                'Choose Date: the index active on the specific date selected.',
                            ],
                        ],
                    ],
                ],
            ],
        ],
        [
            'label'    => 'Tips',
            'sections' => [
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'The Current Settings panel on the right updates live as you move through each step — use it to confirm all selections before saving.',
                        'Configure settings before entering scores — changing the scoring system triggers a full recalculation on save.',
                        'Blind Player is configured in Step 2 but applied only after all scores are entered. Do not use Apply Blind Player mid-round.',
                        'For Points games, set the Points Strategy before score entry — the calculator uses these values for hole-by-hole results.',
                        'Pair vs. Field is the most common strategy for casual games. Use Pair vs. Pair when you want pairs to compete directly with segments and rotation.',
                    ],
                ],
            ],
        ],
    ],
];