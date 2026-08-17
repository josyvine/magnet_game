/* ==========================================================================
   MAGNETIC FORCE & TORQUE SYSTEM
   Implements physical dipole-dipole force vectors, non-linear inverse square
   pole-to-pole interactions, magnetic torque alignment, and electric snap arcs.
   ========================================================================== */

class MagneticForceSystem {
    /**
     * Computes all mutual magnetic forces and rotational torques between every magnet pair.
     * @param {Array<MagnetBody>} bodies List of active magnet bodies in world
     * @param {PhysicsWorld} world Reference to physics world for event dispatch
     */
    static computePairwiseInteractions(bodies, world) {
        const n = bodies.length;
        if (n < 2) return;

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                MagneticForceSystem.solveDipoleInteraction(bodies[i], bodies[j], world);
            }
        }
    }

    /**
     * Solves explicit 4-pole dipole interaction between Body A and Body B:
     * - (N_A <-> N_B) : Repulsion (+ +)
     * - (S_A <-> S_B) : Repulsion (- -)
     * - (N_A <-> S_B) : Attraction (+ -)
     * - (S_A <-> N_B) : Attraction (- +)
     * 
     * Calculates resulting center-of-mass linear force and rotational torque vectors.
     * 
     * @param {MagnetBody} bodyA 
     * @param {MagnetBody} bodyB 
     * @param {PhysicsWorld} world 
     */
    static solveDipoleInteraction(bodyA, bodyB, world) {
        // Retrieve global world positions of physical poles
        const nA = bodyA.getNorthPolePos();
        const sA = bodyA.getSouthPolePos();
        const nB = bodyB.getNorthPolePos();
        const sB = bodyB.getSouthPolePos();

        // 4 Pole-to-Pole Interaction Vectors: [sourcePole, targetPole, signMultiplier]
        // signMultiplier: +1 = Repel (push away), -1 = Attract (pull together)
        const polePairs = [
            { p1: nA, p2: nB, sign: 1.0,  type: 'NN' }, // North - North (Repel)
            { p1: sA, p2: sB, sign: 1.0,  type: 'SS' }, // South - South (Repel)
            { p1: nA, p2: sB, sign: -1.0, type: 'NS' }, // North - South (Attract)
            { p1: sA, p2: nB, sign: -1.0, type: 'SN' }  // South - North (Attract)
        ];

        let totalForceOnAX = 0.0;
        let totalForceOnAY = 0.0;
        let totalTorqueA = 0.0;
        let totalTorqueB = 0.0;

        const k = (bodyA.magneticStrength + bodyB.magneticStrength) * 0.5;
        const minDistance = GAME_CONFIG.MIN_DISTANCE;

        let closestOppositeDist = Infinity;

        for (let pair of polePairs) {
            const dx = pair.p2.x - pair.p1.x;
            const dy = pair.p2.y - pair.p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Track closest opposite poles for electric arc / snap visualization
            if (pair.sign < 0 && dist < closestOppositeDist) {
                closestOppositeDist = dist;
            }

            // Softened distance to prevent infinite force singularity at zero distance
            const effectiveDist = Math.max(dist, minDistance);
            
            // Inverse Square Coulomb-Dipole Approximation: F = k / (r^2)
            let forceMag = k / (effectiveDist * effectiveDist);

            // Clamp max force per pole
            forceMag = Math.min(forceMag, GAME_CONFIG.MAX_MAGNET_FORCE * 0.5);

            // Normalized direction vector from Pole 1 (on A) to Pole 2 (on B)
            const nx = dx / (dist > 0.0001 ? dist : 1.0);
            const ny = dy / (dist > 0.0001 ? dist : 1.0);

            // Force exerted on Pole 1 (Body A)
            // If sign > 0 (repel), force pushes away from Pole 2 (-n)
            // If sign < 0 (attract), force pulls towards Pole 2 (+n)
            const f1x = -pair.sign * forceMag * nx;
            const f1y = -pair.sign * forceMag * ny;

            // Accumulate linear force on Body A
            totalForceOnAX += f1x;
            totalForceOnAY += f1y;

            // Calculate rotational Torque on Body A around center of mass: Tau = r x F
            // r1 = vector from Body A center to Pole 1
            const r1x = pair.p1.x - bodyA.x;
            const r1y = pair.p1.y - bodyA.y;
            const torque1 = r1x * f1y - r1y * f1x;
            totalTorqueA += torque1;

            // Force exerted on Pole 2 (Body B) is equal and opposite (Newton's Third Law)
            const f2x = -f1x;
            const f2y = -f1y;

            // Calculate rotational Torque on Body B around center of mass: Tau = r x F
            const r2x = pair.p2.x - bodyB.x;
            const r2y = pair.p2.y - bodyB.y;
            const torque2 = r2x * f2y - r2y * f2x;
            totalTorqueB += torque2;
        }

        // Clamp cumulative linear forces
        const netForceMag = Math.sqrt(totalForceOnAX * totalForceOnAX + totalForceOnAY * totalForceOnAY);
        if (netForceMag > GAME_CONFIG.MAX_MAGNET_FORCE) {
            const scale = GAME_CONFIG.MAX_MAGNET_FORCE / netForceMag;
            totalForceOnAX *= scale;
            totalForceOnAY *= scale;
        }

        // Clamp cumulative rotational torques
        totalTorqueA = Math.max(-GAME_CONFIG.MAX_TORQUE, Math.min(GAME_CONFIG.MAX_TORQUE, totalTorqueA));
        totalTorqueB = Math.max(-GAME_CONFIG.MAX_TORQUE, Math.min(GAME_CONFIG.MAX_TORQUE, totalTorqueB));

        // Apply physical results to Body A
        bodyA.applyForce(totalForceOnAX, totalForceOnAY);
        bodyA.applyTorque(totalTorqueA);

        // Apply equal and opposite linear force and individual torque to Body B
        bodyB.applyForce(-totalForceOnAX, -totalForceOnAY);
        bodyB.applyTorque(totalTorqueB);

        // Wake up bodies if magnetic forces exceed threshold
        if (netForceMag > 15 || Math.abs(totalTorqueA) > 10 || Math.abs(totalTorqueB) > 10) {
            bodyA.isSleeping = false;
            bodyB.isSleeping = false;
        }

        // Trigger magnetic snap event if opposite poles are violently pulling together
        if (closestOppositeDist < bodyA.radius * 1.8) {
            if (world.onMagneticSnap) {
                const snapIntensity = 1.0 - (closestOppositeDist / (bodyA.radius * 1.8));
                world.onMagneticSnap(bodyA, bodyB, snapIntensity);
            }
        }
    }
}