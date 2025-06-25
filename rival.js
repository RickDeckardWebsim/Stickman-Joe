import Enemy from './enemy.js';
import { Pistol } from './pistol.js';
import { Rifle } from './rifle.js';
import { Shotgun } from './shotgun.js';
import { InjectionCannon } from './injection-cannon.js';
import { generateRandomAttachment } from './weapon.js';
import { createBloodSplatter } from './gore.js';
import { world, enemies } from './world.js';
import { hasLineOfSight } from './city.js';
import { NPC_WITNESS_DISTANCE } from './enemy.js';

const RIVAL_HEALTH = 350;
const RIVAL_BLOOD_COLOR = '#87CEEB';

export default class Rival extends Enemy {
    constructor(x, y) {
        super(x, y);

        this.color = '#333333';
        this.health = RIVAL_HEALTH;
        this.maxHealth = RIVAL_HEALTH;
        this.bloodColor = RIVAL_BLOOD_COLOR;

        this.bravery = 1.0;
        this.aggressiveness = 1.0;
        this.panicThreshold = 0.0;
        this.shockResistance = 0.98;

        this.speed = 3.5;
        this.knockbackResistance = 0.7;
        this.punchDamage = 25;
        this.punchKnockback = 12;

        this.isHostileActor = true;
        this.isCop = false;

        this._equipRandomWeapon();
    }

    _equipRandomWeapon() {
        const weaponClasses = [Pistol, Rifle, Shotgun, InjectionCannon];
        const WeaponClass = weaponClasses[Math.floor(Math.random() * weaponClasses.length)];
        this.weapon = new WeaponClass(this);
        this.weapon.reserveAmmo = 999;
        this._addRandomAttachments();
    }

    _addRandomAttachments() {
        if (!this.weapon.modSlots || !generateRandomAttachment) {
            return;
        }

        this.weapon.attachments = new Array(this.weapon.modSlots.length).fill(null);

        const minSlots = Math.max(1, Math.floor(this.weapon.modSlots.length * 0.4));
        const maxSlots = Math.max(minSlots, Math.floor(this.weapon.modSlots.length * 0.8));
        const slotsToFill = Math.floor(Math.random() * (maxSlots - minSlots + 1)) + minSlots;

        const availableSlots = [...Array(this.weapon.modSlots.length).keys()];
        const slotsToModify = [];

        for (let i = 0; i < slotsToFill; i++) {
            if (availableSlots.length === 0) break;
            const randomIndex = Math.floor(Math.random() * availableSlots.length);
            slotsToModify.push(availableSlots.splice(randomIndex, 1)[0]);
        }

        for (const slotIndex of slotsToModify) {
            const slotType = this.weapon.modSlots[slotIndex];
            let attempts = 0;
            while (attempts < 30) {
                const attachment = generateRandomAttachment();
                const isCompatible = attachment.type === slotType || attachment.type === 'experimental' || slotType === 'rail';
                if (isCompatible) {
                    if (this.weapon.attachMod(attachment, slotIndex)) {
                        break;
                    }
                }
                attempts++;
            }
        }
    }

    witnessCrime() {
        // Rivals don't react to crimes other than those against them.
    }

    takeDamage(amount, impactAngle, options = {}) {
        if (this.health <= 0) return;

        if (options.knockback && options.knockback > 0) {
            this.applyKnockback(options.knockback, impactAngle, options.owner);
        }

        if (options.onHitEffect === 'zombify') {
            return;
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

        createBloodSplatter(this.x, this.y, amount, impactAngle, { color: this.bloodColor, bloodyMess: options.bloodyMess });

        if (wasAlive && this.health <= 0) {
            if (options.isHeadshot) {
                this.deathType = 'headshot';
            } else {
                this.deathType = 'normal';
            }
        }

        if (options.isHeadshot && !this.isBleeding) {
            this.isBleeding = true;
            this.lastBloodDripTime = Date.now();
        }
    }

    drawOverBody(ctx, player) {
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 0.9, this.radius * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.85, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff3333';
        ctx.fillRect(this.radius * 0.2, -this.radius * 0.2, this.radius * 0.7, this.radius * 0.4);
    }
}