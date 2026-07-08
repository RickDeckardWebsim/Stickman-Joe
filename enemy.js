import { world, enemies, particles, corpses, settledCorpses } from './world.js';
import { createBloodSplatter, BloodParticle, PointBloodEmitter } from './gore.js';
import { TearParticle } from './visual-effects.js';
import { getSidewalkPatrolPoint, hasLineOfSight, getSidewalkPath, findNearestSidewalk, isOnSidewalk } from './city.js';
import Ragdoll from './ragdoll.js';
import { playSound } from './audio.js';
import { runCivilianAI, runCombatAI, runZombieAI, runGrievingBehavior, findSocialTarget, decideState, predictTargetPosition } from './ai/behavior.js';
import { witnessCrime, witnessDeath, witnessRelatedDeath, spreadPanic, checkCrimeWitnesses } from './ai/witness.js';
import { Pistol } from './pistol.js';
import { settings } from './options.js';

export const NPC_WITNESS_DISTANCE = 100;

const SKIN_TONES = ['#f9e4d4', '#f2d5b6', '#e6be98', '#d6a57c', '#c28b68', '#a97355', '#8c5a42', '#6b4431', '#523425', '#3c251a'];
const MAX_ATTACKERS = 3; // Max enemies that can charge the player at once
const ATTACK_RADIUS = 150; // Radius around player considered "attacking"
const PANIC_SPREAD_RADIUS = 200; // Distance panic can spread to other NPCs
const CROWD_DENSITY_THRESHOLD = 4; // Max NPCs in small area before they spread out

const FEAR_LOS_COOLDOWN = 500;

function getRandomSkinTone() {
    return SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
}

function lerpAngle(start, end, amount) {
    let difference = end - start;
    if (difference > Math.PI) {
        difference -= 2 * Math.PI;
    } else if (difference < -Math.PI) {
        difference += 2 * Math.PI;
    }
    return start + difference * amount;
}

export default class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.speed = 1.8 + Math.random() * 0.8; // More varied base speeds (1.8-2.6)
        this.health = 100 * settings.enemyHealthMultiplier;
        this.maxHealth = 100 * settings.enemyHealthMultiplier;
        this.perceptionRadius = this.radius * 4;
        this.color = getRandomSkinTone();

        // --- Enhanced AI Properties ---
        this.bravery = Math.random() * 0.4; // 0 to 0.4 (much more cowardly)
        this.aggressiveness = Math.random() * 0.3; // 0 to 0.3 (much less aggressive)
        this.panicThreshold = 0.7 + Math.random() * 0.3; // When they start panicking (0.7-1.0)
        this.shockResistance = Math.random() * 0.3; // Most civilians are easily shocked
        this.curiosity = Math.random(); // How likely to investigate things
        this.socialness = Math.random(); // How much they cluster with others
        /* @tweakable [0-1] How strongly this unit leads its target. 0=no prediction, 1=perfect prediction. */
        this.predictionStrength = 0.1;
        /* @tweakable [0-1] The margin of error for prediction. 0=no error, 1=high error. */
        this.predictionError = 0.8;

        // --- Enhanced State Management ---
        this.state = 'PATROLLING';
        this.previousState = 'PATROLLING';
        this.stateChangeCooldown = 0;
        this.stateTimer = 0; // How long in current state
        this.hitFlashTime = 0;
        this.reactionFlash = { type: null, time: 0 };
        this.lastImpactAngle = 0;
        this.lastHitByWeapon = 'Unknown';
        this.deathType = null; // 'normal', 'headshot', 'bleed', 'head_exploded'
        this.shotgunDamageAccumulator = { id: null, totalDamage: 0 };
        this.lastHitBy = null;

        // Limb state
        this.limbs = {
            leftArm: true,
            rightArm: true,
            leftLeg: true,
            rightLeg: true,
        };

        // Status Effects
        this.isBleeding = false;
        this.bleedDps = 5; // damage per second
        this.lastBloodDripTime = 0;
        this.lastUpdateTime = Date.now();

        // Weapon
        this.weapon = null;

        // Strafing properties
        this.strafeDirection = Math.random() < 0.5 ? 1 : -1;
        this.lastStrafeSwitch = 0;
        this.strafeSwitchInterval = 1000 + Math.random() * 2000; // Switch strafe direction every 1-3s
        this.strafeDistanceModifier = 0; // Added for dynamic spacing
    
        // New properties for shock reaction and idle behavior
        this.shockTime = 0;
        this.patrolTarget = null;
        this.currentWaypoint = 0;

        // Enhanced civilian behavior properties
        this.patrolSpeed = this.speed * (0.4 + Math.random() * 0.6); // Walk at 40% to 100% of run speed
        this.glanceEndTime = 0;
        this.idleEndTime = 0;
        this.investigateEndTime = 0;
        this.wanderRadius = 200 + Math.random() * 150; // How far they wander from spawn
        this.preferredSidewalk = null; // Preferred sidewalk to hang around
        this.path = []; // Path for navigation
        this.pathIndex = 0;
        this.lastPathCalc = 0; // Timestamp of last path calculation
        this.stuckCounter = 0; // Counter for when NPC gets stuck
        this.lastPosition = { x: x, y: y };
        this.movementCheckTime = 0;

        // Leg animation properties
        this.walkCycle = 0;
        this.movementAngle = 0; // Direction the enemy is walking
        this.facingAngle = Math.random() * Math.PI * 2; // Direction the enemy is looking
        this.isMoving = false;
        this.canSeePlayer = false;
        this.lastKnownPlayerPos = null;
        this.searchDirection = Math.random() * Math.PI * 2; // Random search direction
        this.angle = this.facingAngle;

        // --- Pickpocketing & Vision ---
        this.visionConeAngle = Math.PI / 1.5; // 120 degree vision cone
        this.isPickpocketed = false;
        this.money = Math.floor(Math.random() * 50) + 10; // How much money they have
        this.searchEndTime = 0;

        // --- Relationship System ---
        this.relationships = new Set(); // Set of enemy IDs this enemy cares about
        this.enemyId = Math.random().toString(36).substr(2, 9); // Unique ID
        this.grievingTarget = null; // Corpse or settled corpse being grieved
        this.lastTearTime = 0;
        this.isCop = false;
        this.isHostileActor = false;
        this.civilianTarget = null;
        this.fleeTarget = null;
        this.policeTarget = null;
        this.wasShootingLastFrame = false;
        this.isZombie = false;
        this.knowsZombiesAreHostile = false; // New property
        this.lastSeenFleeTargetTime = 0; // New property for fear cooldown
        
        // Punching properties
        this.punchRange = 55;
        this.punchDamage = 12;
        this.punchKnockback = 6;
        this.punchCooldown = 600; // ms
        this.lastPunchTime = 0;
        
        // Bite properties (for zombies)
        this.biteAttack = {
            range: 50,
            damage: 25,
            cooldown: 1500,
            knockback: 4
        };
        this.lastBiteTime = 0;
        
        // Knockback resistance (varies by enemy type)
        this.knockbackResistance = Math.random() * 0.3; // 0-30% resistance
    }

    attemptPickpocket(player) {
        if (this.isPickpocketed || this.health <= 0 || this.isCop || this.isZombie) {
            return { success: false, message: "Cannot pickpocket." };
        }

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        
        const angleToPlayer = Math.atan2(dy, dx);
        let angleDiff = angleToPlayer - this.facingAngle;
        // Normalize angle difference to be between -PI and PI
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Player must be "behind" the NPC (outside the forward vision cone)
        if (Math.abs(angleDiff) < this.visionConeAngle / 2) {
            this.alertToFailedPickpocket(player);
            return { success: false, message: "They saw you!" };
        }

        // Success/failure chance
        const successChance = 0.75; // 75% base success
        if (Math.random() < successChance) {
            // Success
            const amount = this.money;
            this.money = 0;
            this.isPickpocketed = true;
            return { success: true, amount: amount };
        } else {
            // Failure
            this.alertToFailedPickpocket(player);
            return { success: false, message: "You were caught!" };
        }
    }

    alertToFailedPickpocket(player) {
        this.reactionFlash = { type: 'anger', time: Date.now() };
        this.state = 'CHASING';
        this.lastKnownPlayerPos = {x: player.x, y: player.y};
        // Alert nearby cops and raise wanted level
        world.wantedLevel = Math.min(5, world.wantedLevel + 0.5);
        world.lastWantedLevelIncrease = Date.now();
        witnessCrime(this, 'assault', player, this); // They are the victim
    }

    dismember(impactAngle, extraChance = 0) {
        // Apply extra chance from modifiers
        const baseDismemberChance = 0.2;
        if (Math.random() > baseDismemberChance + extraChance) return;

        const availableLimbs = [];
        if (this.limbs.leftArm) availableLimbs.push('leftArm');
        if (this.limbs.rightArm) availableLimbs.push('rightArm');
        if (this.limbs.leftLeg) availableLimbs.push('leftLeg');
        if (this.limbs.rightLeg) availableLimbs.push('rightLeg');

        if (availableLimbs.length === 0) return;

        const limbToSever = availableLimbs[Math.floor(Math.random() * availableLimbs.length)];
        let isFatal = false;
        let stumpPos = { x: this.x, y: this.y };
        const shoulderOffsetY = this.radius * 0.5;
        const hipOffsetY = this.radius * 0.3;

        // Create limb configuration for the severed limb ragdoll
        const severedLimbConfig = {
            leftArm: false,
            rightArm: false,
            leftLeg: false,
            rightLeg: false
        };

        switch(limbToSever) {
            case 'leftArm':
                this.limbs.leftArm = false;
                severedLimbConfig.leftArm = true;
                stumpPos.x -= this.radius * 0.7;
                stumpPos.y -= shoulderOffsetY;
                break;
            case 'rightArm':
                this.limbs.rightArm = false;
                severedLimbConfig.rightArm = true;
                stumpPos.x -= this.radius * 0.7;
                stumpPos.y += shoulderOffsetY;
                break;
            case 'leftLeg':
                this.limbs.leftLeg = false;
                severedLimbConfig.leftLeg = true;
                isFatal = true;
                stumpPos.y += hipOffsetY;
                break;
            case 'rightLeg':
                this.limbs.rightLeg = false;
                severedLimbConfig.rightLeg = true;
                isFatal = true;
                stumpPos.y += hipOffsetY;
                break;
        }

        // Create a small ragdoll with only the severed limb
        const limbLaunchSpeed = 8 + Math.random() * 6;
        const limbLaunchVector = { 
            x: Math.cos(impactAngle + (Math.random() - 0.5) * 0.3) * limbLaunchSpeed, 
            y: Math.sin(impactAngle + (Math.random() - 0.5) * 0.3) * limbLaunchSpeed 
        };
        
        const severedLimbRagdoll = new Ragdoll(stumpPos.x, stumpPos.y, limbLaunchVector, this.color, {
            limbs: severedLimbConfig,
            isHeadExploded: true, // No head for severed limb
            isSeveredLimb: true, // New flag for simplified structure
            severedLimbType: limbToSever
        });
        
        corpses.push(severedLimbRagdoll);

        // Add blood emitter to the stump point (neck point serves as attachment)
        if (severedLimbRagdoll.neckPoint) {
            particles.push(new PointBloodEmitter(severedLimbRagdoll.neckPoint, 1500));
        }
        
        // Spawn blood from stump
        createBloodSplatter(stumpPos.x, stumpPos.y, 80, impactAngle + Math.PI);

        // Rapid bleeding status effect
        this.isBleeding = true;
        this.bleedDps = isFatal ? 25 : 15; // More bleeding
        this.lastBloodDripTime = Date.now();
        
        // Leg shots are fatal
        if (isFatal) {
            this.health = 0;
            this.deathType = 'dismembered';
        } else {
            // Not fatal, but make the enemy react
            this.shockTime = Date.now() + 500; // Stunned for a bit
            this.reactionFlash = { type: 'fear', time: Date.now() }; // Always fear losing a limb
        }
    }

    update(player) {
        const now = Date.now();
        const dt = now - this.lastUpdateTime;
        this.lastUpdateTime = now;
        this.stateTimer += dt;

        const wasAlive = this.health > 0;

        if (this.isZombie && wasAlive) {
            // zombie idle sound removed
        }

        // --- Enhanced Bleeding System ---
        if (this.isBleeding && wasAlive) {
            const bleedAmount = (this.bleedDps / 1000) * dt;
            this.health -= bleedAmount;
            
            if (this.health <= 0) {
                this.deathType = 'bleed';
            }

            // More realistic blood drip timing
            const bleedInterval = Math.max(150, 400 - (this.bleedDps * 20));
            if (now - this.lastBloodDripTime > bleedInterval) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 0.3 + 0.2;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                const size = Math.random() * 1.5 + 0.8;
                
                particles.push(new BloodParticle(this.x, this.y, vx, vy, size));
                this.lastBloodDripTime = now;
            }
        }
        
        if (!wasAlive) return; // Don't run AI if dead.

        // --- Frost cleanup: restore speed when freeze expires ---
        if (this._frozenUntil && now > this._frozenUntil) {
            this.speed = this._frozenSpeed || 2;
            this._frozenUntil = 0;
        }

        // --- Confusion cleanup: restore normal AI when confusion expires ---
        if (this._confusedUntil && now > this._confusedUntil) {
            this._confusedUntil = 0;
            this.civilianTarget = null;
            this.policeTarget = null;
            this.state = 'PATROLLING';
        }

        // Check for Grieving state first
        if (this.state === 'GRIEVING') {
            const grievingMovement = runGrievingBehavior(this, now);
            const { goalDx, goalDy, currentSpeed } = grievingMovement;
            const moveMag = Math.hypot(goalDx, goalDy);
            if (moveMag > 0.1) {
                this.isMoving = true;
                this.movementAngle = Math.atan2(goalDy, goalDx);
                this.x += (goalDx / moveMag) * currentSpeed;
                this.y += (goalDy / moveMag) * currentSpeed;
            } else {
                this.isMoving = false;
            }
            // Update facing direction towards corpse and cry
            if (this.grievingTarget) {
                let targetX, targetY;
                 if (this.grievingTarget.points && this.grievingTarget.points.length > 0) {
                    targetX = this.grievingTarget.points.reduce((sum, p) => sum + p.x, 0) / this.grievingTarget.points.length;
                    targetY = this.grievingTarget.points.reduce((sum, p) => sum + p.y, 0) / this.grievingTarget.points.length;
                } else {
                    targetX = this.grievingTarget.x || this.x;
                    targetY = this.grievingTarget.y || this.y;
                }
                const targetAngle = Math.atan2(targetY - this.y, targetX - this.x);
                this.facingAngle = lerpAngle(this.facingAngle, targetAngle, 0.1);
                this.angle = this.facingAngle;
                
                const distToCorpse = Math.hypot(this.x - targetX, this.y - targetY);
                if (distToCorpse < 60) {
                    const griefTearsInterval = 300;
                    if (now - this.lastTearTime > griefTearsInterval) {
                        this.emitTears();
                        this.lastTearTime = now;
                    }
                }
            }
            this.constrainToCity(world.city); // Make sure they don't get pushed into walls while grieving
            return; // Skip other AI
        }

        // --- Panic Spreading ---
        if (this.state === 'FLEEING' && Math.random() < 0.1) { // 10% chance per frame to spread panic
            spreadPanic(this);
        }

        // Check for shock AFTER checking for death
        if (now < this.shockTime) {
            this.isMoving = false; // Freeze in place
            const painTearsInterval = 250;
            if (now - this.lastTearTime > painTearsInterval) {
                this.emitTears();
                this.lastTearTime = now;
            }
            return; // Skip AI and movement logic
        }

        const buildings = world.city ? world.city.buildings : [];
        this.canSeePlayer = hasLineOfSight(this.x, this.y, player.x, player.y, buildings);
        const distToPlayer = Math.hypot(this.x - player.x, this.y - player.y);

        let goalDx = 0;
        let goalDy = 0;
        let currentSpeed = 0;
        let aiResult = {};

        // --- SELECT AI MODE ---
        if (this.isZombie) {
            aiResult = runZombieAI(this, player, now);
        } else {
            const isHostile = this.isCop ? (world.wantedLevel > 0 || this.knowsZombiesAreHostile) : this.isHostileActor;
            
            if (!isHostile) {
                aiResult = runCivilianAI(this, player, now);
            } else {
                aiResult = runCombatAI(this, player, now, distToPlayer);
            }
        }
        
        goalDx = aiResult.goalDx;
        goalDy = aiResult.goalDy;
        currentSpeed = aiResult.currentSpeed;
        
        // --- Path Following Override ---
        if (this.path && this.path.length > 0 && this.pathIndex < this.path.length) {
            const targetWaypoint = this.path[this.pathIndex];
            goalDx = targetWaypoint.x - this.x;
            goalDy = targetWaypoint.y - this.y;
            const distToWaypoint = Math.hypot(goalDx, goalDy);

            if (this.state === 'FLEEING') {
                currentSpeed = this.speed * 1.2;
            } else if (this.state === 'PATROLLING' || this.state === 'IDLE' || this.state === 'SEARCHING') {
                currentSpeed = this.patrolSpeed;
            } else {
                currentSpeed = this.speed;
            }

            if (distToWaypoint < 40) {
                this.pathIndex++;
                if (this.pathIndex >= this.path.length) {
                    this.path = [];
                    this.pathIndex = 0;
                }
            }
        }

        // --- Crowd Density Management ---
        let separationDx = 0;
        let separationDy = 0;
        let crowdDensity = 0;
        const separationWeight = 1.2; // Simplified

        for (const other of enemies) {
            if (this === other) continue;

            const dist = Math.hypot(this.x - other.x, this.y - other.y);
            const combinedPersonalSpace = 50; // Fixed value instead of dynamic
            
            if (dist > 0 && dist < combinedPersonalSpace) {
                crowdDensity++;
                const awayDx = (this.x - other.x) / dist;
                const awayDy = (this.y - other.y) / dist;
                
                const weight = 1 - (dist / combinedPersonalSpace);
                separationDx += awayDx * weight;
                separationDy += awayDy * weight;
            }
        }
        
        // Combine goal-seeking and separation forces
        const moveDx = goalDx + separationDx * separationWeight;
        const moveDy = goalDy + separationDy * separationWeight;

        const moveMag = Math.hypot(moveDx, moveDy);
        if (moveMag > 0.1) {
            this.isMoving = true;
            this.movementAngle = Math.atan2(moveDy, moveDx);
            
            // Simplified walk cycle
            const speedRatio = currentSpeed / this.speed;
            this.walkCycle += 0.2 * speedRatio;

            // Smooth acceleration
            const acceleration = 0.15;
            const targetVx = (moveDx / moveMag) * currentSpeed;
            const targetVy = (moveDy / moveMag) * currentSpeed;
            
            const currentVx = this.velocity?.x || 0;
            const currentVy = this.velocity?.y || 0;
            
            this.velocity = {
                x: currentVx + (targetVx - currentVx) * acceleration,
                y: currentVy + (targetVy - currentVy) * acceleration
            };

            this.x += this.velocity.x;
            this.y += this.velocity.y;
        } else {
            this.isMoving = false;
            // Apply friction when not moving
            if (this.velocity) {
                this.velocity.x *= 0.8;
                this.velocity.y *= 0.8;
                
                if (Math.hypot(this.velocity.x, this.velocity.y) < 0.1) {
                    this.velocity = { x: 0, y: 0 };
                }
            }
        }

        // --- Collision with other enemies ---
        for (const other of enemies) {
            if (this === other) continue;

            const dist = Math.hypot(this.x - other.x, this.y - other.y);
            const min_dist = this.radius + other.radius;

            if (dist < min_dist && dist > 0) {
                const overlap = min_dist - dist;
                const angle = Math.atan2(this.y - other.y, this.x - other.x);
                
                // Push this enemy away by half the overlap.
                // The other enemy will be pushed in its own update cycle.
                const pushX = Math.cos(angle) * overlap * 0.5;
                const pushY = Math.sin(angle) * overlap * 0.5;

                this.x += pushX;
                this.y += pushY;
            }
        }
        
        // --- Collision with player ---
        // Recalculate distance to player after enemy-enemy collision adjustments
        const finalDistToPlayer = Math.hypot(this.x - player.x, this.y - player.y);
        const minPlayerDist = this.radius + player.radius;

        if (finalDistToPlayer < minPlayerDist && finalDistToPlayer > 0) {
            const overlap = minPlayerDist - finalDistToPlayer;
            const angle = Math.atan2(this.y - player.y, this.x - player.x);

            // Only push the ENEMY away — player push is handled
            // centrally in resolvePlayerCollisions() in main.js
            // to prevent multi-enemy feedback loops that cause spazzing.
            this.x += Math.cos(angle) * overlap * 0.5;
            this.y += Math.sin(angle) * overlap * 0.5;
        }

        // --- Enhanced Facing Direction with Smoother Turning ---
        let targetAngle;

        const isCombatState = this.state === 'CHASING' || this.state === 'STRAFING';

        if (this.isZombie) {
            if (this.civilianTarget) { // Re-using civilianTarget for any zombie target
                targetAngle = Math.atan2(this.civilianTarget.y - this.y, this.civilianTarget.x - this.x);
            } else {
                targetAngle = this.movementAngle;
            }
        } else if (isCombatState && this.lastKnownPlayerPos) {
            // In combat, face the player's last known position
            targetAngle = Math.atan2(this.lastKnownPlayerPos.y - this.y, this.lastKnownPlayerPos.x - this.x);
        } else if (this.state === 'ATTACKING_CIVILIAN' && this.civilianTarget) {
            targetAngle = Math.atan2(this.civilianTarget.y - this.y, this.civilianTarget.x - this.x);
        } else if (this.state === 'SEARCHING') {
             targetAngle = this.searchDirection;
        } else if (this.state === 'GLANCING') {
            // When glancing, face the player
            targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
        } else if (this.state === 'GRIEVING' && this.grievingTarget) {
            // When grieving, face the corpse
            if (this.grievingTarget.points && this.grievingTarget.points.length > 0) {
                const targetX = this.grievingTarget.points.reduce((sum, p) => sum + p.x, 0) / this.grievingTarget.points.length;
                const targetY = this.grievingTarget.points.reduce((sum, p) => sum + p.y, 0) / this.grievingTarget.points.length;
                targetAngle = Math.atan2(targetY - this.y, targetX - this.x);
            } else {
                targetAngle = this.facingAngle; // Fallback
            }
        } else if (this.isMoving) {
            // Otherwise, if moving, face forward in the direction of movement.
            targetAngle = this.movementAngle;
        } else {
            // If idle, keep current facing
            targetAngle = this.facingAngle;
        }

        // Smoothly turn towards the target angle with variable speed
        if (typeof targetAngle !== 'undefined') {
            this.facingAngle = lerpAngle(this.facingAngle, targetAngle, 0.08 + this.aggressiveness * 0.04); // More aggressive = faster turning
            this.angle = this.facingAngle;
        }

        // --- WEAPON HANDLING (after angle is set) ---
        if (this.weapon) {
            let shootCondition = false;
            let aimTarget = null;
            let aimPos = { x: this.x + Math.cos(this.angle) * 100, y: this.y + Math.sin(this.angle) * 100 };
            
            // Determine the primary target for this frame
            let primaryTarget = null;
            if (this.isCop && this.policeTarget) {
                primaryTarget = this.policeTarget;
            } else if (this.state === 'ATTACKING_CIVILIAN' && this.civilianTarget) {
                primaryTarget = this.civilianTarget;
            } else {
                // Default target is the player if hostile
                const isHostileToPlayer = this.isCop ? world.wantedLevel > 0 : this.isHostileActor;
                if (isHostileToPlayer) {
                    primaryTarget = player;
                }
            }

            if (primaryTarget) {
                const canSeeTarget = hasLineOfSight(this.x, this.y, primaryTarget.x, primaryTarget.y, buildings);
                const distToTarget = Math.hypot(this.x - primaryTarget.x, this.y - primaryTarget.y);
                
                const isAggressiveState = this.state === 'STRAFING' || (this.state === 'CHASING' && distToTarget < 600);
                if (isAggressiveState && canSeeTarget) {
                    shootCondition = true;
                    aimTarget = primaryTarget;
                    aimPos = predictTargetPosition(this, aimTarget);
                } else {
                    // Not in an aggressive state but has a target, aim without shooting
                    aimTarget = primaryTarget;
                    aimPos = { x: aimTarget.x, y: aimTarget.y };
                }
            }
    
            if (aimTarget) {
                 // AI automatically reloads when empty
                if (this.weapon.ammo === 0 && this.weapon.reserveAmmo > 0 && !this.weapon.isReloading) {
                    this.weapon.startReload();
                }
                
                const justShot = shootCondition && !this.wasShootingLastFrame;
                this.wasShootingLastFrame = shootCondition;

                // Pass AI's intent to the weapon
                this.weapon.update({ shoot: shootCondition, justShot: justShot }, false, aimPos);
            } else if (this.weapon.owner !== player) {
                // If there's no target, make sure AI stops shooting.
                // Player weapon update is handled separately.
                this.wasShootingLastFrame = false;
                this.weapon.update({ shoot: false, justShot: false }, false, { x: this.x, y: this.y });
            }
        }

        // --- World Boundary Constraints ---
        const minX = world.wallThickness + this.radius;
        const maxX = world.width - world.wallThickness - this.radius;
        const minY = world.wallThickness + this.radius;
        const maxY = world.height - world.wallThickness - this.radius;

        this.x = Math.max(minX, Math.min(this.x, maxX));
        this.y = Math.max(minY, Math.min(this.y, maxY));
        
        if (world.city) {
            this.constrainToCity(world.city);
        }

        // Check if stuck
        if (now - this.movementCheckTime > 1000) {
            const distMoved = Math.hypot(this.x - this.lastPosition.x, this.y - this.lastPosition.y);
            if (this.isMoving && distMoved < 1) { // If trying to move but moved less than 1 pixel
                this.stuckCounter++;
                if (this.stuckCounter > 2) { // Stuck for 3 checks
                    this.path = []; // Clear path and force recalculation on next AI tick
                    this.patrolTarget = null;
                    this.stuckCounter = 0;
                }
            } else {
                this.stuckCounter = 0;
            }
            this.lastPosition = { x: this.x, y: this.y };
            this.movementCheckTime = now;
        }

        // Handle punching when close to player and no weapon
        if (!this.weapon && this.state === 'CHASING') {
            const distToPlayer = Math.hypot(this.x - player.x, this.y - player.y);
            if (distToPlayer < this.punchRange * 1.2) {
                this.punch();
            }
        }

        // Handle biting when close to player and no weapon
        if (this.isZombie && this.civilianTarget) {
            const distToTarget = Math.hypot(this.x - this.civilianTarget.x, this.y - this.civilianTarget.y);
            if (distToTarget < this.biteAttack.range) {
                this.bite();
            }
        }
    }

    spreadPanic() {
        spreadPanic(this);
    }

    runCivilianAI(player, now) {
        return runCivilianAI(this, player, now);
    }

    findSocialTarget() {
        findSocialTarget(this);
    }

    runCombatAI(player, now, distToPlayer) {
        return runCombatAI(this, player, now, distToPlayer);
    }

    runZombieAI(player, now) {
        return runZombieAI(this, player, now);
    }

    runGrievingBehavior(now) {
        return runGrievingBehavior(this, now);
    }

    emitTears() {
        if (this.isZombie) return;
        const tearCount = 2 + Math.random() * 3;
        for (let i = 0; i < tearCount; i++) {
            const speed = 1 + Math.random() * 2;
            const angle = Math.random() * Math.PI * 2;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const size = Math.random() * 1.5 + 1;
            
            // Tears come from the 'eyes', which are near the top of the circle
            particles.push(new TearParticle(this.x, this.y - this.radius * 0.3, vx, vy, size));
        }
    }

    witnessDeath(deathX, deathY) {
        witnessDeath(this, deathX, deathY);
    }

    witnessRelatedDeath(deadEnemyId, corpse) {
        witnessRelatedDeath(this, deadEnemyId, corpse);
    }

    _decideState(player, distToPlayer, now) {
        decideState(this, player, distToPlayer, now);
    }

    constrainToCity(city) {
        if (!city) return;
        // More robust building collision
        for (const building of city.buildings) {
            const closestX = Math.max(building.x, Math.min(this.x, building.x + building.width));
            const closestY = Math.max(building.y, Math.min(this.y, building.y + building.height));

            const dx = this.x - closestX;
            const dy = this.y - closestY;
            const dist = Math.hypot(dx, dy);

            if (dist < this.radius) {
                // Collision occurred
                const overlap = this.radius - dist;
                const pushAngle = Math.atan2(dy, dx);
                
                // Push out of the building
                this.x += Math.cos(pushAngle) * overlap;
                this.y += Math.sin(pushAngle) * overlap;
                
                // If using velocity-based movement, deflect velocity
                if (this.velocity) {
                    const wallNormalX = dx / dist;
                    const wallNormalY = dy / dist;
                    const dot = this.velocity.x * wallNormalX + this.velocity.y * wallNormalY;
                    
                    // Deflect velocity to simulate sliding
                    this.velocity.x -= dot * wallNormalX * 1.1;
                    this.velocity.y -= dot * wallNormalY * 1.1;
                }

                // If following a path and hit a building, the path is likely bad.
                if (this.path && this.path.length > 0) {
                    this.stuckCounter++;
                    if (this.stuckCounter > 1) { // If stuck for more than one frame
                        this.path = [];
                        this.patrolTarget = null; // Also reset patrol target
                    }
                }
            }
        }
    }

    witnessCrime(crimeType, criminal, victim) {
        // Don't react if already in combat, fleeing, or grieving
        if (['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING'].includes(this.state)) return;

        if (this.isCop) {
            if (criminal === world.player) {
                this.state = 'CHASING';
                this.policeTarget = null; // Target the player
                this.lastKnownPlayerPos = { x: criminal.x, y: criminal.y };
                world.wantedLevel = Math.min(5, world.wantedLevel + 1);
                world.lastWantedLevelIncrease = Date.now();
            } else if (criminal instanceof Enemy && criminal.isHostileActor) {
                this.state = 'CHASING';
                this.policeTarget = criminal; // Target the hostile civilian
            } else if (crimeType === 'zombie_attack' && criminal.isZombie) {
                this.state = 'CHASING';
                this.policeTarget = criminal; // Target the attacking zombie
                this.knowsZombiesAreHostile = true;
                this.reactionFlash = { type: 'anger', time: Date.now() };
            }
        } else { // Civilian witness
            this.state = 'FLEEING';
            this.fleeTarget = criminal;
            this.lastSeenFleeTargetTime = Date.now(); // Start the fear timer
            this.stateChangeCooldown = Date.now() + 5000 + Math.random() * 3000;
            this.reactionFlash = { type: 'fear', time: Date.now() };
        }
    }

    takeDamage(amount, impactAngle, options = {}) {
        if (this.health <= 0) return; // Already dead

        // Zombification should happen before any damage is applied
        // and should prevent any damage from being taken.
        if (options.onHitEffect === 'zombify') {
            this.zombify();
            return; // Stop further damage processing.
        }

        // Apply knockback if specified
        if (options.knockback && options.knockback > 0) {
            this.applyKnockback(options.knockback, impactAngle, options.owner);
        }

        // Apply player damage multiplier
        if (options.owner === world.player) {
            amount *= settings.playerDamageMultiplier;
        }

        // --- Dismemberment Logic ---
        // Shotguns and special modifiers can dismember
        const dismemberChanceFromWeapon = options.weaponName === 'Shotgun' ? 0.2 : 0;
        const totalDismemberChance = dismemberChanceFromWeapon + (options.dismemberChance || 0);

        if (totalDismemberChance > 0 && options.owner) {
            const distToOwner = Math.hypot(this.x - options.owner.x, this.y - options.owner.y);
            const canDismember = distToOwner < 150; // Dismemberment is a close-range affair

            if (canDismember && Math.random() < totalDismemberChance) {
                this.dismember(impactAngle);
                if (this.health <= 0) {
                     createBloodSplatter(this.x, this.y, amount, impactAngle, { bloodyMess: options.bloodyMess });
                     return;
                }
            }
        }

        // Shotgun damage accumulation
        if (options.weaponName === 'Shotgun' && options.shotId) {
            // If it's a new shot, reset accumulator
            if (this.shotgunDamageAccumulator.id !== options.shotId) {
                this.shotgunDamageAccumulator.id = options.shotId;
                this.shotgunDamageAccumulator.totalDamage = 0;
            }
            this.shotgunDamageAccumulator.totalDamage += amount;
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

        createBloodSplatter(this.x, this.y, amount, impactAngle, { bloodyMess: options.bloodyMess });

        if (wasAlive && this.health <= 0) {
            if (options.isHeadshot) {
                this.deathType = 'headshot';
            } else {
                this.deathType = 'normal';
            }

            // Overwrite with head explosion if conditions met
            if (options.weaponName === 'Shotgun' && options.owner) {
                const distToOwner = Math.hypot(this.x - options.owner.x, this.y - options.owner.y);
                const damageThreshold = 100; // Lowered from 140. Approx 5 pellets worth of damage
                if (distToOwner < 280 && this.shotgunDamageAccumulator.totalDamage >= damageThreshold) {
                    this.deathType = 'head_exploded';
                }
            } else if (wasAlive && this.health > 0 && !this.isZombie) { // If it survived and is not a zombie
                const minPainShockDuration = 200;
                const maxPainShockDuration = 700;
                this.shockTime = Math.max(this.shockTime, Date.now() + minPainShockDuration + Math.random() * (maxPainShockDuration - minPainShockDuration));
                this.reactionFlash = { type: 'fear', time: Date.now() };
            }

            if (options.isHeadshot && !this.isBleeding) {
                this.isBleeding = true;
                this.lastBloodDripTime = Date.now();
            }
        }
    }

    applyKnockback(force, angle, source) {
        const effectiveForce = force * (1 - this.knockbackResistance);
        const knockbackVelocity = {
            x: Math.cos(angle) * effectiveForce,
            y: Math.sin(angle) * effectiveForce
        };
        
        // Apply knockback movement
        const newX = this.x + knockbackVelocity.x;
        const newY = this.y + knockbackVelocity.y;
        
        // Check for wall/building collision during knockback
        this.checkKnockbackCollision(newX, newY, effectiveForce, source);
        
        this.x = newX;
        this.y = newY;
        this.constrainToCity(world.city);
    }

    checkKnockbackCollision(newX, newY, force, source) {
        let hitWall = false;
        let wallDamage = 0;
        
        // Check world boundaries
        if (newX <= world.wallThickness + this.radius || 
            newX >= world.width - world.wallThickness - this.radius ||
            newY <= world.wallThickness + this.radius || 
            newY >= world.height - world.wallThickness - this.radius) {
            hitWall = true;
        }
        
        // Check building collision
        if (world.city) {
            for (const building of world.city.buildings) {
                if (newX >= building.x && newX <= building.x + building.width &&
                    newY >= building.y && newY <= building.y + building.height) {
                    hitWall = true;
                    break;
                }
            }
        }
        
        if (hitWall && force > 4) {
            // Calculate wall slam damage based on force
            wallDamage = Math.floor(force * 2.5); // 2.5 damage per force unit
            
            this.takeDamage(wallDamage, 0, { weaponName: 'Wall Impact', owner: source });
            
            // Complete obliteration for very high forces
            if (force > 25) {
                this.obliterate(source);
            }
        }
    }

    obliterate(source) {
        // Mark all limbs as severed
        this.limbs = {
            leftArm: false,
            rightArm: false,
            leftLeg: false,
            rightLeg: false,
        };
        
        this.health = 0; // Instant death
        this.deathType = 'obliterated';
        
        // Create multiple body part ragdolls
        const numParts = 5 + Math.floor(Math.random() * 4); // 5-8 parts
        for (let i = 0; i < numParts; i++) {
            const angle = (Math.PI * 2 * i) / numParts + Math.random() * 0.8;
            const speed = 8 + Math.random() * 12;
            const launchVector = {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            };
            
            const part = new Ragdoll(
                this.x + (Math.random() - 0.5) * 30,
                this.y + (Math.random() - 0.5) * 30,
                launchVector,
                this.color,
                { isSeveredLimb: true, severedLimbType: 'fragment', isHeadExploded: true }
            );
            corpses.push(part);
        }
        
        // Create massive blood splatter
        createBloodSplatter(this.x, this.y, 150, Math.random() * Math.PI * 2);
    }

    punch() {
        const now = Date.now();
        if (now - this.lastPunchTime < this.punchCooldown) return;
        
        this.lastPunchTime = now;
        
        // Play punch sound
        playSound('knife_swing', { volume: 0.25, pitch: 1.2 });
        
        // Try to punch the player
        const dx = world.player.x - this.x;
        const dy = world.player.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < this.punchRange + world.player.radius) {
            const angleToPlayer = Math.atan2(dy, dx);
            let angleDiff = angleToPlayer - this.facingAngle;
            
            // Handle wraparound
            if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            // Check if player is in front of enemy (60 degree arc)
            if (Math.abs(angleDiff) < Math.PI / 6) {
                world.player.takeDamage(this.punchDamage, angleToPlayer, {
                    weaponName: 'Punch',
                    owner: this,
                    knockback: this.punchKnockback
                });
            }
        }
    }

    bite() {
        const now = Date.now();
        if (now - this.lastBiteTime < this.biteAttack.cooldown || !this.civilianTarget) return;

        this.lastBiteTime = now;
        playSound('zombie_bite', { volume: 0.6, pitch: 0.9 + Math.random() * 0.2 });

        const target = this.civilianTarget;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < this.biteAttack.range + target.radius) {
            const angleToTarget = Math.atan2(dy, dx);
            let angleDiff = angleToTarget - this.facingAngle;
            if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            // Wide bite arc
            if (Math.abs(angleDiff) < Math.PI / 3) {
                target.takeDamage(this.biteAttack.damage, angleToTarget, {
                    weaponName: 'Bite',
                    owner: this,
                    knockback: this.biteAttack.knockback,
                    onHitEffect: 'zombify' // Add zombify effect to bite
                });
                
                // A bite is a crime witnesses can react to
                checkCrimeWitnesses(this, 'zombie_attack', target);

                // Zombify target
                if (target.zombify) {
                    target.zombify();
                }
            }
        }
    }

    zombify() {
        if (this.isZombie) return;

        this.isZombie = true;
        this.health = this.maxHealth * 1.5; // Zombies are tougher
        this.maxHealth *= 1.5;
        this.color = '#5a7d59'; // Sickly green
        this.speed *= 0.7; // Shamble
        this.state = 'CHASING'; // Immediately start hunting
        this.weapon = null; // Zombies don't use guns
        this.bravery = 1.0;
        this.aggressiveness = 1.0;
        this.isHostileActor = true; // Hostile to everyone
        this.isCop = false; // No longer a cop
        this.civilianTarget = null;
        this.policeTarget = null;
        this.fleeTarget = null;
        
        // Play a sound effect?
        // playSound('zombie_turn');
    }

    getBodyColor() {
        // Hit flash overrides base color
        if (Date.now() - this.hitFlashTime < 100) {
            return '#ffffff';
        }
        return this.color;
    }

    drawArms(ctx, player) {
        if (this.isZombie) {
            // Zombie arms outstretched
            const armLength = this.radius * 1.5;
            const shoulderSeparation = this.radius * 0.5;

            ctx.strokeStyle = this.color;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';

            // Left Arm
            if (this.limbs.leftArm) {
                ctx.beginPath();
                ctx.moveTo(0, -shoulderSeparation);
                ctx.lineTo(armLength, -shoulderSeparation * 0.5);
                ctx.stroke();
            }
            // Right Arm
            if (this.limbs.rightArm) {
                ctx.beginPath();
                ctx.moveTo(0, shoulderSeparation);
                ctx.lineTo(armLength, shoulderSeparation * 0.5);
                ctx.stroke();
            }
            return;
        }

        if (!this.weapon || this.weapon.name === 'Knife') {
            if (!this.limbs.leftArm && !this.limbs.rightArm) return;

            const handRadius = 6;
            const shoulderSeparation = this.radius * 0.6;
            const armOffset = this.radius * 0.8; // Distance from body center

            ctx.fillStyle = this.color; // Skin color for hands

            // Left Arm (from enemy's perspective, relative to facing direction)
            if (this.limbs.leftArm) {
                ctx.beginPath();
                ctx.arc(armOffset, -shoulderSeparation, handRadius, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Right Arm (from enemy's perspective, relative to facing direction)
            if (this.limbs.rightArm) {
                ctx.beginPath();
                ctx.arc(armOffset, shoulderSeparation, handRadius, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }

        const handRadius = 5;
        ctx.fillStyle = this.color;

        // The weapon's drawing origin, including recoil.
        const gunX = this.radius - this.weapon.recoil;
        const gunY = 0;

        // Make copies of grip points to animate them without modifying the weapon's base data
        let backHandPos = this.weapon.gripPoints.backHand ? { ...this.weapon.gripPoints.backHand } : null;
        let frontHandPos = this.weapon.gripPoints.frontHand ? { ...this.weapon.gripPoints.frontHand } : null;

        // --- Handle Reload Animations ---
        if (this.weapon.isReloading && this.weapon.reloadAnimProgress > 0 && this.weapon.name !== 'Shotgun') {
            const progress = this.weapon.reloadAnimProgress;
            const magWellPos = this.weapon.magWellPoint;

            if (frontHandPos && magWellPos) {
                const startPos = this.weapon.gripPoints.frontHand;
                const hipPos = { x: 0, y: this.radius + 10 }; 

                let currentPos;
                if (progress < 0.5) {
                    const t = progress * 2;
                    const p0 = startPos;
                    const p2 = hipPos;
                    const p1 = { x: (p0.x + p2.x) / 2, y: p2.y + 30 }; 

                    currentPos = {
                        x: (1 - t)**2 * p0.x + 2 * (1 - t) * t * p1.x + t**2 * p2.x,
                        y: (1 - t)**2 * p0.y + 2 * (1 - t) * t * p1.y + t**2 * p2.y
                    };
                } else {
                    const t = (progress - 0.5) * 2;
                    const p0 = hipPos;
                    const p2 = magWellPos;
                    const p1 = { x: (p0.x + p2.x) / 2, y: p0.y + 30 };

                    currentPos = {
                        x: (1 - t)**2 * p0.x + 2 * (1 - t) * t * p1.x + t**2 * p2.x,
                        y: (1 - t)**2 * p0.y + 2 * (1 - t) * t * p1.y + t**2 * p2.y
                    };
                }
                frontHandPos.x = currentPos.x;
                frontHandPos.y = currentPos.y;
            }
        }
        
        // --- Handle Shotgun Pump Animation ---
        if (this.weapon.name === 'Shotgun' && this.weapon.pumpProgress > 0) {
            const progress = this.weapon.pumpProgress;
            const pumpDist = 20;
            // This creates a 0 -> 1 -> 0 path as progress goes from 1 -> 0
            const animPath = 1 - Math.abs(1 - (1 - progress) * 2);

            if(frontHandPos) {
                frontHandPos.x -= pumpDist * animPath;
            }
        }

        // --- Draw Hands ---
        if (frontHandPos && this.limbs.rightArm) { // Assuming front hand is right hand
            ctx.beginPath();
            ctx.arc(gunX + frontHandPos.x, gunY + frontHandPos.y, handRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        if (backHandPos && this.limbs.leftArm) { // Assuming back hand is left
            ctx.beginPath();
            ctx.arc(gunX + backHandPos.x, gunY + backHandPos.y, handRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawLegs(ctx) {
        const strideLength = 8; // Fixed value
        const legWidth = 6;
        const legHeight = 16 + this.radius * 0.2; // Scale with NPC size
        const legSeparation = 8;

        // Simplified leg animation
        const legOffset = Math.sin(this.walkCycle) * strideLength;
        const bobOffset = Math.sin(this.walkCycle * 2) * 0.5;

        ctx.save();
        ctx.rotate(this.movementAngle);
        ctx.translate(0, bobOffset * 0.5); // Subtle body bob

        const legColor = '#2a2a2a';

        // Left Leg - simplified animation
        if (this.limbs.leftLeg) {
            ctx.save();
            ctx.translate(legOffset, -legSeparation / 2);
            
            ctx.fillStyle = legColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, legHeight / 2, legWidth / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Right Leg - simplified animation
        if (this.limbs.rightLeg) {
            ctx.save();
            ctx.translate(-legOffset, legSeparation / 2);
            
            ctx.fillStyle = legColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, legHeight / 2, legWidth / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        ctx.restore();
    }

    drawOverBody(ctx, player) {
        // Hook for subclasses like Cop to draw hats, etc.
    }

    draw(ctx, player) {
        if (this.isHostileActor) {
            ctx.save();
            ctx.translate(this.x, this.y);
            const glowIntensity = 0.3 + Math.sin(Date.now() / 250) * 0.2; // Pulsating glow
            ctx.fillStyle = `rgba(255, 50, 50, ${glowIntensity})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        const bodyColor = this.getBodyColor();

        // Handle grief/anger reaction flash
        const reaction = this.reactionFlash;
        if (reaction.type && Date.now() - reaction.time < 200) {
            let flashColor = '#000000';
            if (reaction.type === 'grief') flashColor = '#1a1a4d'; // Dark blue for grief
            if (reaction.type === 'anger') flashColor = '#6d1a1a'; // Dark red for anger
            if (reaction.type === 'fear') flashColor = '#f0e68c'; // Khaki for fear

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
            ctx.fillStyle = flashColor;
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.isMoving) {
            this.drawLegs(ctx);
        }

        // Body and arms (rotated to face direction)
        ctx.save();
        ctx.rotate(this.facingAngle);
        
        // Draw Body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = bodyColor;
        ctx.fill();

        // Draw Weapon
        if (this.weapon) {
            this.weapon.draw(ctx);
        }

        // Draw Arms
        this.drawArms(ctx, player);

        // Draw Hat (or other accessories) for subclasses
        this.drawOverBody(ctx, player);

        ctx.restore(); // un-rotate

        ctx.restore(); // un-translate
    }
}