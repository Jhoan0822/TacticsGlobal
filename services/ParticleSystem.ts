// ============================================
// ENHANCED GPU-OPTIMIZED PARTICLE SYSTEM
// Uses typed arrays and batch rendering for performance
// ============================================

export enum ParticleType {
    EXPLOSION,
    SMOKE,
    FIRE,
    SPARK,
    WAKE,
    // NEW TYPES
    DEBRIS,
    SHRAPNEL,
    SMOKE_TRAIL,
    MUZZLE_FLASH,
    DUST,
    WATER_SPLASH,
    BLOOD
}

// Particle data stored in typed arrays for GPU-like performance
interface ParticleData {
    // Position
    x: Float32Array;
    y: Float32Array;
    // Velocity
    vx: Float32Array;
    vy: Float32Array;
    // Properties
    life: Float32Array;
    maxLife: Float32Array;
    size: Float32Array;
    alpha: Float32Array;
    // Color (packed as RGB floats)
    r: Float32Array;
    g: Float32Array;
    b: Float32Array;
    // Type
    type: Uint8Array;
    // Active flag
    active: Uint8Array;
}

const MAX_PARTICLES = 2000;

export class ParticleSystem {
    private data: ParticleData;
    private count: number = 0;
    private freeIndices: number[] = [];

    constructor() {
        // Pre-allocate typed arrays for all particles
        this.data = {
            x: new Float32Array(MAX_PARTICLES),
            y: new Float32Array(MAX_PARTICLES),
            vx: new Float32Array(MAX_PARTICLES),
            vy: new Float32Array(MAX_PARTICLES),
            life: new Float32Array(MAX_PARTICLES),
            maxLife: new Float32Array(MAX_PARTICLES),
            size: new Float32Array(MAX_PARTICLES),
            alpha: new Float32Array(MAX_PARTICLES),
            r: new Float32Array(MAX_PARTICLES),
            g: new Float32Array(MAX_PARTICLES),
            b: new Float32Array(MAX_PARTICLES),
            type: new Uint8Array(MAX_PARTICLES),
            active: new Uint8Array(MAX_PARTICLES)
        };

        // Initialize free indices
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.freeIndices.push(i);
        }
    }

    spawn(x: number, y: number, type: ParticleType, count: number = 1) {
        for (let i = 0; i < count && this.freeIndices.length > 0; i++) {
            const idx = this.freeIndices.pop()!;
            this.initParticle(idx, x, y, type);
            this.data.active[idx] = 1;
            this.count++;
        }
    }

    // Spawn explosion with debris
    spawnExplosion(x: number, y: number, size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'NUCLEAR') {
        const counts = {
            'SMALL': { fire: 8, smoke: 5, spark: 3 },
            'MEDIUM': { fire: 15, smoke: 10, spark: 8, debris: 5 },
            'LARGE': { fire: 25, smoke: 20, spark: 15, debris: 10, shrapnel: 8 },
            'NUCLEAR': { fire: 50, smoke: 40, spark: 30, debris: 20, shrapnel: 15 }
        };

        const c = counts[size];
        this.spawn(x, y, ParticleType.FIRE, c.fire);
        this.spawn(x, y, ParticleType.SMOKE, c.smoke);
        this.spawn(x, y, ParticleType.SPARK, c.spark);
        if (c.debris) this.spawn(x, y, ParticleType.DEBRIS, c.debris);
        if (c.shrapnel) this.spawn(x, y, ParticleType.SHRAPNEL, c.shrapnel);
    }

    // Spawn muzzle flash
    spawnMuzzleFlash(x: number, y: number) {
        this.spawn(x, y, ParticleType.MUZZLE_FLASH, 3);
        this.spawn(x, y, ParticleType.SMOKE, 2);
    }

    // Spawn movement trail (dust for tanks, wake for ships)
    spawnTrail(x: number, y: number, isWater: boolean) {
        if (isWater) {
            this.spawn(x, y, ParticleType.WAKE, 2);
            this.spawn(x, y, ParticleType.WATER_SPLASH, 1);
        } else {
            this.spawn(x, y, ParticleType.DUST, 2);
        }
    }

    private initParticle(idx: number, x: number, y: number, type: ParticleType) {
        const d = this.data;
        d.x[idx] = x;
        d.y[idx] = y;
        d.type[idx] = type;
        d.life[idx] = 0;
        d.alpha[idx] = 1;

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2;

        switch (type) {
            case ParticleType.EXPLOSION:
            case ParticleType.FIRE:
                d.vx[idx] = Math.cos(angle) * speed * 2;
                d.vy[idx] = Math.sin(angle) * speed * 2;
                d.maxLife[idx] = 30 + Math.random() * 20;
                d.size[idx] = 2 + Math.random() * 3;
                d.r[idx] = 255;
                d.g[idx] = Math.random() * 100;
                d.b[idx] = 0;
                break;

            case ParticleType.SMOKE:
                d.vx[idx] = Math.cos(angle) * speed * 0.5;
                d.vy[idx] = Math.sin(angle) * speed * 0.5 - 0.5;
                d.maxLife[idx] = 60 + Math.random() * 40;
                d.size[idx] = 3 + Math.random() * 4;
                d.r[idx] = 100;
                d.g[idx] = 100;
                d.b[idx] = 100;
                break;

            case ParticleType.SPARK:
                d.vx[idx] = Math.cos(angle) * speed * 3;
                d.vy[idx] = Math.sin(angle) * speed * 3;
                d.maxLife[idx] = 15 + Math.random() * 10;
                d.size[idx] = 1 + Math.random();
                d.r[idx] = 255;
                d.g[idx] = 200 + Math.random() * 55;
                d.b[idx] = 100;
                break;

            case ParticleType.DEBRIS:
                d.vx[idx] = Math.cos(angle) * speed * 4;
                d.vy[idx] = Math.sin(angle) * speed * 4 - 2;
                d.maxLife[idx] = 40 + Math.random() * 30;
                d.size[idx] = 2 + Math.random() * 2;
                d.r[idx] = 80;
                d.g[idx] = 60;
                d.b[idx] = 50;
                break;

            case ParticleType.SHRAPNEL:
                d.vx[idx] = Math.cos(angle) * speed * 5;
                d.vy[idx] = Math.sin(angle) * speed * 5;
                d.maxLife[idx] = 20 + Math.random() * 15;
                d.size[idx] = 1 + Math.random();
                d.r[idx] = 150;
                d.g[idx] = 150;
                d.b[idx] = 150;
                break;

            case ParticleType.MUZZLE_FLASH:
                d.vx[idx] = Math.cos(angle) * speed;
                d.vy[idx] = Math.sin(angle) * speed;
                d.maxLife[idx] = 5 + Math.random() * 3;
                d.size[idx] = 3 + Math.random() * 2;
                d.r[idx] = 255;
                d.g[idx] = 220;
                d.b[idx] = 150;
                break;

            case ParticleType.DUST:
                d.vx[idx] = (Math.random() - 0.5) * 0.5;
                d.vy[idx] = -Math.random() * 0.3;
                d.maxLife[idx] = 40 + Math.random() * 30;
                d.size[idx] = 2 + Math.random() * 3;
                d.r[idx] = 180;
                d.g[idx] = 160;
                d.b[idx] = 140;
                break;

            case ParticleType.WAKE:
            case ParticleType.WATER_SPLASH:
                d.vx[idx] = (Math.random() - 0.5) * 0.3;
                d.vy[idx] = 0;
                d.maxLife[idx] = 80 + Math.random() * 40;
                d.size[idx] = 1 + Math.random() * 2;
                d.r[idx] = 200;
                d.g[idx] = 220;
                d.b[idx] = 255;
                break;

            case ParticleType.SMOKE_TRAIL:
                d.vx[idx] = 0;
                d.vy[idx] = -0.2;
                d.maxLife[idx] = 100;
                d.size[idx] = 2 + Math.random();
                d.r[idx] = 120;
                d.g[idx] = 120;
                d.b[idx] = 120;
                break;

            case ParticleType.BLOOD:
                d.vx[idx] = Math.cos(angle) * speed * 2;
                d.vy[idx] = Math.sin(angle) * speed * 2 + 1;
                d.maxLife[idx] = 30 + Math.random() * 20;
                d.size[idx] = 1 + Math.random() * 2;
                d.r[idx] = 180;
                d.g[idx] = 20;
                d.b[idx] = 20;
                break;
        }
    }

    update() {
        const d = this.data;

        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (!d.active[i]) continue;

            d.life[i]++;
            d.x[i] += d.vx[i];
            d.y[i] += d.vy[i];

            // Gravity for debris/shrapnel
            if (d.type[i] === ParticleType.DEBRIS || d.type[i] === ParticleType.SHRAPNEL) {
                d.vy[i] += 0.1; // Gravity
            }

            // Drag
            d.vx[i] *= 0.95;
            d.vy[i] *= 0.95;

            // Fade
            d.alpha[i] = 1 - (d.life[i] / d.maxLife[i]);

            // Size reduction for some types
            if (d.type[i] === ParticleType.FIRE || d.type[i] === ParticleType.SMOKE) {
                d.size[i] *= 0.99;
            }

            if (d.life[i] >= d.maxLife[i]) {
                d.active[i] = 0;
                this.freeIndices.push(i);
                this.count--;
            }
        }
    }

    // Batch render all particles (GPU-optimized approach)
    draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, zoom: number) {
        const d = this.data;
        const halfW = ctx.canvas.width / 2;
        const halfH = ctx.canvas.height / 2;

        ctx.save();

        // Sort by type for batched rendering (same colors together)
        const sortedIndices: number[] = [];
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (d.active[i]) sortedIndices.push(i);
        }

        // Draw in batches by similar color
        for (const idx of sortedIndices) {
            const screenX = (d.x[idx] - offsetX) * zoom + halfW;
            const screenY = (d.y[idx] - offsetY) * zoom + halfH;

            // CRITICAL: Ensure radius is never negative (was causing client crash)
            const radius = Math.max(0.1, d.size[idx] * zoom);

            ctx.globalAlpha = Math.max(0, Math.min(1, d.alpha[idx])); // Clamp alpha too
            ctx.fillStyle = `rgb(${d.r[idx]}, ${d.g[idx]}, ${d.b[idx]})`;
            ctx.beginPath();
            ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // Get active particle count for debugging
    getCount(): number {
        return this.count;
    }
}

export const globalParticleSystem = new ParticleSystem();
