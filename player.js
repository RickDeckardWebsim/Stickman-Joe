import { Knife, Grenade, Weapon } from './weapon.js';
import { Pistol } from './pistol.js';
import { Shotgun } from './shotgun.js';
import { Rifle } from './rifle.js';
import { world, particles, corpses, enemies } from './world.js';
import { MoneyWallet, EmptyCan } from './currency.js';
import { BloodParticle, PointBloodEmitter, createBloodSplatter } from './gore.js';
import Ragdoll from './ragdoll.js';
import { Medkit } from './medkit.js';
import { playSound } from './audio.js';
import { InjectionCannon } from './injection-cannon.js';
import { LMG } from './lmg.js';
import { settings } from './options.js';

const SKIN_TONES = ['#f9e4d4', '#f2d5b6', '#e6be98', '#d6a57c', '#c28b68', '#a97355', '#8c5a42', '#6b4431', '#523425', '#3c251a'];

function getRandomSkinTone() {
    return SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
}

export default class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 20;
        this.speed = 4;
        this.color = getRandomSkinTone();
        this.angle = 0;
        
        // Health System
        this.health = 120 * settings.playerHealthMultiplier;
        this.maxHealth = 120 * settings.playerHealthMultiplier;
        this.armor = 0;
        this.maxArmor = 100;
        this.isDead = false;
        this.hitFlashTime = 0;
        this.lastImpactAngle = 0;

        // Velocity for prediction
        this.vx = 0;
        this.vy = 0;

        // Limb status for UI display and gameplay effects
        this.limbs = {
            head: { status: 'ok', severed: false },
            torso: { status: 'ok', severed: false }, // Torso can't be severed
            leftArm: { status: 'ok', severed: false },
            rightArm: { status: 'ok', severed: false },
            leftLeg: { status: 'ok', severed: false },
            rightLeg: { status: 'ok', severed: false },
        };

        // Bleeding status
        this.isBleeding = false;
        this.bleedDps = 10;
        this.lastBloodDripTime = 0;
        this.lastUpdateTime = Date.now();

        // Inventory and hotbar setup
        this.inventory = new Array(24).fill(null); // Increased from 15 to 24
        this.hotbarSize = 5;
        this.currentWeaponSlot = 0; // index in inventory array

        // Add starting weapons
        this.inventory[0] = new Rifle(this);
        this.inventory[1] = new Pistol(this);
        this.inventory[2] = new Shotgun(this);
        this.inventory[3] = new Knife(this);
        this.inventory[4] = new InjectionCannon(this);
        this.inventory[5] = new Medkit(this);
        this.inventory[6] = new LMG(this); // Add LMG
        this.inventory[23] = new MoneyWallet(); // Moved to slot 23 (was 14)
        this.inventory[23].amount = 500; // Give player starting money

        this.weapon = this.inventory[this.currentWeaponSlot];

        // Leg animation properties
        this.walkCycle = 0;
        this.movementAngle = 0;
        this.isMoving = false;

        // Punching properties
        this.punchRange = 60;
        this.punchDamage = 15;
        this.punchKnockback = 8;
        this.punchCooldown = 500; // ms
        this.lastPunchTime = 0;
        
        // Knockback resistance
        this.knockbackResistance = 0.5; // Player is more resistant to knockback
    }

    _getHitLimb() {
        const rand = Math.random() * 100;
        if (rand < 10) return 'head';    // 10%
        if (rand < 50) return 'torso';   // 40%
        if (rand < 62.5) return 'leftArm';// 12.5%
        if (rand < 75) return 'rightArm';// 12.5%
        if (rand < 87.5) return 'leftLeg';// 12.5%
        return 'rightLeg';               // 12.5%
    }

    takeDamage(amount, impactAngle, options = {}) {
        if (this.isDead) return;

        // Apply knockback if specified
        if (options.knockback && options.knockback > 0) {
            this.applyKnockback(options.knockback, impactAngle, options.owner);
        }

        // Apply enemy damage multiplier
        amount *= settings.enemyDamageMultiplier;

        // Armor absorbs damage first
        if (this.armor > 0) {
            const armorDamage = Math.min(this.armor, amount);
            this.armor -= armorDamage;
            amount -= armorDamage;
            
                        if (this.armor <= 0) {
                // Armor is destroyed, could add visual/audio feedback here
                this.armor = 0;
            }
        }

        // If there's remaining damage after armor, apply to health
        if (amount > 0) {
            const limbName = this._getHitLimb();
            const limb = this.limbs[limbName];
            
            // If a severed limb is "hit" again, transfer damage to torso as a fallback.
            if (limb.severed) {
                this.limbs.torso.status = 'damaged';
            }

            let damageMultiplier = 1.0;
            if (limbName === 'head') damageMultiplier = 3.0;
            if (limbName.includes('Arm') || limbName.includes('Leg')) damageMultiplier = 0.75;
            
            const finalDamage = amount * damageMultiplier;

            this.health -= finalDamage;
            this.hitFlashTime = Date.now();
            this.lastImpactAngle = impactAngle;
            
            // Check for zombification
            if (options.owner && options.owner.isZombie && options.weaponName === 'Bite') {
                this.isDead = true;
                this.deathTime = Date.now();
                this.deathType = 'zombified';
                this.health = 0;
                return;
            }

            // Update limb status, potentially crippling and severing it
            if (limb.status !== 'crippled' && !limb.severed && limbName !== 'torso') {
                if (limb.status === 'ok') {
                    limb.status = 'damaged';
                } else if (limb.status === 'damaged') {
                    limb.status = 'crippled';
                    
                    // --- New Limb Severing Logic ---
                    limb.severed = true;
                    let isFatal = false;

                    if (limbName === 'head') {
                        isFatal = true;
                        // The main death logic will handle creating a headless ragdoll
                    }

                    if (limbName.includes('Leg')) {
                        isFatal = true;
                    }

                    if (limbName.includes('Arm') || limbName.includes('Leg')) {
                        // All severed limbs cause bleeding
                        this.isBleeding = true; 
                        this.lastBloodDripTime = Date.now();
                        
                        const limbLaunchSpeed = 8 + Math.random() * 6;
                        const limbLaunchAngle = impactAngle + Math.PI; // Opposite to impact
                        const limbLaunchVector = { 
                            x: Math.cos(limbLaunchAngle + (Math.random() - 0.5) * 0.3) * limbLaunchSpeed, 
                            y: Math.sin(limbLaunchAngle + (Math.random() - 0.5) * 0.3) * limbLaunchSpeed 
                        };

                        const severedLimbRagdoll = new Ragdoll(this.x, this.y, limbLaunchVector, this.color, {
                            isSeveredLimb: true,
                            severedLimbType: limbName,
                            isHeadExploded: true, // Simplified ragdoll, no head
                        });
                        corpses.push(severedLimbRagdoll);

                        // Add blood emitter to the stump point of the new limb ragdoll
                        if (severedLimbRagdoll.neckPoint) {
                            particles.push(new PointBloodEmitter(severedLimbRagdoll.neckPoint, 1500));
                        }
                        
                        // Spawn blood from player's body stump
                        createBloodSplatter(this.x, this.y, 80, impactAngle + Math.PI);
                    }

                    if (isFatal) {
                        this.health = 0;
                    }
                }
            } else if (limbName === 'torso' && this.health < this.maxHealth * 0.4) {
                // Torso gets damaged when player health is low
                limb.status = 'damaged';
            }
            
            if (this.health <= 0) {
                this.health = 0;
                // The main loop will handle the death sequence
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
        this.constrainToWorld();
        if (world.city) {
            this.constrainToCity(world.city);
        }

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
        
        if (hitWall && force > 5) {
            // Calculate wall slam damage based on force
            wallDamage = Math.floor(force * 3); // 3 damage per force unit
            
            // Apply damage to all body parts
            Object.keys(this.limbs).forEach(limbName => {
                if (!this.limbs[limbName].severed) {
                    if (this.limbs[limbName].status === 'ok') {
                        this.limbs[limbName].status = 'damaged';
                    } else if (this.limbs[limbName].status === 'damaged') {
                        this.limbs[limbName].status = 'crippled';
                    }
                }
            });
            
            this.takeDamage(wallDamage, 0);
            
            // Complete obliteration for very high forces
            if (force > 20) {
                this.obliterate();
            }
        }
    }

    obliterate() {
        // Mark all limbs as severed and crippled
        Object.keys(this.limbs).forEach(limbName => {
            this.limbs[limbName].severed = true;
            this.limbs[limbName].status = 'crippled';
        });
        
        this.health = 0; // Instant death
        
        // Create multiple body part ragdolls
        const numParts = 4 + Math.floor(Math.random() * 3); // 4-6 parts
        for (let i = 0; i < numParts; i++) {
            const angle = (Math.PI * 2 * i) / numParts + Math.random() * 0.5;
            const speed = 5 + Math.random() * 10;
            const launchVector = {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            };
            
            const part = new Ragdoll(
                this.x + (Math.random() - 0.5) * 20,
                this.y + (Math.random() - 0.5) * 20,
                launchVector,
                this.color,
                { isSeveredLimb: true, severedLimbType: 'fragment', isHeadExploded: true }
            );
            corpses.push(part);
        }
    }

    useMedkit(limbName, medkitItem) {
        if (!this.limbs[limbName]) return { success: false, message: "Invalid limb." };
        
        const limb = this.limbs[limbName];

        if (limb.status === 'ok') {
            return { success: false, message: "This limb is not damaged." };
        }
        if (limb.severed) {
             return { success: false, message: "Cannot heal a severed limb." };
        }

        // Heal the limb status
        if (limb.status === 'crippled') {
            limb.status = 'damaged';
        } else if (limb.status === 'damaged') {
            limb.status = 'ok';
        }

        // Restore player health
        this.health = Math.min(this.maxHealth, this.health + medkitItem.healAmount);

        // A medkit application stops bleeding
        this.isBleeding = false;

        return { success: true };
    }

    getBodyColor() {
        if (Date.now() - this.hitFlashTime < 100) {
            return '#ffffff';
        }
        return this.color;
    }

    update(input, isMouseOverUI, mouseWorldPos, world) {
        const now = Date.now();
        const dt = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        if (this.isBleeding && !this.isDead) {
            const bleedAmount = (this.bleedDps / 1000) * dt;
            this.health -= bleedAmount;

            if (this.health <= 0) {
                this.health = 0;
            }

            if (now - this.lastBloodDripTime > 200) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 0.5;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                const size = Math.random() * 2 + 1;
                particles.push(new BloodParticle(this.x, this.y, vx, vy, size));
                this.lastBloodDripTime = now;
            }
        }

        if (this.isDead) {
            this.isMoving = false;
            this.vx = 0;
            this.vy = 0;
            return; // Stop processing input if dead
        }

        let dx = 0;
        let dy = 0;

        const isSprinting = input.keys.has('shift');
        const currentSpeed = isSprinting ? this.speed * 2 : this.speed;

        if (input.keys.has('w')) dy -= 1;
        if (input.keys.has('s')) dy += 1;
        if (input.keys.has('a')) dx -= 1;
        if (input.keys.has('d')) dx += 1;
        
        // Normalize diagonal movement
        const magnitude = Math.hypot(dx, dy);
        if (magnitude > 0) {
            this.isMoving = true;
            this.movementAngle = Math.atan2(dy, dx);
            const speedRatio = currentSpeed / this.speed;
            this.walkCycle += 0.25 * speedRatio;

            dx = (dx / magnitude) * currentSpeed;
            dy = (dy / magnitude) * currentSpeed;
        } else {
            this.isMoving = false;
        }

        this.vx = dx;
        this.vy = dy;

        this.x += dx;
        this.y += dy;

        this.constrainToWorld();
        if (world.city) {
            this.constrainToCity(world.city);
        }

        // Handle punching when no weapon equipped
        if (!this.weapon && input.mouse.down && !isMouseOverUI && !this.isDead) {
            this.punch();
        }

        // Weapon switching with keys 1, 2, 3
        if (input.justPressed.has('1')) this.switchWeapon(0);
        if (input.justPressed.has('2')) this.switchWeapon(1);
        if (input.justPressed.has('3')) this.switchWeapon(2);
        if (input.justPressed.has('4')) this.switchWeapon(3);
        if (input.justPressed.has('5')) this.switchWeapon(4);

        this.angle = Math.atan2(mouseWorldPos.y - this.y, mouseWorldPos.x - this.x);
        
        if (this.weapon) {
            this.weapon.update(input, isMouseOverUI, mouseWorldPos);
        }
    }

    punch() {
        const now = Date.now();
        if (now - this.lastPunchTime < this.punchCooldown) return;
        
        this.lastPunchTime = now;
        
        // Play punch sound
        playSound('knife_swing', { volume: 0.3, pitch: 1.3 });
        
        // Check for targets in punch range
        for (const enemy of enemies) {
            if (enemy.health <= 0) continue;
            
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist < this.punchRange + enemy.radius) {
                const angleToEnemy = Math.atan2(dy, dx);
                let angleDiff = angleToEnemy - this.angle;
                
                // Handle wraparound
                if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                
                // Check if enemy is in front of player (60 degree arc)
                if (Math.abs(angleDiff) < Math.PI / 6) {
                    enemy.takeDamage(this.punchDamage, angleToEnemy, {
                        weaponName: 'Punch',
                        owner: this,
                        knockback: this.punchKnockback
                    });
                    break; // Only hit one target
                }
            }
        }
    }

    constrainToWorld() {
        // --- World Boundary Constraints ---
        const minX = world.wallThickness + this.radius;
        const maxX = world.width - world.wallThickness - this.radius;
        const minY = world.wallThickness + this.radius;
        const maxY = world.height - world.wallThickness - this.radius;

        this.x = Math.max(minX, Math.min(this.x, maxX));
        this.y = Math.max(minY, Math.min(this.y, maxY));
    }

    constrainToCity(city) {
        for (const building of city.buildings) {
            const closestX = Math.max(building.x, Math.min(this.x, building.x + building.width));
            const closestY = Math.max(building.y, Math.min(this.y, building.y + building.height));

            const dist = Math.hypot(this.x - closestX, this.y - closestY);

            if (dist < this.radius) {
                // Collision occurred
                const overlap = this.radius - dist;
                const angle = Math.atan2(this.y - closestY, this.x - closestX);
                // Avoid division by zero if player is perfectly inside
                if (dist > 0) {
                    this.x += Math.cos(angle) * overlap;
                    this.y += Math.sin(angle) * overlap;
                } else { // Player is at the center of the closest point, push out
                    this.x += overlap;
                }
            }
        }
    }

    switchWeapon(slotIndex) {
        if (slotIndex < this.hotbarSize) {
            this.currentWeaponSlot = slotIndex; // Always update the selected slot
            const item = this.inventory[slotIndex];

            // Correctly check if the item is a weapon using instanceof
            if (item instanceof Weapon) {
                item.owner = this; // Ensure owner is set when switching weapons
                this.weapon = item;
            } else {
                this.weapon = null;
            }
        }
    }

    addItemToInventory(itemToAdd) {
        // Special stacking logic for grenades
        if (itemToAdd instanceof Grenade) {
            const existingStack = this.inventory.find(item => item instanceof Grenade);
            if (existingStack) {
                existingStack.ammo++;
                // TODO: Play pickup sound
                return true;
            }
        }
        
        // Special stacking logic for empty cans
        if (itemToAdd instanceof EmptyCan) {
            const existingStack = this.inventory.find(item => item instanceof EmptyCan);
            if (existingStack) {
                existingStack.amount += itemToAdd.amount;
                // TODO: Play pickup sound
                return true;
            }
        }
        
        // Special stacking logic for money wallet
        if (itemToAdd instanceof MoneyWallet) {
            const existingWallet = this.inventory.find(item => item instanceof MoneyWallet);
            if (existingWallet) {
                existingWallet.amount += itemToAdd.amount;
                // TODO: Play pickup sound
                return true;
            }
        }
        
        // For all other items (weapons, medkits, etc.), find an empty slot.
        const emptySlotIndex = this.inventory.findIndex(item => item === null);
        if (emptySlotIndex !== -1) {
            this.inventory[emptySlotIndex] = itemToAdd;
            // TODO: Play pickup sound
            return true;
        }
        // TODO: Show "Inventory Full" message
        return false;
    }

    drawLegs(ctx) {
        const strideLength = 15;
        const legWidth = 8;
        const legHeight = 22;
        const legSeparation = 10;

        const legOffset = Math.sin(this.walkCycle) * strideLength;

        ctx.save();
        ctx.rotate(this.movementAngle); // Rotate legs in direction of movement

        // A dark color for pants
        ctx.fillStyle = '#4a2a1a';

        // Leg 1 (Left)
        if (!this.limbs.leftLeg.severed) {
            ctx.save();
            ctx.translate(legOffset, -legSeparation / 2); // Move leg forward/back and to the side
            ctx.beginPath();
            ctx.ellipse(0, 0, legHeight / 2, legWidth / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Leg 2 (Right)
        if (!this.limbs.rightLeg.severed) {
            ctx.save();
            ctx.translate(-legOffset, legSeparation / 2); // Opposite offset
            ctx.beginPath();
            ctx.ellipse(0, 0, legHeight / 2, legWidth / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        ctx.restore();
    }

    drawArms(ctx) {
        if (!this.weapon || this.weapon.name === 'Knife') return;

        const handRadius = 5;
        ctx.fillStyle = this.getBodyColor();

        // The weapon's drawing origin, including recoil.
        // This makes sure hands stick to the recoiling weapon.
        const gunX = this.radius - this.weapon.recoil;
        const gunY = 0;

        // Make copies of grip points to animate them without modifying the weapon's base data
        let frontHandPos = this.weapon.gripPoints.frontHand ? { ...this.weapon.gripPoints.frontHand } : null;
        let backHandPos = this.weapon.gripPoints.backHand ? { ...this.weapon.gripPoints.backHand } : null;

        // --- Handle Reload Animations ---
        if (this.weapon.isReloading && this.weapon.reloadAnimProgress > 0 && this.weapon.name !== 'Shotgun') {
            const progress = this.weapon.reloadAnimProgress;
            const magWellPos = this.weapon.magWellPoint;

            if (frontHandPos && magWellPos) {
                const startPos = this.weapon.gripPoints.frontHand;
                // Hip position is relative to player center, in player's rotated coordinate space.
                const hipPos = { x: 0, y: this.radius + 10 }; // A bit outside the body on the side.

                let currentPos;
                if (progress < 0.5) {
                    // Phase 1: gun's grip -> hip
                    const t = progress * 2; // scale 0->0.5 to 0->1
                    const p0 = startPos;
                    const p2 = hipPos;
                    // Control point to make it arc downwards and out
                    const p1 = { x: (p0.x + p2.x) / 2, y: p2.y + 30 }; 

                    currentPos = {
                        x: (1 - t)**2 * p0.x + 2 * (1 - t) * t * p1.x + t**2 * p2.x,
                        y: (1 - t)**2 * p0.y + 2 * (1 - t) * t * p1.y + t**2 * p2.y
                    };
                } else {
                    // Phase 2: hip -> gun's magwell
                    const t = (progress - 0.5) * 2; // scale 0.5->1 to 0->1
                    const p0 = hipPos;
                    const p2 = magWellPos;
                    // Control point to make it arc up and in
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
            // Back-and-forth motion. A simpler way to write a triangle wave for progress going 1 -> 0
            const pumpDist = 20;
            const animPath = 1 - Math.abs(1 - (1 - progress) * 2);

            if(frontHandPos) {
                frontHandPos.x -= pumpDist * animPath;
            }
        }

        // --- Draw Hands ---
        if (frontHandPos && !this.limbs.rightArm.severed) { // Check right arm
            ctx.beginPath();
            ctx.arc(gunX + frontHandPos.x, gunY + frontHandPos.y, handRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        if (backHandPos && !this.limbs.leftArm.severed) { // Check left arm
            ctx.beginPath();
            ctx.arc(gunX + backHandPos.x, gunY + backHandPos.y, handRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    draw(ctx) {
        if (this.isDead) return; // The ragdoll will be drawn instead

        ctx.save();
        ctx.translate(this.x, this.y);

        // --- Draw Legs ---
        if (this.isMoving) {
            this.drawLegs(ctx);
        }

        ctx.rotate(this.angle);

        // Draw player body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.getBodyColor();
        ctx.fill();

        // Draw weapon
        if (this.weapon) {
            this.weapon.draw(ctx);
        }

        // Draw arms gripping weapon
        this.drawArms(ctx);

        ctx.restore();
    }
}