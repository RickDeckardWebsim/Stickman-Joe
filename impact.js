import { Particle } from './particle.js';
import { particles, world } from './world.js';

class Debris extends Particle {
    constructor(x, y, vx, vy, size, color = null) {
        super(x, y, vx, vy);
        this.size = size;
        if (color) {
            this.color = color;
        } else {
            const r = 180 + Math.random() * 40;
            const g = 50 + Math.random() * 30;
            const b = 40 + Math.random() * 30;
            this.color = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}

class Dust extends Particle {
    constructor(x, y, vx, vy, size) {
        super(x, y, vx, vy);
        this.size = size;
        this.friction = 0.92; // Dust slows down faster
        this.life = 1.0;
        this.decay = 0.02 + Math.random() * 0.02;
    }

    update() {
        if (!this.active) return false;

        this.life -= this.decay;
        if (this.life <= 0) {
            this.active = false;
            return false; // Just disappeared, not settled
        }
        
        this._updatePhysics();

        return false;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = `rgba(150, 150, 150, ${Math.max(0, this.life * 0.5)})`;
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

export function createBuildingImpactParticles(x, y, projectile, wallNormal, buildingColor) {
    const debrisCount = Math.ceil(projectile.mass * 5);
    const dustCount = Math.ceil(projectile.mass * 8);

    const projectileVel = { x: projectile.vx, y: projectile.vy };
    const projectileSpeed = Math.hypot(projectileVel.x, projectileVel.y);

    const dot = projectileVel.x * wallNormal.x + projectileVel.y * wallNormal.y;
    const reflectX = projectileVel.x - 2 * dot * wallNormal.x;
    const reflectY = projectileVel.y - 2 * dot * wallNormal.y;
    
    // Debris particles with building color variations
    for (let i = 0; i < debrisCount; i++) {
        const speed = (Math.random() * 0.3 + 0.1) * (projectileSpeed / 4);
        const angle = Math.atan2(reflectY, reflectX) + (Math.random() - 0.5) * Math.PI / 2;
        
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        
        const size = (Math.random() * 0.5 + 0.5) * projectile.radius;
        
        // Create color variations of the building color
        let debrisColor;
        if (Math.random() < 0.3) {
            // Brick color
            debrisColor = `rgb(${139 + Math.random() * 30}, ${69 + Math.random() * 20}, ${19 + Math.random() * 15})`;
        } else {
            // Building color with slight variation
            const match = buildingColor.match(/#([0-9a-f]{6})/i);
            if (match) {
                const hex = match[1];
                const r = Math.min(255, parseInt(hex.substr(0,2), 16) + (Math.random() - 0.5) * 40);
                const g = Math.min(255, parseInt(hex.substr(2,2), 16) + (Math.random() - 0.5) * 40);
                const b = Math.min(255, parseInt(hex.substr(4,2), 16) + (Math.random() - 0.5) * 40);
                debrisColor = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
            } else {
                debrisColor = buildingColor;
            }
        }
        
        particles.push(new Debris(x, y, vx, vy, size, debrisColor));
    }

    // Dust particles (reuse existing dust logic)
    for (let i = 0; i < dustCount; i++) {
        const speed = (Math.random() * 0.5 + 0.2) * (projectileSpeed / 6);
        const angle = Math.atan2(reflectY, reflectX) + (Math.random() - 0.5) * Math.PI;

        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        const size = (Math.random() * 0.8 + 0.8) * projectile.radius * 1.5;
        particles.push(new Dust(x, y, vx, vy, size));
    }
}

export function createImpactParticles(x, y, projectile, wallNormal) {
    const debrisCount = Math.ceil(projectile.mass * 5);
    const dustCount = Math.ceil(projectile.mass * 8);

    const projectileVel = { x: projectile.vx, y: projectile.vy };
    const projectileSpeed = Math.hypot(projectileVel.x, projectileVel.y);

    const dot = projectileVel.x * wallNormal.x + projectileVel.y * wallNormal.y;
    const reflectX = projectileVel.x - 2 * dot * wallNormal.x;
    const reflectY = projectileVel.y - 2 * dot * wallNormal.y;
    
    // Debris particles
    for (let i = 0; i < debrisCount; i++) {
        const speed = (Math.random() * 0.3 + 0.1) * (projectileSpeed / 4);
        const angle = Math.atan2(reflectY, reflectX) + (Math.random() - 0.5) * Math.PI / 2;
        
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        
        const size = (Math.random() * 0.5 + 0.5) * projectile.radius;
        particles.push(new Debris(x, y, vx, vy, size));
    }

    // Dust particles
    for (let i = 0; i < dustCount; i++) {
        const speed = (Math.random() * 0.5 + 0.2) * (projectileSpeed / 6);
        const angle = Math.atan2(reflectY, reflectX) + (Math.random() - 0.5) * Math.PI;

        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        const size = (Math.random() * 0.8 + 0.8) * projectile.radius * 1.5;
        particles.push(new Dust(x, y, vx, vy, size));
    }
}