import { world, enemies, corpses, settledCorpses } from '../world.js';
import { getSidewalkPatrolPoint, hasLineOfSight, getSidewalkPath, findNearestSidewalk, isOnSidewalk } from '../city.js';

/* @tweakable [Distance from commander for military units to maintain formation.] */
const COMMANDER_FOLLOW_DISTANCE = 80;
/* @tweakable [Width of the military unit formation around the commander.] */
const COMMANDER_FORMATION_WIDTH = 120;

const MAX_ATTACKERS = 10; 
const ATTACK_RADIUS = 150; 
const FEAR_LOS_COOLDOWN = 5000; 

/* @tweakable [How often combat AI recalculates its path in milliseconds when target is not visible] */
const COMBAT_PATH_RECALC_INTERVAL = 1000;

/* @tweakable [Distance threshold to switch from path-following to direct chase when target becomes visible] */
const DIRECT_CHASE_LOS_DISTANCE = 500;

/* @tweakable [Duration in milliseconds an enemy will search for a lost target] */
const SEARCH_DURATION = 5000;

/* @tweakable [How close an NPC needs to get to a waypoint to consider it reached] */
const WAYPOINT_REACHED_THRESHOLD = 40;

function lerpAngle(start, end, amount) {
    let difference = end - start;
    if (difference > Math.PI) {
        difference -= 2 * Math.PI;
    } else if (difference < -Math.PI) {
        difference += 2 * Math.PI;
    }
    return start + difference * amount;
}

export function predictTargetPosition(shooter, target) {
    // If target has no velocity, just aim at the center.
    if (!target.vx && !target.vy) {
        return { x: target.x, y: target.y };
    }

    // Get the projectile speed from the weapon's stats.
    const projectileSpeed = shooter.weapon ? shooter.weapon.getModifiedStats().projectileSpeed : 25;
    if (projectileSpeed === 0) return { x: target.x, y: target.y };

    const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y);
    const timeToHit = dist / projectileSpeed;

    // Base prediction based on strength
    const predictedX = target.x + target.vx * timeToHit * shooter.predictionStrength;
    const predictedY = target.y + target.vy * timeToHit * shooter.predictionStrength;

    // Add inaccuracy based on error margin
    const errorMagnitude = shooter.predictionError * dist * 0.05; // Error scales with distance
    const errorAngle = Math.random() * Math.PI * 2;
    const finalX = predictedX + Math.cos(errorAngle) * errorMagnitude;
    const finalY = predictedY + Math.sin(errorAngle) * errorMagnitude;

    return { x: finalX, y: finalY };
}

export function decideState(enemy, player, distToPlayer, now) {
    if (now < enemy.stateChangeCooldown) return;
    
    if (enemy.canSeePlayer) {
        enemy.lastKnownPlayerPos = { x: player.x, y: player.y };
    }

    // Check how many other enemies are currently attacking the player
    let nearbyAttackers = 0;
    if (enemy.state !== 'FLEEING') {
        for (const other of enemies) {
            if (other === enemy) continue;
            const distOtherToPlayer = Math.hypot(other.x - player.x, other.y - player.y);
            // Consider an enemy an "attacker" if it's close and in an aggressive state
            if (distOtherToPlayer < ATTACK_RADIUS && (other.state === 'CHASING' || other.state === 'STRAFING')) {
                nearbyAttackers++;
            }
        }
    }

    // Don't change state if attacking or fleeing a civilian
    if (enemy.state === 'ATTACKING_CIVILIAN' || (enemy.state === 'FLEEING' && enemy.fleeTarget)) {
        return;
    }

    const healthPercent = enemy.health / enemy.maxHealth;
    const wantedLevelFactor = Math.min(1, world.wantedLevel / 5); // 0-1 based on wanted level

    // If hostile to player, use combat logic. Otherwise, civilian logic.
    let isHostileToPlayer = enemy.isCop ? world.wantedLevel > 0 : enemy.isHostileActor;

    // If I'm a civilian and I was just shot, I become hostile
    if (!enemy.isCop && enemy.lastHitBy === player && now - enemy.hitFlashTime < 5000) {
        isHostileToPlayer = true;
        enemy.isHostileActor = true;
    }

    if (!isHostileToPlayer) {
        // Civilians flee from a firefight
        const aggressionNearby = enemies.some(e => e.isHostileActor && Math.hypot(enemy.x - e.x, enemy.y - e.y) < 500);
        const playerIsAggressive = world.playerHasBeenAggressive && distToPlayer < 600;

        if (aggressionNearby || playerIsAggressive) {
            // Break any active conversation before fleeing
            if (enemy.conversingWith) {
                enemy.conversingWith.conversingWith = null;
                enemy.conversingWith.state = 'PATROLLING';
                enemy.conversingWith = null;
            }
            enemy.state = 'FLEEING';
            enemy.fleeTarget = player;
            enemy.stateChangeCooldown = now + 1500;
        }
    }

    // --- COMBAT LOGIC ---
    // Much higher fleeing thresholds for civilians
    const fleeHealthThreshold = 0.8 - enemy.bravery * 0.3; // Ranges from 0.68 (bravest) to 0.8 (most cowardly)
    if (healthPercent < fleeHealthThreshold && enemy.state !== 'FLEEING' && !enemy.isCop) {
        enemy.state = 'FLEEING';
        enemy.fleeTarget = player;
        enemy.stateChangeCooldown = now + 2000; // Longer flee duration
        return;
    }

    // If fleeing, much higher threshold to stop fleeing
    if (enemy.state === 'FLEEING') {
        if (healthPercent > fleeHealthThreshold + 0.3 || distToPlayer > 1200) {
            // Only very brave civilians re-engage after fleeing
            if (enemy.bravery > 0.3 && enemy.aggressiveness > 0.2 && enemy.isCop) {
                enemy.state = 'CHASING';
            } else {
                enemy.state = 'PATROLLING'; // Most just go back to normal life
            }
        }
    } else { // Not fleeing, decide on action
        // Much more restrictive engagement criteria
        if (nearbyAttackers >= MAX_ATTACKERS && enemy.state === 'CHASING' && distToPlayer < 400) {
            enemy.state = 'STRAFING';
            enemy.stateChangeCooldown = now + 500;
            return;
        }

        const engageDistance = 400; // Reduced from 600
        const idealStrafeDistance = 300; // Reduced from 400

        // Only very brave and aggressive civilians will actually engage
        const willFight = enemy.bravery > 0.25 && enemy.aggressiveness > 0.2 && healthPercent > 0.6;
        
        if (!willFight) {
            enemy.state = 'FLEEING';
            enemy.fleeTarget = player;
            enemy.stateChangeCooldown = now + 1500;
            return;
        }

        if (distToPlayer > engageDistance && enemy.lastKnownPlayerPos) {
             enemy.state = 'CHASING';
        } else if (distToPlayer < idealStrafeDistance) {
            // Even brave civilians prefer to strafe rather than charge
            if (Math.random() < 0.7) { // 70% chance to strafe instead of charge
                enemy.state = 'STRAFING';
            } else {
                enemy.state = 'CHASING';
            }
        } else {
            enemy.state = 'STRAFING'; // Default to cautious behavior
        }
    }
    
    // Dynamically adjust strafe distance based on crowd
    if (enemy.state === 'STRAFING') {
        // Increase strafe distance if the area is crowded, pushing this enemy to the outer circle.
        enemy.strafeDistanceModifier = Math.min(200, nearbyAttackers * 50);
    } else {
        enemy.strafeDistanceModifier = 0;
    }

    // Re-evaluate state every so often to feel dynamic
    enemy.stateChangeCooldown = now + 300 + Math.random() * 400;
}

export function runCombatAI(enemy, player, now, distToPlayer) {
    enemy._decideState(player, distToPlayer, now);

    let goalDx = 0;
    let goalDy = 0;
    let currentSpeed = enemy.speed;

    const target = (enemy.isCop && enemy.policeTarget) || (enemy.state === 'ATTACKING_CIVILIAN' && enemy.civilianTarget) || player;
    const canSeeTarget = hasLineOfSight(enemy.x, enemy.y, target.x, target.y, world.city.buildings);

    if (canSeeTarget) {
        enemy.lastKnownPlayerPos = { x: target.x, y: target.y };
        enemy.path = []; // Clear path if we can see the target
    }

    switch (enemy.state) {
        case 'FOLLOWING_COMMANDER':
            const { commander } = enemy;
            if (commander && commander.health > 0) {
                // Determine formation position relative to commander
                if (!enemy.formationPosition) {
                    // Assign a random slot in the formation
                    enemy.formationPosition = {
                        x: (Math.random() - 0.5) * COMMANDER_FORMATION_WIDTH,
                        y: COMMANDER_FOLLOW_DISTANCE + (Math.random() * 50)
                    };
                }

                const commanderAngle = commander.facingAngle;
                const cosA = Math.cos(commanderAngle);
                const sinA = Math.sin(commanderAngle);

                // Rotate the formation offset to match commander's facing direction
                const rotatedOffsetX = enemy.formationPosition.x * cosA - enemy.formationPosition.y * sinA;
                const rotatedOffsetY = enemy.formationPosition.x * sinA + enemy.formationPosition.y * cosA;
                
                const targetX = commander.x - rotatedOffsetX;
                const targetY = commander.y - rotatedOffsetY;

                goalDx = targetX - enemy.x;
                goalDy = targetY - enemy.y;
                currentSpeed = enemy.speed * 0.9;
            } else {
                enemy.state = 'CHASING'; // Commander is gone, revert to combat
            }
            break;

        case 'REGROUPING':
            let avgX = 0;
            let avgY = 0;
            let militaryCount = 0;
            for (const unit of enemies) {
                if (unit.isMilitary && unit.health > 0) {
                    avgX += unit.x;
                    avgY += unit.y;
                    militaryCount++;
                }
            }
            if (militaryCount > 0) {
                goalDx = (avgX / militaryCount) - enemy.x;
                goalDy = (avgY / militaryCount) - enemy.y;
            } else {
                // No other military, just attack player
                enemy.state = 'CHASING';
            }
            
            if (now > enemy.stateChangeCooldown) {
                enemy.state = 'CHASING';
            }
            break;

        case 'CHASING':
        case 'STRAFING':
            if (canSeeTarget) {
                if (enemy.state === 'STRAFING') {
                    if (now > enemy.lastStrafeSwitch + enemy.strafeSwitchInterval) {
                        enemy.strafeDirection *= -1;
                        enemy.lastStrafeSwitch = now;
                    }
                    const toTargetMag = distToPlayer > 0 ? distToPlayer : 1;
                    const dyToTarget = target.y - enemy.y;
                    const dxToTarget = target.x - enemy.x;
                    const perpDx = -dyToTarget / toTargetMag;
                    const perpDy = dxToTarget / toTargetMag;
                    const idealDist = 200 + (1 - enemy.aggressiveness) * 150 + enemy.strafeDistanceModifier;
                    const distError = distToPlayer - idealDist;
                    const distCorrectionSpeed = Math.max(-1, Math.min(1, distError * -0.05));
                    goalDx = (perpDx * enemy.strafeDirection * 0.8) + (dxToTarget / toTargetMag * distCorrectionSpeed * 0.6);
                    goalDy = (perpDy * enemy.strafeDirection * 0.8) + (dyToTarget / toTargetMag * distCorrectionSpeed * 0.6);
                    currentSpeed *= 0.9;
                } else { // CHASING with LoS
                    goalDx = target.x - enemy.x;
                    goalDy = target.y - enemy.y;
                }
            } else {
                // Can't see target, use pathfinding.
                if ((!enemy.path || enemy.path.length === 0) && enemy.lastKnownPlayerPos) {
                    if (!enemy.lastPathCalc || now - enemy.lastPathCalc > COMBAT_PATH_RECALC_INTERVAL) {
                        enemy.path = getSidewalkPath(world.city, enemy.x, enemy.y, enemy.lastKnownPlayerPos.x, enemy.lastKnownPlayerPos.y);
                        enemy.pathIndex = 0;
                        enemy.lastPathCalc = now;
                    }
                }
            }
            break;
        case 'FLEEING':
            const fleeFrom = enemy.fleeTarget || player;
            goalDx = -(fleeFrom.x - enemy.x);
            goalDy = -(fleeFrom.y - enemy.y);
            currentSpeed *= 1.5;
            break;
        case 'SEARCHING':
            currentSpeed = enemy.speed * 0.5;
            if (now > enemy.searchEndTime) {
                enemy.state = 'PATROLLING';
            } else {
                // If no path, generate a short one to wander
                if (!enemy.path || enemy.path.length === 0) {
                    if (!enemy.lastPathCalc || now - enemy.lastPathCalc > 2500) {
                        const randomPoint = getSidewalkPatrolPoint(world.city);
                        enemy.path = getSidewalkPath(world.city, enemy.x, enemy.y, randomPoint.x, randomPoint.y);
                        enemy.pathIndex = 0;
                        enemy.lastPathCalc = now;
                    }
                }
            }
            break;
        default: // PATROLLING, IDLE
             if (enemy.canSeePlayer || (enemy.isCop && enemy.policeTarget)) {
                enemy.state = 'CHASING';
            }
            break;
    }
    return { goalDx, goalDy, currentSpeed };
}

export function runCivilianAI(enemy, player, now) {
    // Handle attacking another civilian
    if (enemy.state === 'ATTACKING_CIVILIAN') {
        if (!enemy.civilianTarget || enemy.civilianTarget.health <= 0) {
            enemy.state = 'PATROLLING';
            enemy.civilianTarget = null;
            enemy.isHostileActor = false;
            enemy.weapon = null;
            enemy.routeWaypoints = [];
            return { goalDx: 0, goalDy: 0, currentSpeed: 0 };
        }
        const goalDx = enemy.civilianTarget.x - enemy.x;
        const goalDy = enemy.civilianTarget.y - enemy.y;
        const currentSpeed = enemy.speed;
        return { goalDx, goalDy, currentSpeed };
    }

    // Fleeing logic
    if (enemy.state === 'FLEEING' && enemy.fleeTarget) {
        if (!enemy.fleeTarget || enemy.fleeTarget.health <= 0) {
            // Threat is gone, calm down
            enemy.state = 'PATROLLING';
            enemy.fleeTarget = null;
            enemy.routeWaypoints = [];
            return { goalDx: 0, goalDy: 0, currentSpeed: 0 };
        }

        // Check Line of Sight for calming down
        if (enemy.fleeTarget) {
            const canSeeThreat = hasLineOfSight(enemy.x, enemy.y, enemy.fleeTarget.x, enemy.fleeTarget.y, world.city.buildings);
            if (canSeeThreat) {
                enemy.lastSeenFleeTargetTime = now;
            }
        }

        // Lost sight of threat — but stay scared if we recently HEARD a gunshot
        if (now - enemy.lastSeenFleeTargetTime > FEAR_LOS_COOLDOWN && now > (enemy._heardGunshotUntil || 0)) {
            // Lost sight AND hearing expired — calm down
            enemy.state = 'PATROLLING';
            enemy.fleeTarget = null;
            enemy.routeWaypoints = [];
            enemy.stateChangeCooldown = now + 2000;
            return { goalDx: 0, goalDy: 0, currentSpeed: 0 };
        }
        
        // Continue fleeing
        const goalDx = -(enemy.fleeTarget.x - enemy.x);
        const goalDy = -(enemy.fleeTarget.y - enemy.y);
        return { goalDx, goalDy, currentSpeed: enemy.speed * 1.2 };
    }

    const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    let goalDx = 0;
    let goalDy = 0;
    let currentSpeed = 0;

    // Check if stuck and reset if necessary
    if (now - enemy.movementCheckTime > 1000) { // Check every second
        const distMoved = Math.hypot(enemy.x - enemy.lastPosition.x, enemy.y - enemy.lastPosition.y);
        if (distMoved < 5 && enemy.isMoving) { // Barely moved while trying to move
            enemy.stuckCounter++;
            if (enemy.stuckCounter > 3) {
                // Reset route and find new destination
                enemy.routeWaypoints = [];
                enemy.patrolTarget = null;
                enemy.stuckCounter = 0;
            }
        } else {
            enemy.stuckCounter = 0;
        }
        enemy.lastPosition = { x: enemy.x, y: enemy.y };
        enemy.movementCheckTime = now;
    }

    // Enhanced glancing behavior with curiosity factor
    const canGlance = enemy.state === 'PATROLLING' || enemy.state === 'IDLE';
    if (canGlance && distToPlayer < 120 && now > enemy.glanceEndTime + 5000) {
        const glanceChance = 0.6 + enemy.curiosity * 0.3;
        if (Math.random() < glanceChance) {
            enemy.state = 'GLANCING';
            enemy.glanceEndTime = now + (1000 + Math.random() * 2000) * (1 + enemy.curiosity);
        } else {
            enemy.glanceEndTime = now;
        }
    }
    
    // Enhanced State Actions
    switch (enemy.state) {
        case 'PATROLLING':
            // The pathing logic is now handled by the main enemy update loop.
            if (!enemy.path || enemy.path.length === 0) {
                const endPoint = getSidewalkPatrolPoint(world.city);
                enemy.path = getSidewalkPath(world.city, enemy.x, enemy.y, endPoint.x, endPoint.y);
                enemy.pathIndex = 0;
            }
            currentSpeed = enemy.patrolSpeed;

            // --- Conversation trigger: find a nearby NPC to talk to ---
            if (!enemy.conversingWith && Math.random() < 0.005 * enemy.socialness) {
                for (const other of enemies) {
                    if (other === enemy || other.health <= 0 || other.isCop || other.isHostileActor) continue;
                    if (other.conversingWith) continue; // Already in a conversation
                    const dist = Math.hypot(enemy.x - other.x, enemy.y - other.y);
                    if (dist < 60 && dist > 20 && (other.state === 'PATROLLING' || other.state === 'IDLE')) {
                        // Start conversation
                        enemy.conversingWith = other;
                        enemy.conversationEndTime = now + 3000 + Math.random() * 4000; // 3-7 seconds
                        enemy.state = 'CONVERSING';
                        enemy.path = [];
                        other.conversingWith = enemy;
                        other.conversationEndTime = enemy.conversationEndTime;
                        other.state = 'CONVERSING';
                        other.path = [];
                        break;
                    }
                }
            }
            break;

        case 'CONVERSING':
            // Stand still and face the conversation partner
            currentSpeed = 0;
            if (!enemy.conversingWith || enemy.conversingWith.health <= 0 || now > enemy.conversationEndTime) {
                // End conversation — form a relationship
                if (enemy.conversingWith && enemy.conversingWith.health > 0) {
                    enemy.addRelationshipStrength(enemy.conversingWith.enemyId, 0.15);
                    enemy.conversingWith.addRelationshipStrength(enemy.enemyId, 0.15);
                }
                enemy.conversingWith = null;
                enemy.state = 'PATROLLING';
                enemy.path = [];
            } else {
                // Face the conversation partner
                const partner = enemy.conversingWith;
                const angle = Math.atan2(partner.y - enemy.y, partner.x - enemy.x);
                enemy.facingAngle = angle;
                enemy.angle = angle;
            }
            break;

        case 'INVESTIGATING':
            if (now > enemy.investigateEndTime) {
                enemy.state = 'PATROLLING';
                enemy.routeWaypoints = [];
            } else {
                // Move cautiously toward player position, preferring sidewalks
                const investigateDx = player.x - enemy.x;
                const investigateDy = player.y - enemy.y;
                const investigateDist = Math.hypot(investigateDx, investigateDy);
                
                if (investigateDist > 80) {
                    // Try to stay on sidewalks while investigating
                    if (isOnSidewalk(enemy.x, enemy.y, world.city)) {
                        goalDx = investigateDx * 0.3; // Move slowly and indirectly
                        goalDy = investigateDy * 0.3;
                    } else {
                        // Move to nearest sidewalk first
                        const nearestSidewalk = findNearestSidewalk(enemy.x, enemy.y, world.city);
                        if (nearestSidewalk) {
                            goalDx = nearestSidewalk.point.x - enemy.x;
                            goalDy = nearestSidewalk.point.y - enemy.y;
                        }
                    }
                    currentSpeed = enemy.patrolSpeed * 0.6;
                }
            }
            break;

        case 'GLANCING':
            currentSpeed = enemy.patrolSpeed * 0.3;
            if (now > enemy.glanceEndTime) {
                enemy.state = 'PATROLLING';
                enemy.path = []; // Force new path
            }
            break;
        
        case 'IDLE':
            currentSpeed = 0;
            if (now > enemy.idleEndTime) {
                enemy.state = 'PATROLLING';
                enemy.path = []; // Force new path
            } else if (Math.random() < 0.03) { // Occasionally look around while idle
                enemy.facingAngle += (Math.random() - 0.5) * 0.3;
            }
            break;
    }

    return { goalDx, goalDy, currentSpeed };
}

export function runZombieAI(enemy, player, now) {
    let goalDx = 0;
    let goalDy = 0;
    let currentSpeed = enemy.speed; // Zombies shamble at their base speed

    // --- Find Target ---
    let closestTarget = null;
    let closestDistSq = Infinity;

    // Cops with zombie knowledge will hunt zombies
    if (enemy.isCop && enemy.knowsZombiesAreHostile) {
        for (const e of enemies) {
            if (e.isZombie && e.health > 0) {
                const distSq = (e.x - enemy.x)**2 + (e.y - enemy.y)**2;
                if (distSq < closestDistSq) {
                    closestDistSq = distSq;
                    closestTarget = e;
                }
            }
        }
    }
    
    // If a cop has a zombie target, prioritize it
    if (closestTarget) {
        enemy.policeTarget = closestTarget;
    }

    // Check player
    if (player && !player.isDead) {
        const distSq = (player.x - enemy.x)**2 + (player.y - enemy.y)**2;
        closestDistSq = distSq;
        closestTarget = player;
    }

    // Check other enemies
    for (const e of enemies) {
        if (e === enemy || e.isZombie || e.health <= 0) continue;

        const distSq = (e.x - enemy.x)**2 + (e.y - enemy.y)**2;
        if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closestTarget = e;
        }
    }

    enemy.civilianTarget = closestTarget; // Use civilianTarget to store the current target

    // --- Movement ---
    if (enemy.civilianTarget) {
        enemy.state = 'CHASING'; // Zombies are always chasing
        const canSeeTarget = hasLineOfSight(enemy.x, enemy.y, enemy.civilianTarget.x, enemy.civilianTarget.y, world.city.buildings);

        if (canSeeTarget) {
            enemy.path = []; // Clear path for direct chase
            goalDx = enemy.civilianTarget.x - enemy.x;
            goalDy = enemy.civilianTarget.y - enemy.y;
        } else {
            // Can't see target, use pathfinding
            if (!enemy.path || enemy.path.length === 0) {
                 if (!enemy.lastPathCalc || now - enemy.lastPathCalc > COMBAT_PATH_RECALC_INTERVAL) {
                    enemy.path = getSidewalkPath(world.city, enemy.x, enemy.y, enemy.civilianTarget.x, enemy.civilianTarget.y);
                    enemy.pathIndex = 0;
                    enemy.lastPathCalc = now;
                 }
            }
        }
    } else {
        // Wander aimlessly if no targets
        enemy.state = 'PATROLLING';
        // Simple wander logic
        if (now > (enemy.lastStrafeSwitch || 0) + 3000) { // Reuse strafe timer for simplicity
            enemy.searchDirection = Math.random() * Math.PI * 2;
            enemy.lastStrafeSwitch = now;
        }
        goalDx = Math.cos(enemy.searchDirection);
        goalDy = Math.sin(enemy.searchDirection);
        currentSpeed = enemy.speed * 0.5; // Wander slowly
    }

    return { goalDx, goalDy, currentSpeed };
}

export function runGrievingBehavior(enemy, now) {
    // Check if grieving target still exists
    const allCorpses = [...corpses, ...settledCorpses];
    const targetExists = allCorpses.includes(enemy.grievingTarget);
    
    if (!targetExists || (now > enemy.stateChangeCooldown + 10000)) { // Grieve for max 10s after initial period
        enemy.grievingTarget = null;
        enemy.state = 'PATROLLING';
        enemy.isHostileActor = enemy.isCop; // Revert hostility status
        return { goalDx: 0, goalDy: 0, currentSpeed: 0 };
    }

    // Move toward the corpse
    let targetX, targetY;
    if (enemy.grievingTarget.points && enemy.grievingTarget.points.length > 0) {
        // Average position of ragdoll points
        targetX = enemy.grievingTarget.points.reduce((sum, p) => sum + p.x, 0) / enemy.grievingTarget.points.length;
        targetY = enemy.grievingTarget.points.reduce((sum, p) => sum + p.y, 0) / enemy.grievingTarget.points.length;
    } else {
        targetX = enemy.grievingTarget.x || enemy.x;
        targetY = enemy.grievingTarget.y || enemy.y;
    }

    const distToCorpse = Math.hypot(targetX - enemy.x, targetY - enemy.y);
    
    if (distToCorpse > 40) {
        // Move closer to corpse
        return {
            goalDx: targetX - enemy.x,
            goalDy: targetY - enemy.y,
            currentSpeed: enemy.speed * 0.5
        };
    } else {
        // Close enough, cry over the body
        if (now - enemy.lastTearTime > 300) { // Tear every 300ms
            enemy.emitTears();
            enemy.lastTearTime = now;
        }
        return { goalDx: 0, goalDy: 0, currentSpeed: 0 };
    }
}

export function findSocialTarget(enemy) {
    // Enhanced social behavior - look for NPCs on same or nearby sidewalks
    let closestSocial = null;
    let closestDist = Infinity;
    
    for (const other of enemies) {
        if (other === enemy || other.isCop || other.isHostileActor) continue;
        
        const dist = Math.hypot(enemy.x - other.x, enemy.y - other.y);
        if (dist < 300 && dist > 80 && dist < closestDist) {
            if (other.state === 'IDLE' || other.state === 'PATROLLING') {
                // Prefer targets on sidewalks
                if (isOnSidewalk(other.x, other.y, world.city)) {
                    closestSocial = other;
                    closestDist = dist;
                }
            }
        }
    }
    
    if (closestSocial && Math.random() < enemy.socialness) {
        // Create path to social target
        enemy.path = getSidewalkPath(world.city, enemy.x, enemy.y, closestSocial.x, closestSocial.y);
        enemy.pathIndex = 0;
    }
}