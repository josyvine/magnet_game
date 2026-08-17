/* ==========================================================================
   HEURISTIC FALLBACK AI ENGINE
   Local, deterministic physics-aware search engine.
   Runs forward trajectory simulations across multiple candidate launch vectors
   when no Google Gemini API key is provided or when offline.
   
   Difficulty Tiers:
   - Easy: Direct vector with high angular noise and moderate launch power.
   - Medium: Evaluates 18 candidate shots, dipole-alignment and center-control aware.
   - Hard: Evaluates 48 candidate trajectories, aggressive high-momentum 
           knockout strikes, foul avoidance, and boundary displacement.
   ========================================================================== */

class HeuristicFallback {
    /**
     * Computes the best physical launch vector based on candidate search.
     * @param {Object} gameState 
     * @param {'easy'|'medium'|'hard'} difficulty 
     * @returns {{launchAngle: number, launchPower: number, reasoning: string}}
     */
    static computeMove(gameState, difficulty = 'medium') {
        const aiPos = gameState.ai;
        const p1Pos = gameState.p1;
        const centerX = GAME_CONFIG.BOARD_CENTER_X;
        const centerY = GAME_CONFIG.BOARD_CENTER_Y;

        // Check if magnets are currently snapped together
        const currentDist = Math.hypot(p1Pos.x - aiPos.x, p1Pos.y - aiPos.y);
        const isDocked = currentDist <= (GAME_CONFIG.MAGNET_RADIUS * 2.15);

        // Angle directly towards opponent's center of mass
        const angleToOpponent = Math.atan2(p1Pos.y - aiPos.y, p1Pos.x - aiPos.x);
        // Angle directly towards arena center
        const angleToCenter = Math.atan2(centerY - aiPos.y, centerX - aiPos.x);

        // Distance from opponent to center
        const p1DistToCenter = Math.hypot(p1Pos.x - centerX, p1Pos.y - centerY);
        const isPlayerInCenter = p1DistToCenter <= GAME_CONFIG.SCORE_CENTER_RADIUS + 30;

        if (difficulty === 'easy') {
            // Easy AI: Aimed shot with moderate power and variance
            const noiseAngle = (Math.random() - 0.5) * 0.5; // +/- ~15 degrees
            const powerNoise = (Math.random() - 0.5) * 150;
            
            // If docked, aim slightly away to avoid foul
            const baseAngle = isDocked ? angleToCenter : (isPlayerInCenter ? angleToOpponent : angleToCenter);
            const chosenAngle = baseAngle + noiseAngle;

            const chosenPower = Math.max(
                350,
                Math.min(GAME_CONFIG.MAX_LAUNCH_POWER, (isPlayerInCenter && !isDocked ? 600 : 450) + powerNoise)
            );

            return {
                launchAngle: chosenAngle,
                launchPower: chosenPower,
                reasoning: 'Easy Heuristic: Direct approach with angular variation.'
            };
        }

        // Candidate Sampling for Medium and Hard
        const numAngleSamples = difficulty === 'hard' ? 24 : 12;
        const numPowerSamples = difficulty === 'hard' ? 5 : 3;
        
        const candidateShots = [];

        // 1. High-Power Direct Knockout Sweep (ONLY if NOT docked)
        if (isPlayerInCenter && !isDocked) {
            for (let a = 0; a < 8; a++) {
                const microOffset = (a / 7 - 0.5) * 0.25; // Fine-tune angle around Player 1
                for (let p = 0; p < 3; p++) {
                    const heavyPower = 650 + (p / 2) * 230; 
                    candidateShots.push({
                        angle: angleToOpponent + microOffset,
                        power: heavyPower,
                        isKnockout: true
                    });
                }
            }
        }

        // 2. Full Strategic Sweep (Angles around Opponent and Center)
        for (let a = 0; a < numAngleSamples; a++) {
            const angleOffset = (a / (numAngleSamples - 1) - 0.5) * Math.PI * 1.1;
            const baseAngle = a % 2 === 0 ? angleToOpponent : angleToCenter;
            const testAngle = baseAngle + angleOffset;

            for (let p = 0; p < numPowerSamples; p++) {
                const testPower = 300 + (p / Math.max(1, numPowerSamples - 1)) * (GAME_CONFIG.MAX_LAUNCH_POWER - 300);

                candidateShots.push({
                    angle: testAngle,
                    power: testPower,
                    isKnockout: false
                });
            }
        }

        let bestShot = candidateShots[0];
        let bestScore = -Infinity;

        // Evaluate candidate shots using forward trajectory simulation
        for (let candidate of candidateShots) {
            const score = HeuristicFallback.evaluateCandidateTrajectory(
                aiPos,
                p1Pos,
                candidate.angle,
                candidate.power,
                isDocked,
                difficulty === 'hard' ? 45 : 25
            );

            if (score > bestScore) {
                bestScore = score;
                bestShot = candidate;
            }
        }

        return {
            launchAngle: bestShot.angle,
            launchPower: bestShot.power,
            reasoning: `${difficulty.toUpperCase()} Heuristic: Evaluated ${candidateShots.length} trajectory simulations; executed ${bestShot.isKnockout ? 'HIGH-POWER KNOCKOUT STRIKE' : 'POSITIONAL TACTIC'}.`
        };
    }

    /**
     * Simulates forward physics for N steps and returns a utility evaluation score.
     * Heavily rewards knocking the player away, and heavily penalizes Docked Pair fouls.
     * @param {Object} aiStart 
     * @param {Object} p1Start 
     * @param {number} launchAngle 
     * @param {number} launchPower 
     * @param {boolean} wasDockedAtStart 
     * @param {number} simSteps 
     * @returns {number} Score (higher is better)
     */
    static evaluateCandidateTrajectory(aiStart, p1Start, launchAngle, launchPower, wasDockedAtStart, simSteps = 30) {
        // Virtual cloning of initial state
        let ax = aiStart.x;
        let ay = aiStart.y;
        let avx = Math.cos(launchAngle) * (launchPower * 1.5);
        let avy = Math.sin(launchAngle) * (launchPower * 1.5);
        let aAngle = aiStart.angle;

        let px = p1Start.x;
        let py = p1Start.y;
        let pvx = p1Start.vx || 0;
        let pvy = p1Start.vy || 0;
        let pAngle = p1Start.angle;

        const dt = GAME_CONFIG.FIXED_DT;
        const centerX = GAME_CONFIG.BOARD_CENTER_X;
        const centerY = GAME_CONFIG.BOARD_CENTER_Y;

        const minX = GAME_CONFIG.ARENA_MIN_X + GAME_CONFIG.MAGNET_RADIUS;
        const maxX = GAME_CONFIG.ARENA_MAX_X - GAME_CONFIG.MAGNET_RADIUS;
        const minY = GAME_CONFIG.ARENA_MIN_Y + GAME_CONFIG.MAGNET_RADIUS;
        const maxY = GAME_CONFIG.ARENA_MAX_Y - GAME_CONFIG.MAGNET_RADIUS;

        let hitOpponent = false;
        let initialP1DistCenter = Math.hypot(p1Start.x - centerX, p1Start.y - centerY);

        for (let step = 0; step < simSteps; step++) {
            // Dipole collision approximation
            const dx = px - ax;
            const dy = py - ay;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < GAME_CONFIG.MAGNET_RADIUS * 2) {
                hitOpponent = true;
                const nx = dx / (dist > 0.001 ? dist : 1);
                const ny = dy / (dist > 0.001 ? dist : 1);
                const relVel = (pvx - avx) * nx + (pvy - avy) * ny;
                if (relVel < 0) {
                    const impulse = -(1 + GAME_CONFIG.RESTITUTION) * relVel * 0.6;
                    avx -= impulse * nx;
                    avy -= impulse * ny;
                    pvx += impulse * nx;
                    pvy += impulse * ny;
                }
            }

            // Apply magnetic forces
            const effDist = Math.max(dist, GAME_CONFIG.MIN_DISTANCE);
            const magForce = (GAME_CONFIG.MAGNET_STRENGTH * 0.5) / (effDist * effDist);
            const nx = dx / (dist > 0.001 ? dist : 1);
            const ny = dy / (dist > 0.001 ? dist : 1);

            const alignment = Math.cos(aAngle - pAngle);
            const forceSign = alignment > 0 ? -1 : 1;

            avx += forceSign * magForce * nx * dt;
            avy += forceSign * magForce * ny * dt;
            pvx -= forceSign * magForce * nx * dt;
            pvy -= forceSign * magForce * ny * dt;

            // Integrate motion
            ax += avx * dt;
            ay += avy * dt;
            px += pvx * dt;
            py += pvy * dt;

            // Surface friction
            avx *= GAME_CONFIG.SURFACE_FRICTION;
            avy *= GAME_CONFIG.SURFACE_FRICTION;
            pvx *= GAME_CONFIG.SURFACE_FRICTION;
            pvy *= GAME_CONFIG.SURFACE_FRICTION;

            // Rectangular boundary bounces
            if (ax < minX || ax > maxX) avx *= -GAME_CONFIG.RIM_RESTITUTION;
            if (ay < minY || ay > maxY) avy *= -GAME_CONFIG.RIM_RESTITUTION;

            if (px < minX || px > maxX) pvx *= -GAME_CONFIG.RIM_RESTITUTION;
            if (py < minY || py > maxY) pvy *= -GAME_CONFIG.RIM_RESTITUTION;
        }

        // --- HEURISTIC UTILITY EVALUATION ---
        let utility = 0;

        const finalAIDistCenter = Math.hypot(ax - centerX, ay - centerY);
        const finalP1DistCenter = Math.hypot(px - centerX, py - centerY);

        // DOCKED PAIR STRIKE FOUL PENALTY
        if (wasDockedAtStart && hitOpponent) {
            utility -= 1500; // HEAVY PENALTY: Avoid striking docked pairs to prevent fouls!
        }

        // 1. Center Control
        utility += (GAME_CONFIG.BOARD_RADIUS - finalAIDistCenter) * 2.0;

        // 2. Opponent Displacement
        const p1Displacement = finalP1DistCenter - initialP1DistCenter;
        utility += p1Displacement * 4.5;

        // 3. Center Control Point
        if (finalAIDistCenter <= GAME_CONFIG.SCORE_CENTER_RADIUS && finalAIDistCenter < finalP1DistCenter) {
            utility += 800;
        }

        // 4. Kinetic Hit Bonus (Only if not docked at start)
        if (hitOpponent && !wasDockedAtStart) {
            utility += 450;
        }

        return utility;
    }
}