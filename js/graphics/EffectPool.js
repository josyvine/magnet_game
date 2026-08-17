/* ==========================================================================
   EFFECT OBJECT POOL & VFX MANAGER
   High-performance particle and visual effect pooling.
   Prevents runtime memory garbage collection on mobile devices.
   Manages:
   1. 8-Frame Collision Sheet animations (4 columns x 2 rows).
   2. Kinetic Metal Shard fragmentation bursts.
   3. Dust Shockwave explosions on rim collisions.
   4. Point-of-impact Glow and Spark particles.
   ========================================================================== */

class EffectPool {
    /**
     * @param {AssetLoader} assetLoader 
     */
    constructor(assetLoader) {
        this.assets = assetLoader;

        // Active effect collections
        this.activeSheetAnims = [];
        this.activeShards = [];
        this.activeDust = [];
        this.activeGlows = [];

        // Pre-allocated object pools
        this.shardPool = [];
        this.dustPool = [];
        this.glowPool = [];

        this.initPools();
    }

    /**
     * Pre-allocates reusable particle instances.
     */
    initPools() {
        // Pool 60 metal shards
        for (let i = 0; i < 60; i++) {
            this.shardPool.push({
                x: 0, y: 0, vx: 0, vy: 0,
                angle: 0, angularVel: 0,
                size: 0, alpha: 1, maxLife: 1, life: 0,
                active: false
            });
        }

        // Pool 15 dust shockwaves
        for (let i = 0; i < 15; i++) {
            this.dustPool.push({
                x: 0, y: 0,
                size: 0, maxSize: 0,
                alpha: 1, maxLife: 1, life: 0,
                active: false
            });
        }

        // Pool 20 glow flashes
        for (let i = 0; i < 20; i++) {
            this.glowPool.push({
                x: 0, y: 0,
                radius: 0, maxRadius: 0,
                color: '#00f6ff',
                alpha: 1, maxLife: 1, life: 0,
                active: false
            });
        }
    }

    /**
     * Spawns synchronized 8-frame collision sprite sheet animation at impact point.
     * @param {number} x Impact point X
     * @param {number} y Impact point Y
     * @param {number} intensity Impact speed factor (0.0 to 1.0)
     */
    spawnCollisionSheet(x, y, intensity = 1.0) {
        this.activeSheetAnims.push({
            x,
            y,
            frame: 0,
            totalFrames: 8,
            frameTimer: 0,
            frameDuration: 0.045, // Seconds per frame (~22 FPS playback)
            scale: 0.75 + intensity * 0.5,
            rotation: Math.random() * Math.PI * 2
        });

        // Trigger supplementary kinetic metal shards
        this.spawnShards(x, y, Math.round(8 + intensity * 16));
        this.spawnGlowFlash(x, y, 60 + intensity * 60, intensity > 0.6 ? '#ff5722' : '#00f6ff');
    }

    /**
     * Spawns rim impact dust explosion shockwave.
     * @param {number} x 
     * @param {number} y 
     * @param {number} speed 
     */
    spawnDustShockwave(x, y, speed) {
        const dust = this.dustPool.find(d => !d.active) || { active: false };
        dust.x = x;
        dust.y = y;
        dust.size = 20;
        dust.maxSize = Math.min(180, 40 + speed * 0.35);
        dust.alpha = 1.0;
        dust.maxLife = 0.55;
        dust.life = 0;
        dust.active = true;

        if (!this.activeDust.includes(dust)) {
            this.activeDust.push(dust);
        }
    }

    /**
     * Spawns kinetic fragmentation metal shards.
     * @param {number} x 
     * @param {number} y 
     * @param {number} count 
     */
    spawnShards(x, y, count = 12) {
        let spawned = 0;
        for (let shard of this.shardPool) {
            if (!shard.active) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 120 + Math.random() * 420;

                shard.x = x;
                shard.y = y;
                shard.vx = Math.cos(angle) * speed;
                shard.vy = Math.sin(angle) * speed;
                shard.angle = Math.random() * Math.PI * 2;
                shard.angularVel = (Math.random() - 0.5) * 20;
                shard.size = 8 + Math.random() * 14;
                shard.alpha = 1.0;
                shard.maxLife = 0.4 + Math.random() * 0.3;
                shard.life = 0;
                shard.active = true;

                if (!this.activeShards.includes(shard)) {
                    this.activeShards.push(shard);
                }

                spawned++;
                if (spawned >= count) break;
            }
        }
    }

    /**
     * Spawns radial point-of-impact glow energy burst.
     */
    spawnGlowFlash(x, y, maxRadius, color = '#00f6ff') {
        const glow = this.glowPool.find(g => !g.active) || { active: false };
        glow.x = x;
        glow.y = y;
        glow.radius = 5;
        glow.maxRadius = maxRadius;
        glow.color = color;
        glow.alpha = 1.0;
        glow.maxLife = 0.25;
        glow.life = 0;
        glow.active = true;

        if (!this.activeGlows.includes(glow)) {
            this.activeGlows.push(glow);
        }
    }

    /**
     * Updates physics, frame indices, and lifetimes for all active effects.
     * @param {number} dt Frame time delta in seconds
     */
    update(dt) {
        // 1. Update 8-Frame Sprite Sheets (4 cols x 2 rows)
        for (let i = this.activeSheetAnims.length - 1; i >= 0; i--) {
            const anim = this.activeSheetAnims[i];
            anim.frameTimer += dt;
            if (anim.frameTimer >= anim.frameDuration) {
                anim.frameTimer = 0;
                anim.frame++;
                if (anim.frame >= anim.totalFrames) {
                    this.activeSheetAnims.splice(i, 1);
                }
            }
        }

        // 2. Update Metal Shards
        for (let i = this.activeShards.length - 1; i >= 0; i--) {
            const s = this.activeShards[i];
            s.life += dt;
            if (s.life >= s.maxLife) {
                s.active = false;
                this.activeShards.splice(i, 1);
                continue;
            }

            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vx *= 0.94; // Air resistance
            s.vy *= 0.94;
            s.angle += s.angularVel * dt;
            s.alpha = 1.0 - (s.life / s.maxLife);
        }

        // 3. Update Dust Shockwaves
        for (let i = this.activeDust.length - 1; i >= 0; i--) {
            const d = this.activeDust[i];
            d.life += dt;
            if (d.life >= d.maxLife) {
                d.active = false;
                this.activeDust.splice(i, 1);
                continue;
            }

            const progress = d.life / d.maxLife;
            d.size = d.maxSize * Math.sin(progress * (Math.PI / 2));
            d.alpha = 1.0 - progress;
        }

        // 4. Update Glow Flashes
        for (let i = this.activeGlows.length - 1; i >= 0; i--) {
            const g = this.activeGlows[i];
            g.life += dt;
            if (g.life >= g.maxLife) {
                g.active = false;
                this.activeGlows.splice(i, 1);
                continue;
            }

            const progress = g.life / g.maxLife;
            g.radius = g.maxRadius * progress;
            g.alpha = 1.0 - progress;
        }
    }

    /**
     * Renders all active particle layers onto game canvas.
     * @param {CanvasRenderingContext2D} ctx 
     */
    render(ctx) {
        // A. Draw Dust Shockwaves
        const dustImg = this.assets.getImage(ASSETS.dustExplosion);
        for (let d of this.activeDust) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, d.alpha * 0.85);
            if (dustImg) {
                ctx.drawImage(dustImg, d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
            } else {
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.size / 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(215, 180, 140, 0.4)';
                ctx.fill();
            }
            ctx.restore();
        }

        // B. Draw Radial Glow Energy Bursts
        for (let g of this.activeGlows) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, g.alpha);
            const gradient = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.radius);
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.4, g.color);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // C. Draw Metal Fragmentation Shards
        const shardsImg = this.assets.getImage(ASSETS.metalShards);
        for (let s of this.activeShards) {
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.angle);
            ctx.globalAlpha = Math.max(0, s.alpha);

            if (shardsImg) {
                ctx.drawImage(shardsImg, -s.size / 2, -s.size / 2, s.size, s.size);
            } else {
                ctx.fillStyle = '#ffb300';
                ctx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size * 0.6);
            }
            ctx.restore();
        }

        // D. Draw 8-Frame Collision Sprite Sheet (4 cols x 2 rows)
        const sheetImg = this.assets.getImage(ASSETS.collisionSheet);
        if (sheetImg) {
            const cols = 4;
            const rows = 2;
            const frameWidth = sheetImg.width / cols;
            const frameHeight = sheetImg.height / rows;

            for (let anim of this.activeSheetAnims) {
                const col = anim.frame % cols;
                const row = Math.floor(anim.frame / cols);
                const sx = col * frameWidth;
                const sy = row * frameHeight;

                const destSize = 160 * anim.scale;

                ctx.save();
                ctx.translate(anim.x, anim.y);
                ctx.rotate(anim.rotation);
                ctx.drawImage(
                    sheetImg,
                    sx, sy, frameWidth, frameHeight,
                    -destSize / 2, -destSize / 2, destSize, destSize
                );
                ctx.restore();
            }
        }
    }
}