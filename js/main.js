/* ==========================================================================
   MAIN APPLICATION ENTRY POINT
   Initializes all systems, binds UI event listeners, manages the right-hand
   settings drawer, connects live Gemini model fetching, and runs the master loop.
   ========================================================================== */

window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Main] Initializing Magnet Physics Arena...');

    // 1. Initialize Canvas & Asset Loader
    const canvas = document.getElementById('game-canvas');
    const assetLoader = new AssetLoader();
    const soundManager = new SoundManager();

    // Unlock Web Audio context on the first user interaction anywhere
    const unlockAudio = () => {
        soundManager.initContext();
        soundManager.resumeContext();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Preload and process all assets
    await assetLoader.loadAll();

    // 2. Initialize Physics World & Magnet Bodies
    const physicsWorld = new PhysicsWorld();
    const p1Magnet = new MagnetBody(400, 600, -Math.PI / 2, 'p1');
    const aiMagnet = new MagnetBody(400, 200, Math.PI / 2, 'ai');

    physicsWorld.addBody(p1Magnet);
    physicsWorld.addBody(aiMagnet);

    // 3. Initialize Game State & Turn Management
    const gameState = new GameStateManager();
    const effectPool = new EffectPool(assetLoader);

    const turnManager = new TurnManager(
        gameState,
        physicsWorld,
        p1Magnet,
        aiMagnet,
        (activeTurn) => {
            soundManager.playTurnSound(activeTurn === 'p1');
            updateHUD(gameState);
        }
    );

    // 4. Initialize Input Controller & Renderer
    const inputController = new InputController(canvas, gameState, turnManager, p1Magnet);
    const renderer = new Renderer(canvas, assetLoader, physicsWorld, gameState, inputController, effectPool);

    // 5. Connect Physical Event Callbacks to VFX & Audio
    physicsWorld.onCollision = (bodyA, bodyB, contact, impulse, speed) => {
        effectPool.spawnCollisionSheet(contact.contactX, contact.contactY, Math.min(1.0, speed / 600));
        soundManager.playSnapSound(Math.min(1.0, speed / 500));
    };

    physicsWorld.onBoundaryHit = (body, normal, speed) => {
        effectPool.spawnDustShockwave(body.x, body.y, speed);
        soundManager.playImpactSound(speed);
    };

    physicsWorld.onMagneticSnap = (bodyA, bodyB, intensity) => {
        if (intensity > 0.6) {
            bodyA.isWarning = true;
            bodyB.isWarning = true;
        } else {
            bodyA.isWarning = false;
            bodyB.isWarning = false;
        }
    };

    // 6. UI Element References
    const mainMenu = document.getElementById('main-menu');
    const gameHud = document.getElementById('game-hud');
    const howToPlayModal = document.getElementById('how-to-play-modal');
    const gameOverModal = document.getElementById('game-over-modal');
    const settingsDrawer = document.getElementById('settings-drawer');
    const drawerBackdrop = document.getElementById('settings-drawer-backdrop');

    // UI Buttons
    const btnStartGame = document.getElementById('btn-start-game');
    const btnHowToPlay = document.getElementById('btn-how-to-play');
    const btnCloseRules = document.getElementById('btn-close-rules');
    const btnRulesBack = document.getElementById('btn-rules-back');
    const btnMenuSettings = document.getElementById('btn-menu-settings');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseDrawer = document.getElementById('btn-close-drawer');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const btnFetchModels = document.getElementById('btn-fetch-models');
    const btnPauseGame = document.getElementById('btn-pause-game');
    const btnNextRound = document.getElementById('btn-next-round');
    const btnReturnMenu = document.getElementById('btn-return-menu');

    // Settings Inputs
    const inputApiKey = document.getElementById('gemini-api-key');
    const selectModel = document.getElementById('gemini-model-select');
    const selectDifficulty = document.getElementById('ai-difficulty');
    const toggleSfx = document.getElementById('toggle-sfx');
    const toggleHaptics = document.getElementById('toggle-haptics');
    const toggleFields = document.getElementById('toggle-fields');
    const toggleDebug = document.getElementById('toggle-debug');

    // Populate Settings from Storage
    const populateSettingsUI = () => {
        const saved = StorageManager.load();
        
        // Restore API Key text input
        inputApiKey.value = saved.geminiApiKey || '';
        selectDifficulty.value = saved.aiDifficulty || 'medium';
        toggleSfx.checked = saved.sfxEnabled;
        toggleHaptics.checked = saved.hapticsEnabled;
        toggleFields.checked = saved.showFields;
        toggleDebug.checked = saved.showDebug;

        // Populate cached models dynamically
        selectModel.innerHTML = '';
        const models = saved.availableModels || [
            { id: 'local-fallback', displayName: 'Local Physical Heuristic (Offline)' }
        ];
        
        for (let m of models) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.displayName;
            if (m.id === saved.selectedModel) {
                opt.selected = true;
            }
            selectModel.appendChild(opt);
        }

        // Update connection status label on main menu
        const statusLabel = document.getElementById('ai-status-label');
        const statusDot = document.querySelector('#menu-ai-status .status-dot');
        if (saved.geminiApiKey && saved.selectedModel !== 'local-fallback') {
            statusDot.className = 'status-dot online';
            statusLabel.textContent = `AI: Gemini Online (${saved.selectedModel})`;
        } else {
            statusDot.className = 'status-dot offline';
            statusLabel.textContent = 'AI: Local Heuristic (No Key)';
        }
    };

    populateSettingsUI();

    // 7. Right-Hand Drawer Controls
    const openDrawer = () => {
        soundManager.playButtonClick();
        populateSettingsUI();
        settingsDrawer.classList.add('open');
        drawerBackdrop.classList.remove('hidden');
    };

    const closeDrawer = () => {
        soundManager.playButtonClick();
        settingsDrawer.classList.remove('open');
        drawerBackdrop.classList.add('hidden');
    };

    btnMenuSettings.addEventListener('click', openDrawer);
    btnOpenSettings.addEventListener('click', openDrawer);
    btnCloseDrawer.addEventListener('click', closeDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);

    // Save Settings
    btnSaveSettings.addEventListener('click', () => {
        soundManager.playButtonClick();
        StorageManager.save({
            geminiApiKey: inputApiKey.value.trim(),
            selectedModel: selectModel.value,
            aiDifficulty: selectDifficulty.value,
            sfxEnabled: toggleSfx.checked,
            hapticsEnabled: toggleHaptics.checked,
            showFields: toggleFields.checked,
            showDebug: toggleDebug.checked
        });
        populateSettingsUI();
        closeDrawer();
    });

    // Fetch Live Models via Gemini REST API
    btnFetchModels.addEventListener('click', async () => {
        soundManager.playButtonClick();
        const apiKey = inputApiKey.value.trim();
        if (!apiKey) {
            alert('Please enter a valid Google Gemini API Key first.');
            return;
        }

        btnFetchModels.textContent = 'Fetching Live Models...';
        btnFetchModels.disabled = true;

        try {
            // 1. Fetch from Google
            const models = await GeminiClient.fetchAvailableModels(apiKey);
            
            // 2. Pick the best default model (Flash is usually fastest for games)
            const recommended = models.find(m => m.id.includes('flash')) || models[1];
            const defaultModelId = recommended ? recommended.id : 'local-fallback';
            
            // 3. ATOMICALLY save the models, the selected model, and the API key
            StorageManager.setAvailableModels(models, defaultModelId, apiKey);
            
            // 4. Now refresh the UI safely
            populateSettingsUI();
            alert(`Success! Retrieved ${models.length - 1} active models from Google.`);
            
        } catch (err) {
            alert(`Error fetching models: ${err.message}`);
        } finally {
            btnFetchModels.textContent = 'Fetch Live Models';
            btnFetchModels.disabled = false;
        }
    });

    // 8. Navigation & Modal Controls
    btnStartGame.addEventListener('click', () => {
        soundManager.playButtonClick();
        mainMenu.classList.add('hidden');
        gameHud.classList.remove('hidden');
        gameState.resetMatch();
        turnManager.initRoundLayout();
        updateHUD(gameState);
    });

    btnHowToPlay.addEventListener('click', () => {
        soundManager.playButtonClick();
        howToPlayModal.classList.remove('hidden');
    });

    const closeRules = () => {
        soundManager.playButtonClick();
        howToPlayModal.classList.add('hidden');
    };
    btnCloseRules.addEventListener('click', closeRules);
    btnRulesBack.addEventListener('click', closeRules);

    btnPauseGame.addEventListener('click', () => {
        soundManager.playButtonClick();
        gameState.togglePause();
        btnPauseGame.querySelector('img').src = 
            gameState.getState() === GameStateManager.STATES.PAUSED 
                ? ASSETS.btnPlay 
                : ASSETS.btnPause;
    });

    btnNextRound.addEventListener('click', () => {
        soundManager.playButtonClick();
        gameOverModal.classList.add('hidden');
        gameState.nextRound();
        turnManager.initRoundLayout();
        updateHUD(gameState);
    });

    btnReturnMenu.addEventListener('click', () => {
        soundManager.playButtonClick();
        gameOverModal.classList.add('hidden');
        gameHud.classList.add('hidden');
        mainMenu.classList.remove('hidden');
        gameState.setState(GameStateManager.STATES.MENU);
    });

    // Handle State Machine UI Updates
    gameState.onStateChange((newState, oldState, payload) => {
        updateHUD(gameState);

        if (newState === GameStateManager.STATES.GAME_OVER) {
            const isHumanWin = payload.winner === 'p1';
            document.getElementById('result-banner').src = isHumanWin ? ASSETS.bannerWin : ASSETS.bannerGameOver;
            document.getElementById('result-title').textContent = isHumanWin ? 'VICTORY!' : 'DEFEAT';
            document.getElementById('result-desc').textContent = isHumanWin 
                ? 'You dominated the magnetic field!' 
                : 'Gemini AI outmaneuvered your dipole polarity!';
            document.getElementById('final-p1-score').textContent = `P1: ${gameState.scoreP1}`;
            document.getElementById('final-p2-score').textContent = `AI: ${gameState.scoreAI}`;

            if (isHumanWin) {
                soundManager.playVictorySound();
            } else {
                soundManager.playDefeatSound();
            }

            setTimeout(() => {
                gameOverModal.classList.remove('hidden');
            }, 600);
        }
    });

    /**
     * Updates Top HUD scores and turn badges.
     * @param {GameStateManager} state 
     */
    function updateHUD(state) {
        document.getElementById('score-p1').textContent = state.scoreP1;
        document.getElementById('score-p2').textContent = state.scoreAI;

        const turnText = document.getElementById('turn-text');
        const aimHint = document.getElementById('aim-hint-text');

        if (state.getState() === GameStateManager.STATES.AI_THINKING) {
            turnText.textContent = 'AI THINKING';
            aimHint.textContent = 'Gemini is calculating magnetic trajectory...';
        } else if (state.activeTurn === 'p1') {
            turnText.textContent = 'YOUR TURN';
            aimHint.textContent = 'Drag from your side & release to launch';
        } else {
            turnText.textContent = 'AI TURN';
            aimHint.textContent = 'Defend the center objective!';
        }
    }

    // 9. Master Animation & Physics Game Loop
    let lastTime = performance.now();

    function gameLoop(currentTime) {
        const deltaSeconds = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // If not paused or in menu, update physics & turn logic
        if (gameState.getState() !== GameStateManager.STATES.PAUSED &&
            gameState.getState() !== GameStateManager.STATES.MENU) {
            
            physicsWorld.update(deltaSeconds);
            turnManager.update();
            effectPool.update(deltaSeconds);
        }

        // Render current visual frame
        renderer.render();

        requestAnimationFrame(gameLoop);
    }

    // Start master loop
    requestAnimationFrame((time) => {
        lastTime = time;
        gameLoop(time);
    });

    console.log('[Main] Magnet Physics Arena fully loaded and ready.');
});