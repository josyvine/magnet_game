/* ==========================================================================
   RENDERER
   High-performance 2D Canvas rendering engine.
   Draws rectangular wooden arena, magnetic dipole fields, rotated magnet pucks,
   slingshot aim guides, electric arcs, particle pools, and debug overlays.
   ========================================================================== */

class Renderer {
    /**
     * @param {HTMLCanvasElement} canvas 
     * @param {AssetLoader} assetLoader 
     * @param {PhysicsWorld} physicsWorld 
     * @param {GameStateManager} gameState 
     * @param {InputController} inputController 
     * @param {EffectPool} effectPool 
     */
    constructor(canvas, assetLoader, physicsWorld, gameState, inputController, effectPool) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.assets = assetLoader;
        this.world = physicsWorld;
        this.gameState = gameState;
        this.input = inputController;
        this.effects = effectPool;

        // Internal logical resolution matches 800x1100 full-screen vertical arena
        this.width = GAME_CONFIG.WORLD_WIDTH;
        this.height = GAME_CONFIG.WORLD_HEIGHT;

        this.initCanvasSize();
        window.addEventListener('resize', () => this.initCanvasSize());
    }

    /**
     * Resizes internal canvas drawing buffer to match 800x1100 coordinate space.
     */
    initCanvasSize() {
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    /**
     * Master frame render called from requestAnimationFrame loop.
     * Rendering order is STRICT to prevent overlapping visual noise.
     */
    render() {
        const ctx = this.ctx;
        ctx.save();

        // 1. Clear background
        ctx.fillStyle = '#07060c';
        ctx.fillRect(0, 0, this.width, this.height);

        // 2. BOTTOM LAYER: Draw Rectangular Wooden Board Asset (Full-Bleed 800x1100)
        this.drawBoard(ctx);

        // 3. Draw Center Objective Ring (135px Radius Target)
        this.drawObjectiveZone(ctx);

        // 4. LOWER MIDDLE LAYER: Draw Rotating Magnetic Dipole Field Lines
        // (Rendered BEFORE magnets so they don't cover the metal textures)
        const settings = StorageManager.load();
        if (settings.showFields) {
            this.drawMagneticFields(ctx);
        }

        // 5. UPPER MIDDLE LAYER: Draw Electric Arcs between opposite poles
        this.drawElectricArcs(ctx);

        // 6. Draw Slingshot Aim Guide (When Player is dragging)
        if (this.input && this.input.isDragging) {
            this.drawAimGuide(ctx);
        }

        // 7. FOREGROUND LAYER: Draw Physical Magnet Pucks
        // (Rendered AFTER fields so the metal looks clean and sharp)
        this.drawMagnets(ctx);

        // 8. VFX LAYER: Draw Active Particle & Collision VFX Pool
        if (this.effects) {
            this.effects.render(ctx);
        }

        // 9. DEBUG LAYER: Draw Physics Debug Overlay (if enabled)
        if (settings.showDebug) {
            this.drawDebugOverlay(ctx);
        }

        ctx.restore();
    }

    /**
     * Draws full-bleed rectangular wooden table image across 800x1100.
     */
    drawBoard(ctx) {
        ctx.save();
        const boardImg = this.assets.getImage(ASSETS.board);

        if (boardImg) {
            // Render full-bleed rectangular board texture
            ctx.drawImage(boardImg, 0, 0, this.width, this.height);
        } else {
            // Procedural fallback
            ctx.fillStyle = '#3a2012';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.lineWidth = 16;
            ctx.strokeStyle = '#2b160a';
            ctx.strokeRect(0, 0, this.width, this.height);
        }

        // Center Divider Line
        ctx.beginPath();
        ctx.moveTo(GAME_CONFIG.ARENA_MIN_X, GAME_CONFIG.BOARD_CENTER_Y);
        ctx.lineTo(GAME_CONFIG.ARENA_MAX_X, GAME_CONFIG.BOARD_CENTER_Y);
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Draws enlarged 135px center dominance objective zone.
     */
    drawObjectiveZone(ctx) {
        const cx = GAME_CONFIG.BOARD_CENTER_X; // 400
        const cy = GAME_CONFIG.BOARD_CENTER_Y; // 550
        const r = GAME_CONFIG.SCORE_CENTER_RADIUS; // 135px

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 246, 255, 0.05)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = '#00f6ff';
        ctx.shadowColor = '#00f6ff';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Draws rotating dipole field assets underneath each magnet body.
     */
    drawMagneticFields(ctx) {
        for (let b of this.world.bodies) {
            const fieldImg = b.owner === 'p1' 
                ? this.assets.getImage(ASSETS.fieldBlue)
                : this.assets.getImage(ASSETS.fieldRed);

            if (fieldImg) {
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.rotate(b.angle);

                const speed = Math.hypot(b.vx, b.vy);
                const pulseAlpha = 0.65 + Math.sin(Date.now() * 0.005) * 0.15;
                ctx.globalAlpha = Math.min(1.0, pulseAlpha + speed * 0.0005);

                const size = b.radius * 5.2;
                ctx.drawImage(fieldImg, -size / 2, -size / 2, size, size);
                ctx.restore();
            }
        }
    }

    /**
     * Draws physical electric arcs between opposite poles if in snapping threshold.
     */
    drawElectricArcs(ctx) {
        if (this.world.bodies.length < 2) return;
        const b1 = this.world.bodies[0];
        const b2 = this.world.bodies[1];

        const n1 = b1.getNorthPolePos();
        const s1 = b1.getSouthPolePos();
        const n2 = b2.getNorthPolePos();
        const s2 = b2.getSouthPolePos();

        // Opposite pairs: N1-S2, S1-N2
        this.renderArcBetween(ctx, n1, s2, '#00f6ff');
        this.renderArcBetween(ctx, s1, n2, '#ff5722');
    }

    /**
     * Renders jagged procedural electric discharge line.
     */
    renderArcBetween(ctx, p1, p2, color) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);

        if (dist > GAME_CONFIG.MAGNET_RADIUS * 2.8) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);

        const segments = 6;
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const px = p1.x + dx * t + (Math.random() - 0.5) * 16;
            const py = p1.y + dy * t + (Math.random() - 0.5) * 16;
            ctx.lineTo(px, py);
        }

        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Draws slingshot launch trajectory and force meter.
     */
    drawAimGuide(ctx) {
        const aim = this.input.aimVector;
        if (aim.length <= 5) return;

        const p1 = this.input.p1;
        const endX = p1.x + aim.x * aim.length * 1.6;
        const endY = p1.y + aim.y * aim.length * 1.6;

        ctx.save();
        // Slingshot trajectory line
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(endX, endY);
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = '#00f6ff';
        ctx.shadowColor = '#00f6ff';
        ctx.shadowBlur = 8;
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.arc(endX, endY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00e676';
        ctx.fill();
        ctx.restore();
    }

    /**
     * Draws the actual magnet puck graphics.
     */
    drawMagnets(ctx) {
        for (let b of this.world.bodies) {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.angle);

            // Determine which puck image state to draw
            let puckImg = this.assets.getImage(ASSETS.puckBase);

            if (b.isSelected || b.isDragging) {
                puckImg = this.assets.getImage(ASSETS.puckSelected) || puckImg;
            } else if (b.isWarning) {
                puckImg = this.assets.getImage(ASSETS.puckWarning) || puckImg;
            }

            const size = b.radius * 2.2;

            if (puckImg) {
                ctx.drawImage(puckImg, -size / 2, -size / 2, size, size);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
                ctx.fillStyle = b.owner === 'p1' ? '#1976d2' : '#d32f2f';
                ctx.fill();
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
            }

            // Draw North/South pole labels explicitly on the puck face
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // North Pole (Blue/White text)
            ctx.fillStyle = '#00f6ff';
            ctx.fillText('N', b.poleSeparation * 0.7, 0);

            // South Pole (Red/White text)
            ctx.fillStyle = '#ff1744';
            ctx.fillText('S', -b.poleSeparation * 0.7, 0);

            ctx.restore();
        }
    }

    /**
     * Draws real-time physics vectors for debugging.
     */
    drawDebugOverlay(ctx) {
        ctx.save();
        for (let b of this.world.bodies) {
            // Collision circle
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Velocity vector
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x + b.vx * 0.2, b.y + b.vy * 0.2);
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Dipole Pole Points
            const n = b.getNorthPolePos();
            const s = b.getSouthPolePos();

            ctx.fillStyle = '#00f6ff';
            ctx.beginPath();
            ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}