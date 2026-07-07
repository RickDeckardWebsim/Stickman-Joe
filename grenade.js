import { world, enemies, corpses, particles, settledCorpses } from './world.js';
import { Explosion } from './visual-effects.js';
import { PointBloodEmitter } from './gore.js';
import { playSound } from './audio.js';

let grenadeImage;

export class GrenadeEntity {
    constructor(startX, startY, targetX, targetY) {
        this.startX = startX;
        this.startY = startY;
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;

        this.fuseTime = 3000;
        this.spawnTime = Date.now();
        this.landTime = this.spawnTime + 1000;

        this.travelDuration = this.landTime - this.spawnTime;
        
        this.z = 0;
        this.arcHeight = 60;
        this.angle = Math.random() * Math.PI * 2;

        this.radius = 6;
        this.explosionRadius = 250;
        this.damage = 300;

        if (!grenadeImage) {
            grenadeImage = new Image();
            grenadeImage.src = './grenade_icon.png';
        }
    }

    update() {
        const now = Date.now();
        const elapsedTime = now - this.spawnTime;

        if (now < this.landTime) {
            // --- Flying Phase ---
            const travelProgress = elapsedTime / this.travelDuration;
            this.x = this.startX + (this.targetX - this.startX) * travelProgress;
            this.y = this.startY + (this.targetY - this.startY) * travelProgress;
            this.z = 4 * this.arcHeight * (travelProgress - travelProgress ** 2);
            this.angle += 0.1;
        } else {
            // --- On Ground Phase ---
            this.x = this.targetX;
            this.y = this.targetY;
            this.z = 0;

            if (now > this.spawnTime + this.fuseTime) {
                this.explode();
                return true; // Signal for removal
            }
        }
        return false;
    }

    explode() {
        playSound('explosion', { volume: 0.6 });
        particles.push(new Explosion(this.x, this.y, this.explosionRadius));

        // --- Damage Player ---
        if (world.player && !world.player.isDead) {
            const distToPlayer = Math.hypot(this.x - world.player.x, this.y - world.player.y);
            if (distToPlayer < this.explosionRadius) {
                const damageFalloff = 1 - (distToPlayer / this.explosionRadius);
                const finalDamage = this.damage * damageFalloff;
                const impactAngle = Math.atan2(world.player.y - this.y, world.player.x - this.x);
                world.player.takeDamage(finalDamage, impactAngle);
            }
        }

        // --- Damage Enemies ---
        for (const enemy of enemies) {
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (dist < this.explosionRadius) {
                const damageFalloff = 1 - (dist / this.explosionRadius);
                const finalDamage = this.damage * damageFalloff;
                const impactAngle = Math.atan2(enemy.y - this.y, enemy.x - this.x);
                enemy.takeDamage(finalDamage, impactAngle, { weaponName: 'Grenade' });
                if (enemy.health > 0) {
                    enemy.isBleeding = true;
                }
            }
        }

        // --- Dismember Corpses ---
        const allCorpses = [...corpses, ...settledCorpses];
        for (const corpse of allCorpses) {
            let inRange = false;
            for(const point of corpse.points) {
                if (Math.hypot(this.x - point.x, this.y - point.y) < this.explosionRadius) {
                    inRange = true;
                    break;
                }
            }
            if (inRange) this.dismember(corpse);
        }
    }

    dismember(corpse) {
        // Apply a large force to all points of the ragdoll
        for (const p of corpse.points) {
            const angle = Math.atan2(p.y - this.y, p.x - this.x);
            const dist = Math.hypot(p.x - this.x, p.y - this.y);
            const forceFalloff = Math.max(0, 1 - (dist / this.explosionRadius));
            const force = 35 * forceFalloff;

            p.oldx -= Math.cos(angle) * force + (Math.random() - 0.5) * 8;
            p.oldy -= Math.sin(angle) * force + (Math.random() - 0.5) * 8;
        }

        // High chance to break connections and create blood emitters
        for (let i = corpse.sticks.length - 1; i >= 0; i--) {
            if (Math.random() < 0.8) {
                const stick = corpse.sticks[i];
                particles.push(new PointBloodEmitter(stick.p0, 1500));
                particles.push(new PointBloodEmitter(stick.p1, 1500));
                corpse.sticks.splice(i, 1);
            }
        }
        
        // Ensure the corpse is reactivated if it was settled
        if (!corpse.active) {
            corpse.active = true;
            const index = settledCorpses.indexOf(corpse);
            if(index > -1) {
                settledCorpses.splice(index, 1);
                corpses.push(corpse);
            }
        }
    }

    draw(ctx) {
        const shadowAlpha = 0.4 - (this.z / this.arcHeight) * 0.3;
        const shadowSize = this.radius * (1 + this.z / this.arcHeight * 0.5);
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, shadowSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(this.x, this.y - this.z);
        ctx.rotate(this.angle);
        if (grenadeImage.complete && grenadeImage.naturalWidth > 0) {
             ctx.drawImage(grenadeImage, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
        }
        ctx.restore();
        
        const now = Date.now();
        if (now > this.landTime && now < this.spawnTime + this.fuseTime) {
            const fuseProgress = (now - this.landTime) / (this.fuseTime - this.travelDuration);
            if (Math.floor(fuseProgress * 12) % 2 === 0) {
                 ctx.fillStyle = '#ff0000';
                 ctx.beginPath();
                 ctx.arc(this.x, this.y - this.z, 3, 0, Math.PI * 2);
                 ctx.fill();
            }
        }
    }
}