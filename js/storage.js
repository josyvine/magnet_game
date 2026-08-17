/* ==========================================================================
   STORAGE MANAGER
   Handles safe browser persistence (localStorage) for user settings,
   Gemini API key, model selection, audio preferences, and high scores.
   ========================================================================== */

class StorageManager {
    static STORAGE_KEY = 'MAGNET_ARENA_USER_DATA_V1';

    static DEFAULT_DATA = {
        geminiApiKey: '',
        selectedModel: 'local-fallback',
        availableModels: [
            { id: 'local-fallback', displayName: 'Local Physical Heuristic (Offline)' }
        ],
        aiDifficulty: 'medium',     // 'easy', 'medium', 'hard'
        sfxEnabled: true,
        hapticsEnabled: true,
        showFields: true,
        showDebug: false,
        stats: {
            gamesPlayed: 0,
            humanWins: 0,
            aiWins: 0,
            highestKineticImpact: 0
        }
    };

    /**
     * Loads saved settings from localStorage with fallback defaults.
     * @returns {Object} User preferences and credentials
     */
    static load() {
        try {
            const raw = localStorage.getItem(StorageManager.STORAGE_KEY);
            if (!raw) {
                return { ...StorageManager.DEFAULT_DATA };
            }
            const parsed = JSON.parse(raw);
            return {
                ...StorageManager.DEFAULT_DATA,
                ...parsed,
                stats: {
                    ...StorageManager.DEFAULT_DATA.stats,
                    ...(parsed.stats || {})
                }
            };
        } catch (err) {
            console.warn('[StorageManager] Failed to read localStorage:', err);
            return { ...StorageManager.DEFAULT_DATA };
        }
    }

    /**
     * Saves user settings to localStorage.
     * @param {Object} updatedData 
     * @returns {boolean} Success status
     */
    static save(updatedData) {
        try {
            const current = StorageManager.load();
            const merged = { ...current, ...updatedData };
            localStorage.setItem(StorageManager.STORAGE_KEY, JSON.stringify(merged));
            return true;
        } catch (err) {
            console.error('[StorageManager] Failed to write localStorage:', err);
            return false;
        }
    }

    /**
     * Helper to retrieve only the Gemini API Key.
     * @returns {string}
     */
    static getApiKey() {
        return StorageManager.load().geminiApiKey.trim();
    }

    /**
     * Helper to update the selected Gemini model.
     * @param {string} modelId 
     */
    static setSelectedModel(modelId) {
        const data = StorageManager.load();
        data.selectedModel = modelId;
        StorageManager.save(data);
    }

    /**
     * Atomically stores fetched models, active selection, and API key.
     * @param {Array<{id: string, displayName: string}>} modelsList 
     * @param {string} selectedModel
     * @param {string} apiKey
     */
    static setAvailableModels(modelsList, selectedModel = null, apiKey = null) {
        const data = StorageManager.load();
        data.availableModels = modelsList;
        if (selectedModel) {
            data.selectedModel = selectedModel;
        }
        if (apiKey !== null && apiKey !== undefined) {
            data.geminiApiKey = apiKey.trim();
        }
        StorageManager.save(data);
    }

    /**
     * Records match win/loss statistics.
     * @param {'human'|'ai'} winner 
     */
    static recordMatchResult(winner) {
        const data = StorageManager.load();
        data.stats.gamesPlayed += 1;
        if (winner === 'human') {
            data.stats.humanWins += 1;
        } else if (winner === 'ai') {
            data.stats.aiWins += 1;
        }
        StorageManager.save(data);
    }

    /**
     * Resets all storage back to default values.
     */
    static clearAll() {
        try {
            localStorage.removeItem(StorageManager.STORAGE_KEY);
        } catch (e) {
            // Ignore
        }
    }
}