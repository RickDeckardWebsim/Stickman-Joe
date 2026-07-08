import { world, corpses, settledCorpses, particles } from './world.js';
import { getValidSpawnPoint, isOnSidewalk } from './city.js';

// --- Rats: small scurrying creatures that roam the city and nibble corpses ---

const MAX_RATS = 30;
const RAT_SPEED = 3.5;
const RAT_SCURRY_SPEED = 5.0;
const RAT_RADIUS = 4;
const RAT_COLOR = '#3a3530';
const RAT_COLOR_DARK = '#2a2520';
const RAT_NIBBLE_RANGE = 15;
const RAT_NIBBLE_INTERVAL = 2000;   // ms between nibble bites
const RAT_TARGET_REACHED_DIST = 8;
const RAT_CORPSE_SEEK_RANGE = 250;  // How far rats can sense corpses
const RAT_CORPSE_SEEK_CHANCE = 0.003; // Chance per frame to seek a corpse
const RAT_DIR_CHANGE_INTERVAL = 1500; // ms before picking new wander target
const RAT_FLEE_DIST = 120;          // Flee from player if this close

export class Rat {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = RAT_RADIUS;
        this.speed = RAT_SPEED;
        this.targetX = x;
        this.targetY = y;
        this.facingAngle = Math.random() * Math.PI * 2;
        this.lastDirChange = 0;
        this.lastNibbleTime = 0;
        this.nibblingCorpse = null;
        this.isNibbling = false;
        this.isScurrying = false;
        this.scurryEndTime = 0;
        this.active = true;
        this.legPhase = Math.random() * Math.PI * 2;
        this.fleeing = false;
        this.lastFleeTime = 0;
    }

    update(player, city, now) {
        if (!this.active) return;

        // --- Flee from player if close ---
        if (player && !player.isDead) {
            const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
            if (distToPlayer < RAT_FLEE_DIST) {
                this.fleeing = true;
                this.lastFleeTime = now;
                this.isNibbling = false;
                this.nibblingCorpse = null;
                // Scurry away from player
                const fleeAngle = Math.atan2(this.y - player.y, this.x - player.x);
                this.targetX = this.x + Math.cos(fleeAngle) * 200;
                this.targetY = this.y + Math.sin(fleeAngle) * 200;
                this.isScurrying = true;
                this.scurryEndTime = now + 1500;
            } else if (now - this.lastFleeTime > 3000) {
                this.fleeing = false;
            }
        }

        // --- Check scurry state ---
        if (now > this.scurryEndTime) {
            this.isScurrying = false;
        }

        const currentSpeed = this.isScurrying ? RAT_SCURRY_SPEED : RAT_SPEED;

        // --- Occasionally seek out a corpse to nibble ---
        if (!this.fleeing && !this.isNibbling && Math.random() < RAT_CORPSE_SEEK_CHANCE) {
            const corpse = this._findNearbyCorpse();
            if (corpse) {
                const c = this._getCorpsePos(corpse);
                this.targetX = c.x;
                this.targetY = c.y;
                this.nibblingCorpse = corpse;
            }
        }

        // --- If we have a target corpse, check if we reached it ---
        if (this.nibblingCorpse && !this.fleeing) {
            const c = this._getCorpsePos(this.nibblingCorpse);
            if (c) {
                const dist = Math.hypot(c.x - this.x, c.y - this.y);
                if (dist < RAT_NIBBLE_RANGE) {
                    // Reached the corpse — nibble
                    this.isNibbling = true;
                    this._nibble(this.nibblingCorpse, now);
                } else {
                    this.targetX = c.x;
                    this.targetY = c.y;
                }
            } else {
                // Corpse no longer exists
                this.nibblingCorpse = null;
                this.isNibbling = false;
            }
        }

        // --- If nibbling, stay put and occasionally nibble ---
        if (this.isNibbling && !this.fleeing) {
            // Check if corpse still exists
            if (!this._corpseExists(this.nibblingCorpse)) {
                this.isNibbling = false;
                this.nibblingCorpse = null;
            } else {
                this._nibble(this.nibblingCorpse, now);
                return; // Stay put while nibbling
            }
        }

        // --- Movement: scurry toward target ---
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < RAT_TARGET_REACHED_DIST) {
            // Reached target — pick a new one
            this._pickNewTarget(city, now);
        } else {
            const moveAngle = Math.atan2(dy, dx);
            this.facingAngle = moveAngle;
            this.x += Math.cos(moveAngle) * currentSpeed;
            this.y += Math.sin(moveAngle) * currentSpeed;
            this.legPhase += 0.3;
        }

        // --- Constrain to world + building collision ---
        this.x = Math.max(world.wallThickness, Math.min(this.x, world.width - world.wallThickness));
        this.y = Math.max(world.wallThickness, Math.min(this.y, world.height - world.wallThickness));

        // Simple building avoidance: if inside a building, push out
        if (city && city.buildings) {
            for (const building of city.buildings) {
                if (this.x > building.x && this.x < building.x + building.width &&
                    this.y > building.y && this.y < building.y + building.height) {
                    // Push to nearest edge
                    const dL = this.x - building.x;
                    const dR = (building.x + building.width) - this.x;
                    const dT = this.y - building.y;
                    const dB = (building.y + building.height) - this.y;
                    const minD = Math.min(dL, dR, dT, dB);
                    if (minD === dL) this.x = building.x - this.radius;
                    else if (minD === dR) this.x = building.x + building.width + this.radius;
                    else if (minD === dT) this.y = building.y - this.radius;
                    else this.y = building.y + building.height + this.radius;
                    // Pick new target after hitting a wall
                    this._pickNewTarget(city, now);
                }
            }
        }
    }

    _pickNewTarget(city, now) {
        if (city && city.sidewalks && city.sidewalks.length > 0) {
            // Pick a random sidewalk point
            const sidewalk = city.sidewalks[Math.floor(Math.random() * city.sidewalks.length)];
            this.targetX = sidewalk.x + Math.random() * sidewalk.width;
            this.targetY = sidewalk.y + Math.random() * sidewalk.height;
        } else {
            // Fallback: random nearby point
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 100;
            this.targetX = this.x + Math.cos(angle) * dist;
            this.targetY = this.y + Math.sin(angle) * dist;
        }
        this.lastDirChange = now;
    }

    _findNearbyCorpse() {
        const allCorpses = [...corpses, ...settledCorpses];
        let nearest = null;
        let nearestDist = RAT_CORPSE_SEEK_RANGE;

        for (const corpse of allCorpses) {
            if (!corpse || corpse._beingEaten) continue;
            const c = this._getCorpsePos(corpse);
            if (!c) continue;
            const d = Math.hypot(c.x - this.x, c.y - this.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = corpse;
            }
        }
        return nearest;
    }

    _getCorpsePos(corpse) {
        if (corpse.points && corpse.points.length > 0) {
            const cx = corpse.points.reduce((s, p) => s + p.x, 0) / corpse.points.length;
            const cy = corpse.points.reduce((s, p) => s + p.y, 0) / corpse.points.length;
            return { x: cx, y: cy };
        }
        if (corpse.x !== undefined) return { x: corpse.x, y: corpse.y };
        return null;
    }

    _corpseExists(corpse) {
        return corpses.includes(corpse) || settledCorpses.includes(corpse);
    }

    _nibble(corpse, now) {
        if (now - this.lastNibbleTime < RAT_NIBBLE_INTERVAL) return;
        this.lastNibbleTime = now;

        // Remove a small point from the corpse ragdoll (nibble damage)
        if (corpse.points && corpse.points.length > 3) {
            // Remove a random non-essential point
            const removable = corpse.points.filter(p => p !== corpse.headPoint && p !== corpse.neckPoint);
            if (removable.length > 0) {
                const victim = removable[Math.floor(Math.random() * removable.length)];
                corpse.points = corpse.points.filter(p => p !== victim);
                corpse.sticks = corpse.sticks.filter(s => s.p0 !== victim && s.p1 !== victim);

                // Small blood particle
                const vp = this._getCorpsePos(corpse);
                if (vp) {
                    import('./world.js').then(w => {
                        for (let i = 0; i < 2; i++) {
                            const a = Math.random() * Math.PI * 2;
                            w.particles.push(new NibbleParticle(vp.x, vp.y, Math.cos(a) * 0.8, Math.sin(a) * 0.8));
                        }
                    });
                }
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.facingAngle);

        // Body — small dark oval
        ctx.fillStyle = this.isScurrying ? RAT_COLOR_DARK : RAT_COLOR;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, this.radius * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head — slightly forward
        ctx.fillStyle = RAT_COLOR_DARK;
        ctx.beginPath();
        ctx.arc(this.radius * 0.7, 0, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Ears — tiny triangles
        ctx.fillStyle = RAT_COLOR_DARK;
        ctx.beginPath();
        ctx.moveTo(this.radius * 0.5, -this.radius * 0.4);
        ctx.lineTo(this.radius * 0.8, -this.radius * 0.6);
        ctx.lineTo(this.radius * 0.7, -this.radius * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(this.radius * 0.5, this.radius * 0.4);
        ctx.lineTo(this.radius * 0.8, this.radius * 0.6);
        ctx.lineTo(this.radius * 0.7, this.radius * 0.2);
        ctx.closePath();
        ctx.fill();

        // Tail — long thin curve behind
        ctx.strokeStyle = RAT_COLOR_DARK;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-this.radius, 0);
        const tailWag = Math.sin(this.legPhase * 0.5) * 3;
        ctx.quadraticCurveTo(-this.radius * 2, tailWag, -this.radius * 2.5, tailWag * 1.5);
        ctx.stroke();

        // Legs — tiny animated lines
        const legOffset = Math.sin(this.legPhase) * 2;
        ctx.strokeStyle = RAT_COLOR_DARK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -this.radius * 0.5);
        ctx.lineTo(legOffset, -this.radius * 1.2);
        ctx.moveTo(0, this.radius * 0.5);
        ctx.lineTo(-legOffset, this.radius * 1.2);
        ctx.moveTo(-this.radius * 0.5, -this.radius * 0.5);
        ctx.lineTo(-legOffset * 0.7, -this.radius * 1.2);
        ctx.moveTo(-this.radius * 0.5, this.radius * 0.5);
        ctx.lineTo(legOffset * 0.7, this.radius * 1.2);
        ctx.stroke();

        // Nibble indicator — tiny red dot when eating
        if (this.isNibbling) {
            ctx.fillStyle = 'rgba(180, 30, 30, 0.6)';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

// --- Nibble particle: tiny dark red speck ---
class NibbleParticle {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = 1 + Math.random();
        this.life = 15 + Math.random() * 10;
        this.maxLife = this.life;
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.9;
        this.vy *= 0.9;
        this.life -= 1;
        if (this.life <= 0) this.active = false;
        return !this.active;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.fillStyle = `rgba(120, 20, 20, ${alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- Rat manager: spawns and maintains rat population ---
export class RatManager {
    constructor() {
        this.rats = [];
        this.initialized = false;
    }

    init(city) {
        if (this.initialized || !city) return;
        this.initialized = true;
        // Spawn initial rats spread across the city
        for (let i = 0; i < 15; i++) {
            const point = getValidSpawnPoint(city);
            this.rats.push(new Rat(point.x, point.y));
        }
    }

    update(player, city, now) {
        if (!this.initialized) this.init(city);
        if (!city) return;

        // Update all rats
        for (let i = this.rats.length - 1; i >= 0; i--) {
            const rat = this.rats[i];
            if (!rat || !rat.active) {
                this.rats.splice(i, 1);
                continue;
            }
            rat.update(player, city, now);
        }

        // Maintain population — spawn more if below threshold
        if (this.rats.length < MAX_RATS && Math.random() < 0.02) {
            const point = getValidSpawnPoint(city);
            this.rats.push(new Rat(point.x, point.y));
        }
    }

    draw(ctx) {
        for (const rat of this.rats) {
            rat.draw(ctx);
        }
    }
}
