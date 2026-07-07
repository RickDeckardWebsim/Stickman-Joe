import { world, enemies, corpses, settledCorpses, throwables, particles } from './world.js';
import { playSound } from './audio.js';
import { Explosion, EffectArea } from './visual-effects.js';
import { PointBloodEmitter } from './gore.js';

let throwableImage;

const throwableBaseConfig = {
    minFuse: 2000,
    maxFuse: 5000,
    arcHeight: 60,
};

export class ThrowableEntity {
    constructor(startX, startY, targetX, targetY, throwableData) {
        this.startX = startX;
        this.startY = startY;
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;

        this.data = throwableData;
        this.fuseTime = this.data.fuseTime || 3000;
        this.spawnTime = Date.now();
        this.landTime = this.spawnTime + 1000;
        this.travelDuration = this.landTime - this.spawnTime;

        this.z = 0;
        this.arcHeight = throwableBaseConfig.arcHeight;
        this.angle = Math.random() * Math.PI * 2;
        this.radius = 6;

        this.stuckTo = null;
        this.stuckOffset = { x: 0, y: 0 };

        if (!throwableImage) {
            throwableImage = new Image();
            throwableImage.src = './grenade_icon.png'; // Use a generic icon for now
        }
    }

    update() {
        const now = Date.now();
        
        if (this.stuckTo) {
            if (this.stuckTo.health <= 0) {
                this.stuckTo = null;
                // fall to ground
                this.x = this.x;
                this.y = this.y;
            } else {
                this.x = this.stuckTo.x + this.stuckOffset.x;
                this.y = this.stuckTo.y + this.stuckOffset.y;
            }
        } else {
            const elapsedTime = now - this.spawnTime;

            if (now < this.landTime) {
                // --- Flying Phase ---
                const travelProgress = elapsedTime / this.travelDuration;
                this.x = this.startX + (this.targetX - this.startX) * travelProgress;
                this.y = this.startY + (this.targetY - this.startY) * travelProgress;
                this.z = 4 * this.arcHeight * (travelProgress - travelProgress ** 2);
                this.angle += 0.1;

                // Sticking logic
                if (this.data.sticksToEntities) {
                    for (const entity of [...enemies, world.player]) {
                        if (!entity || entity.health <= 0) continue;
                        const dist = Math.hypot(this.x - entity.x, this.y - entity.y);
                        if (dist < entity.radius + this.radius) {
                            this.stuckTo = entity;
                            this.stuckOffset = {x: this.x - entity.x, y: this.y - entity.y};
                            this.landTime = now; // Stop flying
                            playSound('knife_hit', { volume: 0.4, pitch: 1.2 });
                            break;
                        }
                    }
                }
            } else {
                // --- On Ground Phase ---
                this.x = this.targetX;
                this.y = this.targetY;
                this.z = 0;
            }
        
            if (now > this.spawnTime + this.fuseTime) {
                this.detonate();
                return true; // Signal for removal
            }

            return false;
        }
        
        if (now > this.spawnTime + this.fuseTime) {
            this.detonate();
            return true; // Signal for removal
        }

        return false;
    }

    detonate() {
        playSound('explosion', { volume: 0.6 }); // Generic sound for now

        for (const effect of this.data.effects) {
            this.applyEffect(effect);
        }
    }

    applyEffect(effect) {
        const allEntities = [...enemies, world.player];

        switch(effect.type) {
            case 'explosion':
                particles.push(new Explosion(this.x, this.y, effect.radius));
                for (const entity of allEntities) {
                    if (!entity || entity.health <= 0) continue;
                    const dist = Math.hypot(this.x - entity.x, this.y - entity.y);
                    if (dist < effect.radius) {
                        const damageFalloff = 1 - (dist / effect.radius);
                        const finalDamage = effect.damage * damageFalloff;
                        const impactAngle = Math.atan2(entity.y - this.y, entity.x - this.x);
                        entity.takeDamage(finalDamage, impactAngle, { weaponName: this.data.name });
                        // Dismemberment
                        if (effect.dismembermentChance > 0 && Math.random() < effect.dismembermentChance * damageFalloff) {
                            if (entity.dismember) entity.dismember(impactAngle);
                        }
                    }
                }
                // Dismember corpses too
                for (const corpse of [...corpses, ...settledCorpses]) {
                     let inRange = false;
                     for(const point of corpse.points) {
                         if (Math.hypot(this.x - point.x, this.y - point.y) < effect.radius) {
                             inRange = true;
                             break;
                         }
                     }
                     if (inRange) this.dismemberCorpse(corpse, effect);
                }
                break;
            
            case 'force':
                                const forceKnockbackMultiplier = 2.0;

                for (const entity of allEntities) {
                    if (!entity) continue;
                    const dist = Math.hypot(this.x - entity.x, this.y - entity.y);
                    if (dist < effect.radius && dist > 0) {
                        const falloff = 1 - (dist / effect.radius);
                        const forceVec = { x: (entity.x - this.x) / dist, y: (entity.y - this.y) / dist };
                        
                        // Add rotation
                        const tangentVec = { x: -forceVec.y, y: forceVec.x };
                        const finalForceX = (forceVec.x + tangentVec.x * effect.rotation) * effect.strength * falloff;
                        const finalForceY = (forceVec.y + tangentVec.y * effect.rotation) * effect.strength * falloff;
                        
                        // Calculate knockback angle
                        const knockbackAngle = Math.atan2(finalForceY, finalForceX);
                        const knockbackForce = Math.hypot(finalForceX, finalForceY) * forceKnockbackMultiplier;
                        
                        if (entity.applyKnockback) {
                            entity.applyKnockback(knockbackForce, knockbackAngle);
                        }
                    }
                }
                break;

            case 'damage_over_time':
                                const dotBaseDamage = 5;
                particles.push(new EffectArea(this.x, this.y, effect.radius, effect.duration, dotBaseDamage, effect.damageType));
                break;

            case 'stun':
                for (const entity of allEntities) {
                     if (!entity || entity.health <= 0) continue;
                     const dist = Math.hypot(this.x - entity.x, this.y - entity.y);
                     if (dist < effect.radius) {
                         if (entity.shockTime) {
                             entity.shockTime = Math.max(entity.shockTime, Date.now() + effect.duration);
                         }
                     }
                }
                break;
            
            case 'spawn_entities':
                for (let i = 0; i < effect.count; i++) {
                    const offsetX = (Math.random() - 0.5) * 50;
                    const offsetY = (Math.random() - 0.5) * 50;
                    // For now, only supports spawning mini-grenades
                    if (effect.entityType === 'mini_grenade') {
                        const miniData = generateProceduralThrowable(true); // isChild = true
                        throwables.push(new ThrowableEntity(this.x, this.y, this.x + offsetX, this.y + offsetY, miniData));
                    }
                }
                break;
        }
    }
    
    dismemberCorpse(corpse, effect) {
        // Apply a large force to all points of the ragdoll
        for (const p of corpse.points) {
            const angle = Math.atan2(p.y - this.y, p.x - this.x);
            const dist = Math.hypot(p.x - this.x, p.y - this.y);
            const forceFalloff = Math.max(0, 1 - (dist / effect.radius));
            const force = 35 * forceFalloff;

            p.oldx -= Math.cos(angle) * force + (Math.random() - 0.5) * 8;
            p.oldy -= Math.sin(angle) * force + (Math.random() - 0.5) * 8;
        }

        // High chance to break connections and create blood emitters
        for (let i = corpse.sticks.length - 1; i >= 0; i--) {
            if (Math.random() < (effect.dismembermentChance || 0.5)) {
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
        if (throwableImage.complete && throwableImage.naturalWidth > 0) {
             ctx.drawImage(throwableImage, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
        }
        ctx.restore();
        
        const now = Date.now();
        if (now > this.landTime && now < this.spawnTime + this.fuseTime) {
            const fuseProgress = (now - this.landTime) / (this.fuseTime - (this.landTime - this.spawnTime));
            if (Math.floor(fuseProgress * 12) % 2 === 0) {
                 ctx.fillStyle = '#ff0000';
                 ctx.beginPath();
                 ctx.arc(this.x, this.y - this.z, 3, 0, Math.PI * 2);
                 ctx.fill();
            }
        }
    }
}

const effectGenerationConfig = {
    // Chance for a throwable to have a specific primary effect
    primaryEffectChance: {
        explosion: 0.7,
        force: 0.25,
        damage_over_time: 0.2,
    },
    // Chance to add a secondary effect
    secondaryEffectChance: {
        stun: 0.3,
        force: 0.15, // can be secondary too
        spawn_entities: 0.05, // e.g. cluster bombs
    },
    // Property ranges for each effect
    explosion: {
        radius: { min: 50, max: 350 },
        damage: { min: 50, max: 400 },
        dismembermentChance: { min: 0.1, max: 0.9 },
    },
    force: {
        radius: { min: 100, max: 500 },
        strength: { min: -40, max: 40 }, // negative is pull
        rotation: { min: -1, max: 1 },
    },
    damage_over_time: {
        radius: { min: 80, max: 250 },
        duration: { min: 3000, max: 10000 },
        types: ['fire', 'acid', 'electric']
    },
    stun: {
        radius: { min: 100, max: 400 },
        duration: { min: 1000, max: 5000 },
    },
    spawn_entities: {
        count: {min: 2, max: 8},
        entityType: 'mini_grenade',
    }
};

export function generateProceduralThrowable(isChild = false) {
    const data = {
        name: "Procedural Grenade",
        effects: [],
        fuseTime: throwableBaseConfig.minFuse + Math.random() * (throwableBaseConfig.maxFuse - throwableBaseConfig.minFuse),
        sticksToEntities: Math.random() < 0.15 // 15% chance to be sticky
    };

    let primaryEffectAdded = false;

    // Add primary effects
    for (const [type, chance] of Object.entries(effectGenerationConfig.primaryEffectChance)) {
        if (Math.random() < chance) {
            const config = effectGenerationConfig[type];
            const effect = { type };
            for(const [prop, range] of Object.entries(config)) {
                if (prop === 'entityType') {
                    effect[prop] = range;
                } else if (range.min !== undefined) {
                    effect[prop] = range.min + Math.random() * (range.max - range.min);
                } else if (Array.isArray(range)) {
                    effect[prop] = range[Math.floor(Math.random() * range.length)];
                }
            }
            data.effects.push(effect);
            primaryEffectAdded = true;
        }
    }

    // If no primary effect, add a default small explosion
    if (!primaryEffectAdded) {
        data.effects.push({ type: 'explosion', radius: 80, damage: 60, dismembermentChance: 0.1 });
    }

    // Add secondary effects (if not a child grenade from a cluster)
    if (!isChild) {
        for (const [type, chance] of Object.entries(effectGenerationConfig.secondaryEffectChance)) {
            if (Math.random() < chance) {
                // avoid duplicate effect types
                if (data.effects.some(e => e.type === type)) continue;

                const config = effectGenerationConfig[type];
                const effect = { type };
                for(const [prop, range] of Object.entries(config)) {
                    if (prop === 'entityType') {
                        effect[prop] = range;
                    } else if (range.min !== undefined) {
                        effect[prop] = range.min + Math.random() * (range.max - range.min);
                    }
                }
                data.effects.push(effect);
            }
        }
    }

    // TODO: Generate a better name based on effects
    data.name = "Chaos Grenade";

    return data;
}