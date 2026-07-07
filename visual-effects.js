import { Particle } from './particle.js';

export class TearParticle extends Particle {
    constructor(x, y, vx, vy, size) {
        super(x, y, vx, vy);
        this.size = size;
        this.friction = 0.94; // Tears flow slower than blood
        this.gravity = 0.05; // Light gravity

        this.life = 15 + Math.random() * 15; // frames in the air
        this.isSplat = false;
        
        this.smearTrail = [];
        this.maxTrailLength = 5;
        this.smearDuration = 30 + Math.random() * 30; // frames to smear
        this.color = `rgba(50, 120, 200, 0.8)`; // Blue tears
    }

    update() {
        if (!this.active) {
            return false;
        }

        if (!this.isSplat) {
            // --- Flying Phase ---
            this._updatePhysics(); // This applies friction and bouncing

            this.life--;
            if (this.life <= 0) {
                this.isSplat = true;
                this.friction = 0.9; // More friction on the ground
                this.vy = 0; // Stop vertical bouncing on splat
                this.smearTrail.push({x: this.x, y: this.y, size: this.size});
            }
        } else {
            // --- Smearing Phase ---
            this._updatePhysics();
            
            this.smearDuration--;
            if (this.smearDuration <= 0 || (Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.05)) {
                this.active = false;
                return true; // Just "settled", ready to be drawn on decal canvas.
            }

            // Reduce size as it smears
            this.size *= 0.99;
            if (this.size < 0.3) {
                this.active = false;
                return true;
            }
            
            this.smearTrail.push({x: this.x, y: this.y, size: this.size});
            if (this.smearTrail.length > this.maxTrailLength) {
                this.smearTrail.shift();
            }
        }

        return false; // Still active
    }

    draw(ctx) {
        // If drawing to decal canvas after being deactivated
        if (!this.active && this.smearTrail.length > 0) {
            this.drawSmear(ctx);
            return;
        }
        
        if (!this.active) return; // Don't draw if inactive and has no trail

        if (this.isSplat) {
            // While actively smearing, draw the smear so far
            this.drawSmear(ctx);
        } else {
            // While flying, draw a simple circle
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawSmear(ctx) {
        if (this.smearTrail.length < 2) {
             if (this.smearTrail.length === 1) {
                // Draw a single splat if it didn't move
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.smearTrail[0].x, this.smearTrail[0].y, this.smearTrail[0].size, 0, Math.PI * 2);
                ctx.fill();
             }
             return;
        }

        ctx.strokeStyle = this.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 1; i < this.smearTrail.length; i++) {
            const p1 = this.smearTrail[i-1];
            const p2 = this.smearTrail[i];
            ctx.lineWidth = Math.max(0.5, p1.size);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    }
}

export class Explosion {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.maxRadius = radius;
        this.life = 0;
        this.duration = 400; // ms
        this.active = true;
    }

    update() {
        this.life += 16; // approx dt
        if (this.life >= this.duration) {
            this.active = false;
        }
        return false; // Never settles
    }

    draw(ctx) {
        const progress = this.life / this.duration;
        const easeOut = 1 - (1 - progress) ** 3; // Ease-out cubic
        const currentRadius = this.maxRadius * easeOut;
        const alpha = 1 - progress;

        // Shockwave ring
        ctx.strokeStyle = `rgba(255, 200, 100, ${alpha * 0.8})`;
        ctx.lineWidth = 10 * (1 - easeOut);
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Core flash
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }
}

export class EffectArea {
    constructor(x, y, radius, duration, damagePerTick, type) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.duration = duration;
        this.damagePerTick = damagePerTick;
        this.type = type; // 'fire', 'acid', 'electric'
        
        this.startTime = Date.now();
        this.lastDamageTime = 0;
        this.damageInterval = 500; // Damage every 500ms
        this.active = true;
        
        this.particles = [];
        this.lastParticleEmit = 0;
        this.particleEmitInterval = 100;
    }

    update() {
        const now = Date.now();
        if (now - this.startTime > this.duration) {
            this.active = false;
            return false;
        }
        
        // Apply damage to entities in area
        if (now - this.lastDamageTime > this.damageInterval) {
            this.applyDamage();
            this.lastDamageTime = now;
        }
        
        // Emit visual particles
        if (now - this.lastParticleEmit > this.particleEmitInterval) {
            this.emitParticles();
            this.lastParticleEmit = now;
        }

        // Update visual particles
        for(let i = this.particles.length - 1; i >= 0; i--) {
            if (!this.particles[i].update()) {
                this.particles.splice(i, 1);
            }
        }
        
        return false;
    }

    applyDamage() {
        import('./world.js').then(worldModule => {
            const { world, enemies } = worldModule;
            const { player } = world;
            const allEntities = [...enemies, player];

            for (const entity of allEntities) {
                 if (!entity || entity.health <= 0) continue;
                 const dist = Math.hypot(this.x - entity.x, this.y - entity.y);
                 if (dist <= this.radius) {
                     entity.takeDamage(this.damagePerTick, 0, { weaponName: `${this.type} area` });
                 }
            }
        });
    }

    emitParticles() {
        const particleCount = 3;
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * this.radius;
            const x = this.x + Math.cos(angle) * dist;
            const y = this.y + Math.sin(angle) * dist;
            this.particles.push(new AreaParticle(x, y, this.type));
        }
    }

    draw(ctx) {
        if (!this.active) return;
        
        const progress = (Date.now() - this.startTime) / this.duration;
        const alpha = 1 - progress;
        
        // Draw main area glow
        let glowColor = 'rgba(255, 255, 255, 0.2)';
        if(this.type === 'fire') glowColor = 'rgba(255, 100, 0, 0.2)';
        if(this.type === 'acid') glowColor = 'rgba(100, 255, 50, 0.2)';
        if(this.type === 'electric') glowColor = 'rgba(100, 100, 255, 0.2)';

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw individual particles
        for (const p of this.particles) {
            p.draw(ctx);
        }
    }
}

class AreaParticle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.life = 0.5 + Math.random() * 0.5;
        this.size = 2 + Math.random() * 3;
        this.type = type;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.02;
        return this.life > 0;
    }

    draw(ctx) {
        let color = '#fff';
        if (this.type === 'fire') color = '#ff8800';
        if (this.type === 'acid') color = '#88ff88';
        if (this.type === 'electric') color = '#8888ff';
        
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}