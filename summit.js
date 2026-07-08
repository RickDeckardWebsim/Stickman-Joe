import Enemy from './enemy.js';
import { world, enemies, corpses, settledCorpses } from './world.js';
import { createBloodSplatter } from './gore.js';
import { hasLineOfSight } from './city.js';
import { playSound } from './audio.js';

// --- Summit: a necromancer NPC that follows the player and raises the dead ---

const SUMMIT_HEALTH = 500;
const SUMMIT_SPEED = 2.2;
const SUMMIT_FOLLOW_DISTANCE = 350;   // Ideal distance to keep from player
const SUMMIT_FOLLOW_BUFFER = 80;      // Don't move if within this much of ideal distance
const SUMMIT_RAISE_INTERVAL = 8000;   // Min ms between raise-dead attempts
const SUMMIT_RAISE_RANGE = 400;       // How far Summit can reach corpses
const SUMMIT_RAISE_MAX_HUSKS = 8;     // Max husks Summit maintains at once
const SUMMIT_BLOOD_COLOR = '#b048d8';

let summitKillCount = 0;  // Total kills tracked since Summit spawned

export function getSummitKillCount() { return summitKillCount; }
export function incrementSummitKillCount() { summitKillCount++; }

export default class Summit extends Enemy {
    constructor(x, y) {
        super(x, y);

        // --- Identity ---
        this.name = 'Summit';
        this.isSummit = true;
        this.isCop = false;
        this.isZombie = false;
        this.isHostileActor = false;  // Not inherently hostile — walks around like a normal NPC

        // --- Stats ---
        this.health = SUMMIT_HEALTH;
        this.maxHealth = SUMMIT_HEALTH;
        this.speed = SUMMIT_SPEED;
        this.radius = 17;
        this.color = '#6a2c8a';       // Dark purple skin
        this.bloodColor = SUMMIT_BLOOD_COLOR;
        this.knockbackResistance = 0.85;
        this.bravery = 1.0;
        this.aggressiveness = 0.0;
        this.panicThreshold = 0.0;
        this.shockResistance = 0.99;

        // --- Summit-specific ---
        this.lastRaiseTime = 0;
        this.raiseFlashTime = 0;
        this.enraged = false;          // Becomes hostile if attacked enough
        this.enrageThreshold = 3;      // Hits before becoming hostile
        this.hitCount = 0;
        this.weapon = null;            // Summit doesn't use guns — uses necromancy
        this.state = 'PATROLLING';

        // Purple aura particles
        this.lastAuraTime = 0;
    }

    // --- Summit doesn't witness crimes or react to the witness system ---
    witnessCrime() {}
    witnessDeath() {}
    witnessRelatedDeath() {}
    spreadPanic() {}

    // --- Take damage: count hits, become enraged after enough hits ---
    takeDamage(amount, impactAngle, options = {}) {
        if (this.health <= 0) return;

        // Immune to zombification
        if (options.onHitEffect === 'zombify') return;

        if (options.knockback && options.knockback > 0) {
            this.applyKnockback(options.knockback, impactAngle, options.owner);
        }

        const wasAlive = this.health > 0;
        this.health -= amount;
        this.hitFlashTime = Date.now();
        this.lastImpactAngle = impactAngle;
        this.lastHitByWeapon = options.weaponName || this.lastHitByWeapon;
        this.lastHitBy = options.owner || null;

        if (options.bleedChance > 0 && Math.random() < options.bleedChance) {
            this.isBleeding = true;
            this.bleedDps += options.bleedDps || 0;
            this.lastBloodDripTime = Date.now();
        }

        createBloodSplatter(this.x, this.y, amount, impactAngle, { color: this.bloodColor });

        // Count hits — become enraged after enough
        this.hitCount++;
        if (this.hitCount >= this.enrageThreshold && !this.enraged) {
            this.enraged = true;
            this.isHostileActor = true;
            this.aggressiveness = 1.0;
            this.reactionFlash = { type: 'anger', time: Date.now() };
        }

        if (wasAlive && this.health <= 0) {
            this.deathType = options.isHeadshot ? 'headshot' : 'normal';
            // Summit's death releases all husks
            for (const e of enemies) {
                if (e && e.isHusk && e.health > 0) {
                    e.health = 0;
                    e.deathType = 'normal';
                }
            }
        }
    }

    // --- Custom update: override the normal AI with Summit behavior ---
    update(player, worldRef) {
        const now = Date.now();

        // Skip if dead
        if (this.health <= 0) return;

        // --- Aura particles: emit purple sparkles around Summit ---
        if (now - this.lastAuraTime > 200) {
            this.lastAuraTime = now;
            // Import particles lazily
            import('./world.js').then(w => {
                const angle = Math.random() * Math.PI * 2;
                const dist = this.radius + Math.random() * 15;
                w.particles.push(new AuraParticle(
                    this.x + Math.cos(angle) * dist,
                    this.y + Math.sin(angle) * dist
                ));
            });
        }

        // --- Movement: follow player at a distance ---
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distToPlayer = Math.hypot(dx, dy);

        this.facingAngle = Math.atan2(dy, dx);

        if (distToPlayer > SUMMIT_FOLLOW_DISTANCE + SUMMIT_FOLLOW_BUFFER) {
            // Too far — walk toward player
            const moveAngle = Math.atan2(dy, dx);
            this.x += Math.cos(moveAngle) * this.speed;
            this.y += Math.sin(moveAngle) * this.speed;
            this.isMoving = true;
        } else if (distToPlayer < SUMMIT_FOLLOW_DISTANCE - SUMMIT_FOLLOW_BUFFER) {
            // Too close — back away
            const moveAngle = Math.atan2(-dy, -dx);
            this.x += Math.cos(moveAngle) * this.speed * 0.8;
            this.y += Math.sin(moveAngle) * this.speed * 0.8;
            this.isMoving = true;
        } else {
            // In the sweet spot — wander casually
            if (Math.random() < 0.02) {
                this._wanderAngle = Math.random() * Math.PI * 2;
            }
            if (this._wanderAngle !== undefined) {
                this.x += Math.cos(this._wanderAngle) * this.speed * 0.4;
                this.y += Math.sin(this._wanderAngle) * this.speed * 0.4;
                this.isMoving = true;
            } else {
                this.isMoving = false;
            }
        }

        // --- Constrain to world + building collision ---
        this.x = Math.max(worldRef.wallThickness, Math.min(this.x, worldRef.width - worldRef.wallThickness));
        this.y = Math.max(worldRef.wallThickness, Math.min(this.y, worldRef.height - worldRef.wallThickness));
        if (worldRef.city) this.constrainToCity(worldRef.city);

        // --- Raise dead: periodically convert nearby corpses into Husks ---
        if (now - this.lastRaiseTime > SUMMIT_RAISE_INTERVAL) {
            const huskCount = enemies.filter(e => e && e.isHusk && e.health > 0).length;
            if (huskCount < SUMMIT_RAISE_MAX_HUSKS) {
                this._raiseDead(now);
            }
        }

        // --- Enraged behavior: if attacked enough, fight back with necromancy bursts ---
        if (this.enraged && player) {
            // Rapidly raise dead when enraged
            if (now - this.lastRaiseTime > 3000) {
                this._raiseDead(now);
            }
        }

        // --- Bleed handling ---
        if (this.isBleeding) {
            this._updateBleed(now);
        }

        // --- Zombie rot (Summit doesn't rot) ---
        // --- Puke/Stress (Summit doesn't puke) ---
        // --- Infection (Summit is immune) ---
    }

    _raiseDead(now) {
        // Find nearby corpses (both active and settled)
        const allCorpses = [...corpses, ...settledCorpses];
        let raised = 0;
        const maxRaisePerAttempt = 2;

        for (let i = allCorpses.length - 1; i >= 0 && raised < maxRaisePerAttempt; i--) {
            const corpse = allCorpses[i];
            if (!corpse || corpse._raisedBySummit) continue;

            // Get corpse center position
            let cx, cy;
            if (corpse.points && corpse.points.length > 0) {
                cx = corpse.points.reduce((sum, p) => sum + p.x, 0) / corpse.points.length;
                cy = corpse.points.reduce((sum, p) => sum + p.y, 0) / corpse.points.length;
            } else {
                cx = corpse.x;
                cy = corpse.y;
            }

            const dist = Math.hypot(cx - this.x, cy - this.y);
            if (dist > SUMMIT_RAISE_RANGE) continue;

            // Mark corpse as raised — remove it
            corpse._raisedBySummit = true;
            const corpseIdx = corpses.indexOf(corpse);
            if (corpseIdx >= 0) corpses.splice(corpseIdx, 1);
            const settledIdx = settledCorpses.indexOf(corpse);
            if (settledIdx >= 0) settledCorpses.splice(settledIdx, 1);

            // Spawn a Husk at the corpse position
            const husk = new Husk(cx, cy);
            enemies.push(husk);

            // Visual: purple raise effect
            this.raiseFlashTime = now;
            import('./world.js').then(w => {
                for (let j = 0; j < 8; j++) {
                    const angle = (j / 8) * Math.PI * 2;
                    w.particles.push(new RaiseParticle(cx, cy, Math.cos(angle) * 2, Math.sin(angle) * 2));
                }
            });

            raised++;
        }

        if (raised > 0) {
            this.lastRaiseTime = now;
            playSound('zombie_bite', { volume: 0.4, pitch: 0.5 }); // Low-pitch undead sound
        }
    }

    _updateBleed(now) {
        if (this.bleedDps > 0) {
            this.health -= (this.bleedDps / 1000) * 16;
            if (this.health <= 0) {
                this.health = 0;
                this.deathType = 'bleed';
            }
        }
    }

    // --- Custom draw: purple robes, glowing eyes, raise flash ---
    drawOverBody(ctx, player) {
        const now = Date.now();

        // Purple robe overlay
        ctx.fillStyle = '#4a1a6a';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.1, this.radius * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hood
        ctx.fillStyle = '#2a0a3a';
        ctx.beginPath();
        ctx.arc(0, -this.radius * 0.3, this.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();

        // Glowing purple eyes
        const eyeGlow = 0.5 + Math.sin(now / 300) * 0.3;
        ctx.fillStyle = `rgba(180, 72, 216, ${eyeGlow})`;
        ctx.beginPath();
        ctx.arc(-this.radius * 0.3, -this.radius * 0.35, 2.5, 0, Math.PI * 2);
        ctx.arc(this.radius * 0.3, -this.radius * 0.35, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Raise flash — purple ring expanding outward
        if (now - this.raiseFlashTime < 600) {
            const t = (now - this.raiseFlashTime) / 600;
            const ringRadius = this.radius + t * 40;
            ctx.strokeStyle = `rgba(180, 72, 216, ${1 - t})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Enraged aura — red tint
        if (this.enraged) {
            ctx.fillStyle = `rgba(255, 50, 50, ${0.2 + Math.sin(now / 200) * 0.1})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Override getBodyColor to return purple
    getBodyColor() {
        if (Date.now() - this.hitFlashTime < 100) return '#ffffff';
        return this.color;
    }
}

// --- Husk: purple undead raised by Summit ---

const HUSK_HEALTH = 200;
const HUSK_SPEED = 2.8;        // Faster than normal zombies (2.8 vs ~1.7)
const HUSK_DAMAGE = 30;
const HUSK_COLOR = '#7a3a9a';   // Purple undead
const HUSK_GRAB_RANGE = 55;
const HUSK_GRAB_INTERVAL = 600;

export class Husk extends Enemy {
    constructor(x, y) {
        super(x, y);

        this.name = 'Husk';
        this.isHusk = true;
        this.isZombie = true;        // Husks count as zombies for AI routing
        this.isHostileActor = true;
        this.isCop = false;

        // Purple undead stats
        this.health = HUSK_HEALTH;
        this.maxHealth = HUSK_HEALTH;
        this.speed = HUSK_SPEED;
        this.color = HUSK_COLOR;
        this.bloodColor = '#b048d8';
        this.radius = 15;
        this.bravery = 1.0;
        this.aggressiveness = 1.0;
        this.knockbackResistance = 0.5;

        // Husk doesn't rot (already undead)
        this.zombieRotRate = 0;

        // Calculated attack AI
        this.weapon = null;
        this.grabbingTarget = null;
        this.lastGrabDamageTime = 0;
        this.grabDamageInterval = HUSK_GRAB_INTERVAL;
        this.grabDamage = HUSK_DAMAGE;
        this.biteAttack = {
            range: HUSK_GRAB_RANGE,
            damage: HUSK_DAMAGE,
            cooldown: 800,
            knockback: 3,
        };

        // Target selection: husks target the nearest living non-husk
        this.civilianTarget = null;
        this.lastTargetScan = 0;

        this.state = 'CHASING';
        this.lastBiteTime = Date.now();
    }

    // Husks don't get infected
    infect() {}
    zombify() {}

    // Husks don't rot
    _updateZombieRot() {}

    // Husks don't puke or accumulate stress
    _tryPuke() {}

    // Husk take damage — purple blood, no zombify
    takeDamage(amount, impactAngle, options = {}) {
        if (this.health <= 0) return;
        if (options.onHitEffect === 'zombify') return;

        if (options.knockback && options.knockback > 0) {
            this.applyKnockback(options.knockback, impactAngle, options.owner);
        }

        const wasAlive = this.health > 0;
        this.health -= amount;
        this.hitFlashTime = Date.now();
        this.lastImpactAngle = impactAngle;
        this.lastHitByWeapon = options.weaponName || this.lastHitByWeapon;
        this.lastHitBy = options.owner || null;

        createBloodSplatter(this.x, this.y, amount, impactAngle, { color: this.bloodColor });

        if (wasAlive && this.health <= 0) {
            this.deathType = options.isHeadshot ? 'headshot' : 'normal';
        }
    }

    // Calculated attack AI: predict target position and intercept
    _decideTarget(player, now) {
        if (now - this.lastTargetScan < 1000) return;
        this.lastTargetScan = now;

        // Priority: player if close, else nearest living NPC
        const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);

        let bestTarget = null;
        let bestDist = Infinity;

        if (distToPlayer < 600 && !player.isDead) {
            bestTarget = player;
            bestDist = distToPlayer;
        }

        // Also consider nearby living NPCs (non-husk, non-zombie)
        for (const e of enemies) {
            if (!e || e === this || e.health <= 0 || e.isHusk || e.isSummit) continue;
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < bestDist && d < 500) {
                bestDist = d;
                bestTarget = e;
            }
        }

        this.civilianTarget = bestTarget;
    }

    // Custom update for husk: calculated intercept AI
    update(player, worldRef) {
        const now = Date.now();
        if (this.health <= 0) return;

        this._decideTarget(player, now);

        const target = this.civilianTarget;
        if (!target) {
            // No target — wander toward player
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 10) {
                this.facingAngle = Math.atan2(dy, dx);
                this.x += (dx / dist) * this.speed * 0.5;
                this.y += (dy / dist) * this.speed * 0.5;
                this.isMoving = true;
            }
            return;
        }

        // --- Calculated intercept: predict where target will be ---
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);

        // Predict target's future position based on velocity
        let targetVx = 0, targetVy = 0;
        if (target.lastPosition) {
            targetVx = (target.x - target.lastPosition.x) / 16; // approx velocity
            targetVy = (target.y - target.lastPosition.y) / 16;
        } else if (target === player) {
            // Player velocity approximation
            targetVx = (player.x - (player._lastHuskX || player.x)) / 16;
            targetVy = (player.y - (player._lastHuskY || player.y)) / 16;
            player._lastHuskX = player.x;
            player._lastHuskY = player.y;
        }

        // Predicted intercept point (lead the target)
        const timeToReach = dist / (this.speed * 60); // frames to reach
        const predictX = target.x + targetVx * timeToReach * 0.7;
        const predictY = target.y + targetVy * timeToReach * 0.7;

        const interceptAngle = Math.atan2(predictY - this.y, predictX - this.x);
        this.facingAngle = interceptAngle;

        // Move toward intercept point
        if (dist > this.biteAttack.range) {
            this.x += Math.cos(interceptAngle) * this.speed;
            this.y += Math.sin(interceptAngle) * this.speed;
            this.isMoving = true;
        } else {
            // In range — grab/attack
            this.isMoving = false;
            this._huskAttack(target, now);
        }

        // Constrain to world + building collision
        this.x = Math.max(worldRef.wallThickness, Math.min(this.x, worldRef.width - worldRef.wallThickness));
        this.y = Math.max(worldRef.wallThickness, Math.min(this.y, worldRef.height - worldRef.wallThickness));
        if (worldRef.city) this.constrainToCity(worldRef.city);
    }

    _huskAttack(target, now) {
        if (now - this.lastBiteTime < this.biteAttack.cooldown) return;
        this.lastBiteTime = now;

        if (target.takeDamage) {
            target.takeDamage(this.biteAttack.damage, this.facingAngle, {
                weaponName: 'Husk Claw',
                owner: this,
                knockback: this.biteAttack.knockback,
            });
        }

        // Purple impact effect
        import('./world.js').then(w => {
            for (let i = 0; i < 5; i++) {
                const angle = this.facingAngle + (Math.random() - 0.5) * 1.0;
                w.particles.push(new RaiseParticle(
                    target.x, target.y,
                    Math.cos(angle) * 3, Math.sin(angle) * 3
                ));
            }
        });
    }

    // Custom draw: purple body with darker purple overlay and glowing eyes
    drawOverBody(ctx, player) {
        const now = Date.now();

        // Darker purple body overlay
        ctx.fillStyle = '#4a1a6a';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 0.9, this.radius * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glowing purple eyes
        const eyeGlow = 0.6 + Math.sin(now / 200) * 0.3;
        ctx.fillStyle = `rgba(200, 100, 240, ${eyeGlow})`;
        ctx.beginPath();
        ctx.arc(-this.radius * 0.25, -this.radius * 0.2, 2, 0, Math.PI * 2);
        ctx.arc(this.radius * 0.25, -this.radius * 0.2, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    getBodyColor() {
        if (Date.now() - this.hitFlashTime < 100) return '#ffffff';
        return this.color;
    }
}

// --- Visual effect particles ---

class AuraParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = -0.5 - Math.random() * 0.5; // Float upward
        this.size = 1 + Math.random() * 2;
        this.life = 30 + Math.random() * 20;
        this.maxLife = this.life;
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.life -= 1;
        if (this.life <= 0) this.active = false;
        return !this.active;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.fillStyle = `rgba(180, 72, 216, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

class RaiseParticle {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = 2 + Math.random() * 3;
        this.life = 40 + Math.random() * 20;
        this.maxLife = this.life;
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.92;
        this.vy *= 0.92;
        this.life -= 1;
        if (this.life <= 0) this.active = false;
        return !this.active;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.fillStyle = `rgba(160, 60, 200, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}
