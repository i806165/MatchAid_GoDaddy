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
                    'body'    => 'This page controls how the game is scored and how handicaps are applied. Settings are organized into a 4-step wizard. A live Current Settings panel on the right shows your selections at all times. Complete all four steps and save before entering scores.',
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Prerequisites',
                    'bullets' => [
                        'The game shell must be saved in Game Maintenance before settings can be configured.',
                        'Settings can be configured before or after building the roster — however, having the roster in place first is recommended for Best Ball and points-based games.',
                        'If scores have already been entered, changing scoring settings will trigger a full recalculation on save.',
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
                                'Pair vs. Field: each pair competes against the entire field. Most common for casual games.',
                                'Pair vs. Pair: pairs compete directly against each other across segments.',
                            ],
                        ],
                        [
                            'bullet'     => 'Game Format — the type of game being played.',
                            'subbullets' => [
                                'Stroke Play, Stableford, Match Play, Skins, Scramble, Shamble, Alt-Shot, or Chapman.',
                                'The format determines the scoring basis (Strokes, Points, Holes, or Skins) used in subsequent steps.',
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
                                'COD, 1-3-2-4, or 1-4-2-3: pairs rotate by position each segment.',
                            ],
                        ],
                        [
                            'bullet'     => 'Blind Player (Pair vs. Field only) — designates an enrolled player whose score fills an incomplete group.',
                            'subbullets' => [
                                'Configure the blind player and target group size here.',
                                'Use Apply Blind Player only after all scores have been entered.',
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
                            'bullet'     => 'Scoring Method — whether handicaps are applied to scores.',
                            'subbullets' => [
                                'NET: handicap-adjusted scores.',
                                'GROSS: unadjusted scores.',
                            ],
                        ],
                        [
                            'bullet'     => 'Scoring System — what is counted per hole or per round.',
                            'subbullets' => [
                                'Best Ball, Total Score, Individual, or Points-based systems.',
                            ],
                        ],
                        'Best Ball Count — how many scores count per group per hole (Best Ball systems only).',
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
                        'Scores Per Hole — declare how many scores count on each hole individually. Use Set All to apply one value, then adjust specific holes as needed (select systems only).',
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
                            'bullet'     => 'HC Method — how handicap strokes are applied.',
                            'subbullets' => [
                                'CH with Allowance: strokes distributed hole-by-hole based on difficulty rating.',
                                'Shots-Off: strokes deducted from the total score.',
                            ],
                        ],
                        'Allowance — percentage of full handicap applied (100% down to 0% in 5% increments).',
                        [
                            'bullet'     => 'Stroke Distribution — how strokes are assigned across holes.',
                            'subbullets' => [
                                'Standard: strokes assigned by hole difficulty ranking.',
                                'Balanced: strokes trimmed and redistributed to spin holes.',
                                'Balanced-Rounded: same as Balanced with rounding applied.',
                            ],
                        ],
                        [
                            'bullet'     => 'HC Effectivity — which handicap index snapshot to use.',
                            'subbullets' => [
                                'Play Date: the index active on the day of the game.',
                                '3-Month Low, 6-Month Low, or 12-Month Low: the lowest index over the period.',
                                'Choose Date: a specific date you select.',
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