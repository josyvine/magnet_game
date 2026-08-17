/* ==========================================================================
   SOUND MANAGER & HAPTIC FEEDBACK
   Zero-dependency procedural sound synthesis using the Web Audio API.
   Generates authentic metallic snaps, electric crackles, rim bounces,
   launch whooshes, UI feedback, and mobile vibration sequences.
   ========================================================================== */

class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.initialized = false;
    }

    /**
     * Initializes the Web Audio context on the first user touch or click.
     * Complies with modern mobile browser autoplay policies.
     */
    initContext() {
        if (this.initialized) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = 0.65;
                this.masterGain.connect(this.ctx.destination);
                this.initialized = true;
            }
        } catch (err) {
            console.warn('[SoundManager] Web Audio initialization failed:', err);
        }
    }

    /**
     * Resumes audio context if suspended by browser.
     */
    resumeContext() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Plays sharp metallic magnetic snap / contact sound.
     * @param {number} intensity Normalized force (0.0 to 1.0)
     */
    playSnapSound(intensity = 0.8) {
        if (!this.canPlaySound()) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // High-frequency metallic fundamental with fast pitch drop
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200 + intensity * 600, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.07);

        // Exponential decay envelope
        gain.gain.setValueAtTime(Math.min(1.0, 0.4 + intensity * 0.5), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.09);

        this.triggerHaptic([35, 20, 45]);
    }

    /**
     * Plays heavy wooden rim collision thud.
     * @param {number} speed Impact speed
     */
    playImpactSound(speed = 200) {
        if (!this.canPlaySound()) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const clampedSpeed = Math.min(800, speed);
        const pitch = 90 + (clampedSpeed / 800) * 110;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

        gain.gain.setValueAtTime(Math.min(0.8, 0.2 + (clampedSpeed / 800) * 0.6), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.15);

        this.triggerHaptic(25);
    }

    /**
     * Plays slingshot launch whoosh sound.
     * @param {number} power Launch impulse power
     */
    playLaunchSound(power = 300) {
        if (!this.canPlaySound()) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(380 + (power / 900) * 250, now + 0.14);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.17);

        this.triggerHaptic(15);
    }

    /**
     * Plays turn transition alert sound.
     * @param {boolean} isPlayerTrue True if now Player 1's turn
     */
    playTurnSound(isPlayerTrue = true) {
        if (!this.canPlaySound()) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        const startFreq = isPlayerTrue ? 440 : 330;
        const endFreq = isPlayerTrue ? 660 : 440;

        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    /**
     * Plays harmonic victory chime sequence.
     */
    playVictorySound() {
        if (!this.canPlaySound()) return;

        const notes = [440, 554.37, 659.25, 880]; // A Major arpeggio
        notes.forEach((freq, index) => {
            const now = this.ctx.currentTime + index * 0.11;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.3);
        });

        this.triggerHaptic([60, 40, 60, 40, 100]);
    }

    /**
     * Plays descending minor defeat sound.
     */
    playDefeatSound() {
        if (!this.canPlaySound()) return;

        const notes = [440, 392, 349.23, 293.66]; // Descending D minor
        notes.forEach((freq, index) => {
            const now = this.ctx.currentTime + index * 0.14;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.26);
        });

        this.triggerHaptic([80, 50, 120]);
    }

    /**
     * Plays UI button press click.
     */
    playButtonClick() {
        if (!this.canPlaySound()) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.06);

        this.triggerHaptic(10);
    }

    /**
     * Validates whether audio is enabled in user settings and audio context is ready.
     * @returns {boolean}
     */
    canPlaySound() {
        const settings = StorageManager.load();
        if (!settings.sfxEnabled) return false;
        if (!this.initialized || !this.ctx) {
            this.initContext();
        }
        this.resumeContext();
        return this.initialized && this.ctx.state === 'running';
    }

    /**
     * Triggers mobile haptic feedback if enabled.
     * @param {number|number[]} pattern Duration in ms or vibration cadence array
     */
    triggerHaptic(pattern = 20) {
        const settings = StorageManager.load();
        if (settings.hapticsEnabled && 'vibrate' in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {
                // Ignore devices where vibration permission is restricted
            }
        }
    }
}