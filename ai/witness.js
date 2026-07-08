import { world, enemies } from '../world.js';
import { hasLineOfSight } from '../city.js';

// === Detection System Constants ===
const VISION_RANGE = 500;
const VISION_CONE_HALF_ANGLE = Math.PI * 0.55; // ~100° vision cone
const HEARING_RANGE_GUNSHOT = 800;
const HEARING_RANGE_SCREAM = 300;
const ALERT_PROPAGATION_RANGE = 400;
const ALERT_DURATION = 15000;
const PANIC_SPREAD_RADIUS = 200;
const REPORT_COOLDOWN = 5000;

const activeAlerts = [];

// === Vision Cone Check ===
function canSee(witness, targetX, targetY) {
    const dx = targetX - witness.x;
    const dy = targetY - witness.y;
    const dist = Math.hypot(dx, dy);
    if (dist > VISION_RANGE) return false;
    if (dist < 10) return true;
    const angleToTarget = Math.atan2(dy, dx);
    let angleDiff = angleToTarget - witness.facingAngle;
    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    if (Math.abs(angleDiff) > VISION_CONE_HALF_ANGLE) return false;
    const buildings = world.city ? world.city.buildings : [];
    return hasLineOfSight(witness.x, witness.y, targetX, targetY, buildings);
}

// === Hearing Check ===
function canHear(witness, soundX, soundY, soundRange) {
    return Math.hypot(witness.x - soundX, witness.y - soundY) < soundRange;
}

// === Crime Witnessing ===
export function witnessCrime(witness, crimeType, criminal, victim) {
    if (['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING'].includes(witness.state)) return;
    if (witness.health <= 0) return;

    if (witness.isCop) {
        if (criminal === world.player) {
            witness.state = 'CHASING';
            witness.lastKnownPlayerPos = { x: criminal.x, y: criminal.y };
            world.wantedLevel = Math.min(5, world.wantedLevel + 0.5);
            witness.reactionFlash = { type: 'anger', time: Date.now() };
            propagateAlert(criminal.x, criminal.y, 'player', witness.enemyId);
        } else if (criminal && criminal.isHostileActor) {
            witness.state = 'CHASING';
            witness.policeTarget = criminal;
            witness.reactionFlash = { type: 'anger', time: Date.now() };
        } else if (crimeType === 'zombie_attack' && criminal.isZombie) {
            witness.state = 'CHASING';
            witness.policeTarget = criminal;
            witness.knowsZombiesAreHostile = true;
            witness.reactionFlash = { type: 'anger', time: Date.now() };
        }
    } else {
        witness.state = 'FLEEING';
        witness.fleeTarget = criminal;
        witness.lastSeenFleeTargetTime = Date.now();
        witness.stateChangeCooldown = Date.now() + 5000 + Math.random() * 3000;
        witness.reactionFlash = { type: 'fear', time: Date.now() };

        // Civilian reports crime — raises wanted level
        if (!witness._lastReportTime || Date.now() - witness._lastReportTime > REPORT_COOLDOWN) {
            witness._lastReportTime = Date.now();
            let copNearby = false;
            for (const e of enemies) {
                if (e && e.isCop && e.health > 0 && Math.hypot(e.x - witness.x, e.y - witness.y) < 200) {
                    copNearby = true; break;
                }
            }
            world.wantedLevel = Math.min(5, world.wantedLevel + (copNearby ? 0.3 : 0.1));
        }
    }
}

// === Alert Propagation — cops share info with nearby cops ===
function propagateAlert(x, y, type, sourceId) {
    activeAlerts.push({ x, y, time: Date.now(), type, sourceId });
    for (const cop of enemies) {
        if (!cop || !cop.isCop || cop.health <= 0 || cop.enemyId === sourceId) continue;
        if (cop.state === 'CHASING' || cop.state === 'STRAFING') continue;
        if (Math.hypot(cop.x - x, cop.y - y) < ALERT_PROPAGATION_RANGE) {
            cop.state = 'CHASING';
            cop.lastKnownPlayerPos = { x, y };
            cop.reactionFlash = { type: 'anger', time: Date.now() };
        }
    }
}

// === Check Crime Witnesses — vision cone AND hearing ===
export function checkCrimeWitnesses(criminal, crimeType, victim) {
    for (const witness of enemies) {
        if (witness === criminal || witness === victim || witness.health <= 0) continue;
        const canSeeCrime = canSee(witness, criminal.x, criminal.y) ||
            (victim && canSee(witness, victim.x, victim.y));
        const hearingRange = crimeType === 'gunshot' ? HEARING_RANGE_GUNSHOT : 200;
        const canHearCrime = canHear(witness, criminal.x, criminal.y, hearingRange);
        if (canSeeCrime || canHearCrime) {
            witnessCrime(witness, crimeType, criminal, victim);
        }
    }
}

// === Witness Death — with vision cone and hearing ===
export function witnessDeath(witness, deathX, deathY) {
    if (['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING'].includes(witness.state) || witness.health <= 0) return;
    if (!canSee(witness, deathX, deathY) && !canHear(witness, deathX, deathY, 200)) return;
    if (witness.isCop) {
        witness.state = 'SEARCHING';
        witness.lastKnownPlayerPos = { x: deathX, y: deathY };
        witness.searchEndTime = Date.now() + 8000;
        witness.reactionFlash = { type: 'anger', time: Date.now() };
    } else {
        witness.state = 'FLEEING';
        witness.fleeTarget = world.player;
        witness.lastSeenFleeTargetTime = Date.now();
        witness.stateChangeCooldown = Date.now() + 3000 + Math.random() * 2000;
        witness.reactionFlash = { type: 'fear', time: Date.now() };
    }
}

// === Witness Related Death (grief) ===
export function witnessRelatedDeath(witness, deadEnemyId, corpse) {
    if (witness.relationships.has(deadEnemyId)) {
        witness.grievingTarget = corpse;
        witness.state = 'GRIEVING';
        const griefDuration = 5000 + Math.random() * 5000;
        witness.stateChangeCooldown = Date.now() + griefDuration;
        witness.reactionFlash = { type: 'grief', time: Date.now() };
        witness.shockTime = Date.now() + 1500;
    }
}

// === Panic Spreading — now requires vision ===
export function spreadPanic(panickedEnemy) {
    for (const other of enemies) {
        if (other === panickedEnemy || other.health <= 0 || other.isZombie) continue;
        if (other.state === 'FLEEING' || other.state === 'CHASING') continue;
        const dist = Math.hypot(panickedEnemy.x - other.x, panickedEnemy.y - other.y);
        if (dist < PANIC_SPREAD_RADIUS && canSee(other, panickedEnemy.x, panickedEnemy.y)) {
            other.state = 'FLEEING';
            other.fleeTarget = panickedEnemy.fleeTarget || world.player;
            other.lastSeenFleeTargetTime = Date.now();
            other.stateChangeCooldown = Date.now() + 3000;
            other.reactionFlash = { type: 'fear', time: Date.now() };
        }
    }
}

// === Notify Nearby Enemies of Death — vision cone + hearing ===
export function notifyNearbyEnemiesOfDeath(deathX, deathY, deadEnemyId, corpse) {
    for (const enemy of enemies) {
        if (!enemy || enemy.health <= 0) continue;
        if (canSee(enemy, deathX, deathY) || canHear(enemy, deathX, deathY, 150)) {
            witnessDeath(enemy, deathX, deathY);
            witnessRelatedDeath(enemy, deadEnemyId, corpse);
        }
    }
}

// === Gunshot Detection — alerts NPCs based on hearing range ===
export function alertGunshot(x, y) {
    for (const npc of enemies) {
        if (!npc || npc.health <= 0) continue;
        if (npc.state === 'CHASING' || npc.state === 'STRAFING' || npc.state === 'FLEEING') continue;
        if (canHear(npc, x, y, HEARING_RANGE_GUNSHOT)) {
            if (npc.isCop) {
                npc.state = 'SEARCHING';
                npc.lastKnownPlayerPos = { x, y };
                npc.searchEndTime = Date.now() + 10000;
                npc.reactionFlash = { type: 'anger', time: Date.now() };
            } else if (!npc.isZombie) {
                npc.state = 'FLEEING';
                npc.fleeTarget = world.player;
                npc.lastSeenFleeTargetTime = Date.now() + 5000; // +5s so hearing-based fear lasts longer than 500ms LOS check
                npc.stateChangeCooldown = Date.now() + 4000 + Math.random() * 3000;
                npc.reactionFlash = { type: 'fear', time: Date.now() };
            }
        }
    }
}

// === Update Active Alerts — called each frame ===
export function updateAlerts() {
    const now = Date.now();
    for (let i = activeAlerts.length - 1; i >= 0; i--) {
        if (now - activeAlerts[i].time > ALERT_DURATION) {
            activeAlerts.splice(i, 1);
        }
    }
}