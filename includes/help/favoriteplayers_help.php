<?php
// /public_html/includes/help/favoriteplayers_help.php
declare(strict_types=1);

return [
    'title' => 'Favorite Players Help',
    'intro' => 'Build and manage your list of frequently used players.',
    'sections' => [
        [
            'icon'    => 'target',
            'heading' => 'Purpose',
            'body'    => 'Favorite Players lets you maintain a personal list of golfers (golfing buddies).  Estblishing Favorites allows you to organize players in order to make it faster to build game rosters and communicate with players.',
        ],
        [
            'icon'    => 'people',
            'heading' => 'Prerequisites',
            'bullets' => [
                'None',
            ],
        ],
        [
            'icon'    => 'list',
            'heading' => 'Key Fields',
            'bullets' => [
                'Player Name — the golfer name.',
                'GHIN — shown in masked form on the list for privacy.',
                'Email — optional contact information for the favorite player.',
                'Mobile / Phone — optional phone number for the favorite player.',
                'Local ID / Member ID — optional club or group-specific identifier.',
                'Groups — reusable labels that help organize favorites, such as Wednesday Group, Guests, Seniors, or Substitutes.',
                'Search Players — filters your favorites list by name or GHIN.',
                'Group Filter — limits the list to favorites assigned to a selected group.',
            ],
        ],
        [
            'icon'    => 'route',
            'heading' => 'Available Actions',
            'bullets' => [
                '+ Add New Favorite — opens GHIN search so you can select a player to add.',
                'Tap/click a favorite row — opens the edit form for that player.',
                'Delete icon — removes the player from your favorites list.',
                'Save — stores contact details, local ID, and group assignments.',
                'Cancel — exits the form without saving changes.',
                'Add Group — creates a new group label and assigns it to the current favorite.  A favorite can have multiple groups.',
                'Group chips — tap one or more chips to assign or remove the player from that group.',
            ],
        ],
        [
            'icon'    => 'tip',
            'heading' => 'Tips',
            'bullets' => [
                'Use groups to organize frequent playing pools, leagues, guest lists, or recurring game groups.',
                'A favorite can belong to more than one group.',
                'Deleting a favorite happens immediately, so use the delete icon carefully.',
                'When this page is launched from a roster/registration flow, Save or Cancel returns you to the calling page instead of the Favorites list.',
            ],
        ],
    ],
];