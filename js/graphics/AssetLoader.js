/* ==========================================================================
   ASSET LOADER & CHROMA-KEY PIPELINE
   Preloads all PNG sprite and effect assets asynchronously.
   Integrates client-side Chroma-Key (#00FF00 removal) with un-multiplied
   alpha processing to ensure transparent sprites with zero green fringing.
   ========================================================================== */

class AssetLoader {
    constructor() {
        this.cache = new Map();
        this.totalAssets = 0;
        this.loadedAssets = 0;
        this.onProgress = null; // (loaded, total, percent) => {}
    }

    /**
     * Preloads all images listed in the global ASSETS dictionary.
     * @returns {Promise<void>}
     */
    async loadAll() {
        const entries = Object.entries(ASSETS);
        this.totalAssets = entries.length;
        this.loadedAssets = 0;

        const promises = entries.map(([key, path]) => {
            return this.loadImage(path)
                .then(processedImg => {
                    this.cache.set(path, processedImg);
                    this.loadedAssets++;
                    if (typeof this.onProgress === 'function') {
                        const percent = Math.round((this.loadedAssets / this.totalAssets) * 100);
                        this.onProgress(this.loadedAssets, this.totalAssets, percent);
                    }
                })
                .catch(err => {
                    console.warn(`[AssetLoader] Non-fatal load failure for ${path}:`, err.message);
                    this.loadedAssets++;
                });
        });

        await Promise.all(promises);
        console.log(`[AssetLoader] Finished loading ${this.loadedAssets}/${this.totalAssets} assets.`);
    }

    /**
     * Loads a single image file, detects if green chroma-keying is needed,
     * and returns a clean, hardware-accelerated Canvas image source.
     * @param {string} src 
     * @returns {Promise<HTMLCanvasElement|HTMLImageElement>}
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    // Process image through chroma-key cleaning pipeline
                    const cleanedCanvas = this.processChromaKey(img);
                    resolve(cleanedCanvas);
                } catch (e) {
                    // Fallback to raw image if canvas manipulation fails
                    resolve(img);
                }
            };

            img.onerror = () => {
                reject(new Error(`Failed to load asset at path: ${src}`));
            };

            img.src = src;
        });
    }

    /**
     * Checks pixels for green screen backgrounds (#00FF00) and applies 
     * color-difference keying with un-multiplied alpha falloff.
     * @param {HTMLImageElement} img 
     * @returns {HTMLCanvasElement}
     */
    processChromaKey(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const totalPixels = canvas.width * canvas.height;

        let hasGreenScreen = false;

        // Sample corners to detect if image uses pure green backdrop
        const sampleIndices = [0, (canvas.width - 1) * 4, ((canvas.height - 1) * canvas.width) * 4];
        for (let idx of sampleIndices) {
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            if (g > 200 && r < 60 && b < 60) {
                hasGreenScreen = true;
                break;
            }
        }

        // If green background detected, apply keying
        if (hasGreenScreen) {
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const maxRB = Math.max(r, b);
                const greenDiff = g - maxRB;

                if (greenDiff > 28) {
                    // Background green -> Transparent
                    const alpha = Math.max(0, 1.0 - ((greenDiff - 5) / 32));
                    data[i + 3] = Math.round(data[i + 3] * alpha);
                } else if (greenDiff <= 4) {
                    // Keep solid foreground
                } else {
                    // Edge anti-aliasing
                    const alpha = Math.max(0, 1.0 - (greenDiff / 28));
                    data[i + 3] = Math.round(data[i + 3] * alpha);
                }

                // Despill: suppress green tint in warm flame and gold regions
                if (data[i + 3] > 0 && r > b) {
                    const maxAllowedG = Math.round(r * 0.62 + b * 0.38);
                    if (data[i + 1] > maxAllowedG) {
                        data[i + 1] = maxAllowedG;
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        }

        return canvas;
    }

    /**
     * Retrieves a loaded and processed image canvas from cache.
     * @param {string} path Asset path constant from ASSETS
     * @returns {HTMLCanvasElement|HTMLImageElement|null}
     */
    getImage(path) {
        return this.cache.get(path) || null;
    }
}