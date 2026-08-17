/* ==========================================================================
   GAME_CONFIG & ASSET REGISTRY
   Synchronized with 50-Point Match Goal, Milestones, Docked Strike Fouls,
   and Rectangular Arena Image Bounds.
   ========================================================================== */

const GAME_CONFIG = {
    // --- CANVAS & RECTANGULAR ARENA COORDINATES ---
    WORLD_WIDTH: 800,
    WORLD_HEIGHT: 1100,        // Extended height to fill mobile screens
    BOARD_CENTER_X: 400,
    BOARD_CENTER_Y: 550,

    // Rectangular Arena Playable Inner Boundaries (Inside Wooden Frame Rim)
    ARENA_MIN_X: 45,
    ARENA_MAX_X: 755,
    ARENA_MIN_Y: 55,
    ARENA_MAX_Y: 1045,

    // --- PHYSICS CONSTANTS ---
    FIXED_DT: 1 / 60,          // 60 Hz deterministic physics timestep
    MAX_ACCUMULATOR: 0.25,     // Prevent spiral of death on lag spikes
    SUB_STEPS: 4,              // Micro-steps per physics frame for precision

    // --- MAGNET PROPERTIES ---
    MAGNET_RADIUS: 42,         // Collision circle radius
    MAGNET_MASS: 1.0,          // Base mass in kg
    MAGNET_INERTIA: 0.5 * 1.0 * (42 * 42), // I = 0.5 * m * r^2
    MAGNET_STRENGTH: 2000000,  // Dipole force multiplier
    MIN_DISTANCE: 42,          // Softening limit
    MAX_MAGNET_FORCE: 2800,    // Clamped force maximum (N)
    
    // --- TORQUE & ALIGNMENT ---
    TORQUE_STRENGTH: 140000,   // Angular dipole alignment multiplier
    MAX_TORQUE: 9500,          // Clamped torque maximum (N*px)

    // --- FRICTION & RESTITUTION ---
    SURFACE_FRICTION: 0.968,   // Balanced surface friction for smooth sliding and settling
    ANGULAR_DAMPING: 0.945,    // Rotational velocity decay per step
    RESTITUTION: 0.70,         // Bounciness during magnet-on-magnet collisions
    RIM_RESTITUTION: 0.60,     // Bounciness against arena outer wooden rim
    COLLISION_FRICTION: 0.35,  // Tangential friction during contact

    // --- SPEED LIMITS & STABILITY ---
    MAX_LINEAR_SPEED: 1300,    // Maximum velocity clamp (px/s)
    MAX_ANGULAR_SPEED: 20,     // Maximum rotation rate clamp (rad/s)

    // --- LAUNCH CONTROL (ANTI-EXPLOIT) ---
    MIN_LAUNCH_POWER: 90,
    MAX_LAUNCH_POWER: 950,
    POWER_DRAG_SCALE: 2.9,     // Pixel drag distance to velocity conversion
    MIN_START_DISTANCE: 140,   // Cannot launch within opponent proximity

    // --- SETTLING / SLEEP THRESHOLD ---
    SETTLE_VELOCITY_SQ: 2.5,   // Linear speed squared threshold (px/s)^2
    SETTLE_ANGULAR_VEL_SQ: 0.008, // Angular speed squared threshold (rad/s)^2
    SETTLE_TIME_REQUIRED: 0.40, // Seconds of quietude required to end turn

    // --- 50-POINT MATCH GOAL, MILESTONES & STRICT FOULS ---
    POINTS_TO_WIN: 50,         // Match Target: First to 50 points wins
    MILESTONE_INTERVAL: 10,    // Milestone triggers at 10, 20, 30, 40, 50 points
    SCORE_CENTER_RADIUS: 135,  // Enlarged center objective circle
    SCORE_PER_CENTER_CONTROL: 1,
    
    // Foul Penalties
    FOUL_OUT_OF_BOUNDS_SPEED: 650, // Slamming walls at excessive speed triggers Out-Of-Bounds Foul
    SCORE_FOUL_PENALTY_POINTS: 1,  // Opponent gains +1 point on Foul
    STRICT_DOCKED_STRIKE_FOUL: true // Striking a joined/snapped pair is ruled INVALID / FOUL
};

// --- ASSETS MATCHING YOUR EXACT DIRECTORIES ---
const ASSETS = {
    // Board
    board: 'board/board_texture.png',

    // Magnets
    puckBase: 'magnets/master.png',
    puckSelected: 'magnets/selected.png',
    puckWarning: 'magnets/warning.png',
    puckGhost: 'magnets/ghost.png',
    puckDragging: 'magnets/dragging.png',

    // Effects
    fieldBlue: 'effects/magnetic_field_blue.png',
    fieldRed: 'effects/magnetic_field_red.png',
    fieldWave: 'effects/magnetic_wave.png',
    dustExplosion: 'effects/dust.png',
    metalShards: 'effects/metal_fragments.png',
    lightningArcBlue: 'effects/electric_arc_blue.png',
    lightningArcRed: 'effects/electric_arc_red.png',
    glowBurstBlue: 'effects/glow_burst_blue.png',
    glowBurstOrange: 'effects/glow_burst_orange.png',
    spark: 'effects/spark.png',

    // Collision
    collisionSheet: 'collision/magnet_collision_sheet.png',

    // UI Panels & Banners
    badgeP1: 'ui/player_panel/player1_panel.png',
    badgeP2: 'ui/player_panel/player2_panel.png',
    badgeTurn: 'ui/turn_indicator/your_turn.png',
    bannerWin: 'ui/win_lose/you_win.png',
    bannerGameOver: 'ui/win_lose/game_over.png',

    // UI Buttons
    btnPlay: 'ui/buttons/play.png',
    btnPause: 'ui/buttons/pause.png',
    btnRobot: 'ui/buttons/vs_ai.png',
    btnSettings: 'ui/buttons/settings.png',
    btnAudio: 'ui/buttons/sound.png',
    btnBook: 'ui/buttons/how_to_play.png',
    btnShare: 'ui/buttons/share.png',
    btnBack: 'ui/buttons/back.png',
    btnMultiplayer: 'ui/buttons/two_players.png',
    btnOnline: 'ui/buttons/online.png'
};

Object.freeze(GAME_CONFIG);
Object.freeze(ASSETS);