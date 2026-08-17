/* ==========================================================================
   GOOGLE GEMINI API CLIENT
   Connects to Google Generative AI REST endpoints.
   Features:
   1. Live Model Retrieval (queries Google server for available Gemini models).
   2. Board State Serialization & Structured Physical Reasoning.
   3. Strict Schema Prompting to return validated launch parameters:
      { launchAngle: number, launchPower: number, reasoning: string }
   4. Automatic Fallback to Heuristic engine if key is absent or network fails.
   ========================================================================== */

class GeminiClient {
    static BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

    /**
     * Fetches live available models from Google Generative Language API.
     * @param {string} apiKey 
     * @returns {Promise<Array<{id: string, displayName: string}>>}
     */
    static async fetchAvailableModels(apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            throw new Error('API key is required to fetch live models.');
        }

        const endpoint = `${GeminiClient.BASE_URL}/models?key=${apiKey.trim()}`;
        
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP Error ${response.status}`);
            }

            const data = await response.json();
            const models = (data.models || [])
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => {
                    const cleanId = m.name.replace(/^models\//, '');
                    return {
                        id: cleanId,
                        displayName: `${m.displayName || cleanId} (${cleanId})`
                    };
                });

            // Always provide offline fallback at the top
            return [
                { id: 'local-fallback', displayName: 'Local Physical Heuristic (Offline)' },
                ...models
            ];
        } catch (error) {
            console.error('[GeminiClient] Failed to fetch live models:', error);
            throw error;
        }
    }

    /**
     * Sends the authoritative game state to Google Gemini and returns physical launch vectors.
     * @param {Object} gameState Current board positions, polarities, and scores
     * @param {string} apiKey
     * @param {string} modelId
     * @param {'easy'|'medium'|'hard'} difficulty
     * @returns {Promise<{launchAngle: number, launchPower: number, reasoning: string}>}
     */
    static async requestMove(gameState, apiKey, modelId = 'local-fallback', difficulty = 'medium') {
        // If offline fallback selected or no API key, route to internal heuristic
        if (!apiKey || modelId === 'local-fallback' || apiKey.trim() === '') {
            console.log('[GeminiClient] Using Local Physical Heuristic fallback.');
            return HeuristicFallback.computeMove(gameState, difficulty);
        }

        const cleanModel = modelId.replace(/^models\//, '');
        const endpoint = `${GeminiClient.BASE_URL}/models/${cleanModel}:generateContent?key=${apiKey.trim()}`;

        // Construct structured physics prompt with tactical target context
        const promptText = GeminiClient.buildPrompt(gameState, difficulty);

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: promptText }]
                }
            ],
            generationConfig: {
                temperature: difficulty === 'hard' ? 0.15 : 0.6,
                topP: 0.85,
                maxOutputTokens: 250,
                responseMimeType: 'application/json'
            }
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.warn(`[GeminiClient] API error (${response.status}):`, errData);
                return HeuristicFallback.computeMove(gameState, difficulty);
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResponse) {
                throw new Error('Empty response payload from Gemini.');
            }

            // Parse structured JSON response
            const parsed = JSON.parse(textResponse);

            // Validate bounds
            const angle = Number.isFinite(parsed.launchAngle) ? parsed.launchAngle : Math.PI;
            const power = Math.max(
                GAME_CONFIG.MIN_LAUNCH_POWER,
                Math.min(GAME_CONFIG.MAX_LAUNCH_POWER, Number(parsed.launchPower) || 550)
            );

            return {
                launchAngle: angle,
                launchPower: power,
                reasoning: parsed.reasoning || 'Executed Gemini physical move.'
            };

        } catch (err) {
            console.warn('[GeminiClient] Call failed, invoking local fallback:', err.message);
            return HeuristicFallback.computeMove(gameState, difficulty);
        }
    }

    /**
     * Builds strict physics context prompt for Gemini with 50-point goal & foul rules.
     * @param {Object} state 
     * @param {string} difficulty 
     * @returns {string}
     */
    static buildPrompt(state, difficulty) {
        const cx = GAME_CONFIG.BOARD_CENTER_X;
        const cy = GAME_CONFIG.BOARD_CENTER_Y;
        const p1DistToCenter = Math.hypot(state.p1.x - cx, state.p1.y - cy);
        const isPlayerInCenter = p1DistToCenter <= GAME_CONFIG.SCORE_CENTER_RADIUS + 20;

        // Check if magnets are currently snapped together
        const isDocked = state.distance <= (GAME_CONFIG.MAGNET_RADIUS * 2.15);

        // Angle vector from AI directly to Human
        const directTargetAngle = Math.atan2(state.p1.y - state.ai.y, state.p1.x - state.ai.x);

        let tacticalInstruction = "";

        if (isDocked) {
            tacticalInstruction = `STRICT FOUL RULE WARNING:
The two magnets are currently SNAPPED/DOCKED together ($N \\leftrightarrow S$ contact)!
Directly striking a joined pair is an INVALID STRIKE / FOUL!
You MUST aim slightly away or take a positional placement shot to break the pair cleanly without committing a foul!`;
        } else if (isPlayerInCenter) {
            tacticalInstruction = `CRITICAL TACTICAL SITUATION:
Human Player 1 (Blue) is currently occupying the center scoring ring (${p1DistToCenter.toFixed(1)}px from center)!
You MUST execute a HIGH-POWER DIRECT KNOCKOUT STRIKE (Power: 650 to 900) aimed directly at Player 1 (around Angle ${directTargetAngle.toFixed(2)} radians) to blast them out of the ring!`;
        } else {
            tacticalInstruction = `TACTICAL GOAL:
Aim to occupy the center ring (400, 550) or knock Player 1 away if they approach. Direct vector to Player 1 is ${directTargetAngle.toFixed(2)} radians.`;
        }

        return `You are an expert competitive player in a 2D physical magnet game.
Full-Screen Rectangular Arena: (800 x 1100), Center: (400, 550).
Center Objective Target Ring Radius: ${GAME_CONFIG.SCORE_CENTER_RADIUS}px.
MATCH GOAL: First to 50 Points wins the match. Milestones trigger at 10, 20, 30, 40, 50 points.

PHYSICS RULES:
- Opposites attract (N-S); likes repel (N-N, S-S).
- High power impulses cause kinetic momentum transfer to knock the opponent away.
- Striking a joined/snapped magnet pair is a FOUL!

CURRENT MATCH STATE:
- Scores: Human P1: ${state.scores.player1} / 50 | Gemini AI: ${state.scores.ai} / 50.
- Your Magnet (AI Red): (${state.ai.x.toFixed(1)}, ${state.ai.y.toFixed(1)}).
- Opponent (Human Blue): (${state.p1.x.toFixed(1)}, ${state.p1.y.toFixed(1)}).
- Distance between magnets: ${state.distance.toFixed(1)} px.
- Difficulty Mode: ${difficulty}.

${tacticalInstruction}

TASK:
Return ONLY a valid JSON object matching this schema:
{
  "launchAngle": <number in radians between -3.1415 and 3.1415>,
  "launchPower": <number power between ${GAME_CONFIG.MIN_LAUNCH_POWER} and ${GAME_CONFIG.MAX_LAUNCH_POWER}>,
  "reasoning": "<short tactical description>"
}`;
    }
}