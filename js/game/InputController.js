/* ==========================================================================
   INPUT CONTROLLER
   Handles touch, mouse, and pointer events for mobile and desktop screens.
   Implements slingshot drag aiming, anti-exploit distance clamping,
   trajectory preview vectors, and release-to-launch mechanics.
   ========================================================================== */

class InputController {
    /**
     * @param {HTMLCanvasElement} canvas 
     * @param {GameStateManager} gameState 
     * @param {TurnManager} turnManager 
     * @param {MagnetBody} playerMagnet 
     */
    constructor(canvas, gameState, turnManager, playerMagnet) {
        this.canvas = canvas;
        this.gameState = gameState;
        this.turnManager = turnManager;
        this.p1 = playerMagnet;

        this.isDragging = false;
        this.pointerStartX = 0;
        this.pointerStartY = 0;
        this.pointerCurrentX = 0;
        this.pointerCurrentY = 0;

        // Visual Drag & Aiming Vectors
        this.aimVector = { x: 0, y: 0, length: 0, angle: 0, power: 0 };

        this.initListeners();
    }

    /**
     * Registers pointer and touch listeners on the canvas.
     */
    initListeners() {
        // Pointer down (Mouse click or Touch start)
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e), { passive: false });

        // Pointer move (Mouse move or Touch drag)
        window.addEventListener('pointermove', (e) => this.handlePointerMove(e), { passive: false });

        // Pointer up / cancel (Mouse release or Touch end)
        window.addEventListener('pointerup', (e) => this.handlePointerUp(e), { passive: false });
        window.addEventListener('pointercancel', (e) => this.handlePointerCancel(e), { passive: false });
    }

    /**
     * Converts client viewport coordinates to internal 800x1100 world coordinates.
     * Accurately factors in full-screen rectangular canvas scale.
     * @param {PointerEvent} e 
     * @returns {{x: number, y: number}}
     */
    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = GAME_CONFIG.WORLD_WIDTH / rect.width;   // 800
        const scaleY = GAME_CONFIG.WORLD_HEIGHT / rect.height; // 1100

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    /**
     * Starts dragging when player touches anywhere near their blue magnet.
     * @param {PointerEvent} e 
     */
    handlePointerDown(e) {
        // Verify state is valid for human input
        if (this.gameState.getState() !== GameStateManager.STATES.PLAYER_AIM ||
            this.gameState.activeTurn !== 'p1') {
            return;
        }

        const coords = this.getCanvasCoords(e);
        const dx = coords.x - this.p1.x;
        const dy = coords.y - this.p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Generous 3.2x touch radius for mobile fingers
        const touchRadius = this.p1.radius * 3.2;

        if (dist <= touchRadius) {
            e.preventDefault();
            this.isDragging = true;
            this.p1.isSelected = true;
            this.p1.isDragging = true;

            // Anchor launch vector directly to magnet center
            this.pointerStartX = this.p1.x;
            this.pointerStartY = this.p1.y;
            this.pointerCurrentX = coords.x;
            this.pointerCurrentY = coords.y;

            this.updateAimVector();
        }
    }

    /**
     * Updates drag pull-back vector during move.
     * @param {PointerEvent} e 
     */
    handlePointerMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const coords = this.getCanvasCoords(e);
        this.pointerCurrentX = coords.x;
        this.pointerCurrentY = coords.y;

        this.updateAimVector();
    }

    /**
     * Computes launch power, angle, and slingshot direction.
     */
    updateAimVector() {
        // Slingshot vector: dragging backwards from magnet center aims forwards
        const pullX = this.pointerStartX - this.pointerCurrentX;
        const pullY = this.pointerStartY - this.pointerCurrentY;
        const pullDist = Math.sqrt(pullX * pullX + pullY * pullY);

        if (pullDist < 8) {
            this.aimVector.length = 0;
            this.aimVector.power = 0;
            return;
        }

        // Clamp drag magnitude to prevent infinite power exploit
        const maxDrag = (GAME_CONFIG.MAX_LAUNCH_POWER - GAME_CONFIG.MIN_LAUNCH_POWER) / GAME_CONFIG.POWER_DRAG_SCALE;
        const clampedDist = Math.min(pullDist, maxDrag);

        const launchAngle = Math.atan2(pullY, pullX);
        const power = GAME_CONFIG.MIN_LAUNCH_POWER + (clampedDist * GAME_CONFIG.POWER_DRAG_SCALE);

        this.aimVector.x = Math.cos(launchAngle);
        this.aimVector.y = Math.sin(launchAngle);
        this.aimVector.length = clampedDist;
        this.aimVector.angle = launchAngle;
        this.aimVector.power = power;
    }

    /**
     * Releases magnet and fires physical impulse.
     * @param {PointerEvent} e 
     */
    handlePointerUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.p1.isSelected = false;
        this.p1.isDragging = false;

        // If dragged enough to register a deliberate shot
        if (this.aimVector.length > 10 && this.aimVector.power >= GAME_CONFIG.MIN_LAUNCH_POWER) {
            this.turnManager.executeHumanLaunch(this.aimVector.angle, this.aimVector.power);
        }

        // Reset aim vector
        this.aimVector.length = 0;
        this.aimVector.power = 0;
    }

    /**
     * Cancels active drag safely without firing.
     */
    handlePointerCancel(e) {
        this.isDragging = false;
        this.p1.isSelected = false;
        this.p1.isDragging = false;
        this.aimVector.length = 0;
        this.aimVector.power = 0;
    }
}