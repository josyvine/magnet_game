/* ==========================================================================
   PHYSICS WORLD
   Deterministic fixed-timestep accumulator loop, micro-stepping sub-stepper,
   sleep/settle detector, and rectangular arena boundary confinement.
   ========================================================================== */

class PhysicsWorld {
    constructor() {
        this.bodies = [];
        this.accumulator = 0.0;
        this.fixedDt = GAME_CONFIG.FIXED_DT;
        this.subSteps = GAME_CONFIG.SUB_STEPS;
        this.subDt = this.fixedDt / this.subSteps;
        
        this.centerX = GAME_CONFIG.BOARD_CENTER_X;
        this.centerY = GAME_CONFIG.BOARD_CENTER_Y;

        this.settleTimer = 0.0;
        this.isSettled = true;

        // Collision & Event dispatch listeners
        this.onCollision = null;     // (bodyA, bodyB, normal, impulse, relativeSpeed) => {}
        this.onBoundaryHit = null;   // (body, rimNormal, impactSpeed, isFoul) => {}
        this.onMagneticSnap = null;  // (bodyA, bodyB, snapIntensity) => {}
    }

    /**
     * Registers a physical body to the simulation.
     * @param {MagnetBody} body 
     */
    addBody(body) {
        if (!this.bodies.includes(body)) {
            this.bodies.push(body);
        }
    }

    /**
     * Removes a body from the simulation.
     * @param {MagnetBody} body 
     */
    removeBody(body) {
        const idx = this.bodies.indexOf(body);
        if (idx !== -1) {
            this.bodies.splice(idx, 1);
        }
    }

    /**
     * Resets the physics accumulator and marks all bodies active.
     */
    wakeAll() {
        this.settleTimer = 0.0;
        this.isSettled = false;
        for (let b of this.bodies) {
            b.isSleeping = false;
        }
    }

    /**
     * Main step called from the requestAnimationFrame loop.
     * Uses a fixed time accumulator to remain stable regardless of display FPS.
     * @param {number} deltaSeconds Frame elapsed time in seconds
     */
    update(deltaSeconds) {
        // Clamp large lag spikes to prevent physics explosion
        const safeDelta = Math.min(deltaSeconds, GAME_CONFIG.MAX_ACCUMULATOR);
        this.accumulator += safeDelta;

        while (this.accumulator >= this.fixedDt) {
            // Execute sub-steps for collision precision and high-speed stability
            for (let s = 0; s < this.subSteps; s++) {
                this.stepSub(this.subDt);
            }
            this.accumulator -= this.fixedDt;
            this.checkSettling(this.fixedDt);
        }
    }

    /**
     * Micro-step integration of forces, collisions, and boundaries.
     * @param {number} dt Time fraction per micro-step
     */
    stepSub(dt) {
        // 1. Clear forces
        for (let b of this.bodies) {
            b.forceX = 0;
            b.forceY = 0;
            b.torque = 0;
        }

        // 2. Compute mutual physical dipole magnetic forces and torques
        MagneticForceSystem.computePairwiseInteractions(this.bodies, this);

        // 3. Integrate velocities and positions
        for (let b of this.bodies) {
            b.integrateForces(dt);
        }

        // 4. Solve magnet-on-magnet collisions
        CollisionSystem.resolveBodyCollisions(this.bodies, this);

        // 5. Solve rectangular arena boundary collisions
        this.solveBoundaries();

        // 6. Apply surface friction and angular damping
        for (let b of this.bodies) {
            b.applyDamping();
        }
    }

    /**
     * Confines all magnets inside the rectangular wooden arena walls.
     * Detects wall bounces, wall friction, and high-speed Out-Of-Bounds fouls.
     */
    solveBoundaries() {
        const minX = GAME_CONFIG.ARENA_MIN_X;
        const maxX = GAME_CONFIG.ARENA_MAX_X;
        const minY = GAME_CONFIG.ARENA_MIN_Y;
        const maxY = GAME_CONFIG.ARENA_MAX_Y;

        for (let b of this.bodies) {
            const r = b.radius;

            // --- LEFT WALL ---
            if (b.x - r < minX) {
                const impactSpeed = Math.abs(b.vx);
                b.x = minX + r;
                b.vx = -b.vx * GAME_CONFIG.RIM_RESTITUTION;
                b.vy *= GAME_CONFIG.COLLISION_FRICTION;
                b.angularVelocity *= 0.80;

                this.triggerWallEvent(b, { x: 1, y: 0 }, impactSpeed);
            }
            // --- RIGHT WALL ---
            else if (b.x + r > maxX) {
                const impactSpeed = Math.abs(b.vx);
                b.x = maxX - r;
                b.vx = -b.vx * GAME_CONFIG.RIM_RESTITUTION;
                b.vy *= GAME_CONFIG.COLLISION_FRICTION;
                b.angularVelocity *= 0.80;

                this.triggerWallEvent(b, { x: -1, y: 0 }, impactSpeed);
            }

            // --- TOP WALL ---
            if (b.y - r < minY) {
                const impactSpeed = Math.abs(b.vy);
                b.y = minY + r;
                b.vy = -b.vy * GAME_CONFIG.RIM_RESTITUTION;
                b.vx *= GAME_CONFIG.COLLISION_FRICTION;
                b.angularVelocity *= 0.80;

                this.triggerWallEvent(b, { x: 0, y: 1 }, impactSpeed);
            }
            // --- BOTTOM WALL ---
            else if (b.y + r > maxY) {
                const impactSpeed = Math.abs(b.vy);
                b.y = maxY - r;
                b.vy = -b.vy * GAME_CONFIG.RIM_RESTITUTION;
                b.vx *= GAME_CONFIG.COLLISION_FRICTION;
                b.angularVelocity *= 0.80;

                this.triggerWallEvent(b, { x: 0, y: -1 }, impactSpeed);
            }
        }
    }

    /**
     * Dispatches wall hit event and evaluates Out-Of-Bounds speed fouls.
     */
    triggerWallEvent(body, normal, impactSpeed) {
        if (impactSpeed > 35) {
            const isFoul = impactSpeed > GAME_CONFIG.FOUL_OUT_OF_BOUNDS_SPEED;
            if (this.onBoundaryHit) {
                this.onBoundaryHit(body, normal, impactSpeed, isFoul);
            }
        }
    }

    /**
     * Checks if all magnets have physically come to rest.
     * @param {number} dt 
     */
    checkSettling(dt) {
        let allSlow = true;

        for (let b of this.bodies) {
            const linearSpeedSq = b.vx * b.vx + b.vy * b.vy;
            const angularSpeedSq = b.angularVelocity * b.angularVelocity;

            if (linearSpeedSq > GAME_CONFIG.SETTLE_VELOCITY_SQ ||
                angularSpeedSq > GAME_CONFIG.SETTLE_ANGULAR_VEL_SQ) {
                allSlow = false;
                break;
            }
        }

        if (allSlow) {
            this.settleTimer += dt;
            if (this.settleTimer >= GAME_CONFIG.SETTLE_TIME_REQUIRED) {
                this.isSettled = true;
                for (let b of this.bodies) {
                    b.vx = 0;
                    b.vy = 0;
                    b.angularVelocity = 0;
                    b.isSleeping = true;
                }
            }
        } else {
            this.settleTimer = 0.0;
            this.isSettled = false;
        }
    }
}