import Swat from './swat.js';
import { LMG } from './lmg.js';
import { Rifle } from './rifle.js';
import { Shotgun } from './shotgun.js';
import { Pistol } from './pistol.js';

/* @tweakable Base health for military units. */
const MILITARY_BASE_HEALTH = 200;

/* @tweakable Movement speed for military units. */
const MILITARY_SPEED = 2.9;

/* @tweakable [0-1] Knockback resistance for military units. */
const MILITARY_KNOCKBACK_RESISTANCE = 0.8;

/* @tweakable [0-1] Chance for a military unit to spawn with an LMG. */
const LMG_CHANCE = 0.5;

/* @tweakable [0-1] Chance for a military unit to spawn with a Rifle. */
const RIFLE_CHANCE = 0.35;

/* @tweakable The number of camo splotches on military helmets. */
const MILITARY_CAMO_COUNT = 5;
/* @tweakable The color of the camo splotches on military helmets. */
const MILITARY_CAMO_COLOR = 'rgba(0, 0, 0, 0.15)';
/* @tweakable The range of widths for camo splotches. */
const MILITARY_CAMO_WIDTH_RANGE = { min: 4, max: 12 };
/* @tweakable The range of heights for camo splotches. */
const MILITARY_CAMO_HEIGHT_RANGE = { min: 3, max: 8 };

/* @tweakable The duration in milliseconds military units will spend regrouping after their commander dies. */
export const MILITARY_REGROUP_DURATION = 3000;

// Module-level variable to track the single commander instance
let commanderInstance = null;

export function getCommanderInstance() {
    return commanderInstance;
}

export function clearCommanderInstance() {
    commanderInstance = null;
}

export default class Military extends Swat {
    constructor(x, y) {
        super(x, y);

        this.color = '#556B2F'; // Olive Drab color
        this.health = MILITARY_BASE_HEALTH;
        this.maxHealth = MILITARY_BASE_HEALTH;
        
        // Military are the toughest units
        this.bravery = 1.0;
        this.aggressiveness = 0.9;
        this.speed = MILITARY_SPEED;
        this.knockbackResistance = MILITARY_KNOCKBACK_RESISTANCE;

        /* @tweakable [0-1] How strongly military units lead their shots. 0=none, 1=perfect. */
        this.predictionStrength = 0.85;
        /* @tweakable [0-1] The margin of error for military aiming. 0=perfect, 1=high error. */
        this.predictionError = 0.1;
        
        // Equip with LMG, Rifle, or Shotgun
        const weaponRoll = Math.random();
        if (weaponRoll < LMG_CHANCE) {
            this.weapon = new LMG(this);
            this.weapon.reloadTime = 3800; // Military reload faster
            this.weapon.magSize = 250;
            this.weapon.ammo = this.weapon.magSize;
        } else if (weaponRoll < LMG_CHANCE + RIFLE_CHANCE) {
            this.weapon = new Rifle(this);
            this.weapon.reloadTime = 550;
            this.weapon.magSize = 25;
            this.weapon.ammo = this.weapon.magSize;
        } else {
            this.weapon = new Shotgun(this);
            this.weapon.reloadTime = 1200;
            this.weapon.magSize = 10;
            this.weapon.ammo = this.weapon.magSize;
        }
        
        this.weapon.reserveAmmo = 999;

        this.isMilitary = true;
        this.isSwat = false; // They are above SWAT
        this.isCommander = false;
        this.commander = null;

        this.camoPattern = [];
        const camoWidthRange = MILITARY_CAMO_WIDTH_RANGE.max - MILITARY_CAMO_WIDTH_RANGE.min;
        const camoHeightRange = MILITARY_CAMO_HEIGHT_RANGE.max - MILITARY_CAMO_HEIGHT_RANGE.min;
        for (let i = 0; i < MILITARY_CAMO_COUNT; i++) {
            this.camoPattern.push({
                x: (Math.random() - 0.5) * this.radius * 1.5,
                y: (Math.random() - 0.5) * this.radius * 1.5,
                w: MILITARY_CAMO_WIDTH_RANGE.min + Math.random() * camoWidthRange,
                h: MILITARY_CAMO_HEIGHT_RANGE.min + Math.random() * camoHeightRange,
                rotation: Math.random() * Math.PI * 2
            });
        }
    }

    onCommanderKilled() {
        if (this.commander) {
            this.commander = null;
            this.state = 'REGROUPING';
            this.stateChangeCooldown = Date.now() + MILITARY_REGROUP_DURATION;
        }
    }

    drawOverBody(ctx, player) {
        // Vest
        ctx.fillStyle = '#4A5D23'; // Darker olive
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 0.9, this.radius * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Helmet
        ctx.fillStyle = '#556B2F';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Helmet Camo Pattern
        ctx.fillStyle = MILITARY_CAMO_COLOR;
        for(const pattern of this.camoPattern) {
            ctx.save();
            ctx.translate(pattern.x, pattern.y);
            ctx.rotate(pattern.rotation);
            ctx.fillRect(-pattern.w / 2, -pattern.h / 2, pattern.w, pattern.h);
            ctx.restore();
        }
    }
}

export class MilitaryCommander extends Military {
    constructor(x, y) {
        super(x, y);

        this.isCommander = true;
        this.weapon = new Pistol(this);
        this.weapon.damage = 25;
        this.weapon.fireRate = 250;
        this.weapon.magSize = 15;
        this.weapon.ammo = 15;
        this.weapon.reserveAmmo = 999;
        
        commanderInstance = this;
    }

    drawOverBody(ctx, player) {
        super.drawOverBody(ctx, player);
        
        // Red "hat" marking for commander
        ctx.fillStyle = '#D32F2F';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
}