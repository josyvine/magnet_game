/* ==========================================================================
   MAGNET BODY
   Physical representation of a cylindrical dipole magnet puck.
   Encapsulates mass, inertia, position, linear/angular velocity,
   pole geometric coordinates, and numeric integration.
   ========================================================================== */

class MagnetBody {
    /**
     * @param {number} x Initial center X coordinate
     * @param {number} y Initial center Y coordinate
     * @param {number} angle Initial orientation in radians
     * @param {'p1'|'ai'} owner Player 1 (Blue) or Gemini AI (Red)
     */
    constructor(x, y, angle = 0, owner = 'p1') {
        this.id = 'magnet_' + Math.random().toString(36).substr(2, 9);
        this.owner = owner; // 'p1' = Blue, 'ai' = Red

        // Physical Dimensions & Mass
        this.radius = GAME_CONFIG.MAGNET_RADIUS;
        this.mass = GAME_CONFIG.MAGNET_MASS;
        this.invMass = this.mass > 0 ? 1 / this.mass : 0;
        
        // Moment of inertia for solid cylinder: I = 0.5 * m * r^2
        this.inertia = GAME_CONFIG.MAGNET_INERTIA;
        this.invInertia = this.inertia > 0 ? 1 / this.inertia : 0;

        // Kinematic State
        this.x = x;
        this.y = y;
        this.vx = 0.0;
        this.vy = 0.0;

        // Rotational State
        this.angle = angle; // Radians
        this.angularVelocity = 0.0; // rad/s

        // Cumulative Step Accumulators
        this.forceX = 0.0;
        this.forceY = 0.0;
        this.torque = 0.0;

        // Dipole Magnetic Configuration
        this.magneticStrength = GAME_CONFIG.MAGNET_STRENGTH;
        // Internal dipole separation distance between North and South effective charge centers
        this.poleSeparation = this.radius * 0.75;

        // Interaction and Visual Flags
        this.isSleeping = false;
        this.isSelected = false;
        this.isDragging = false;
        this.isWarning = false;

        // History / Motion Tracking for visuals
        this.prevX = x;
        this.prevY = y;
        this.prevAngle = angle;
    }

    /**
     * Calculates the unit vector pointing along the North-South magnetic dipole axis.
     * @returns {{x: number, y: number}}
     */
    getPoleVector() {
        return {
            x: Math.cos(this.angle),
            y: Math.sin(this.angle)
        };
    }

    /**
     * Computes global world position of the North magnetic pole (+q).
     * @returns {{x: number, y: number}}
     */
    getNorthPolePos() {
        const poleVec = this.getPoleVector();
        return {
            x: this.x + poleVec.x * this.poleSeparation,
            y: this.y + poleVec.y * this.poleSeparation
        };
    }

    /**
     * Computes global world position of the South magnetic pole (-q).
     * @returns {{x: number, y: number}}
     */
    getSouthPolePos() {
        const poleVec = this.getPoleVector();
        return {
            x: this.x - poleVec.x * this.poleSeparation,
            y: this.y - poleVec.y * this.poleSeparation
        };
    }

    /**
     * Applies a linear force to the center of mass.
     * @param {number} fx Force X component in Newtons
     * @param {number} fy Force Y component in Newtons
     */
    applyForce(fx, fy) {
        if (Number.isNaN(fx) || Number.isNaN(fy)) return;
        this.forceX += fx;
        this.forceY += fy;
    }

    /**
     * Applies rotational torque around the center of mass.
     * @param {number} tau Torque in N*px
     */
    applyTorque(tau) {
        if (Number.isNaN(tau)) return;
        this.torque += tau;
    }

    /**
     * Applies an instantaneous physical impulse at an offset contact point.
     * Imparts both linear acceleration and rotational spin.
     * @param {number} ix Impulse X
     * @param {number} iy Impulse Y
     * @param {number} contactX Global contact point X
     * @param {number} contactY Global contact point Y
     */
    applyImpulseAtPoint(ix, iy, contactX, contactY) {
        if (this.invMass === 0) return;

        // Linear velocity delta: dv = J / m
        this.vx += ix * this.invMass;
        this.vy += iy * this.invMass;

        // Lever arm vector from center of mass to contact point: r = contact - center
        const rx = contactX - this.x;
        const ry = contactY - this.y;

        // Angular velocity delta from cross product (r x J): dw = (rx * iy - ry * ix) / I
        const crossImpulse = rx * iy - ry * ix;
        this.angularVelocity += crossImpulse * this.invInertia;

        // Clamp extreme angular velocity
        const maxW = GAME_CONFIG.MAX_ANGULAR_SPEED;
        if (Math.abs(this.angularVelocity) > maxW) {
            this.angularVelocity = Math.sign(this.angularVelocity) * maxW;
        }

        this.isSleeping = false;
    }

    /**
     * Symplectic Euler integration of velocities and positions.
     * @param {number} dt Time step fraction
     */
    integrateForces(dt) {
        if (this.isSleeping) return;

        this.prevX = this.x;
        this.prevY = this.y;
        this.prevAngle = this.angle;

        // 1. Linear acceleration: a = F / m
        const ax = this.forceX * this.invMass;
        const ay = this.forceY * this.invMass;

        this.vx += ax * dt;
        this.vy += ay * dt;

        // Clamp maximum linear speed to prevent tunnel glitches
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > GAME_CONFIG.MAX_LINEAR_SPEED) {
            const factor = GAME_CONFIG.MAX_LINEAR_SPEED / speed;
            this.vx *= factor;
            this.vy *= factor;
        }

        // Integrate linear position: x = x + v * dt
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // 2. Angular acceleration: alpha = Torque / Inertia
        const alpha = this.torque * this.invInertia;
        this.angularVelocity += alpha * dt;

        // Clamp maximum angular velocity
        const maxW = GAME_CONFIG.MAX_ANGULAR_SPEED;
        if (Math.abs(this.angularVelocity) > maxW) {
            this.angularVelocity = Math.sign(this.angularVelocity) * maxW;
        }

        // Integrate rotational angle: angle = angle + w * dt
        this.angle += this.angularVelocity * dt;

        // Normalize angle to [0, 2*PI)
        this.angle = (this.angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    }

    /**
     * Applies surface sliding friction and rotational damping per step.
     */
    applyDamping() {
        if (this.isSleeping) return;

        // Surface friction
        this.vx *= GAME_CONFIG.SURFACE_FRICTION;
        this.vy *= GAME_CONFIG.SURFACE_FRICTION;

        // Angular resistance
        this.angularVelocity *= GAME_CONFIG.ANGULAR_DAMPING;

        // Numeric safety check against NaN or Infinity
        if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
            console.warn(`[Physics Sanity] Resetting invalid coordinates for body ${this.id}`);
            this.x = GAME_CONFIG.BOARD_CENTER_X;
            this.y = GAME_CONFIG.BOARD_CENTER_Y;
            this.vx = 0;
            this.vy = 0;
        }
    }

    /**
     * Resets all kinematic momentum to absolute zero.
     */
    stop() {
        this.vx = 0.0;
        this.vy = 0.0;
        this.angularVelocity = 0.0;
        this.forceX = 0.0;
        this.forceY = 0.0;
        this.torque = 0.0;
        this.isSleeping = true;
    }

    /**
     * Teleports body to a specific position (used exclusively during initial setup/reset).
     * @param {number} x 
     * @param {number} y 
     * @param {number} angle 
     */
    setPosition(x, y, angle = 0) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.prevX = x;
        this.prevY = y;
        this.prevAngle = angle;
        this.stop();
    }
}