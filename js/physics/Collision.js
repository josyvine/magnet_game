/* ==========================================================================
   COLLISION SYSTEM
   Continuous rigid-body circle-circle collision solver.
   Resolves geometric penetration, normal contact impulses, tangential
   surface friction, rotational spin transfer, and physical kinetic impact events.
   ========================================================================== */

class CollisionSystem {
    /**
     * Iterates through all magnet pairs, detects geometric overlap, and resolves physical contact.
     * @param {Array<MagnetBody>} bodies Active physical bodies in world
     * @param {PhysicsWorld} world PhysicsWorld reference for collision event dispatch
     */
    static resolveBodyCollisions(bodies, world) {
        const count = bodies.length;
        if (count < 2) return;

        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                CollisionSystem.solvePairCollision(bodies[i], bodies[j], world);
            }
        }
    }

    /**
     * Solves circle-circle physical impact between Body A and Body B.
     * @param {MagnetBody} bodyA 
     * @param {MagnetBody} bodyB 
     * @param {PhysicsWorld} world 
     */
    static solvePairCollision(bodyA, bodyB, world) {
        const dx = bodyB.x - bodyA.x;
        const dy = bodyB.y - bodyA.y;
        const distSq = dx * dx + dy * dy;
        const radiusSum = bodyA.radius + bodyB.radius;

        // Early-out if bounding circles do not intersect
        if (distSq >= radiusSum * radiusSum || distSq === 0) {
            return;
        }

        const dist = Math.sqrt(distSq);

        // 1. Contact Normal (points from Body A towards Body B)
        const nx = dx / dist;
        const ny = dy / dist;

        // 2. Penetration Depth Resolution (Positional Separation)
        const penetration = radiusSum - dist;
        const totalInvMass = bodyA.invMass + bodyB.invMass;

        if (totalInvMass > 0) {
            // Positional correction percentage (Baumgarte stabilization)
            const percent = 0.85;
            const slop = 0.01;
            const correctionMag = (Math.max(penetration - slop, 0) / totalInvMass) * percent;

            bodyA.x -= nx * correctionMag * bodyA.invMass;
            bodyA.y -= ny * correctionMag * bodyA.invMass;
            bodyB.x += nx * correctionMag * bodyB.invMass;
            bodyB.y += ny * correctionMag * bodyB.invMass;
        }

        // 3. Contact Point coordinates (midpoint on collision plane)
        const contactX = bodyA.x + nx * (bodyA.radius - penetration * 0.5);
        const contactY = bodyA.y + ny * (bodyA.radius - penetration * 0.5);

        // 4. Lever arm vectors from body centers to contact point (rA, rB)
        const rAx = contactX - bodyA.x;
        const rAy = contactY - bodyA.y;
        const rBx = contactX - bodyB.x;
        const rBy = contactY - bodyB.y;

        // 5. Total surface velocities at contact point including angular velocity:
        // v_contact = v + (w x r) = (vx - w * ry, vy + w * rx)
        const vAx = bodyA.vx - bodyA.angularVelocity * rAy;
        const vAy = bodyA.vy + bodyA.angularVelocity * rAx;

        const vBx = bodyB.vx - bodyB.angularVelocity * rBy;
        const vBy = bodyB.vy + bodyB.angularVelocity * rBx;

        // Relative contact velocity (B relative to A)
        const rvx = vBx - vAx;
        const rvy = vBy - vAy;

        // Relative velocity along collision normal
        const velAlongNormal = rvx * nx + rvy * ny;

        // Do not resolve if velocities are already separating
        if (velAlongNormal > 0) {
            return;
        }

        // 6. Normal Impulse Calculation
        // Effective mass in normal direction including rotational inertia:
        // 1 / m_eff = (1/mA + 1/mB) + ((rA x n)^2 / IA) + ((rB x n)^2 / IB)
        const rA_Cross_N = rAx * ny - rAy * nx;
        const rB_Cross_N = rBx * ny - rBy * nx;

        const invMassNormal = totalInvMass + 
            (rA_Cross_N * rA_Cross_N) * bodyA.invInertia + 
            (rB_Cross_N * rB_Cross_N) * bodyB.invInertia;

        const restitution = GAME_CONFIG.RESTITUTION;
        let jn = -(1 + restitution) * velAlongNormal;
        jn /= invMassNormal;

        // Normal impulse vector
        const jnx = jn * nx;
        const jny = jn * ny;

        // Apply normal impulse to both bodies
        bodyA.applyImpulseAtPoint(-jnx, -jny, contactX, contactY);
        bodyB.applyImpulseAtPoint(jnx, jny, contactX, contactY);

        // 7. Friction (Tangential Impulse Calculation)
        // Tangent unit vector perpendicular to normal
        const tx = -ny;
        const ty = nx;

        // Relative velocity along tangent
        const velAlongTangent = rvx * tx + rvy * ty;

        const rA_Cross_T = rAx * ty - rAy * tx;
        const rB_Cross_T = rBx * ty - rBy * tx;

        const invMassTangent = totalInvMass + 
            (rA_Cross_T * rA_Cross_T) * bodyA.invInertia + 
            (rB_Cross_T * rB_Cross_T) * bodyB.invInertia;

        let jt = -velAlongTangent / invMassTangent;

        // Coulomb's Law friction clamp: |jt| <= mu * jn
        const friction = GAME_CONFIG.COLLISION_FRICTION;
        const maxJt = friction * jn;
        jt = Math.max(-maxJt, Math.min(maxJt, jt));

        // Tangential impulse vector
        const jtx = jt * tx;
        const jty = jt * ty;

        // Apply friction impulse to both bodies
        bodyA.applyImpulseAtPoint(-jtx, -jty, contactX, contactY);
        bodyB.applyImpulseAtPoint(jtx, jty, contactX, contactY);

        // 8. Wake both bodies
        bodyA.isSleeping = false;
        bodyB.isSleeping = false;

        // 9. Dispatch Physical Collision Event for visual VFX / audio
        const impactSpeed = Math.abs(velAlongNormal);
        if (world && world.onCollision && impactSpeed > 25) {
            world.onCollision(
                bodyA,
                bodyB,
                { x: nx, y: ny, contactX: contactX, contactY: contactY },
                jn,
                impactSpeed
            );
        }
    }
}