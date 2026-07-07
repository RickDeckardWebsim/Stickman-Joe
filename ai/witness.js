import { world, enemies } from '../world.js';
import { hasLineOfSight } from '../city.js';

const NPC_WITNESS_DISTANCE = 1000;
const PANIC_SPREAD_RADIUS = 200;

export function witnessCrime(witness, crimeType, criminal, victim) {
    if (['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING'].includes(witness.state)) return;

    if (witness.isCop) {
        if (criminal === world.player) {
            witness.state = 'CHASING';
            witness.policeTarget = null; 
            witness.lastKnownPlayerPos = {x: criminal.x, y: criminal.y};
            world.wantedLevel = Math.min(5, world.wantedLevel + 1);
            world.lastWantedLevelIncrease = Date.now();
        } else if (criminal instanceof enemies[0].constructor && criminal.isHostileActor) { 
            witness.state = 'CHASING';
            witness.policeTarget = criminal; 
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
    }
}

export function witnessDeath(witness, deathX, deathY) {
    if (['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING'].includes(witness.state) || witness.health <= 0) return;

    if (witness.isCop) {
        witness.state = 'CHASING';
        witness.lastKnownPlayerPos = {x: deathX, y: deathY};
        witness.stateChangeCooldown = Date.now() + 5000;
        witness.reactionFlash = { type: 'anger', time: Date.now() };
    } else { 
        witness.state = 'FLEEING';
        witness.fleeTarget = {x: deathX, y: deathY};
        witness.lastSeenFleeTargetTime = Date.now();
        witness.stateChangeCooldown = Date.now() + 5000 + Math.random() * 3000;
        witness.reactionFlash = { type: 'fear', time: Date.now() };
    }
}

export function witnessRelatedDeath(witness, deadEnemyId, corpse) {
    if (witness.relationships.has(deadEnemyId)) {
        witness.grievingTarget = corpse;
        witness.state = 'GRIEVING';
                const griefDuration = 1000;
        witness.stateChangeCooldown = Date.now() + griefDuration; 
        witness.reactionFlash = { type: 'grief', time: Date.now() };
        witness.shockTime = Date.now() + 800;
    }
}

export function spreadPanic(panickedEnemy) {
    for (const other of enemies) {
        if (other === panickedEnemy || other.isCop) continue;

        const dist = Math.hypot(panickedEnemy.x - other.x, panickedEnemy.y - other.y);
        const panicContagionChance = 0.1;
        if (dist < PANIC_SPREAD_RADIUS && Math.random() < panicContagionChance) {
            if (other.state === 'PATROLLING' || other.state === 'IDLE') {
                other.state = 'FLEEING';
                other.fleeTarget = panickedEnemy.fleeTarget || world.player;
                other.stateChangeCooldown = Date.now() + 2000 + Math.random() * 3000;
                other.reactionFlash = { type: 'fear', time: Date.now() };
            }
        }
    }
}

export function checkCrimeWitnesses(criminal, crimeType, victim) {
    const buildings = world.city ? world.city.buildings : [];
    for (const witness of enemies) {
        if (witness === criminal || witness === victim || witness.health <= 0) continue;

        const distToCrime = Math.hypot(witness.x - criminal.x, witness.y - criminal.y);
        if (distToCrime > NPC_WITNESS_DISTANCE) continue;

        const canSeeCriminal = hasLineOfSight(witness.x, witness.y, criminal.x, criminal.y, buildings);
        const canSeeVictim = victim ? hasLineOfSight(witness.x, witness.y, victim.x, victim.y, buildings) : canSeeCriminal;

        if (canSeeCriminal || canSeeVictim) {
            witnessCrime(witness, crimeType, criminal, victim);
        }
    }
}

export function notifyNearbyEnemiesOfDeath(deathX, deathY, deadEnemyId, corpse) {
    const sightRadius = 600;
    const sightRadiusSq = sightRadius * sightRadius;

    for (const enemy of enemies) {
        const distSq = (enemy.x - deathX)**2 + (enemy.y - deathY)**2;
        if (distSq < sightRadiusSq) {
            witnessDeath(enemy, deathX, deathY);
            witnessRelatedDeath(enemy, deadEnemyId, corpse);
        }
    }
}