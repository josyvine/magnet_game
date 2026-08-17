/* ==========================================================================
   GAME STATE MANAGER
   Finite State Machine (FSM) controlling all match transitions, turn flags,
   50-point scoring, 10-point milestone achievements, and state serialization.
   ========================================================================== */

class GameStateManager {
    // --- STATE DEFINITIONS ---
    static STATES = {
        MENU: 'MENU',
        READY: 'READY',
        PLAYER_AIM: 'PLAYER_AIM',
        PHYSICS_RUNNING: 'PHYSICS_RUNNING',
        SETTLING: 'SETTLING',
        AI_THINKING: 'AI_THINKING',
        ROUND_OVER: 'ROUND_OVER',
        GAME_OVER: 'GAME_OVER',
        PAUSED: 'PAUSED'
    };

    constructor() {
        this.currentState = GameStateManager.STATES.MENU;
        this.previousState = GameStateManager.STATES.MENU;

        // Match Scores & 50-Point Goal
        this.scoreP1 = 0;
        this.scoreAI = 0;
        this.currentRound = 1;
        this.maxPoints = GAME_CONFIG.POINTS_TO_WIN; // 50 Points

        // Milestone Achievement Trackers (10, 20, 30, 40, 50)
        this.p1Milestones = new Set();
        this.aiMilestones = new Set();
        this.lastMilestoneMessage = null;

        // Turn Ownership
        this.activeTurn = 'p1'; // 'p1' = Player 1 (Human), 'ai' = Gemini AI
        this.turnCount = 0;

        // Round & Game Results
        this.roundWinner = null;
        this.gameWinner = null;

        // State Change Event Listeners
        this.stateListeners = [];
    }

    /**
     * Subscribes a listener callback to state change events.
     * @param {Function} callback (newState, oldState, payload) => {}
     */
    onStateChange(callback) {
        if (typeof callback === 'function' && !this.stateListeners.includes(callback)) {
            this.stateListeners.push(callback);
        }
    }

    /**
     * Safely transitions the state machine to a new state.
     * @param {string} newState One of GameStateManager.STATES
     * @param {Object} payload Optional metadata associated with state transition
     */
    setState(newState, payload = {}) {
        if (this.currentState === newState) return;

        const oldState = this.currentState;
        this.previousState = oldState;
        this.currentState = newState;

        console.log(`[GameState] Transition: ${oldState} -> ${newState}`);

        // Notify all registered listeners
        for (let listener of this.stateListeners) {
            listener(newState, oldState, payload);
        }
    }

    /**
     * Retrieves current active state.
     * @returns {string}
     */
    getState() {
        return this.currentState;
    }

    /**
     * Toggles between PAUSED and previous active state.
     */
    togglePause() {
        if (this.currentState === GameStateManager.STATES.PAUSED) {
            this.setState(this.previousState);
        } else if (
            this.currentState === GameStateManager.STATES.PLAYER_AIM ||
            this.currentState === GameStateManager.STATES.PHYSICS_RUNNING ||
            this.currentState === GameStateManager.STATES.SETTLING ||
            this.currentState === GameStateManager.STATES.AI_THINKING
        ) {
            this.setState(GameStateManager.STATES.PAUSED);
        }
    }

    /**
     * Increments score for a player up to 50 points and evaluates 10-point milestones.
     * @param {'p1'|'ai'} player 
     * @param {number} points 
     * @returns {boolean} True if 50-point match won
     */
    awardPoints(player, points = 1) {
        if (this.currentState === GameStateManager.STATES.GAME_OVER) {
            return true; // Ignore further scoring if match is over
        }

        const oldScore = player === 'p1' ? this.scoreP1 : this.scoreAI;
        let newScore = oldScore + points;

        if (newScore > this.maxPoints) newScore = this.maxPoints;

        if (player === 'p1') {
            this.scoreP1 = newScore;
            this.checkMilestones('p1', oldScore, newScore);
        } else if (player === 'ai') {
            this.scoreAI = newScore;
            this.checkMilestones('ai', oldScore, newScore);
        }

        // Strict 50-Point Match Victory Evaluation
        if (this.scoreP1 >= this.maxPoints) {
            this.gameWinner = 'p1';
            return true;
        } else if (this.scoreAI >= this.maxPoints) {
            this.gameWinner = 'ai';
            return true;
        }
        
        return false;
    }

    /**
     * Checks if a player crossed a 10-point milestone threshold (10, 20, 30, 40, 50).
     * @param {'p1'|'ai'} player 
     * @param {number} oldScore 
     * @param {number} newScore 
     */
    checkMilestones(player, oldScore, newScore) {
        const interval = GAME_CONFIG.MILESTONE_INTERVAL || 10;
        const milestoneSet = player === 'p1' ? this.p1Milestones : this.aiMilestones;

        for (let m = interval; m <= this.maxPoints; m += interval) {
            if (oldScore < m && newScore >= m && !milestoneSet.has(m)) {
                milestoneSet.add(m);
                const playerName = player === 'p1' ? 'PLAYER 1' : 'GEMINI AI';
                this.lastMilestoneMessage = `${playerName} REACHED ${m} POINTS MILESTONE!`;
                
                console.log(`[GameState] MILESTONE UNLOCKED: ${this.lastMilestoneMessage}`);
                
                // Dispatch milestone notification payload
                this.setState(this.currentState, { 
                    milestoneTriggered: true, 
                    milestonePlayer: player, 
                    milestoneValue: m,
                    message: this.lastMilestoneMessage
                });
            }
        }
    }

    /**
     * Advances turn ownership to the other participant.
     */
    switchTurn() {
        this.activeTurn = this.activeTurn === 'p1' ? 'ai' : 'p1';
        this.turnCount++;
    }

    /**
     * Resets entire match state for a fresh 50-point game.
     */
    resetMatch() {
        this.scoreP1 = 0;
        this.scoreAI = 0;
        this.currentRound = 1;
        this.activeTurn = 'p1';
        this.turnCount = 0;
        this.roundWinner = null;
        this.gameWinner = null;
        this.p1Milestones.clear();
        this.aiMilestones.clear();
        this.lastMilestoneMessage = null;
    }

    /**
     * Advances to next round or starts a new match if previous 50-point match concluded.
     */
    nextRound() {
        if (this.gameWinner !== null || this.scoreP1 >= this.maxPoints || this.scoreAI >= this.maxPoints) {
            this.resetMatch();
            return;
        }

        this.currentRound++;
        this.roundWinner = null;
        this.activeTurn = (this.currentRound % 2 === 1) ? 'p1' : 'ai';
    }

    /**
     * Serializes authoritative physics body positions and board layout
     * into a clean JSON structure for Google Gemini API or local heuristic AI.
     * @param {MagnetBody} p1Magnet 
     * @param {MagnetBody} aiMagnet 
     * @returns {Object}
     */
    serializeForAI(p1Magnet, aiMagnet) {
        const dx = p1Magnet.x - aiMagnet.x;
        const dy = p1Magnet.y - aiMagnet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return {
            round: this.currentRound,
            turn: this.turnCount,
            scores: {
                player1: this.scoreP1,
                ai: this.scoreAI
            },
            distance: distance,
            board: {
                centerX: GAME_CONFIG.BOARD_CENTER_X,
                centerY: GAME_CONFIG.BOARD_CENTER_Y,
                radius: GAME_CONFIG.BOARD_RADIUS,
                centerObjectiveRadius: GAME_CONFIG.SCORE_CENTER_RADIUS
            },
            p1: {
                x: p1Magnet.x,
                y: p1Magnet.y,
                vx: p1Magnet.vx,
                vy: p1Magnet.vy,
                angle: p1Magnet.angle,
                angularVelocity: p1Magnet.angularVelocity,
                northPole: p1Magnet.getNorthPolePos(),
                southPole: p1Magnet.getSouthPolePos()
            },
            ai: {
                x: aiMagnet.x,
                y: aiMagnet.y,
                vx: aiMagnet.vx,
                vy: aiMagnet.vy,
                angle: aiMagnet.angle,
                angularVelocity: aiMagnet.angularVelocity,
                northPole: aiMagnet.getNorthPolePos(),
                southPole: aiMagnet.getSouthPolePos()
            }
        };
    }
}