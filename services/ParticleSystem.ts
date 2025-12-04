export enum ParticleType {
    EXPLOSION,
    SMOKE,
    FIRE,
    SPARK,
    WAKE
}

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
    type: ParticleType;
    alpha: number;
}

export class ParticleSystem {
    private particles: Particle[] = [];
    private pool: Particle[] = [];

    constructor() { }

    spawn(x: number, y: number, type: ParticleType, count: number = 1) {
        for (let i = 0; i < count; i++) {
            let p = this.pool.pop();
            if (!p) {
                p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '', type: ParticleType.EXPLOSION, alpha: 1 };
            }
            this.initParticle(p, x, y, type);
            this.particles.push(p);
        }
    }

    private initParticle(p: Particle, x: number, y: number, type: ParticleType) {
        p.x = x;
        p.y = y;
        p.type = type;
        p.life = 0;

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2;

        switch (type) {
            case ParticleType.EXPLOSION:
                p.vx = Math.cos(angle) * speed * 2;
                p.vy = Math.sin(angle) * speed * 2;
                p.maxLife = 30 + Math.random() * 20;
                p.size = 2 + Math.random() * 3;
                p.color = `255, ${Math.floor(Math.random() * 100)}, 0`;
                break;
            case ParticleType.SMOKE:
                p.vx = Math.cos(angle) * speed * 0.5;
                p.vy = Math.sin(angle) * speed * 0.5 - 0.5; // Rise up
                p.maxLife = 60 + Math.random() * 40;
                p.size = 3 + Math.random() * 4;
                p.color = '100, 100, 100';
                break;
            case ParticleType.FIRE:
                p.vx = (Math.random() - 0.5) * 0.5;
                p.vy = -Math.random() * 1.5; // Rise fast
                p.maxLife = 20 + Math.random() * 20;
                p.size = 2 + Math.random() * 3;
                p.color = `255, ${Math.floor(Math.random() * 150)}, 0`;
                break;
            case ParticleType.WAKE:
                p.vx = 0;
                p.vy = 0;
                p.maxLife = 100;
                p.size = 1 + Math.random();
                p.color = '200, 200, 255';
                break;
        }
        p.alpha = 1;
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life++;
            p.x += p.vx;
            p.y += p.vy;

            // Drag
            p.vx *= 0.95;
            p.vy *= 0.95;

            // Fade
            p.alpha = 1 - (p.life / p.maxLife);

            if (p.life >= p.maxLife) {
                this.pool.push(p);
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, zoom: number) {
        ctx.save();
        this.particles.forEach(p => {
            const screenX = (p.x - offsetX) * zoom + ctx.canvas.width / 2;
            const screenY = (p.y - offsetY) * zoom + ctx.canvas.height / 2;

            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = `rgb(${p.color})`;
            ctx.beginPath();
            ctx.arc(screenX, screenY, p.size * zoom, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }
}

export const globalParticleSystem = new ParticleSystem();
