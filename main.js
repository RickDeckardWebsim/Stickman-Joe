import Player from './player.js';
import input, { clearJustPressed } from './input.js';
import { shells, projectiles, particles, world, camera, enemies, corpses, settledCorpses, pickups, grenades, deadDrops, throwables } from './world.js';
import { loadSound } from './audio.js';
import { initUI, updateUI, isMouseOverUI, toggleInventoryAndBodyStatus, isDraggingItem, isInventoryOpen } from './ui.js';
import { createImpactParticles, createBuildingImpactParticles } from './impact.js';
import { createBloodSplatter, createHeadChunkParticle, NeckBloodEmitter, BloodParticle, BloodPool, checkAndLeaveBloodFootprint, updateCorpseBleeding } from './gore.js';
import Ragdoll from './ragdoll.js';
import { notifyNearbyEnemiesOfDeath, checkCrimeWitnesses, alertGunshot, updateAlerts } from './ai/witness.js';
import ItemPickup, { AmmoPickup, ThrowablePickup } from './pickup.js';
import { MoneyPickup, CanPickup, MoneyWallet, EmptyCan } from './currency.js';
import { Grenade, ProceduralThrowable } from './weapon.js';
import { Pistol } from './pistol.js';
import { Shotgun } from './shotgun.js';
import { Rifle } from './rifle.js';
import { GrenadeEntity } from './grenade.js';
import { generateCity, drawCityBackground, getValidSpawnPoint, hasLineOfSight, generateNavGraph } from './city.js';
import { initializeSafehouse, safehouse } from './safehouse.js';
import Enemy from './enemy.js';
import Cop from './cop.js';
import Swat from './swat.js';
import Military, { MilitaryCommander, getCommanderInstance, clearCommanderInstance } from './military.js';
import { Medkit } from './medkit.js';
import { generateRandomAttachment } from './weapon.js';
import { AttachmentPickup } from './pickup.js';
import { DeadDrop } from './dead-drop.js';
import { InjectionCannon } from './injection-cannon.js';
import { LMG } from './lmg.js';
import Rival from './rival.js';
import Summit, { incrementSummitKillCount } from './summit.js';
import { ThrowableEntity } from './throwable.js';
import { initStartMenu } from './start-menu.js';
import { settings, initOptionsMenu } from './options.js';
import { getNetwork, HostManager, ClientManager } from './net.js';

// Offscreen canvases for performance
let staticBackgroundCanvas;
let staticBackgroundCtx;
let worldDecalCanvas;
let worldDecalCtx;
let bloodCanvas;
let bloodCtx;
let voidSwirlCanvas;

// --- Rival Spawning ---
let rivalHasSpawned = false;
const RIVAL_SPAWN_CAN_COUNT = 5;

// --- Summit Spawning ---
let summitHasSpawned = false;
const SUMMIT_SPAWN_KILL_THRESHOLD = 50;
let totalKills = 0;

// Blood Decal Manager
class BloodDecalManager {
    constructor() {
        this.bloodCanvas = null;
        this.bloodCtx = null;
                this.minStampDistance = 10;
                this.minSmearSize = 0.2;
                this.fadeRate = settings.bloodDecalFadeRate;
                this.gridSize = 20;
        this.bloodGrid = null;
        this.lastFadeTime = Date.now();
    }

    initialize(canvas) {
        this.bloodCanvas = canvas;
        this.bloodCtx = canvas.getContext('2d');
        this.bloodCanvas.width = world.width;
        this.bloodCanvas.height = world.height;
        
        // Initialize blood grid for pooling
        const gridWidth = Math.ceil(world.width / this.gridSize);
        const gridHeight = Math.ceil(world.height / this.gridSize);
        this.bloodGrid = Array(gridHeight).fill().map(() => Array(gridWidth).fill(0));
    }

    stampLine(x0, y0, x1, y1, size, color) {
        if (!this.bloodCtx || size < this.minSmearSize) return;
        
        this.bloodCtx.strokeStyle = color;
        this.bloodCtx.lineWidth = Math.max(0.5, size);
        this.bloodCtx.lineCap = 'round';
        this.bloodCtx.lineJoin = 'round';
        this.bloodCtx.beginPath();
        this.bloodCtx.moveTo(x0, y0);
        this.bloodCtx.lineTo(x1, y1);
        this.bloodCtx.stroke();
        
        // Update blood grid for pooling
        this.updateBloodGrid(x0, y0, size);
        this.updateBloodGrid(x1, y1, size);
    }

    stampDot(x, y, size, color) {
        if (!this.bloodCtx || size < this.minSmearSize) return;
        
        this.bloodCtx.fillStyle = color;
        this.bloodCtx.beginPath();
        this.bloodCtx.arc(x, y, size, 0, Math.PI * 2);
        this.bloodCtx.fill();
        
        // Update blood grid for pooling
        this.updateBloodGrid(x, y, size);
    }

    stampTrail(trail, color) {
        if (!this.bloodCtx || trail.length < 2) {
            if (trail.length === 1) {
                this.stampDot(trail[0].x, trail[0].y, trail[0].size, color);
            }
            return;
        }

        this.bloodCtx.strokeStyle = color;
        this.bloodCtx.lineCap = 'round';
        this.bloodCtx.lineJoin = 'round';

        for (let i = 1; i < trail.length; i++) {
            const p1 = trail[i-1];
            const p2 = trail[i];
            this.bloodCtx.lineWidth = Math.max(0.5, p1.size);
            this.bloodCtx.beginPath();
            this.bloodCtx.moveTo(p1.x, p1.y);
            this.bloodCtx.lineTo(p2.x, p2.y);
            this.bloodCtx.stroke();
        }
        
        // Update blood grid for all trail points
        for (const point of trail) {
            this.updateBloodGrid(point.x, point.y, point.size);
        }
    }

    updateBloodGrid(x, y, intensity) {
        const gridX = Math.floor(x / this.gridSize);
        const gridY = Math.floor(y / this.gridSize);
        
        if (gridX >= 0 && gridX < this.bloodGrid[0].length && 
            gridY >= 0 && gridY < this.bloodGrid.length) {
            this.bloodGrid[gridY][gridX] = Math.min(1.0, this.bloodGrid[gridY][gridX] + intensity * 0.1);
        }
    }

    update() {
        const now = Date.now();
        const deltaTime = now - this.lastFadeTime;
        this.lastFadeTime = now;
        
        // Fade blood grid over time
        const fadeAmount = this.fadeRate * (deltaTime / 1000);
        let hasBlood = false;
        
        for (let y = 0; y < this.bloodGrid.length; y++) {
            for (let x = 0; x < this.bloodGrid[y].length; x++) {
                if (this.bloodGrid[y][x] > 0) {
                    this.bloodGrid[y][x] = Math.max(0, this.bloodGrid[y][x] - fadeAmount);
                    if (this.bloodGrid[y][x] > 0) hasBlood = true;
                }
            }
        }
    }

    clear() {
        if (this.bloodCtx) {
            this.bloodCtx.clearRect(0, 0, this.bloodCanvas.width, this.bloodCanvas.height);
        }
        if (this.bloodGrid) {
            for (let y = 0; y < this.bloodGrid.length; y++) {
                this.bloodGrid[y].fill(0);
            }
        }
    }
}

// Global blood decal manager
let bloodDecalManager;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const INITIAL_CIVILIANS = 100;
const INITIAL_COPS = 5;
const INITIAL_SWAT = 2;
const INITIAL_DEAD_DROPS = 10;

// --- Zombie Wanted Level Config ---
const ZOMBIE_COPS_PER_WANTED_LEVEL = [0, 2, 4, 6, 9, 14];
/* @tweakable [The time in seconds before the zombie wanted level starts to decay.] */
const ZOMBIE_WANTED_DECAY_COOLDOWN = 45000; // 45 seconds
/* @tweakable [How much the zombie wanted level increases when a zombie kills a civilian.] */
const ZOMBIE_WANTED_CIVILIAN_KILL_INCREASE = 0.2;
/* @tweakable [How much the zombie wanted level increases when a zombie kills a cop.] */
const ZOMBIE_WANTED_COP_KILL_INCREASE = 0.5;
/* @tweakable [The number of zombies required to start passively increasing the wanted level.] */
const ZOMBIE_COUNT_FOR_PASSIVE_WANTED_INCREASE = 10;
/* @tweakable [The amount the wanted level increases passively every few seconds when zombie count is high.] */
const ZOMBIE_PASSIVE_WANTED_INCREASE_AMOUNT = 0.05;
/* @tweakable [How often in milliseconds the game checks to apply passive wanted level increase for zombies.] */
const ZOMBIE_PASSIVE_WANTED_CHECK_INTERVAL = 5000;

/* @tweakable The number of zombies at which law enforcement response is completely overwhelmed (0% response). */
const ZOMBIE_OVERWHELM_COUNT = 50;

const killSpreeConfig = {
        timeWindow: 5000,
        killThreshold: 3,
        wantedBonus: 0.5,
        decayCooldown: 30000,
        decayAmount: 0.1,
        spreeCheckCooldown: 2000,
};

const moneyDropConfig = {
        baseDropChance: settings.moneyDropChance,
        rapidKillTimeWindow: 1000,
        bonusPerKill: 0.1,
        maxBonus: 0.4,
};

let recentKillTimestamps = [];

// --- Civilian Conflict Management ---
let civilianConflictCooldown = 30000; // 30 seconds
let lastCivilianConflictTime = 0;
const MAX_CIVILIAN_ATTACKERS = 1; // only one such event at a time.

// --- Cop Spawning Management ---
let copSpawnCooldown = 8000; // Time between squad dispatches
let lastCopSpawnTime = 0;
let lastZombiePassiveCheck = 0;

// --- Can Spawning Management ---
let canSpawnCooldown = 8000; // Time between can spawns
let lastCanSpawnTime = 0;
const maxCansInWorld = 15; // Maximum cans that can exist at once

// --- Dead Drop Spawning Management ---
let deadDropSpawnCooldown = 1500; // 15 seconds between dead drops (was 20)
let lastDeadDropSpawnTime = 0;
const maxDeadDropsInWorld = 150; // Increased from 3

function getOffscreenSpawnPoint(canvas) {
    const { width, height, wallThickness, city } = world;
    const margin = 100; // How far off-screen to spawn
    const viewLeft = camera.x - canvas.width / 2;
    const viewRight = camera.x + canvas.width / 2;
    const viewTop = camera.y - canvas.height / 2;
    const viewBottom = camera.y + canvas.height / 2;

    let spawnX, spawnY;
    const side = Math.floor(Math.random() * 4);

    switch (side) {
        case 0: // Top
            spawnX = viewLeft + Math.random() * canvas.width;
            spawnY = viewTop - margin;
            break;
        case 1: // Bottom
            spawnX = viewLeft + Math.random() * canvas.width;
            spawnY = viewBottom + margin;
            break;
        case 2: // Left
            spawnX = viewLeft - margin;
            spawnY = viewTop + Math.random() * canvas.height;
            break;
        case 3: // Right
            spawnX = viewRight + margin;
            spawnY = viewTop + Math.random() * canvas.height;
            break;
    }

    // Clamp to world boundaries
    spawnX = Math.max(wallThickness, Math.min(spawnX, width - wallThickness));
    spawnY = Math.max(wallThickness, Math.min(spawnY, height - wallThickness));

    // Try to avoid spawning inside a building
    if (city) {
        for (const building of city.buildings) {
            if (spawnX > building.x && spawnX < building.x + building.width &&
                spawnY > building.y && spawnY < building.y + building.height) {
                // It's inside a building, push it out to the nearest edge.
                const distToLeft = spawnX - building.x;
                const distToRight = (building.x + building.width) - spawnX;
                const distToTop = spawnY - building.y;
                const distToBottom = (building.y + building.height) - spawnY;
                const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

                if (minDist === distToLeft) spawnX = building.x - 10;
                else if (minDist === distToRight) spawnX = building.x + building.width + 10;
                else if (minDist === distToTop) spawnY = building.y - 10;
                else spawnY = building.y + building.height + 10;

                // Re-clamp
                spawnX = Math.max(wallThickness, Math.min(spawnX, width - wallThickness));
                spawnY = Math.max(wallThickness, Math.min(spawnY, height - wallThickness));
            }
        }
    }

    return { x: spawnX, y: spawnY };
}

function drawStaticBackground() {
    staticBackgroundCanvas.width = world.width;
    staticBackgroundCanvas.height = world.height;
    drawCityBackground(staticBackgroundCtx, world.city, world.width, world.height);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    if (world.width === 0) { // Set world size on first load
        world.width = 4500;
        world.height = 4500;
        
        world.city = generateCity(world.width, world.height, {
            gridSize: 6,
            roadWidth: 150,
            sidewalkWidth: 30,
            buildingPadding: 15,
        });

        // Generate the navigation graph for pathfinding
        generateNavGraph(world.city);

        // Initialize safehouse after city generation
        initializeSafehouse(world.city);

        // Create and pre-render the static background
        staticBackgroundCanvas = document.createElement('canvas');
        staticBackgroundCtx = staticBackgroundCanvas.getContext('2d');
        drawStaticBackground();

        // Create the canvas for permanent decals (e.g. settled shells)
        worldDecalCanvas = document.createElement('canvas');
        worldDecalCanvas.width = world.width;
        worldDecalCanvas.height = world.height;
        worldDecalCtx = worldDecalCanvas.getContext('2d');
        
        // Initialize blood canvas and manager
        bloodCanvas = document.getElementById('blood-canvas');
        bloodDecalManager = new BloodDecalManager();
        bloodDecalManager.initialize(bloodCanvas);
        window.bloodDecalManager = bloodDecalManager;
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const player = new Player(world.width / 2, world.height / 2);
world.player = player; // Make player globally accessible via world object
// Snap camera to player's starting position
camera.x = player.x;
camera.y = player.y;

initUI(player);
initOptionsMenu();

// --- Enemy Spawning Management ---
let nextCivilianSpawnTime = 0;
const civilianSpawnInterval = settings.civilianSpawnInterval; // 2 seconds between new civilians appearing (was 3000)
const maxCivilians = settings.maxCivilians; // Increased from 30
const ambientCopChance = 0.1; // 10% chance for a spawner to create a cop

function assignRelationships(newEnemy) {
    // 30% chance this enemy has relationships
    if (Math.random() < 0.3) {
        const maxRelationships = Math.floor(Math.random() * 3) + 1; // 1-3 relationships
        let relationshipCount = 0;
        
        // Try to form relationships with existing enemies
        for (const existingEnemy of enemies) {
            if (relationshipCount >= maxRelationships) break;
            if (existingEnemy === newEnemy) continue;
            
            // 15% chance to form a relationship with each existing enemy
            if (Math.random() < 0.15) {
                newEnemy.relationships.add(existingEnemy.enemyId);
                existingEnemy.relationships.add(newEnemy.enemyId);
                relationshipCount++;
            }
        }
    }
}

function manageCivilianSpawning() {
    const now = Date.now();
    // Enhanced civilian spawning with time-based variation
    const baseCivilianCount = Math.max(8, settings.maxCivilians - Math.floor(world.wantedLevel) * 6); // Increased minimum from 5 to 8
    
    const civilianCount = enemies.filter(e => !e.isCop).length;
    if (now > nextCivilianSpawnTime && civilianCount < baseCivilianCount) {
        const spawnPoint = getValidSpawnPoint(world.city);
        
        let newEnemy;
        // Enhanced cop spawning logic
        const ambientCopChance = world.wantedLevel === 0 ? 0.08 : 0.05; // Fewer cops when wanted
        if (world.wantedLevel === 0 && Math.random() < ambientCopChance) {
            newEnemy = new Cop(spawnPoint.x, spawnPoint.y);
        } else {
            newEnemy = new Enemy(spawnPoint.x, spawnPoint.y);
        }

        enemies.push(newEnemy);
        assignRelationships(newEnemy);
        
        // Variable spawn timing based on wanted level
        const baseInterval = settings.civilianSpawnInterval;
        const wantedMultiplier = 1 + world.wantedLevel * 0.3; // Reduced from 0.5 to make spawning faster
        nextCivilianSpawnTime = now + baseInterval * wantedMultiplier;
    }
}

function manageCivilianConflict(now) {
    if (now < lastCivilianConflictTime + civilianConflictCooldown) return;

    const currentAttackers = enemies.filter(e => e.isHostileActor).length;
    if (currentAttackers >= MAX_CIVILIAN_ATTACKERS) return;

    // Civilians who are not cops, not already attacking, not armed, and not fleeing.
    const potentialAttackers = enemies.filter(e => !e.isCop && !e.weapon && !e.isHostileActor && e.state !== 'FLEEING');
    const potentialVictims = enemies.filter(e => !e.isCop && !e.isHostileActor);

    if (potentialAttackers.length < 1 || potentialVictims.length < 2) return;

    const attacker = potentialAttackers[Math.floor(Math.random() * potentialAttackers.length)];
    let victim = null;
    
    // Find a victim that is not the attacker
    do {
        victim = potentialVictims[Math.floor(Math.random() * potentialVictims.length)];
    } while (victim === attacker);

    if (!attacker || !victim) return;

    // Make the event happen
    attacker.isHostileActor = true;
    attacker.civilianTarget = victim;
    attacker.state = 'ATTACKING_CIVILIAN';
    attacker.weapon = new Pistol(attacker); // Give them a gun
    attacker.weapon.reserveAmmo = 30; // Give them some ammo

    victim.fleeTarget = attacker;
    victim.state = 'FLEEING';
    victim.stateChangeCooldown = now + 10000; // Flee for a while

    lastCivilianConflictTime = now;
}

function manageCopSpawning(canvas) {
    const now = Date.now();
    if (now < lastCopSpawnTime + copSpawnCooldown) return;

    const playerWanted = Math.floor(world.wantedLevel);
    if (playerWanted === 0) return; // No response needed if player is not wanted

    // Determine the total law enforcement capacity based on player's wanted level.
    const targetCops = settings.copsPerWantedLevel[playerWanted] || 0;
    const targetSwat = settings.swatPerWantedLevel[playerWanted] || 0;
    const targetMilitary = settings.militaryPerWantedLevel[playerWanted] || 0;

    // Calculate how overwhelmed the city is by the zombie threat.
    const zombieCount = enemies.filter(e => e.isZombie).length;
    const zombieDrainFactor = Math.min(1, zombieCount / ZOMBIE_OVERWHELM_COUNT);

    // Reduce the number of available units based on the zombie drain.
    const finalTargetCops = Math.floor(targetCops * (1 - zombieDrainFactor));
    const finalTargetSwat = Math.floor(targetSwat * (1 - zombieDrainFactor));
    const finalTargetMilitary = Math.floor(targetMilitary * (1 - zombieDrainFactor));
    
    const currentCops = enemies.filter(e => e.isCop && !e.isSwat && !e.isMilitary).length;
    const currentSwat = enemies.filter(e => e.isSwat).length;
    const currentMilitary = enemies.filter(e => e.isMilitary).length;

    const needsMilitary = currentMilitary < finalTargetMilitary;
    const needsSwat = currentSwat < finalTargetSwat;
    const needsCops = currentCops < finalTargetCops;

    if (needsMilitary || needsSwat || needsCops) {
        // Even if spawned for the player, units should be aware of zombies if the threat is high
        const alertToZombies = world.zombieWantedLevel >= 2;
        
        let squadType = Cop;
        let squadSize = 0;

        if (needsMilitary) {
            squadType = Military;
            squadSize = finalTargetMilitary - currentMilitary;

            const activeCommander = getCommanderInstance();
            if ((!activeCommander || activeCommander.health <= 0) && squadSize > 0) {
                 const spawnPoint = getOffscreenSpawnPoint(canvas);
                 const commander = new MilitaryCommander(spawnPoint.x, spawnPoint.y);
                 enemies.push(commander);
                 squadSize--; 
            }

        } else if (needsSwat) {
            squadType = Swat;
            squadSize = finalTargetSwat - currentSwat;
        } else if (needsCops) {
            squadType = Cop;
            squadSize = finalTargetCops - currentCops;
        }

        if (squadSize > 0) {
            // Spawn a squad of the determined type
            const spawnSize = Math.min(squadSize, Math.floor(Math.random() * 3) + 2); // 2-4 units per squad
            spawnLawEnforcementSquad(spawnSize, canvas, squadType, alertToZombies);
            lastCopSpawnTime = now;
        }
    }
}

function spawnLawEnforcementSquad(size, canvas, UnitClass, alertToZombies = false) {
    const spawnPoint = getOffscreenSpawnPoint(canvas);
    const squad = [];

    for (let i = 0; i < size; i++) {
        const x = spawnPoint.x + (Math.random() - 0.5) * 50;
        const y = spawnPoint.y + (Math.random() - 0.5) * 50;
        
        const unit = new UnitClass(x, y);
        if (alertToZombies) {
            unit.knowsZombiesAreHostile = true;
        }

        squad.push(unit);
        enemies.push(unit);
    }

    // Establish relationships so they react to each other's deaths
    for (let i = 0; i < squad.length; i++) {
        for (let j = i + 1; j < squad.length; j++) {
            squad[i].relationships.add(squad[j].enemyId);
            squad[j].relationships.add(squad[i].enemyId);
        }
    }
}

function spawnCanInPark() {
    if (!world.city || !world.city.grassAreas) return;
    
    const currentCans = pickups.filter(p => p instanceof CanPickup).length;
    if (currentCans >= maxCansInWorld) return;
    
    // Pick a random grass area (park)
    const grassAreas = world.city.grassAreas;
    if (grassAreas.length === 0) return;
    
    const randomPark = grassAreas[Math.floor(Math.random() * grassAreas.length)];
    
    // Spawn can at random location within park, with some padding from edges
    const padding = 20;
    const x = randomPark.x + padding + Math.random() * (randomPark.width - padding * 2);
    const y = randomPark.y + padding + Math.random() * (randomPark.height - padding * 2);
    
    pickups.push(new CanPickup(x, y));
}

function manageCanSpawning() {
    const now = Date.now();
    if (now > lastCanSpawnTime + canSpawnCooldown) {
        spawnCanInPark();
        lastCanSpawnTime = now;
    }
}

function spawnDeadDropOnRoad() {
    const currentDeadDrops = deadDrops.length;
    if (currentDeadDrops >= maxDeadDropsInWorld) return;
    
    // Find a road position (not on sidewalks, buildings, or grass)
    let attempts = 0;
    let spawnPoint = null;
    
    while (attempts < 50) {
        const x = Math.random() * (world.width - 200) + 100;
        const y = Math.random() * (world.height - 200) + 100;
        
        let onRoad = true;
        
        // Check if position is NOT on any sidewalk, building, or grass area
        if (world.city) {
            // Check sidewalks
            for (const sidewalk of world.city.sidewalks) {
                if (x >= sidewalk.x && x <= sidewalk.x + sidewalk.width &&
                    y >= sidewalk.y && y <= sidewalk.y + sidewalk.height) {
                    onRoad = false;
                    break;
                }
            }
            
            // Check buildings
            if (onRoad) {
                for (const building of world.city.buildings) {
                    if (x >= building.x && x <= building.x + building.width &&
                        y >= building.y && y <= building.y + building.height) {
                            onRoad = false;
                            break;
                        }
                }
            }
            
            // Check grass areas
            if (onRoad) {
                for (const grass of world.city.grassAreas) {
                    if (x >= grass.x && x <= grass.x + grass.width &&
                        y >= grass.y && y <= grass.y + grass.height) {
                            onRoad = false;
                            break;
                        }
                }
            }
        }
        
        if (onRoad) {
            spawnPoint = { x, y };
            break;
        }
        
        attempts++;
    }
    
    if (spawnPoint) {
        // Choose a random dead drop type
        const dropTypes = ['green', 'purple', 'silver', 'gold', 'medical'];
                const dropChances = [0.35, 0.25, 0.15, 0.1, 0.15]; // ammo, attachment, weapon, experimental, medical
        
        const rand = Math.random();
        let cumulativeChance = 0;
        let chosenType = 'green';

        for (let i = 0; i < dropTypes.length; i++) {
            cumulativeChance += dropChances[i];
            if (rand < cumulativeChance) {
                chosenType = dropTypes[i];
                break;
            }
        }

        deadDrops.push(new DeadDrop(spawnPoint.x, spawnPoint.y, chosenType));
    }
}

function manageDeadDropSpawning() {
    const now = Date.now();
    if (now > lastDeadDropSpawnTime + deadDropSpawnCooldown) {
        spawnDeadDropOnRoad();
        lastDeadDropSpawnTime = now;
    }
}

function updateWantedLevel() {
    const now = Date.now();
    
    // Additional wanted level increases for rapid killing (bonus system)
    if (recentKillTimestamps.length > 0 && now - world.lastWantedLevelIncrease > killSpreeConfig.spreeCheckCooldown) {
        const recentKills = recentKillTimestamps.filter(t => now - t <= killSpreeConfig.timeWindow).length; // Kills in last 5 seconds
        
        // Bonus increases for killing sprees (on top of per-kill increases)
        if (recentKills >= killSpreeConfig.killThreshold && world.wantedLevel < 5) {
            world.wantedLevel = Math.min(5, world.wantedLevel + killSpreeConfig.wantedBonus); // Bonus for killing spree
            world.lastWantedLevelIncrease = now;
        }
    }
    
    // Gradually decrease wanted level over time
    if (now - world.lastWantedLevelIncrease > killSpreeConfig.decayCooldown && world.wantedLevel > 0) { // 30 seconds cooldown
        world.wantedLevel = Math.max(0, world.wantedLevel - killSpreeConfig.decayAmount);
        world.lastWantedLevelIncrease = now;
    }

    // Passively increase zombie wanted level based on number of active zombies
    if (now - lastZombiePassiveCheck > ZOMBIE_PASSIVE_WANTED_CHECK_INTERVAL) {
        const zombieCount = enemies.filter(e => e.isZombie).length;
        if (zombieCount >= ZOMBIE_COUNT_FOR_PASSIVE_WANTED_INCREASE) {
            world.zombieWantedLevel = Math.min(5, world.zombieWantedLevel + ZOMBIE_PASSIVE_WANTED_INCREASE_AMOUNT);
            world.lastZombieWantedLevelIncrease = now; // This also resets the decay timer
        }
        lastZombiePassiveCheck = now;
    }

    // Decay zombie wanted level
    if (now - world.lastZombieWantedLevelIncrease > ZOMBIE_WANTED_DECAY_COOLDOWN && world.zombieWantedLevel > 0) {
        world.zombieWantedLevel = Math.max(0, world.zombieWantedLevel - 0.1);
        world.lastZombieWantedLevelIncrease = now; // Reset timer even while decaying
    }
}

function initialSpawn() {
    // Spawn civilians
    for (let i = 0; i < INITIAL_CIVILIANS; i++) {
        const spawnPoint = getValidSpawnPoint(world.city);
        const newEnemy = new Enemy(spawnPoint.x, spawnPoint.y);
        enemies.push(newEnemy);
        assignRelationships(newEnemy);
    }

    // Spawn cops
    for (let i = 0; i < INITIAL_COPS; i++) {
        const spawnPoint = getValidSpawnPoint(world.city);
        const newCop = new Cop(spawnPoint.x, spawnPoint.y);
        enemies.push(newCop);
    }

    // Spawn SWAT
    for (let i = 0; i < INITIAL_SWAT; i++) {
        const spawnPoint = getValidSpawnPoint(world.city);
        const newSwat = new Swat(spawnPoint.x, spawnPoint.y);
        enemies.push(newSwat);
    }

    // Spawn Dead Drops
    for (let i = 0; i < INITIAL_DEAD_DROPS; i++) {
        spawnDeadDropOnRoad();
    }
}

function gameLoop() {
    const now = Date.now();
    const deltaTime = Math.min(now - (gameLoop.lastTime || now), 50); // Cap at 50ms to prevent huge jumps
    gameLoop.lastTime = now;
    
    // --- Camera Update ---
    // Smoothly follow the player
    camera.x += (player.x - camera.x) * camera.lerp;
    camera.y += (player.y - camera.y) * camera.lerp;

    // --- Input & World Updates ---
    // Convert mouse screen coordinates to world coordinates for aiming
    const mouseWorldPos = {
        x: input.mouse.x - canvas.width / 2 + camera.x,
        y: input.mouse.y - canvas.height / 2 + camera.y,
    };

    if (input.justPressed.has('tab')) {
        toggleInventoryAndBodyStatus();
    }
    
    if (player) {
        player.update(input, isMouseOverUI() || isDraggingItem() || isInventoryOpen(), mouseWorldPos, world);

        // If player dies, create a ragdoll once.
        if (player.health <= 0 && !player.isDead) {
            player.isDead = true;
            player.deathTime = Date.now();
            
            // Special handling for player zombification
            if (player.deathType === 'zombified') {
                // Maybe turn the player model green or something before ragdolling.
                // For now, just create a normal ragdoll.
            }
            
            // Create player ragdoll
            const launchVector = { x: Math.cos(player.lastImpactAngle) * 5, y: Math.sin(player.lastImpactAngle) * 5 };
            
            const ragdollLimbs = {
                leftArm: !player.limbs.leftArm.severed,
                rightArm: !player.limbs.rightArm.severed,
                leftLeg: !player.limbs.leftLeg.severed,
                rightLeg: !player.limbs.rightLeg.severed,
            };
            
            const ragdollOptions = {
                limbs: ragdollLimbs,
                isHeadExploded: player.limbs.head.status === 'crippled'
            };

            const corpse = new Ragdoll(player.x, player.y, launchVector, player.color, ragdollOptions);
            corpses.push(corpse);
        }
    }

    // Player interaction ('e' key)
    if (input.justPressed.has('e') && player && !player.isDead && !isInventoryOpen()) {
        // Check safehouse sign interaction first
        if (safehouse && safehouse.canInteract(player)) {
            safehouse.toggleUI();
            toggleInventoryAndBodyStatus(); // Also open inventory for transfers
        } else {
            // Attempt to pickpocket.
            // A more robust system would check which is closer or what the player is facing.
            // For now, this is fine. It will try to pickpocket anyone in range.
            let interactionAttempted = false;
            for (const enemy of enemies) {
                if (enemy.health <= 0) continue;
                const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
                // Use collision radius instead of visual radius for hit detection
                if (dist < player.radius + enemy.radius + 30) {
                    const result = enemy.attemptPickpocket(player);
                    if (result.success !== undefined) {
                        if (result.success) {
                            const wallet = player.inventory.find(item => item instanceof MoneyWallet);
                            if (wallet) {
                                wallet.amount += result.amount;
                            }
                        }
                        // Break after the first attempted interaction to avoid multiple pickpockets/alerts
                        interactionAttempted = true;
                        break;
                    }
                }
            }
        }
    }

    // Single network handle: declared once, used for both client gate and host broadcast
    const _network = getNetwork();
    // Host mode: feed the connected client's reported state into the shadow
    // player before any NPC/spawning logic runs, so authoritative projectiles
    // are spawned in the same tick the host processes the rest of the world.
    if (_network && _network instanceof HostManager) {
        _network.localPlayer = player; // keep host's local player reference updated
        _network.applyClientInput();
    }

    // In client mode, the host authoritatively manages all NPC spawning.
    // The client only renders remote entities, so skip local spawning/AI logic.
    if (!(_network instanceof ClientManager)) {
        manageCivilianSpawning();
        manageCopSpawning(canvas);
        manageCanSpawning();
        manageDeadDropSpawning();
        updateWantedLevel();
        updateAlerts();
        manageCivilianConflict(Date.now());
        checkRivalSpawnConditions(player);
        checkSummitSpawnConditions();
    }

    // Network broadcast (host mode only)
    if (_network && _network instanceof HostManager) {
        const clientCam = _network.lastClientCamera || { x: camera.x, y: camera.y };
        _network.broadcastTick(player, clientCam.x, clientCam.y);
    }

    // Update shells, and move settled ones to the settledShells array
    for (let i = shells.length - 1; i >= 0; i--) {
        const shell = shells[i];
        if (!shell) {
            shells.splice(i, 1);
            continue;
        }
        const justSettled = shell.update();

        if (justSettled) {
            shell.draw(worldDecalCtx); // Draw once to the offscreen decal canvas
            shells.splice(i, 1); // Remove from active list
        }
    }

    // Update grenades
    for (let i = grenades.length - 1; i >= 0; i--) {
        const grenade = grenades[i];
        if (!grenade) {
            grenades.splice(i, 1);
            continue;
        }
        if (grenade.update()) {
            grenades.splice(i, 1);
        }
    }

    // Update procedural throwables
    for (let i = throwables.length - 1; i >= 0; i--) {
        const throwable = throwables[i];
        if (!throwable) {
            throwables.splice(i, 1);
            continue;
        }
        if (throwable.update()) {
            throwables.splice(i, 1);
        }
    }

    // Update pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        if (!pickup || !player) {
            pickups.splice(i, 1);
            continue;
        }
        if (pickup.update(player, input)) {
            pickups.splice(i, 1);
        }
    }

    // Update dead drops
    for (let i = deadDrops.length - 1; i >= 0; i--) {
        const deadDrop = deadDrops[i];
        if (!deadDrop || !player) {
            deadDrops.splice(i, 1);
            continue;
        }
        if (deadDrop.update(player, input)) {
            deadDrops.splice(i, 1);
        }
    }

    // Update blood decal manager
    if (bloodDecalManager) {
        bloodDecalManager.update();
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (!p) {
            particles.splice(i, 1);
            continue;
        }
        const justSettled = p.update(deltaTime);

        if (justSettled) {
            p.draw(worldDecalCtx); // Draw once to the offscreen decal canvas
            particles.splice(i, 1);
        } else if (!p.active) {
            particles.splice(i, 1);
        } else if (p.markedForDecalStamp && !p.hasBeenStampedToDecal) {
            // Let blood particle draw one final frame in the render loop
            // It will be stamped and removed in the render section
        }
    }

    // --- Blood footprints: entities walking through blood leave trails ---
    if (player && !player.isDead) {
        checkAndLeaveBloodFootprint(player);
    }
    for (const enemy of enemies) {
        if (enemy && enemy.health > 0 && enemy.isMoving) {
            checkAndLeaveBloodFootprint(enemy);
        }
    }

    // --- Corpse bleeding: settled corpses leak blood into pools ---
    const bleedNow = Date.now();
    for (const corpse of settledCorpses) {
        if (corpse && !corpse._beingEaten) {
            updateCorpseBleeding(corpse, bleedNow);
        }
    }

    // Update corpses
    for (let i = corpses.length - 1; i >= 0; i--) {
        const corpse = corpses[i];
        if (!corpse) {
            corpses.splice(i, 1);
            continue;
        }
        const justSettled = corpse.update();

        if (justSettled) {
            corpse.draw(worldDecalCtx); // Draw to decal canvas
            settledCorpses.push(corpse);
            corpses.splice(i, 1);
        }
    }

    // Update enemies
    if (!isInventoryOpen()) {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            if (!enemy) {
                enemies.splice(i, 1);
                continue;
            }
            if (player) {
                enemy.update(player, world);
            }
            if (enemy.health <= 0) {
                const now = Date.now();
                recentKillTimestamps.push(now);
                totalKills++;
                if (summitHasSpawned) incrementSummitKillCount();
                recentKillTimestamps = recentKillTimestamps.filter(t => now - t <= moneyDropConfig.rapidKillTimeWindow); // Keep kills from last second

                if (enemy.isCommander) {
                    clearCommanderInstance();
                    // Notify other military units
                    for (const unit of enemies) {
                        if (unit instanceof Military && !unit.isCommander) {
                            unit.onCommanderKilled();
                        }
                    }
                }

                // Immediately increase wanted level for each kill, if applicable
                if (enemy.lastHitBy === player) {
                    let wasInnocent = true;
                    if (enemy.isCop) { // Killing a cop is always bad
                        world.wantedLevel = Math.max(3, world.wantedLevel);
                        world.wantedLevel = Math.min(5, world.wantedLevel + 1.0);
                        world.lastWantedLevelIncrease = now;
                        wasInnocent = false;
                    } else if (!enemy.isHostileActor && !enemy.isZombie) { // Killing a non-hostile civilian is bad
                        world.wantedLevel = Math.min(5, world.wantedLevel + 0.3);
                        world.lastWantedLevelIncrease = now;
                        wasInnocent = false;
                    } else if (enemy.isZombie) { // Player killing a zombie is a "good" act
                        // No wanted level change for killing zombies
                        wasInnocent = false;
                    } else if (enemy.isHostileActor) { // Killing a hostile actor (that's not a cop) might be a good thing
                        // Potentially reduce wanted level? For now, no change.
                        wasInnocent = false;
                    }
                    
                    // Check for murder witnesses
                    if(wasInnocent) {
                        checkCrimeWitnesses(player, 'murder', enemy);
                    }
                } else if (enemy.lastHitBy && enemy.lastHitBy.isZombie) {
                    // Zombie kill, increase zombie wanted level
                    if (enemy.isCop) {
                        world.zombieWantedLevel = Math.min(5, world.zombieWantedLevel + ZOMBIE_WANTED_COP_KILL_INCREASE);
                    } else {
                        world.zombieWantedLevel = Math.min(5, world.zombieWantedLevel + ZOMBIE_WANTED_CIVILIAN_KILL_INCREASE);
                    }
                    world.lastZombieWantedLevelIncrease = now;
                }

                // --- Money Drop Logic ---
                if (enemy.isHostileActor && !enemy.isZombie) {
                    // If it's a hostile actor, they always provide the vigilante bonus.
                    if (enemy.lastHitBy === player) {
                        const wallet = player.inventory.find(item => item instanceof MoneyWallet);
                        if (wallet) {
                            wallet.amount += 100;
                            // TODO: Floating text for "+$100 Vigilante Bonus"
                        }
                    } else { // Killed by a cop or other means
                        pickups.push(new MoneyPickup(enemy.x, enemy.y, 100));
                    }
                } else if (!enemy.isZombie) {
                    let dropChance = settings.moneyDropChance; // "relatively high"
                    const rapidKillBonus = Math.min(moneyDropConfig.maxBonus, (recentKillTimestamps.length - 1) * moneyDropConfig.bonusPerKill); // +10% per kill up to +40%
                    dropChance += rapidKillBonus;
                    
                    if (Math.random() < dropChance) {
                        const value = Math.floor(Math.random() * 322) + 1;
                        pickups.push(new MoneyPickup(enemy.x, enemy.y, value));
                    }
                }

                // --- Weapon and Ammo Drop Logic ---
                if (enemy.weapon) {
                    // Drop ammo (20-50 rounds for regular enemies, 30-80 for cops)
                    const baseAmmo = enemy.isCop ? 30 : 20;
                    const bonusAmmo = enemy.isCop ? 50 : 30;
                    const ammoAmount = Math.floor(Math.random() * bonusAmmo) + baseAmmo;
                    const ammoPickup = new AmmoPickup(
                        enemy.x + (Math.random() - 0.5) * 40,
                        enemy.y + (Math.random() - 0.5) * 40,
                        enemy.weapon.name,
                        ammoAmount
                    );
                    pickups.push(ammoPickup);

                    // 50% chance to drop the weapon itself for cops, 30% for civilians
                    const weaponDropChance = enemy.isCop ? settings.weaponDropChance + 0.15 : settings.weaponDropChance;
                    if (Math.random() < weaponDropChance) {
                        // More robust weapon class determination
                        let weaponClass = null;
                        if (enemy.weapon instanceof Rifle) {
                            weaponClass = Rifle;
                        } else if (enemy.weapon instanceof Shotgun) {
                            weaponClass = Shotgun;
                        } else if (enemy.weapon instanceof Pistol) {
                            weaponClass = Pistol;
                        } else if (enemy.weapon instanceof InjectionCannon) {
                            weaponClass = InjectionCannon;
                        }
                        
                        if (weaponClass) {
                            pickups.push(new ItemPickup(
                                enemy.x + (Math.random() - 0.5) * 60,
                                enemy.y + (Math.random() - 0.5) * 60,
                                weaponClass,
                                player
                            ));
                        }
                    }
                }

                // 2% chance for non-hostile civilians to drop an Injection Cannon
                if (!enemy.isHostileActor && !enemy.isCop && !enemy.weapon && Math.random() < 0.02) {
                     pickups.push(new ItemPickup(
                        enemy.x + (Math.random() - 0.5) * 60,
                        enemy.y + (Math.random() - 0.5) * 60,
                        InjectionCannon,
                        player
                    ));
                }

                // --- Medkit Drop Logic ---
                if (enemy.isCop) { // Cops/SWAT have a 25% chance to drop medkits (increased from 10%)
                    const medkitDropChance = settings.medkitDropChance;
                    if (Math.random() < medkitDropChance) {
                        pickups.push(new ItemPickup(enemy.x, enemy.y, Medkit, player));
                    }
                    
                    // --- Attachment Drop Logic ---
                    // Cops have a 30% chance to drop attachments, SWAT have 45% (increased)
                    const attachmentDropChance = enemy.isSwat ? 0.45 : 0.30;
                    if (Math.random() < attachmentDropChance) {
                        const randomAttachment = generateRandomAttachment();
                        pickups.push(new AttachmentPickup(
                            enemy.x + (Math.random() - 0.5) * 50,
                            enemy.y + (Math.random() - 0.5) * 50,
                            randomAttachment
                        ));
                    }
                }
                
                if (recentKillTimestamps.length >= 5) {
                    // Always spawn grenade on 5+ kill streak
                    pickups.push(new ItemPickup(enemy.x, enemy.y, Grenade, player));
                    // TODO: Add a UI notification for the spawn
                }
                
                const deathType = enemy.deathType || 'normal';
                const corpseColor = enemy.color;
                let createHeadChunk = false;
                let ragdollOptions = {
                    hasMissingHeadChunk: false,
                    isHeadExploded: false,
                    limbs: enemy.limbs, // Pass the enemy's current limb state
                };
                
                // Death effects
                if (deathType === 'bleed') {
                    createBloodSplatter(enemy.x, enemy.y, 20, Math.random() * Math.PI * 2);
                } else if (deathType === 'head_exploded') {
                    // Big initial splatter for the explosion
                    createBloodSplatter(enemy.x, enemy.y, 100, Math.random() * Math.PI * 2);
                } else {
                    createBloodSplatter(enemy.x, enemy.y, enemy.maxHealth, enemy.lastImpactAngle);
                }
                
                // Determine launch vector for ragdoll and if a head chunk should be made
                let launchVector = { x: 0, y: 0 };
                
                if (deathType === 'head_exploded') {
                    const launchAngle = enemy.lastImpactAngle;
                    const launchSpeed = 10 + Math.random() * 6; // More violent
                    launchVector = { x: Math.cos(launchAngle) * launchSpeed, y: Math.sin(launchAngle) * launchSpeed };
                    ragdollOptions.isHeadExploded = true;
                } else if (deathType === 'headshot') {
                    const launchAngle = enemy.lastImpactAngle;
                    const launchSpeed = 8 + Math.random() * 5;
                    launchVector = { x: Math.cos(launchAngle) * launchSpeed, y: Math.sin(launchAngle) * launchSpeed };

                    if (enemy.lastHitByWeapon === 'Rifle' || enemy.lastHitByWeapon === 'Shotgun') {
                        createHeadChunk = true;
                        ragdollOptions.hasMissingHeadChunk = true;
                        const chunkLaunchSpeed = launchSpeed * (0.5 + Math.random() * 0.3);
                        const chunkLaunchVec = { x: Math.cos(launchAngle) * chunkLaunchSpeed, y: Math.sin(launchAngle) * chunkLaunchSpeed };
                        createHeadChunkParticle(enemy.x, enemy.y, chunkLaunchVec, corpseColor);
                    }

                } else if (deathType === 'normal') {
                    const launchAngle = enemy.lastImpactAngle;
                    const launchSpeed = 5 + Math.random() * 3;
                    launchVector = { x: Math.cos(launchAngle) * launchSpeed, y: Math.sin(launchAngle) * launchSpeed };
                } else if (deathType === 'bleed') {
                    // "flop onto the ground"
                    launchVector = { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 };
                } else if (deathType === 'dismembered') {
                    const launchAngle = enemy.lastImpactAngle;
                    const launchSpeed = 10 + Math.random() * 5; // Violent death
                    launchVector = { x: Math.cos(launchAngle) * launchSpeed, y: Math.sin(launchAngle) * launchSpeed };
                    createBloodSplatter(enemy.x, enemy.y, 50, Math.random() * Math.PI * 2);
                }

                // Create corpse
                const corpse = new Ragdoll(enemy.x, enemy.y, launchVector, corpseColor, ragdollOptions);
                corpses.push(corpse);

                // If head exploded, create the neck blood emitter
                if (ragdollOptions.isHeadExploded && corpse.neckPoint) {
                    particles.push(new NeckBloodEmitter(corpse.neckPoint));
                }

                // Notify other enemies
                notifyNearbyEnemiesOfDeath(enemy.x, enemy.y, enemy.enemyId, corpse);

                enemies.splice(i, 1);
            }
        }
    }

    // --- Consolidated player-enemy collision resolution ---
    // Runs ONCE after all enemies have updated, preventing the multi-enemy
    // feedback loop that caused the player to spaz/jitter when touching NPCs.
    // Each enemy pushes the player by half the overlap (the other half is the
    // enemy pushing itself away in its own update). Pushes are SUMMED (not
    // averaged) so that opposing pushes don't cancel and trap the player inside
    // a crowd — the closer enemy (larger overlap) dominates. The total is capped
    // to player.radius so dense crowds don't launch the player.
    if (player) {
        let totalPushX = 0;
        let totalPushY = 0;

        for (const enemy of enemies) {
            if (!enemy || enemy.health <= 0) continue;
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            const minDist = player.radius + enemy.radius;

            if (dist < minDist && dist > 0) {
                const overlap = minDist - dist;
                const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
                // Sum pushes — each enemy contributes half the overlap
                totalPushX += Math.cos(angle) * overlap * 0.5;
                totalPushY += Math.sin(angle) * overlap * 0.5;
            }
        }

        const pushMag = Math.hypot(totalPushX, totalPushY);
        if (pushMag > 0) {
            // Cap total push to player.radius so crowds don't launch the player
            const cap = player.radius;
            if (pushMag > cap) {
                totalPushX = (totalPushX / pushMag) * cap;
                totalPushY = (totalPushY / pushMag) * cap;
            }
            player.x += totalPushX;
            player.y += totalPushY;
            player.constrainToWorld();
            if (world.city) {
                player.constrainToCity(world.city);
            }
        }
    }

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if (!p) {
            projectiles.splice(i, 1);
            continue;
        }
        
        // Check for timer-based projectile removal
        const timerResult = p.update();
        if (timerResult === true) {
            projectiles.splice(i, 1);
            continue;
        }

        let projectileRemoved = false;

        // --- COLLISION DETECTION ---
        // Friendly projectiles come from the host's local player OR the host's
        // shadow player (which mirrors the connected client). Both check
        // against enemies; everything else is treated as an enemy projectile.
        const isFriendly = p.owner && (p.owner === player || (_network instanceof HostManager && _network.shadowPlayer === p.owner));
        if (isFriendly && player) {
            // Player's projectile, check against enemies
            for (let j = enemies.length - 1; j >= 0; j--) {
                const enemy = enemies[j];
                if (!enemy || enemy.health <= 0) continue;
                const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
                // Use collision radius instead of visual radius for hit detection
                if (dist < enemy.radius + p.collisionRadius) {
                    const impactAngle = Math.atan2(p.vy, p.vx);
                    
                    // Apply civilian damage modifier
                    let damage = p.isHeadshot ? p.damage * 2 : p.damage;
                    if (!enemy.isCop && p.civilianDamage > 1.0) {
                        damage *= p.civilianDamage;
                    }
                    
                    // Witness check before damage, as the victim might die
                    const wasPreviouslyHostile = enemy.isHostileActor || enemy.isCop;
                    
                    enemy.takeDamage(damage, impactAngle, { 
                        isHeadshot: p.isHeadshot,
                        weaponName: p.weaponName,
                        shotId: p.shotId,
                        owner: p.owner,
                        knockback: p.knockback,
                        onHitEffect: p.onHitEffect,
                        bleedChance: p.bleedChance,
                        bleedDps: p.bleedDps,
                        bloodyMess: p.bloodyMess,
                        dismemberChance: p.dismemberChance,
                    });
                    
                    // If player just shot a non-hostile, it's a crime
                    if (!wasPreviouslyHostile && player) {
                        checkCrimeWitnesses(player, 'assault', enemy);
                    }
                    
                    // Handle hit effects (explosion, fire, toxic)
                    p.handleHitEffects(p.x, p.y, enemy);
                    
                    // Handle split projectiles
                    if (p.splitOnHit) {
                        const fragments = p.createSplitProjectiles();
                        projectiles.push(...fragments);
                    }

                    if (p.sticksToTarget) {
                        p.stuckTo = enemy;
                        p.stuckOffset = { x: p.x - enemy.x, y: p.y - enemy.y };
                        // Don't remove projectile, but stop its movement in the update loop
                    } else if (!p.piercing || p.hasHit) {
                        // Ricochet Freddy projectiles survive to bounce to next target
                        if (p.ricochetFred && p.bounceCount < p.maxBounces) {
                            p.hasHit = false; // Reset so it can hit again
                        } else {
                            projectiles.splice(i, 1);
                            projectileRemoved = true;
                            break;
                        }
                    } else {
                        p.hasHit = true; // Mark as hit for piercing projectiles
                    }
                }
            }
        } else if (p.owner && player) { // Projectile is from an enemy
            // Check against player
            const distToPlayer = Math.hypot(p.x - player.x, p.y - player.y);
            // Use collision radius for player hit detection too
            if (!player.isDead && distToPlayer < player.radius + p.collisionRadius) {
                const impactAngle = Math.atan2(p.vy, p.vx);
                let damage = p.damage;
                
                // Apply bleeding effect
                if (p.bleedChance > 0 && Math.random() < p.bleedChance) {
                    player.isBleeding = true;
                    player.lastBloodDripTime = Date.now();
                }
                
                // Handle hit effects (explosion, fire, toxic)
                p.handleHitEffects(p.x, p.y);
                
                // Handle split projectiles
                if (p.splitOnHit) {
                    const fragments = p.createSplitProjectiles();
                    projectiles.push(...fragments);
                }
                
                player.takeDamage(damage, impactAngle, {
                    knockback: p.knockback,
                    owner: p.owner
                });
                projectiles.splice(i, 1);
                projectileRemoved = true;
            }
        }
        
        if (projectileRemoved) continue;

        // Check collision with buildings (ghost bullets phase through)
        if (world.city && !p.ghostBullet) {
            for (const building of world.city.buildings) {
                if (p.x >= building.x && p.x <= building.x + building.width &&
                    p.y >= building.y && p.y <= building.y + building.height) {
                    
                    // Find closest edge for hit normal
                    const distToLeft = p.x - building.x;
                    const distToRight = (building.x + building.width) - p.x;
                    const distToTop = p.y - building.y;
                    const distToBottom = (building.y + building.height) - p.y;
                    
                    let hitNormal = { x: 0, y: 0 };
                    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                    
                    if (minDist === distToLeft) hitNormal.x = -1;
                    else if (minDist === distToRight) hitNormal.x = 1;
                    else if (minDist === distToTop) hitNormal.y = -1;
                    else hitNormal.y = 1;

                    // Try to bounce if bouncing projectile
                    if (p.bounce(hitNormal)) {
                        // Move projectile out of building with better collision resolution
                        const pushDistance = p.collisionRadius + 2;
                        if (hitNormal.x !== 0) {
                            p.x = hitNormal.x === -1 ? building.x - pushDistance : building.x + building.width + pushDistance;
                        }
                        if (hitNormal.y !== 0) {
                            p.y = hitNormal.y === -1 ? building.y - pushDistance : building.y + building.height + pushDistance;
                        }
                    } else {
                        // Handle hit effects before destroying projectile
                        p.handleHitEffects(p.x, p.y);
                        createBuildingImpactParticles(p.x, p.y, p, hitNormal, building.color);
                        projectiles.splice(i, 1);
                        projectileRemoved = true;
                    }
                    break;
                }
            }
        }
        if (projectileRemoved) continue;

        let hit = false;
        let hitNormal = { x: 0, y: 0 };
        let hitPos = { x: p.x, y: p.y };

        if (!p.ghostBullet) {
            if (p.x <= world.wallThickness) {
                hit = true;
                hitNormal.x = 1;
                hitPos.x = world.wallThickness;
            } else if (p.x >= world.width - world.wallThickness) {
                hit = true;
                hitNormal.x = -1;
                hitPos.x = world.width - world.wallThickness;
            }

            if (p.y <= world.wallThickness) {
                hit = true;
                hitNormal.y = 1;
                hitPos.y = world.wallThickness;
            } else if (p.y >= world.height - world.wallThickness) {
                hit = true;
                hitNormal.y = -1;
                hitPos.y = world.height - world.wallThickness;
            }
        }
        
        if (hit) {
            // Normalize for corners
            const mag = Math.hypot(hitNormal.x, hitNormal.y);
            if (mag > 0) {
                hitNormal.x /= mag;
                hitNormal.y /= mag;
            }

            // Try to bounce if bouncing projectile
            if (p.bounce(hitNormal)) {
                // Move projectile back into bounds with better collision resolution
                const pushDistance = p.collisionRadius + 2;
                p.x = Math.max(world.wallThickness + pushDistance, Math.min(p.x, world.width - world.wallThickness - pushDistance));
                p.y = Math.max(world.wallThickness + pushDistance, Math.min(p.y, world.height - world.wallThickness - pushDistance));
            } else {
                // Handle hit effects before destroying projectile
                p.handleHitEffects(hitPos.x, hitPos.y);
                createImpactParticles(hitPos.x, hitPos.y, p, hitNormal);
                projectiles.splice(i, 1);
            }
        }
    }

    // Update fire damage for all entities
    updateFireDamage();

    // --- RENDER ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cameraLeft = camera.x - canvas.width / 2;
    const cameraTop = camera.y - canvas.height / 2;

    // --- Draw Trippy Void (outside world bounds) ---
    // Optimized: pre-rendered static layers + cheap animated overlay
    const camLeft = camera.x - canvas.width / 2;
    const camTop = camera.y - canvas.height / 2;
    const camRight = camera.x + canvas.width / 2;
    const camBottom = camera.y + canvas.height / 2;

    if (camLeft < 0 || camTop < 0 || camRight > world.width || camBottom > world.height) {
        const time = Date.now() * 0.001;
        const hueShift = (time * 20) % 360;

        ctx.save();

        // 1. Solid dark base (no gradient — just one fillRect)
        ctx.fillStyle = `hsl(${hueShift}, 70%, 5%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Pre-rendered vortex swirls (drawn once, cached, just blitted + rotated)
        if (!voidSwirlCanvas) {
            voidSwirlCanvas = document.createElement('canvas');
            voidSwirlCanvas.width = 512;
            voidSwirlCanvas.height = 512;
            const sctx = voidSwirlCanvas.getContext('2d');
            const cx = 256, cy = 256;
            for (let i = 0; i < 20; i++) {
                const angle = (i / 20) * Math.PI * 2;
                sctx.strokeStyle = `hsla(${i * 18}, 90%, 50%, 0.12)`;
                sctx.lineWidth = 2;
                sctx.beginPath();
                for (let t = 0; t <= 1; t += 0.15) {
                    const r = 50 + 200 * t;
                    const a = angle + t * 3;
                    sctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                }
                sctx.stroke();
            }
        }

        // Blit the swirl canvas, tiled and rotating slowly
        ctx.globalAlpha = 0.6;
        const rot = time * 0.2;
        for (let x = -256; x < canvas.width + 256; x += 400) {
            for (let y = -256; y < canvas.height + 256; y += 400) {
                ctx.save();
                ctx.translate(x + 200, y + 200);
                ctx.rotate(rot);
                ctx.drawImage(voidSwirlCanvas, -256, -256);
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;

        // 3. Floating particles — reduced to 15, simple fillRect (no arcs)
        for (let i = 0; i < 15; i++) {
            const seed = i * 137.5;
            const px = (Math.sin(time * 0.3 + seed) * 0.5 + 0.5) * canvas.width;
            const py = (Math.cos(time * 0.2 + seed * 1.3) * 0.5 + 0.5) * canvas.height;
            const flicker = 0.15 + Math.sin(time * 2 + seed) * 0.1;
            ctx.fillStyle = `hsla(${(hueShift + i * 24) % 360}, 90%, 70%, ${flicker})`;
            ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        }

        // 4. Pulsing world border — no shadowBlur (expensive), just double stroke
        const worldLeft = -camLeft;
        const worldTop = -camTop;
        const worldRight = world.width - camLeft;
        const worldBottom = world.height - camTop;
        const pulse = Math.sin(time * 3) * 0.3 + 0.7;
        const borderHue = (hueShift + 180) % 360;

        // Wide glow stroke (simulates blur without shadowBlur)
        ctx.strokeStyle = `hsla(${borderHue}, 100%, 60%, ${pulse * 0.2})`;
        ctx.lineWidth = 12;
        ctx.strokeRect(worldLeft, worldTop, worldRight - worldLeft, worldBottom - worldTop);

        // Sharp inner stroke
        ctx.strokeStyle = `hsla(${borderHue}, 100%, 70%, ${pulse * 0.8})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(worldLeft, worldTop, worldRight - worldLeft, worldBottom - worldTop);

        ctx.restore();
    }


    // --- Draw Background & Decals (World-space) ---
    // Blit the pre-rendered static background from our offscreen canvas
    ctx.drawImage(
        staticBackgroundCanvas,
        cameraLeft, cameraTop, canvas.width, canvas.height, // Source rect
        0, 0, canvas.width, canvas.height // Destination rect
    );
    
    // Blit the blood decals
    if (bloodCanvas) {
        ctx.drawImage(
            bloodCanvas,
            cameraLeft, cameraTop, canvas.width, canvas.height, // Source rect
            0, 0, canvas.width, canvas.height // Destination rect
        );
    }
    
    // Blit the permanent decals on top
    ctx.drawImage(
        worldDecalCanvas,
        cameraLeft, cameraTop, canvas.width, canvas.height, // Source rect
        0, 0, canvas.width, canvas.height // Destination rect
    );
    
    // --- Draw Game Objects (World-space) ---
    ctx.save();
    ctx.translate(canvas.width / 2 - camera.x, canvas.height / 2 - camera.y);

    // Draw active pickups
    for (const pickup of pickups) {
        pickup.draw(ctx, player);
    }

    // Draw dead drops
    for (const deadDrop of deadDrops) {
        deadDrop.draw(ctx, player);
    }

    // Draw active shells still in motion
    for (const shell of shells) {
        shell.draw(ctx);
    }

    // Draw active particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.draw(ctx);
        
                if (p.markedForDecalStamp && !p.hasBeenStampedToDecal) {
            // Stamp to decal canvas after drawing
            if (bloodDecalManager && p instanceof BloodParticle) {
                const trail = p._getTrailEntries();
                if (trail.length > 0) {
                    bloodDecalManager.stampTrail(trail, p.color);
                } else {
                    bloodDecalManager.stampDot(p.x, p.y, p.size, p.color);
                }
                p.hasBeenStampedToDecal = true;
            }
            // Remove the particle now that it's been stamped
            particles.splice(i, 1);
        }
    }

    // Draw active corpses
    for (const corpse of corpses) {
        corpse.draw(ctx);
    }

    // Draw projectiles
    for (const p of projectiles) {
        p.draw(ctx);
    }

    // Draw grenades
    for (const g of grenades) {
        g.draw(ctx);
    }

    // Draw procedural throwables
    for (const t of throwables) {
        t.draw(ctx);
    }

    // Draw enemies
    for (const enemy of enemies) {
        enemy.draw(ctx, player);
    }

    player.draw(ctx);
    // --- Shadow player rendering (host mode only) ---
    // The host mirrors the connected client as a local Player avatar so the
    // host can see the client's position. Must run inside the world-space
    // transform (before ctx.restore()).
    if (_network && _network instanceof HostManager && _network.shadowPlayer) {
        _network.shadowPlayer.draw(ctx);
    }

    // --- Remote entity rendering (client mode only) ---
    // Host-authoritative entities are rendered as remote stubs. Must run
    // inside the world-space transform (before ctx.restore()).
    if (_network instanceof ClientManager) {
        const alpha = 0.3;
        for (const entity of _network.remoteEntities.values()) {
            entity.interpolate(alpha);
            entity.draw(ctx);
        }
        // Wire the pickup-result callback once (full item reconstruction
        // is deferred to Task 13 polish).
        if (!_network.onPickupResult) {
            _network.onPickupResult = (itemSnap) => {
                // Simple feedback — log for now, full item reconstruction is complex
                console.log('Picked up remote item:', itemSnap.itemType, itemSnap.icon);
                // TODO: reconstruct actual item instance and add to inventory (Task 13 polish)
            };
        }
        // Check for pickup interaction (client mode)
        if (input.justPressed.has('e') && player && !player.isDead) {
            for (const [id, entity] of _network.remoteEntities) {
                if (entity.constructor.name === 'RemotePickup') {
                    const dist = Math.hypot(player.x - entity.x, player.y - entity.y);
                    if (dist < player.radius + 25) {
                        _network.requestPickup(id);
                        break;
                    }
                }
            }
        }
        _network.sendClientState(player, camera, input, canvas);
    }
    // Disconnect overlay (client mode): when the host drops, show a brief
    // overlay and reload back to the menu. Guarded by _disconnectHandled so
    // it only fires once.
    if (_network instanceof ClientManager && !_network.connected && !_network._disconnectHandled) {
        _network._disconnectHandled = true;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);color:white;display:flex;justify-content:center;align-items:center;z-index:100;font-family:sans-serif;font-size:24px;text-align:center;';
        overlay.innerHTML = 'Host disconnected<br>Returning to menu...';
        document.body.appendChild(overlay);
        setTimeout(() => location.reload(), 2000);
    }
    
    ctx.restore();

    // --- Draw Screen-space UI effects ---
    if (!player.isDead) {
        const healthPercent = player.health / player.maxHealth;
        if (healthPercent < 0.3) {
            const vignetteIntensity = (0.3 - healthPercent) / 0.3; // 0 to 1
            const gradient = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, canvas.width / 2 * 0.5,
                canvas.width / 2, canvas.height / 2, canvas.width / 2
            );
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, `rgba(150, 0, 0, ${vignetteIntensity * 0.8})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    if (player.isDead) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 50px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    }

    // Update safehouse
    if (safehouse && safehouse.isUIOpen) {
        // Keep inventory open while safehouse UI is open
        if (!isInventoryOpen()) {
            safehouse.isUIOpen = false;
        }
    }

    if (player) {
        updateUI(player);
    }

    clearJustPressed();
    requestAnimationFrame(gameLoop);
}

function updateFireDamage() {
    const now = Date.now();
    
    // Update player fire damage
    if (world.player && world.player.fireEffectEnd && now < world.player.fireEffectEnd) {
        if (now - (world.player.lastFireDamageTime || 0) > (world.player.fireTickInterval || 500)) {
            world.player.takeDamage(world.player.fireDamage || 5, 0);
            world.player.lastFireDamageTime = now;
            
            // Create fire particle effects
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 2 + 1;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            particles.push(new FireParticle(world.player.x, world.player.y, vx, vy));
        }
    }
    
    // Update enemy fire damage
    for (const enemy of enemies) {
        if (!enemy) continue;
        if (enemy.fireEffectEnd && now < enemy.fireEffectEnd) {
            if (now - (enemy.lastFireDamageTime || 0) > (enemy.fireTickInterval || 500)) {
                enemy.takeDamage(enemy.fireDamage || 5, 0, {
                    weaponName: 'Fire',
                    owner: null
                });
                enemy.lastFireDamageTime = now;
                
                // Create fire particle effects
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 2 + 1;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                particles.push(new FireParticle(enemy.x, enemy.y, vx, vy));
            }
        }
    }
}

class FireParticle {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = 1.0;
        this.decay = 0.02 + Math.random() * 0.02;
        this.size = Math.random() * 3 + 2;
        this.active = true;
    }

    update() {
        if (!this.active) return false;

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        
        this.life -= this.decay;
        if (this.life <= 0) {
            this.active = false;
            return false;
        }
        
        return false;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        
        const colors = ['#ff4444', '#ff8800', '#ffaa00'];
        const colorIndex = Math.floor((1 - this.life) * colors.length);
        ctx.fillStyle = colors[Math.min(colorIndex, colors.length - 1)];
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

async function startGame() {
    await Promise.all([
        loadSound('shoot', 'shoot.mp3'),
        loadSound('shotgun_shoot', 'shotgun_shoot.mp3'),
        loadSound('shotgun_pump', 'shotgun_pump.mp3'),
        loadSound('knife_swing', 'knife_swing.mp3'),
        loadSound('knife_hit', 'knife_hit.mp3'),
        loadSound('explosion', 'explosion.mp3'),
        loadSound('reload', 'reload.mp3'),
        loadSound('empty_click', 'empty_click.mp3'),
        loadSound('injection_cannon_shoot', 'injection_cannon_shoot.mp3'),
        loadSound('zombie_bite', 'zombie_bite.mp3'),
    ]);
    initialSpawn();
    gameLoop();
    initOptionsMenu();
}

initStartMenu(startGame);

function spawnRival() {
    if (rivalHasSpawned) return;

    const spawnPoint = getOffscreenSpawnPoint(canvas);
    const rival = new Rival(spawnPoint.x, spawnPoint.y);
    enemies.push(rival);
    rivalHasSpawned = true;

    // TODO: Add a notification for the player that a new challenger has appeared.
    console.log("A formidable opponent has appeared!");
}

function checkRivalSpawnConditions(player) {
    if (rivalHasSpawned) return;

    const canStack = player.inventory.find(item => item instanceof EmptyCan);
    if (canStack && canStack.amount >= RIVAL_SPAWN_CAN_COUNT) {
        spawnRival();
    }
}

function spawnSummit() {
    if (summitHasSpawned) return;
    const spawnPoint = getOffscreenSpawnPoint(canvas);
    const summit = new Summit(spawnPoint.x, spawnPoint.y);
    enemies.push(summit);
    summitHasSpawned = true;
    console.log("Summit has arrived. The dead stir...");
}

function checkSummitSpawnConditions() {
    if (summitHasSpawned) return;
    if (totalKills >= SUMMIT_SPAWN_KILL_THRESHOLD) {
        spawnSummit();
    }
}