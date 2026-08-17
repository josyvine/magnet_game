/* ==========================================================================
   TURN MANAGER
   Orchestrates round lifecycles, turn sequencing, physics-settling validation,
   50-point objective scoring evaluations, and Docked Pair Foul enforcement.
   Includes turn execution locks to prevent double-strike bugs.
   ========================================================================== */

class TurnManager {
    /**
     * @param {GameStateManager} gameState 
     * @param {PhysicsWorld} physicsWorld 
     * @param {MagnetBody} p1Magnet 
     * @param {MagnetBody} aiMagnet 
     * @param {Function} onTurnChangeCallback 
     */
    constructor(gameState, physicsWorld, p1Magnet, aiMagnet, onTurnChangeCallback) {
        this.gameState = gameState;
        this.world = physicsWorld;
        this.p1 = p1Magnet;
        this.ai = aiMagnet;
        this.onTurnChange = onTurnChangeCallback;

        this.aiThinking = false;
        this.settleCheckActive = false;
        this.isProcessingTurn = false; // Strict execution lock (prevents double strikes)
        this.wasDockedAtStart = false; // Tracks if magnets were snapped together at launch start
        this.aiWatchdogTimer = null;
    }

    /**
     * Sets up initial round layout with magnets positioned on opposite ends of rectangular arena.
     */
    initRoundLayout() {
        if (this.aiWatchdogTimer) {
            clearTimeout(this.aiWatchdogTimer);
            this.aiWatchdogTimer = null;
        }
        this.aiThinking = false;
        this.settleCheckActive = false;
        this.isProcessingTurn = false;
        this.wasDockedAtStart = false;

        const cx = GAME_CONFIG.BOARD_CENTER_X; // 400
        const cy = GAME_CONFIG.BOARD_CENTER_Y; // 550

        // Player 1 (Blue) spawns at bottom
        this.p1.setPosition(cx, cy + 370, -Math.PI / 2);

        // Gemini AI (Red) spawns at top
        this.ai.setPosition(cx, cy - 370, Math.PI / 2);

        this.world.wakeAll();
        this.world.isSettled = true;

        if (this.gameState.activeTurn === 'p1') {
            this.gameState.setState(GameStateManager.STATES.PLAYER_AIM);
        } else {
            this.triggerAITurn();
        }
    }

    /**
     * Detects if magnets are currently snapped together in physical contact ($N \leftrightarrow S$).
     * @returns {boolean}
     */
    checkMagnetDockedState() {
        const dist = Math.hypot(this.p1.x - this.ai.x, this.p1.y - this.ai.y);
        return dist <= (GAME_CONFIG.MAGNET_RADIUS * 2.15);
    }

    /**
     * Called when human player launches their magnet via touch/mouse drag.
     * @param {number} launchAngle 
     * @param {number} launchPower 
     */
    executeHumanLaunch(launchAngle, launchPower) {
        if (this.isProcessingTurn) return; // Lock check
        if (this.gameState.getState() !== GameStateManager.STATES.PLAYER_AIM ||
            this.gameState.activeTurn !== 'p1') {
            return;
        }

        this.isProcessingTurn = true;
        // Check if launching into a docked/snapped pair
        this.wasDockedAtStart = this.checkMagnetDockedState();

        const impulseX = Math.cos(launchAngle) * launchPower;
        const impulseY = Math.sin(launchAngle) * launchPower;

        this.p1.applyImpulseAtPoint(impulseX, impulseY, this.p1.x, this.p1.y);

        this.world.wakeAll();
        this.settleCheckActive = true;
        this.gameState.setState(GameStateManager.STATES.PHYSICS_RUNNING);
    }

    /**
     * Requests a move from Google Gemini (or local heuristic fallback) and applies it to the AI magnet.
     * Guaranteed single-execution via strict turn lock and watchdog timer.
     */
    async triggerAITurn() {
        if (this.isProcessingTurn) return; // Lock check
        if (this.gameState.getState() === GameStateManager.STATES.GAME_OVER) return;

        this.isProcessingTurn = true;
        this.gameState.setState(GameStateManager.STATES.AI_THINKING);
        this.aiThinking = true;

        // Watchdog: If AI takes more than 4 seconds, force a physical shot
        if (this.aiWatchdogTimer) clearTimeout(this.aiWatchdogTimer);
        this.aiWatchdogTimer = setTimeout(() => {
            if (this.aiThinking && this.gameState.getState() === GameStateManager.STATES.AI_THINKING) {
                console.warn('[TurnManager] AI Watchdog timeout triggered. Forcing emergency shot.');
                this.executeEmergencyShot();
            }
        }, 4000);

        const serializedState = this.gameState.serializeForAI(this.p1, this.ai);
        const settings = StorageManager.load();

        try {
            await new Promise(res => setTimeout(res, 500));

            if (this.gameState.getState() !== GameStateManager.STATES.AI_THINKING) {
                if (this.aiWatchdogTimer) clearTimeout(this.aiWatchdogTimer);
                this.isProcessingTurn = false;
                return;
            }

            // Check if launching into a docked/snapped pair
            this.wasDockedAtStart = this.checkMagnetDockedState();

            const move = await GeminiClient.requestMove(
                serializedState,
                settings.geminiApiKey,
                settings.selectedModel,
                settings.aiDifficulty
            );

            if (this.aiWatchdogTimer) clearTimeout(this.aiWatchdogTimer);

            console.log('[TurnManager] AI Executing Single Move:', move);

            const impulseX = Math.cos(move.launchAngle) * move.launchPower;
            const impulseY = Math.sin(move.launchAngle) * move.launchPower;

            this.ai.applyImpulseAtPoint(impulseX, impulseY, this.ai.x, this.ai.y);

            this.world.wakeAll();
            this.settleCheckActive = true;
            this.aiThinking = false;
            this.gameState.setState(GameStateManager.STATES.PHYSICS_RUNNING);

        } catch (err) {
            console.error('[TurnManager] AI execution error:', err);
            if (this.aiWatchdogTimer) clearTimeout(this.aiWatchdogTimer);
            this.executeEmergencyShot();
        }
    }

    /**
     * Emergency fallback impulse so the game never freezes if an API call fails.
     */
    executeEmergencyShot() {
        this.aiThinking = false;
        const angleToCenter = Math.atan2(
            GAME_CONFIG.BOARD_CENTER_Y - this.ai.y,
            GAME_CONFIG.BOARD_CENTER_X - this.ai.x
        );
        this.ai.applyImpulseAtPoint(
            Math.cos(angleToCenter) * 450,
            Math.sin(angleToCenter) * 450,
            this.ai.x,
            this.ai.y
        );
        this.world.wakeAll();
        this.settleCheckActive = true;
        this.gameState.setState(GameStateManager.STATES.PHYSICS_RUNNING);
    }

    /**
     * Called every physics tick to check if movement has ceased and evaluate round scoring.
     */
    update() {
        if (!this.settleCheckActive) return;

        if (this.world.isSettled) {
            this.settleCheckActive = false;
            this.gameState.setState(GameStateManager.STATES.SETTLING);
            this.evaluateTurnEnd();
        }
    }

    /**
     * Evaluates board dominance, enforces Docked Pair Violation rules, and awards 50-point goal progression.
     */
    evaluateTurnEnd() {
        if (this.gameState.getState() === GameStateManager.STATES.GAME_OVER) return;

        const cx = GAME_CONFIG.BOARD_CENTER_X;
        const cy = GAME_CONFIG.BOARD_CENTER_Y;
        const scoreRadius = GAME_CONFIG.SCORE_CENTER_RADIUS; // 135px

        const p1DistToCenter = Math.hypot(this.p1.x - cx, this.p1.y - cy);
        const aiDistToCenter = Math.hypot(this.ai.x - cx, this.ai.y - cy);

        // --- DOCKED PAIR STRIKE VIOLATION CHECK ---
        if (this.wasDockedAtStart && GAME_CONFIG.STRICT_DOCKED_STRIKE_FOUL) {
            console.warn('[TurnManager] DOCKED PAIR STRIKE VIOLATION! Point ruled invalid.');
            this.wasDockedAtStart = false;

            // Trigger HUD Foul Alert
            this.gameState.setState(this.gameState.currentState, {
                foulTriggered: true,
                foulMessage: 'INVALID STRIKE! Striking a joined pair is a Foul!'
            });

            // Release turn lock and cycle to next turn without awarding center control points
            this.finishTurnCycle();
            return;
        }

        this.wasDockedAtStart = false;

        // --- LEGAL CENTER DOMINANCE SCORING CHECK ---
        if (p1DistToCenter <= scoreRadius && p1DistToCenter < aiDistToCenter) {
            const isMatchOver = this.gameState.awardPoints('p1', GAME_CONFIG.SCORE_PER_CENTER_CONTROL);
            if (isMatchOver) {
                this.concludeMatch('p1');
                return;
            }
        } else if (aiDistToCenter <= scoreRadius && aiDistToCenter < p1DistToCenter) {
            const isMatchOver = this.gameState.awardPoints('ai', GAME_CONFIG.SCORE_PER_CENTER_CONTROL);
            if (isMatchOver) {
                this.concludeMatch('ai');
                return;
            }
        }

        this.finishTurnCycle();
    }

    /**
     * Releases turn lock and hands off control to the next participant.
     */
    finishTurnCycle() {
        this.isProcessingTurn = false;

        if (this.gameState.getState() === GameStateManager.STATES.GAME_OVER) return;

        this.gameState.switchTurn();

        if (typeof this.onTurnChange === 'function') {
            this.onTurnChange(this.gameState.activeTurn);
        }

        if (this.gameState.activeTurn === 'p1') {
            this.gameState.setState(GameStateManager.STATES.PLAYER_AIM);
        } else {
            this.triggerAITurn();
        }
    }

    /**
     * Concludes the 50-point match and triggers victory/defeat screen.
     * @param {'p1'|'ai'} winner 
     */
    concludeMatch(winner) {
        console.log(`[TurnManager] 50-Point Match Concluded. Winner: ${winner}`);
        if (this.aiWatchdogTimer) clearTimeout(this.aiWatchdogTimer);
        this.aiThinking = false;
        this.settleCheckActive = false;
        this.isProcessingTurn = false;

        this.gameState.gameWinner = winner;
        this.gameState.setState(GameStateManager.STATES.GAME_OVER, { winner });
        StorageManager.recordMatchResult(winner === 'p1' ? 'human' : 'ai');
    }
}