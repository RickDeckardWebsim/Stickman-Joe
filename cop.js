import Enemy from './enemy.js';
import { Pistol } from './pistol.js';
import { Rifle } from './rifle.js';
import { Shotgun } from './shotgun.js';
import { world, enemies } from './world.js';
import { getSidewalkPatrolPoint, hasLineOfSight, getPatrolRoute, getSidewalkPath } from './city.js';

export default class Cop extends Enemy {
    constructor(x, y) {
        super(x, y);

        this.color = '#4a6b9c'; // Cop blue uniform color
        this.health = 120;
        this.maxHealth = 120;
        
        // Enhanced cop properties
        this.bravery = 0.8 + Math.random() * 0.2;
        this.aggressiveness = 0.7 + Math.random() * 0.3;
        this.panicThreshold = 0.05; // Very unlikely to panic
        this.shockResistance = 0.9; // Highly resistant to shock/stuns

        this.speed = 2.5; // Slightly faster than civilians
        this.patrolSpeed = this.speed * 0.8;
        this.policeTarget = null; // To track non-player hostile targets

        /* @tweakable [0-1] How strongly police lead their shots. 0=none, 1=perfect. */
        this.predictionStrength = 0.4;
        /* @tweakable [0-1] The margin of error for police aiming. 0=perfect, 1=high error. */
        this.predictionError = 0.4;

        // Enhanced police behavior
        this.suspicionLevel = 0; // How suspicious they are of the player
        this.lastRadioTime = 0;
        this.coordination = 0.8 + Math.random() * 0.2; // How well they work with others
        this.investigationSkill = 0.6 + Math.random() * 0.4;
        this.patrolRoute = [];
        this.routeIndex = 0;
        this.patrolDirection = 1; // 1 for forward, -1 for backward
        this.lastPatrolReset = 0;

        // Equip with varied weapons (60% pistol, 30% rifle, 10% shotgun)
        const weaponRoll = Math.random();
        if (weaponRoll < 0.6) {
            this.weapon = new Pistol(this);
            this.weapon.reloadTime = 700; // Cops reload faster
        } else if (weaponRoll < 0.9) {
            this.weapon = new Rifle(this);
            this.weapon.reloadTime = 800; // Faster than civilian rifles
            this.weapon.magSize = 18;
            this.weapon.ammo = this.weapon.magSize;
        } else {
            this.weapon = new Shotgun(this);
            this.weapon.reloadTime = 1300; // Faster shotgun reload
            this.weapon.magSize = 8;
            this.weapon.ammo = this.weapon.magSize;
        }
        
        this.weapon.reserveAmmo = 999; // Effectively infinite ammo for now

        this.isCop = true; // A flag to identify them easily in spawning logic

        // Cops are more resistant to knockback due to training/equipment
        this.knockbackResistance = 0.4 + Math.random() * 0.2; // 40-60% resistance
        
        // Stronger punch due to training
        this.punchDamage = 18;
        this.punchKnockback = 8;
    }

    runCivilianAI(player, now) {
        // Cops use pathfinding for their systematic patrols
        this.state = 'PATROLLING';
        let goalDx = 0;
        let goalDy = 0;
        let currentSpeed = 0;

        // Create patrol route if none exists or needs refresh
        if (this.patrolRoute.length === 0 || now - this.lastPatrolReset > 60000) { // Reset route every minute
            this.patrolRoute = getPatrolRoute(world.city, true); // true for law enforcement
            this.routeIndex = 0;
            this.lastPatrolReset = now;
        }

        if (!this.patrolTarget && this.patrolRoute.length > 0) {
            this.patrolTarget = this.patrolRoute[this.routeIndex];
            // Set a path to the new patrol target
            this.path = getSidewalkPath(world.city, this.x, this.y, this.patrolTarget.x, this.patrolTarget.y);
            this.pathIndex = 0;
        }

        // If we have a path, the main enemy update loop will follow it.
        // We just need to manage switching to the next patrol point when the path is complete.
        if (this.patrolTarget && (!this.path || this.path.length === 0)) {
            // Reached destination (or path was cleared), move to next point in route
            this.routeIndex += this.patrolDirection;
            
            // Reverse direction if at end of route
            if (this.routeIndex >= this.patrolRoute.length) {
                this.routeIndex = this.patrolRoute.length - 2;
                this.patrolDirection = -1;
            } else if (this.routeIndex < 0) {
                this.routeIndex = 1;
                this.patrolDirection = 1;
            }
            
            this.patrolTarget = this.patrolRoute[this.routeIndex];
            
            // Brief pause at waypoints
            if (Math.random() < 0.3) {
                this.state = 'IDLE';
                this.idleEndTime = now + (1000 + Math.random() * 2000);
                return { goalDx: 0, goalDy: 0, currentSpeed: 0 };
            } else {
                // Generate path to the new target
                this.path = getSidewalkPath(world.city, this.x, this.y, this.patrolTarget.x, this.patrolTarget.y);
                this.pathIndex = 0;
            }
        }

        currentSpeed = this.patrolSpeed;
        return { goalDx, goalDy, currentSpeed };
    }

    _decideState(player, distToPlayer, now) {
        if (now < this.stateChangeCooldown) return;

        if (this.canSeePlayer) {
            this.lastKnownPlayerPos = { x: player.x, y: player.y };
        }

        // --- New: Prioritize Hostile Actors ---
        let target = null;
        let distToTarget = Infinity;
        
        // Find highest priority threat
        const threats = [];
        if (world.city) {
            for (const enemy of enemies) {
                if (!enemy || enemy.health <= 0) continue;
                // A target is a zombie if we know about them, or a non-cop hostile actor
                const isTargetable = (this.knowsZombiesAreHostile && enemy.isZombie) || (enemy.isHostileActor && !enemy.isCop && !enemy.isZombie);

                if (isTargetable) {
                    const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                    if (dist < 1000) { // 1000 is engagement range for other hostiles
                        if (hasLineOfSight(this.x, this.y, enemy.x, enemy.y, world.city.buildings)) {
                            // Assign priority: Zombies > Hostile Civilians
                            threats.push({ enemy, dist, priority: enemy.isZombie ? 2 : 1 });
                        }
                    }
                }
            }
        }
        // Player is a threat if wanted level > 0
        if (world.wantedLevel > 0 && hasLineOfSight(this.x, this.y, player.x, player.y, world.city.buildings)) {
            threats.push({ enemy: player, dist: distToPlayer, priority: 0 });
        }

        // Select the target with the highest priority, then closest distance
        if (threats.length > 0) {
            threats.sort((a, b) => {
                if (b.priority !== a.priority) {
                    return b.priority - a.priority; // Higher priority first
                }
                return a.dist - b.dist; // Then closer distance
            });
            target = threats[0].enemy;
            distToTarget = threats[0].dist;
        }


        // If we have a target, engage them.
        if (target) {
            this.policeTarget = (target !== player) ? target : null;
            
            const engageDistance = 800;
            const idealStrafeDistance = 400;

            if (distToTarget > engageDistance && (this.lastKnownPlayerPos || this.policeTarget)) {
                this.state = 'CHASING';
            } else {
                this.state = 'STRAFING';
            }
        } else {
            // No threats, patrol.
            this.policeTarget = null;
            this.state = 'PATROLLING';
        }
        
        this.stateChangeCooldown = now + 300 + Math.random() * 400;
    }
    
    witnessRelatedDeath(deadEnemyId, corpse) {
        const strength = this.getRelationshipStrength(deadEnemyId);
        if (strength > 0.3) {
            // Enraged response to losing a squadmate — scaled by bond strength
            this.aggressiveness = Math.min(1.0, this.aggressiveness + strength * 0.3);
            this.bravery = Math.min(1.0, this.bravery + strength * 0.2);
            this.reactionFlash = { type: 'anger', time: Date.now() }; // Use anger flash
            this.shockTime = Date.now() + 200; // Very brief shock, like a pause before action
            this.state = 'CHASING'; // Charge the player!
            this.stateChangeCooldown = Date.now() + 5000; // Stay enraged for 5 seconds
        }
    }

    update(player) {
        const now = Date.now();
        
        // Enhanced police coordination
        if (this.coordination > 0.8 && now - this.lastRadioTime > 5000) {
            this.coordinateWithNearbyOfficers();
            this.lastRadioTime = now;
        }

        // Dynamic suspicion system
        if (world.wantedLevel > 0) {
            this.suspicionLevel = Math.min(1, this.suspicionLevel + 0.1);
        } else if (this.suspicionLevel > 0) {
            this.suspicionLevel = Math.max(0, this.suspicionLevel - 0.05);
        }

        super.update(player);
    }

    coordinateWithNearbyOfficers() {
        const nearbyOfficers = enemies.filter(e => 
            e.isCop && e !== this && 
            Math.hypot(e.x - this.x, e.y - this.y) < 300
        );

        for (const officer of nearbyOfficers) {
            // Share target information
            if (this.policeTarget && !officer.policeTarget) {
                officer.policeTarget = this.policeTarget;
            }
            
            // Coordinate flanking maneuvers
            if (this.lastKnownPlayerPos && officer.state === 'PATROLLING') {
                officer.lastKnownPlayerPos = this.lastKnownPlayerPos;
                officer.state = 'CHASING';
            }
        }
    }

    drawOverBody(ctx, player) {
        // Enhanced cop appearance with badge detail
        const hatColor = '#2a3b5c';
        const hatHighlight = '#3e5687';
        const badgeColor = '#f0d800';

        // Police vest
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 0.95, this.radius * 1.05, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hat brim
        ctx.fillStyle = hatColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.1, this.radius * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hat top
        ctx.fillStyle = hatHighlight;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        
        // Enhanced badge with shine effect
        ctx.fillStyle = badgeColor;
        ctx.fillRect(-3, -this.radius * 0.8 - 3, 6, 6);
        
        // Badge shine
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, -this.radius * 0.8 - 2, 2, 2);
    }
}