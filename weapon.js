import { shells, projectiles, enemies, grenades, world, particles, throwables } from './world.js';
import { Shell, Magazine, GrenadePin } from './shell.js';
import Projectile from './projectile.js';
import { playSound } from './audio.js';
import { GrenadeEntity } from './grenade.js';
import { ThrowableEntity, generateProceduralThrowable } from './throwable.js';
import { raycast } from './city.js';

// Attachment System
export class Attachment {
    constructor(name, type, modifiers, description) {
        this.name = name;
        this.type = type; // 'grip', 'ammo', 'sight', 'stock', 'muzzle'
        this.modifiers = modifiers; // Object with properties to modify
        this.description = description;
        this.icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; // 1x1 black pixel
    }
}

const attachmentTypes = {
    grip: {
        names: ['Foregrip', 'Bipod', 'Angled Grip', 'Vertical Grip', 'Tactical Grip'],
        modifiers: [
            { recoilReduction: 0.3, fireRate: -50, reloadSpeed: 1.1, knockback: 1.2 },
            { projectileSpeed: 1.2, accuracy: 1.1, reloadSpeed: 0.9, knockback: 0.8 },
            { fireRate: -100, recoilReduction: 0.4, reloadSpeed: 1.15, knockback: 1.1 },
            { projectileCount: 1, damage: -5, reloadSpeed: 0.95, knockback: 0.9 },
            { accuracy: 1.3, recoilReduction: 0.2, reloadSpeed: 1.05, knockback: 1.0, laserSight: 'red' }
        ]
    },
    ammo: {
        names: ['Hollow Point', 'Armor Piercing', 'Incendiary', 'Explosive', 'Tracer', 'Subsonic', 'Magnum', 'Flechette', 'Rubber', 'Depleted Uranium'],
        modifiers: [
            { damage: 1.4, projectileSpeed: 0.9, bulletSize: 1.2, reloadSpeed: 0.95, knockback: 1.3 },
            { piercing: true, damage: 1.1, bulletSize: 0.8, reloadSpeed: 1.05, knockback: 0.9 },
            { damage: 1.2, projectileSize: 1.3, bleedChance: 0.3, reloadSpeed: 0.9, knockback: 1.1 },
            { damage: 1.6, projectileCount: 3, accuracy: 0.7, bulletSize: 1.5, reloadSpeed: 0.8, knockback: 2.0 },
            { projectileSpeed: 1.3, accuracy: 1.2, pathType: 'straight', reloadSpeed: 1.0, knockback: 1.0 },
            { projectileSpeed: 0.7, accuracy: 1.3, bulletSize: 0.9, reloadSpeed: 1.1, knockback: 0.7 },
            { damage: 1.8, projectileSpeed: 1.2, bulletSize: 1.4, recoilReduction: -0.3, reloadSpeed: 0.85, knockback: 1.8 },
            { projectileCount: 5, damage: 0.6, bulletSize: 0.6, pathType: 'wave', reloadSpeed: 0.9, knockback: 0.8 },
            { damage: 0.3, bouncing: true, bulletSize: 1.1, maxSpeed: 15, reloadSpeed: 1.15, knockback: 0.4 },
            { damage: 2.2, piercing: true, bulletSize: 0.7, civilianDamage: 3.0, reloadSpeed: 0.7, knockback: 2.5 }
        ]
    },
    sight: {
        names: ['Red Dot', 'ACOG Scope', 'Holographic', 'Iron Sights+', 'Thermal Scope'],
        modifiers: [
            { accuracy: 1.4, headshotChance: 0.05, reloadSpeed: 1.0, knockback: 1.0 },
            { accuracy: 1.6, projectileSpeed: 1.1, fireRate: -80, reloadSpeed: 0.95, knockback: 1.0 },
            { accuracy: 1.3, headshotChance: 0.08, reloadSpeed: 1.0, knockback: 1.0 },
            { accuracy: 1.2, fireRate: 50, reloadSpeed: 1.05, knockback: 1.0 },
            { headshotChance: 0.15, tracking: true, reloadSpeed: 0.9, knockback: 1.0 }
        ]
    },
    stock: {
        names: ['Heavy Stock', 'Lightweight Stock', 'Adjustable Stock', 'No Stock', 'Precision Stock'],
        modifiers: [
            { recoilReduction: 0.5, fireRate: -100, reloadSpeed: 0.9, knockback: 1.4 },
            { fireRate: 150, recoilReduction: -0.2, reloadSpeed: 1.2, knockback: 0.8 },
            { accuracy: 1.2, recoilReduction: 0.2, reloadSpeed: 1.1, knockback: 1.1 },
            { fireRate: 200, accuracy: 0.8, recoilReduction: -0.4, reloadSpeed: 1.3, knockback: 0.7 },
            { accuracy: 1.5, headshotChance: 0.1, fireRate: -50, reloadSpeed: 1.05, knockback: 1.0 }
        ]
    },
    muzzle: {
        names: ['Suppressor', 'Compensator', 'Flash Hider', 'Muzzle Break', 'Extended Barrel'],
        modifiers: [
            { projectileSpeed: 0.9, accuracy: 1.2, fireRate: -30, reloadSpeed: 0.95, knockback: 0.9 },
            { recoilReduction: 0.4, projectileSpeed: 1.1, reloadSpeed: 1.0, knockback: 1.2 },
            { accuracy: 1.1, headshotChance: 0.03, reloadSpeed: 1.0, knockback: 1.0 },
            { recoilReduction: 0.6, projectileCount: 1, reloadSpeed: 1.0, knockback: 1.3 },
            { projectileSpeed: 1.4, accuracy: 1.3, damage: 1.1, reloadSpeed: 0.9, knockback: 1.2 }
        ]
    },
    choke: {
        names: ['Full Choke', 'Modified Choke', 'Improved Cylinder', 'Cylinder Bore', 'Extra Full'],
        modifiers: [
            { accuracy: 1.4, projectileCount: 0.8, reloadSpeed: 1.0 },
            { accuracy: 1.2, projectileCount: 0.9, reloadSpeed: 1.0 },
            { accuracy: 0.9, projectileCount: 1.1, reloadSpeed: 1.05 },
            { accuracy: 0.7, projectileCount: 1.3, reloadSpeed: 1.1 },
            { accuracy: 1.6, projectileCount: 0.7, damage: 1.1, reloadSpeed: 0.95 }
        ]
    },
    pump: {
        names: ['Speed Pump', 'Heavy Pump', 'Tactical Pump', 'Competition Pump', 'Lightweight Pump'],
        modifiers: [
            { fireRate: -200, recoilReduction: -0.1, reloadSpeed: 1.4 },
            { fireRate: 100, recoilReduction: 0.3, damage: 1.1, reloadSpeed: 0.8 },
            { fireRate: -100, accuracy: 1.1, reloadSpeed: 1.2 },
            { fireRate: -150, accuracy: 1.2, recoilReduction: 0.1, reloadSpeed: 1.3 },
            { fireRate: -250, recoilReduction: -0.2, projectileSpeed: 1.1, reloadSpeed: 1.5 }
        ]
    },
    barrel: {
        names: ['Short Barrel', 'Long Barrel', 'Rifled Barrel', 'Smoothbore', 'Ported Barrel'],
        modifiers: [
            { fireRate: -150, accuracy: 0.8, projectileSpeed: 0.9, reloadSpeed: 1.1 },
            { accuracy: 1.3, projectileSpeed: 1.2, fireRate: 50, reloadSpeed: 0.9 },
            { accuracy: 1.4, damage: 1.1, projectileSpeed: 1.1, reloadSpeed: 0.95 },
            { accuracy: 0.9, projectileCount: 1.2, projectileSpeed: 0.95, reloadSpeed: 1.05 },
            { recoilReduction: 0.4, accuracy: 1.1, projectileSpeed: 1.05, reloadSpeed: 1.0 }
        ]
    },
    rail: {
        names: ['Rail Extender', 'Dual Rail Adapter', 'Tri-Rail Mount', 'Universal Adapter', 'Muzzle Adapter'],
        modifiers: [
            { addSlots: 1, reloadSpeed: 1.0 },
            { addSlots: 2, reloadSpeed: 0.98 },
            { addSlots: 3, reloadSpeed: 0.95 },
            { addSlots: 1, reloadSpeed: 0.9, accuracy: 1.1}, // Universal adapter gives an accuracy boost but slows reload
            { addSlots: 1, recoilReduction: 0.2, fireRate: 50}, // Muzzle adapter adds a rail slot at the cost of fire rate, but reduces recoil
        ]
    },
    receiver: {
        names: ['Featherlight Receiver', 'Heavy-Duty Receiver', 'Overclocked Receiver'],
        modifiers: [
            { reloadSpeed: 1.2, recoilReduction: -0.2 },
            { recoilReduction: 0.4, reloadSpeed: 0.8, damage: 1.1 },
            { fireRate: 100, accuracy: 0.9, damage: 1.1 }
        ]
    },
    magazine: {
        names: ['Extended Mag', 'Quick Mag', 'Drum Mag'],
        modifiers: [
            { magSize: 1.5, reloadSpeed: 0.85 },
            { reloadSpeed: 1.4, magSize: 0.9 },
            { magSize: 2.5, reloadSpeed: 0.6 }
        ]
    },
    laserSight: {
        names: ['Red Laser Sight', 'Green Laser Sight'],
        modifiers: [
            { laserSight: 'red', accuracy: 1.02 },
            { laserSight: 'green', accuracy: 1.02 },
        ]
    },
    injector: {
        names: ['Potency Enhancer', 'Splash Injector', 'Rapid Absorption', 'Stabilizer'],
        modifiers: [
            { effectPotency: 1.5, reloadSpeed: 0.9 }, // e.g. makes zombies stronger
            { splashRadius: 100, effectPotency: 0.7 }, // applies effect in a small radius
            { fireRate: -200, effectDuration: 0.8 }, // faster effect, but shorter duration
            { accuracy: 1.3, projectileSpeed: 1.2 }, // more accurate shots
        ]
    },
    experimental: {
        names: ['Cop Seeker', 'Civilian Hunter', 'Big Bore', 'Rapid Fire', 'Bleeding Edge', 'Slow Mo', 'Speed Demon', 'Multi Shot', 'Splitter', 'Bouncer', 'Zigzag', 'Spiral Storm', 'Wave Rider', 'Size Matters', 'Velocity Chaos', 'Impact Driver', 'Explosive Rounds', 'Fire Starter', 'Toxic Waste', 'Time Bomb', 'Area Denial', 'Chain Reaction'],
        modifiers: [
            { seeksCops: true, tracking: true, projectileSpeed: 1.2, reloadSpeed: 1.0, knockback: 1.0 },
            { civilianDamage: 2.0, damage: 0.8, reloadSpeed: 1.0, knockback: 1.0 },
            { projectileSize: 2.5, damage: 1.8, fireRate: -200, bulletSize: 2.0, reloadSpeed: 0.6, knockback: 2.2 },
            { fireRate: 300, accuracy: 0.7, recoilReduction: -0.3, reloadSpeed: 1.8, knockback: 0.8 },
            { bleedChance: 1.0, damage: 0.9, reloadSpeed: 1.0, knockback: 1.0 },
            { projectileSpeed: 0.4, damage: 1.5, accuracy: 1.4, minSpeed: 5, maxSpeed: 15, reloadSpeed: 0.5, knockback: 1.0 },
            { projectileSpeed: 2.0, fireRate: 100, accuracy: 0.8, maxSpeed: 50, reloadSpeed: 2.0, knockback: 1.1 },
            { projectileCount: 3, damage: 0.7, accuracy: 0.8, reloadSpeed: 1.0, knockback: 1.2 },
            { splitOnHit: true, damage: 1.2, projectileCount: 0.5, reloadSpeed: 1.0, knockback: 1.1 },
            { bouncing: true, maxBounces: 5, projectileSpeed: 1.1, piercing: true, reloadSpeed: 1.0, knockback: 1.0 },
            { pathType: 'zigzag', pathAmplitude: 30, pathFrequency: 0.2, damage: 1.1, reloadSpeed: 1.0, knockback: 1.0 },
            { pathType: 'spiral', spiralRadius: 80, pathFrequency: 0.15, tracking: true, reloadSpeed: 1.0, knockback: 1.0 },
            { pathType: 'wave', pathAmplitude: 25, pathFrequency: 0.25, projectileSpeed: 1.2, reloadSpeed: 1.0, knockback: 1.0 },
            { bulletSize: 3.0, damage: 2.5, projectileSpeed: 0.8, fireRate: -300, reloadSpeed: 0.7, knockback: 2.8 },
            { minSpeed: 10, maxSpeed: 40, pathFrequency: 0.3, damage: 1.3, reloadSpeed: 1.0, knockback: 1.1 },
            { knockback: 4.0, damage: 1.5, projectileSpeed: 1.3, reloadSpeed: 0.9, accuracy: 1.1 },
            { explodeOnHit: true, explosionRadius: 120, explosionDamage: 60, damage: 1.3, reloadSpeed: 0.8, knockback: 1.5 },
            { fireAreaOnHit: true, fireAreaRadius: 100, fireAreaDuration: 6000, damage: 1.1, reloadSpeed: 0.9, knockback: 1.0 },
            { toxicOnHit: true, toxicRadius: 80, toxicDamage: 8, toxicDuration: 10000, damage: 0.9, reloadSpeed: 0.9, knockback: 1.0 },
            { timedExplosion: true, timedExplosionDelay: 1500, explosionRadius: 150, explosionDamage: 80, reloadSpeed: 0.7, knockback: 1.2 },
            { timedFireArea: true, timedFireInterval: 2000, fireAreaRadius: 60, fireAreaDuration: 4000, reloadSpeed: 0.85, knockback: 1.0 },
            { timedToxic: true, timedToxicInterval: 1800, toxicRadius: 70, toxicDuration: 8000, bouncing: true, reloadSpeed: 0.8, knockback: 1.0 }
        ]
    }
};

/* @tweakable The chance for a randomly generated attachment to be a rail adapter. */
const RAIL_ATTACHMENT_CHANCE = 0.25;

export function generateRandomAttachment(experimentalOnly = false) {
    let types;
    if (experimentalOnly) {
        types = ['experimental'];
    } else {
        // Add a higher chance for rail attachments
        if (Math.random() < RAIL_ATTACHMENT_CHANCE) {
            types = ['rail'];
        } else {
            types = Object.keys(attachmentTypes).filter(t => t !== 'experimental');
        }
    }

    const type = types[Math.floor(Math.random() * types.length)];
    const typeData = attachmentTypes[type];
    const index = Math.floor(Math.random() * typeData.names.length);
    
    const name = typeData.names[index];
    const modifiers = { ...typeData.modifiers[index] };
    
    // Add some randomization to modifiers (except for experimental)
    if (type !== 'experimental') {
        /* @tweakable A list of attachment modifiers that should not be randomized and must remain whole numbers. */
        const integerModifiers = ['addSlots'];
        /* @tweakable A list of attachment modifiers that should be rounded to the nearest whole number after randomization. */
        const roundAfterRandomization = ['fireRate'];

        Object.keys(modifiers).forEach(key => {
            if (typeof modifiers[key] === 'number' && !integerModifiers.includes(key)) {
                 // Check against a list of keys that should not be randomized, to preserve specific behaviors.
                if (!['projectileCount', 'piercing', 'tracking'].includes(key)) {
                    modifiers[key] *= (0.8 + Math.random() * 0.4); // ±20% variation
                }

                if (roundAfterRandomization.includes(key)) {
                    modifiers[key] = Math.round(modifiers[key]);
                }
            }
        });
    }
    
    // Add new global modifiers
        const bloodyMessChance = 0.1;
    if (type !== 'experimental' && Math.random() < bloodyMessChance) {
                modifiers.bloodyMess = 4;
    }
    
        const dismemberChance = 0.05;
    if (type !== 'experimental' && Math.random() < dismemberChance) {
                modifiers.dismemberChance = 0.3;
    }

    const description = _generateDescription(modifiers, type);
    
    const attachment = new Attachment(name, type, modifiers, description);
    return attachment;
}

function _generateDescription(modifiers, type) {
    /* @tweakable The number of decimal places to show for percentage-based stats in attachment descriptions. */
    const attachmentDescriptionDecimalPlaces = 1;
    const effects = [];
    
    Object.entries(modifiers).forEach(([key, value]) => {
        switch(key) {
            case 'damage':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% damage`);
                break;
            case 'effectPotency':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% effect potency`);
                break;
            case 'splashRadius':
                effects.push(`Applies effect in a ${value.toFixed(0)}px radius`);
                break;
            case 'effectDuration':
                effects.push(`${value < 1 ? '-' : '+'}${((1 - value) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% effect duration`);
                break;
            case 'fireRate':
                effects.push(`${value > 0 ? '+' : ''}${Math.round(value)}ms fire rate`);
                break;
            case 'recoilReduction':
                effects.push(`-${(value * 100).toFixed(attachmentDescriptionDecimalPlaces)}% recoil`);
                break;
            case 'accuracy':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% accuracy`);
                break;
            case 'projectileSpeed':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% bullet speed`);
                break;
            case 'projectileCount':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% bullets per shot`);
                break;
            case 'projectileSize':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% bullet size`);
                break;
            case 'headshotChance':
                effects.push(`+${(value * 100).toFixed(attachmentDescriptionDecimalPlaces)}% headshot chance`);
                break;
            case 'reloadSpeed':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% reload speed`);
                break;
            case 'piercing':
                if (value) effects.push('Piercing bullets');
                break;
            case 'tracking':
                if (value) effects.push('Tracking bullets');
                break;
            case 'trackingStrength':
                effects.push(`${value > 0.1 ? '+' : ''}${((value - 0.1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% tracking`);
                break;
            case 'seeksCops':
                if (value) effects.push('Seeks out law enforcement');
                break;
            case 'civilianDamage':
                effects.push(`${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% extra damage to civilians`);
                break;
            case 'bleedChance':
                effects.push(`${(value * 100).toFixed(attachmentDescriptionDecimalPlaces)}% chance to cause bleeding`);
                break;
            case 'addSlots':
                 effects.push(`+${value} rail slots`);
                break;
            case 'bloodyMess':
                 effects.push(`Bloody Mess!`);
                break;
            case 'dismemberChance':
                effects.push(`+${(value * 100).toFixed(attachmentDescriptionDecimalPlaces)}% dismember chance`);
                break;
            case 'splitOnHit':
                if (value) effects.push('Bullets split into fragments on impact');
                break;
            case 'bouncing':
                if (value) effects.push('Bullets bounce off surfaces');
                break;
            case 'bulletSize':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% bullet size`);
                break;
            case 'pathType':
                effects.push(`${value} bullet pattern`);
                break;
            case 'pathAmplitude':
                effects.push(`${value.toFixed(0)} pattern intensity`);
                break;
            case 'pathFrequency':
                effects.push(`${(value * 100).toFixed(attachmentDescriptionDecimalPlaces)}% pattern frequency`);
                break;
            case 'spiralRadius':
                effects.push(`${value.toFixed(0)} spiral radius`);
                break;
            case 'maxSpeed':
                effects.push(`max velocity: ${value.toFixed(0)}`);
                break;
            case 'minSpeed':
                effects.push(`min velocity: ${value.toFixed(0)}`);
                break;
            case 'knockback':
                effects.push(`${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(attachmentDescriptionDecimalPlaces)}% knockback force`);
                break;
            case 'explodeOnHit':
                if (value) effects.push('Explosive rounds');
                break;
            case 'fireAreaOnHit':
                if (value) effects.push('Incendiary rounds');
                break;
            case 'toxicOnHit':
                if (value) effects.push('Toxic rounds');
                break;
            case 'timedExplosion':
                if (value) effects.push('Timed explosive rounds');
                break;
            case 'timedFireArea':
                if (value) effects.push('Delayed incendiary effect');
                break;
            case 'timedToxic':
                if (value) effects.push('Delayed toxic release');
                break;
            case 'maxBounces':
                effects.push(`max ${value.toFixed(0)} bounces`);
                break;
            case 'explosionRadius':
                effects.push(`${value.toFixed(0)} explosion radius`);
                break;
            case 'explosionDamage':
                effects.push(`${value.toFixed(0)} explosion damage`);
                break;
            case 'fireAreaRadius':
                effects.push(`${value.toFixed(0)} fire area radius`);
                break;
            case 'toxicRadius':
                effects.push(`${value.toFixed(0)} toxic area radius`);
                break;
            case 'laserSight':
                if (value) effects.push(`Adds a ${value} laser sight`);
                break;
        }
    });
    
    return effects.join(', ') || 'Unknown effect';
}

export class Weapon {
    constructor(owner) {
        this.owner = owner;
        this.width = 0;
        this.height = 0;
        this.color = 'black';
        
        // Recoil state
        this.recoil = 0;
        this.recoilAmount = 0;
        this.recoilDamping = 0.85; 

        // Firing state
        this.fireRate = 100; // ms between shots
        this.lastShotTime = 0;
        this.lastMousePos = { x: 0, y: 0 };
        
        // Ammo & Reloading
        this.ammo = 0;
        this.magSize = 0;
        this.reserveAmmo = 0;
        this.maxReserveAmmo = 500;
        this.reloadTime = 2000; // ms
        this.isReloading = false;
        this.reloadStartTime = 0;
        this.reloadAnimProgress = 0;
        
        // Properties to be overridden by subclasses
        this.name = 'Weapon';
        this.icon = ''; // path to icon image
        this.gripPoints = { frontHand: null, backHand: null };
        this.shellSize = {};
        this.soundVolume = 1.0;
        this.soundPitchBase = 1.0;
        this.soundPitchVariance = 0.1;
        this.ejectionPortOffset = { x: 0, y: 0 };
        this.headshotChance = 0;
        this.accuracy = 1.0; // Base accuracy (1.0 = perfect, lower = more spread)
        this.magWellPoint = null;

        // Fire mode
        this.fireMode = 'auto'; // 'auto', 'semi', 'burst'
        this.availableFireModes = [];

        // Burst fire state
        this.isBursting = false;
        this.burstShotsFired = 0;
        this.burstSize = 3;
        this.burstFireRate = 50; // ms between burst shots
        this.lastBurstShotTime = 0;

        // Projectile properties
        this.projectileRadius = 4;
        this.projectileMass = 1;
        this.projectileDamage = 20;
        
        // Attachment system
        this.attachments = []; // Initialized in subclasses
        
        // Mod slot configuration - override in subclasses
        this.modSlots = [];

        // Knockback properties
        this.baseKnockback = 3; // Base knockback force
    }

    attachMod(attachment, slotIndex) {
        if (slotIndex >= this.modSlots.length || slotIndex < 0) return false;

        const slotType = this.modSlots[slotIndex];
        const isCompatible = attachment.type === slotType || 
                           attachment.type === 'experimental' ||
                           (slotType === 'rail') ||
                           (attachment.type === 'laserSight' && slotType === 'rail') || // Laser sights go on rails
                           (slotType === 'receiver' && attachment.type === 'experimental') || // Allow receiver mods on experimental slots
                           (slotType === 'receiver' && attachment.type === 'laserSight'); // Allow laser sights on receiver

        if (isCompatible && !this.attachments[slotIndex]) {
            this.attachments[slotIndex] = attachment;

            if (attachment.modifiers.addSlots) {
                const numToAdd = attachment.modifiers.addSlots;
                // Add new slots of the same type as the adapter
                const typeToAdd = attachment.modifiers.addSlotType || attachment.type;
                for (let i = 0; i < numToAdd; i++) {
                    this.modSlots.push(typeToAdd);
                    this.attachments.push(null);
                }
            }
            return true;
        }
        return false;
    }

    removeMod(slotIndex) {
        if (slotIndex >= this.attachments.length || slotIndex < 0) return null;

        const attachment = this.attachments[slotIndex];
        if (!attachment) return null;

        if (attachment.modifiers.addSlots) {
            const numAdded = attachment.modifiers.addSlots;
            const totalSlots = this.modSlots.length;

            let canRemove = true;
            for (let i = 1; i <= numAdded; i++) {
                if (this.attachments[totalSlots - i] !== null) {
                    canRemove = false;
                    break;
                }
            }

            if (canRemove) {
                // Remove the added slots from the end
                const typeToRemove = attachment.modifiers.addSlotType || attachment.type;
                let removedCount = 0;
                for (let i = this.modSlots.length - 1; i >= 0 && removedCount < numAdded; i--) {
                    if (this.modSlots[i] === typeToRemove && this.attachments[i] === null) {
                        this.modSlots.splice(i, 1);
                        this.attachments.splice(i, 1);
                        removedCount++;
                    }
                }
            } else {
                console.warn("Cannot remove extender: its added slots are occupied.");
                return null; 
            }
        }
        
        this.attachments[slotIndex] = null;
        return attachment;
    }

    getModifiedStats() {
        const baseStats = {
            damage: this.projectileDamage,
            fireRate: this.fireRate,
            recoilAmount: this.recoilAmount,
            headshotChance: this.headshotChance,
            projectileRadius: this.projectileRadius,
            projectileMass: this.projectileMass,
            projectileSpeed: 25,
            projectileCount: this.pelletCount || 1,
            accuracy: this.accuracy, // Use weapon's base accuracy instead of 1.0
            magSize: 1.0, // Multiplier for magazine size
            piercing: false,
            tracking: false,
            laserSight: false,
            trackingStrength: 0.1, // Base tracking strength
            seeksCops: false,
            civilianDamage: 1.0,
            bleedChance: 0.0,
            bloodyMess: 1.0, // New gore modifier
            dismemberChance: 0.0, // New dismemberment modifier
            splitOnHit: false,
            bouncing: false,
            burstSize: this.burstSize,
            reloadSpeed: 1.0,
            // New projectile behavior stats
            bulletSize: 1.0,
            pathType: 'straight',
            pathAmplitude: 20,
            pathFrequency: 0.1,
            spiralRadius: 50,
            maxSpeed: 25,
            minSpeed: 25,
            maxBounces: 3,
            // Hit reaction modifiers
            explodeOnHit: false,
            explosionRadius: 100,
            explosionDamage: 50,
            fireAreaOnHit: false,
            fireAreaRadius: 80,
            fireAreaDuration: 5000,
            toxicOnHit: false,
            toxicRadius: 60,
            toxicDamage: 3,
            toxicDuration: 8000,
            // Timer-based effects
            timedFireArea: false,
            timedFireInterval: 3000,
            timedExplosion: false,
            timedExplosionDelay: 2000,
            timedToxic: false,
            timedToxicInterval: 2500,
            // Knockback
            knockback: this.baseKnockback,
        };

        // Apply attachment modifiers
        this.attachments.forEach(attachment => {
            if (!attachment) return;
            
            Object.entries(attachment.modifiers).forEach(([key, value]) => {
                if (key === 'addSlots') {
                    // Handled in attach/remove, does not directly affect stats
                } else if (key === 'recoilReduction') {
                    baseStats.recoilAmount *= (1 - value);
                } else if (key === 'projectileSize') {
                    baseStats.projectileRadius *= value;
                } else if (key === 'magSize') {
                    baseStats.magSize *= value;
                } else if (key === 'laserSight') {
                    baseStats.laserSight = value;
                } else if (typeof value === 'number' && ![
                    'projectileCount', 'piercing', 'tracking', 'trackingStrength', 'seeksCops', 'splitOnHit', 'bouncing', 
                    'bloodyMess', 'dismemberChance', // Add new modifiers here
                    'bulletSize', 'pathAmplitude', 'pathFrequency', 'spiralRadius', 'maxSpeed', 'minSpeed', 
                    'reloadSpeed', 'knockback', 'maxBounces', 'explosionRadius', 'explosionDamage',
                    'fireAreaRadius', 'fireAreaDuration', 'toxicRadius', 'toxicDamage', 'toxicDuration',
                    'timedFireInterval', 'timedExplosionDelay', 'timedToxicInterval'
                ].includes(key)) {
                    if (key === 'fireRate') {
                        baseStats[key] += value; // Additive for fire rate
                    } else {
                        baseStats[key] *= value; // Multiplicative for others
                    }
                } else {
                    baseStats[key] = value; // Direct assignment for booleans and special values
                }
            });
        });

        return baseStats;
    }

    canShoot(now) {
        if (this.isReloading || this.isBursting) return false;
        
        const stats = this.getModifiedStats();
        if (now - this.lastShotTime < stats.fireRate) {
            return false;
        }
        
        return true;
    }

    update(input, isMouseOverUI, mouseWorldPos) {
        if (!this.owner) return;
        this.lastMousePos = mouseWorldPos;

        // Recoil decay
        this.recoil *= this.recoilDamping;
        if (Math.abs(this.recoil) < 0.1) {
            this.recoil = 0;
        }

        const now = Date.now();
        const stats = this.getModifiedStats();
        const modifiedReloadTime = this.reloadTime / stats.reloadSpeed;
        
        // Check if reloading is finished
        if (this.isReloading) {
            this.reloadAnimProgress = Math.min(1, (now - this.reloadStartTime) / modifiedReloadTime);
            if (now - this.reloadStartTime > modifiedReloadTime) {
                this.finishReload();
            }
        }

        const effectiveMagSize = Math.ceil(this.magSize * stats.magSize);

        // Burst fire logic
        if (this.isBursting) {
            if (this.ammo > 0 && this.burstShotsFired < stats.burstSize && now - this.lastBurstShotTime > this.burstFireRate) {
                this.fireOneShot(now);
                this.lastBurstShotTime = now;
                this.burstShotsFired++;
            }
            if (this.burstShotsFired >= stats.burstSize || this.ammo === 0) {
                this.isBursting = false;
                this.lastShotTime = now;
            }
            return;
        }

        const isPlayer = this.owner === world.player;

        // Manual Reload for player
        if (isPlayer && input.justPressed.has('r') && !this.isReloading && this.ammo < effectiveMagSize && this.reserveAmmo > 0) {
            this.startReload();
            return; // Don't do anything else this frame
        }

        if (isPlayer && isMouseOverUI) return;

        if (!this.canShoot(now)) return;

        const wantsToShoot = isPlayer ? input.mouse.down : input.shoot;
        const justShotTrigger = isPlayer ? input.justPressed.has('mouse') : (input.justShot || false);

        let shouldFire = false;
        let startBurst = false;

        if (this.fireMode === 'auto') {
            shouldFire = wantsToShoot;
        } else if (this.fireMode === 'semi') {
            shouldFire = justShotTrigger;
        } else if (this.fireMode === 'burst') {
            if (justShotTrigger) {
                startBurst = true;
            }
        }
        
        if (shouldFire || startBurst) {
            if (this.ammo > 0) {
                if (startBurst) {
                    this.isBursting = true;
                    this.burstShotsFired = 1;
                    this.fireOneShot(now);
                    this.lastBurstShotTime = now;
                } else {
                    this.fireOneShot(now);
                    this.lastShotTime = now;
                }
            } else {
                // Auto-reload on empty click for player. AI handles its own reloads.
                if (isPlayer && this.reserveAmmo > 0) {
                    this.startReload();
                    this.lastShotTime = now; // To prevent spamming reload start
                } else {
                    // Play empty sound
                    if (now - this.lastShotTime > 500) { // prevent spamming sound
                        playSound('empty_click', { volume: 0.5 });
                        this.lastShotTime = now;
                    }
                }
            }
        }
    }

    startReload() {
        if (!this.isReloading) {
            this.isReloading = true;
            this.reloadStartTime = Date.now();
            this.reloadAnimProgress = 0;
            playSound('reload', { volume: 0.3, pitch: this.soundPitchBase });

            // Drop magazine only if it's empty upon reload. Mags with ammo are kept.
            if (this.magazineOptions && this.ammo === 0) {
                const angle = this.owner.angle;
                // Eject from roughly where shells are ejected, but with less force
                const portLocalX = this.owner.radius + this.ejectionPortOffset.x - 10; // slightly behind port
                const portLocalY = this.ejectionPortOffset.y + 5; // slightly below port

                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                const rotatedPortX = portLocalX * cosA - portLocalY * sinA;
                const rotatedPortY = portLocalX * sinA + portLocalY * cosA;

                const worldEjectX = this.owner.x + rotatedPortX;
                const worldEjectY = this.owner.y + rotatedPortY;

                shells.push(new Magazine(worldEjectX, worldEjectY, angle, this.magazineOptions));
            }
        }
    }

    finishReload() {
        const stats = this.getModifiedStats();
        const effectiveMagSize = Math.ceil(this.magSize * stats.magSize);
        const ammoNeeded = effectiveMagSize - this.ammo;
        const ammoToTransfer = Math.min(ammoNeeded, this.reserveAmmo);
        
        this.ammo += ammoToTransfer;
        this.reserveAmmo -= ammoToTransfer;
        
        this.isReloading = false;
        this.reloadAnimProgress = 0;
    }

    fireOneShot(now = Date.now()) {
        if (this.ammo <= 0) return;
        this.ammo--;

        if (this.owner === world.player) {
            world.playerHasBeenAggressive = true;
        
            // Increase wanted level slightly for each shot fired by the player
            if (now - world.lastWantedLevelIncrease > 1000) { // Don't spam increases
                world.wantedLevel = Math.min(5, world.wantedLevel + 0.1);
                world.lastWantedLevelIncrease = now;
            }
        }

        const angle = this.owner.angle;
        const stats = this.getModifiedStats();
        
        // Update recoil based on modified stats
        this.recoil = stats.recoilAmount;
        playSound('shoot', { 
            volume: this.soundVolume, 
            pitch: this.soundPitchBase + (Math.random() * this.soundPitchVariance * 2) - this.soundPitchVariance
        });

        // --- SHELL EJECTION ---
        const portLocalX = this.owner.radius + this.ejectionPortOffset.x;
        const portLocalY = this.ejectionPortOffset.y;

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const rotatedPortX = portLocalX * cosA - portLocalY * sinA;
        const rotatedPortY = portLocalX * sinA + portLocalY * cosA;

        const worldEjectX = this.owner.x + rotatedPortX;
        const worldEjectY = this.owner.y + rotatedPortY;

        shells.push(new Shell(worldEjectX, worldEjectY, angle, this.shellSize));

        // --- PROJECTILE FIRING ---
        const muzzleDist = this.owner.radius + this.width - this.recoil;
        const projX = this.owner.x + Math.cos(angle) * muzzleDist;
        const projY = this.owner.y + Math.sin(angle) * muzzleDist;

        const projectileCount = Math.max(1, Math.floor(stats.projectileCount));
        
        for (let i = 0; i < projectileCount; i++) {
            let projectileAngle = angle;
            
            // Apply accuracy-based spread (more intuitive calculation)
            const maxSpread = Math.PI / 6; // 30 degrees max spread
            const spreadAmount = (1 - Math.min(1, stats.accuracy)) * maxSpread;
            projectileAngle += (Math.random() - 0.5) * spreadAmount;
            
            projectiles.push(new Projectile(projX, projY, projectileAngle, {
                radius: stats.projectileRadius,
                mass: stats.projectileMass,
                damage: stats.damage,
                speed: stats.projectileSpeed,
                isHeadshot: Math.random() < stats.headshotChance,
                weaponName: this.name,
                owner: this.owner,
                piercing: stats.piercing,
                tracking: stats.tracking,
                trackingStrength: stats.trackingStrength,
                seeksCops: stats.seeksCops,
                civilianDamage: stats.civilianDamage,
                bleedChance: stats.bleedChance,
                bloodyMess: stats.bloodyMess,
                dismemberChance: stats.dismemberChance,
                // New projectile behavior options
                bulletSize: stats.bulletSize,
                pathType: stats.pathType,
                pathAmplitude: stats.pathAmplitude,
                pathFrequency: stats.pathFrequency,
                spiralRadius: stats.spiralRadius,
                maxSpeed: stats.maxSpeed,
                minSpeed: stats.minSpeed,
                // Hit reaction modifiers
                explodeOnHit: stats.explodeOnHit,
                explosionRadius: stats.explosionRadius,
                explosionDamage: stats.explosionDamage,
                fireAreaOnHit: stats.fireAreaOnHit,
                fireAreaRadius: stats.fireAreaRadius,
                fireAreaDuration: stats.fireAreaDuration,
                toxicOnHit: stats.toxicOnHit,
                toxicRadius: stats.toxicRadius,
                toxicDamage: stats.toxicDamage,
                toxicDuration: stats.toxicDuration,
                // Timer-based effects
                timedFireArea: stats.timedFireArea,
                timedFireInterval: stats.timedFireInterval,
                timedExplosion: stats.timedExplosion,
                timedExplosionDelay: stats.timedExplosionDelay,
                timedToxic: stats.timedToxic,
                timedToxicInterval: stats.timedToxicInterval,
                // Beam-specific options
                knockback: stats.knockback,
            }));
        }
    }

    draw(ctx) {
        if (!this.owner) return; // Guard against null owner
        
        const gunX = this.owner.radius - this.recoil;
        const gunY = -this.height / 2;

        ctx.fillStyle = this.color;
        ctx.fillRect(gunX, gunY, this.width, this.height);
    }
}

export class Rifle extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = 'Rifle';
        this.icon = './rifle_icon.png';
        this.width = 52;
        this.height = 10;
        this.color = '#383838';
        this.recoilAmount = 10;
        this.fireRate = 150; // ms between shots
        this.lastShotTime = 0;
        this.lastMousePos = { x: 0, y: 0 };
        
        // Ammo & Reloading
        this.ammo = 15;
        this.magSize = 15;
        this.reserveAmmo = 60;
        this.reloadTime = 1250; // ms
        this.isReloading = false;
        this.reloadStartTime = 0;
        this.reloadAnimProgress = 0;
        
        // Properties to be overridden by subclasses
        this.name = 'Rifle';
        this.icon = './rifle_icon.png';
        this.gripPoints = { backHand: { x: 10, y: 0 }, frontHand: { x: 30, y: 0 } };
        this.shellSize = { width: 3, height: 6 };
        this.soundVolume = 0.2;
        this.soundPitchBase = 0.9;
        this.soundPitchVariance = 0.1;
        this.ejectionPortOffset = { x: 15, y: -(this.height / 2 + 2) };
        this.headshotChance = 0.15;
        this.accuracy = 0.85; // Good accuracy for rifle
        
        // Fire modes
        this.availableFireModes = ['auto', 'burst', 'semi'];
        this.fireMode = 'auto';
        this.burstSize = 3;

        // 6 mod slots for rifle
        this.modSlots = ['receiver', 'barrel', 'magazine', 'sight', 'muzzle', 'grip', 'stock', 'ammo', 'rail'];
        this.attachments = new Array(this.modSlots.length).fill(null);

        this.baseKnockback = 4; // Higher knockback for rifle
    }

    draw(ctx) {
        if (!this.owner) return; // Guard against null owner
        
        const gunX = this.owner.radius - this.recoil;
        const gunY = -this.height / 2; // Centered vertically

        const barrelColor = '#555';
        const stockColor = '#282828';
        const magazineColor = '#222';

        // Stock
        const stockWidth = 12;
        const stockHeight = 8;
        ctx.fillStyle = stockColor;
        ctx.fillRect(gunX, gunY + (this.height - stockHeight) / 2, stockWidth, stockHeight);
        
        // Body (Receiver + Handguard)
        const bodyWidth = 25;
        const bodyHeight = this.height;
        ctx.fillStyle = this.color; // Use the main weapon color for the body
        ctx.fillRect(gunX + stockWidth, gunY, bodyWidth, bodyHeight);

        // Barrel
        const barrelWidth = 15;
        const barrelHeight = 4;
        ctx.fillStyle = barrelColor;
        ctx.fillRect(gunX + stockWidth + bodyWidth, gunY + (this.height - barrelHeight) / 2, barrelWidth, barrelHeight);
        
        // Magazine
        const magWidth = 6;
        const magHeight = 12;
        ctx.fillStyle = magazineColor;
        ctx.fillRect(gunX + stockWidth + 8, gunY + bodyHeight - 2, magWidth, magHeight);
    }
}

export class Pistol extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = 'Pistol';
        this.icon = './pistol_icon.png';
        this.width = 28;
        this.height = 10;
        this.color = '#222222';
        this.recoilAmount = 6;
        this.fireRate = 400; // Slower
        this.lastShotTime = 0;
        this.lastMousePos = { x: 0, y: 0 };
        
        // Ammo & Reloading
        this.ammo = 9;
        this.magSize = 9;
        this.reserveAmmo = 45;
        this.reloadTime = 900; // ms
        this.isReloading = false;
        this.reloadStartTime = 0;
        this.reloadAnimProgress = 0;
        
        // Properties to be overridden by subclasses
        this.name = 'Pistol';
        this.icon = './pistol_icon.png';
        this.gripPoints = { backHand: { x: 8, y: -4 }, frontHand: { x: 8, y: 4 } };
        this.shellSize = { width: 2, height: 4 }; // Smaller
        this.soundVolume = 0.15;
        this.soundPitchBase = 1.1;
        this.soundPitchVariance = 0.1;
        this.ejectionPortOffset = { x: 10, y: -(this.height / 2 + 2) };
        this.headshotChance = 0.10;
        this.accuracy = 0.75; // Moderate accuracy for pistol
        
        // Fire modes
        this.availableFireModes = ['semi', 'burst'];
        this.fireMode = 'semi';
        this.burstSize = 4;

        // 5 mod slots for pistol + rail
        this.modSlots = ['receiver', 'barrel', 'magazine', 'sight', 'muzzle', 'grip', 'ammo', 'rail'];
        this.attachments = new Array(this.modSlots.length).fill(null);

        this.baseKnockback = 2; // Lower knockback for pistol
    }

    draw(ctx) {
        if (!this.owner) return; // Guard against null owner
        
        const gunX = this.owner.radius - this.recoil;
        const gunY = -this.height / 2;

        const slideColor = '#4a4a4a';
        const gripColor = this.color;

        // Grip
        const gripWidth = 10;
        const gripHeight = this.height;
        ctx.fillStyle = gripColor;
        ctx.fillRect(gunX, gunY, gripWidth, gripHeight);
        
        // Slide
        const slideWidth = 20; // smaller than total width
        const slideHeight = 8;
        ctx.fillStyle = slideColor;
        ctx.fillRect(gunX + gripWidth - 2, gunY + (gripHeight - slideHeight) / 2, slideWidth, slideHeight);
    }
}

export class Shotgun extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = 'Shotgun';
        this.icon = './shotgun_icon.png';
        this.width = 55;
        this.height = 14;
        this.color = '#543d2b'; // Wood/metal color
        this.recoilAmount = 25;
        this.fireRate = 1000; // Pump action is slow
        this.lastShotTime = 0;
        this.lastMousePos = { x: 0, y: 0 };
        this.pumpDuration = 400; // ms for the pump animation
        this.pumpProgress = 0; // Goes from 1 down to 0
        this.lastPumpTime = 0;
        this.pelletCount = 8;
        this.spreadAngle = Math.PI / 12; // 15 degrees total spread
        
        // Ammo & Reloading
        this.ammo = 8;
        this.magSize = 8;
        this.reserveAmmo = 24;
        this.reloadTime = 1500; // ms
        this.isReloading = false;
        this.reloadStartTime = 0;
        this.reloadAnimProgress = 0;
        
        // Properties to be overridden by subclasses
        this.name = 'Shotgun';
        this.icon = './shotgun_icon.png';
        this.gripPoints = { backHand: { x: 15, y: 0 }, frontHand: { x: 40, y: 0 } };
        this.shellSize = { width: 4, height: 10 }; // Bigger shells
        this.soundVolume = 0.4;
        this.soundPitchBase = 0.8;
        this.soundPitchVariance = 0.05;
        this.soundName = 'shotgun_shoot';
        this.ejectionPortOffset = { x: 20, y: -(this.height / 2 + 3) };
        this.headshotChance = 0.05;
        this.accuracy = 0.60; // Lower accuracy due to spread nature
        
        // Fire modes
        this.availableFireModes = ['semi'];
        this.fireMode = 'semi';

        // 3 mod slots for shotgun + rail
        this.modSlots = ['receiver', 'barrel', 'magazine', 'sight', 'muzzle', 'choke', 'pump', 'ammo', 'rail'];
        this.attachments = new Array(this.modSlots.length).fill(null);

        this.baseKnockback = 8; // High knockback for shotgun
    }

    update(input, isMouseOverUI, mouseWorldPos) {
        const now = Date.now();
        // Update pump animation progress
        if (this.pumpProgress > 0) {
            const timeSincePump = now - this.lastPumpTime;
            this.pumpProgress = Math.max(0, 1 - (timeSincePump / this.pumpDuration));
        }
        super.update(input, isMouseOverUI, mouseWorldPos);
    }

    canShoot(now) {
        if (!super.canShoot(now)) return false;
        return this.pumpProgress <= 0;
    }

    finishReload() {
        const stats = this.getModifiedStats();
        const effectiveMagSize = Math.ceil(this.magSize * stats.magSize);
        const ammoNeeded = effectiveMagSize - this.ammo;
        const ammoToTransfer = Math.min(ammoNeeded, this.reserveAmmo);
        
        this.ammo += ammoToTransfer;
        this.reserveAmmo -= ammoToTransfer;
        
        this.isReloading = false;
        this.reloadAnimProgress = 0;
    }

    fireOneShot(now = Date.now()) {
        if (this.ammo <= 0) {
            return;
        }
        this.ammo--;

        // Start the pump animation
        this.lastPumpTime = now;
        this.pumpProgress = 1;

        if (this.owner === world.player) {
            world.playerHasBeenAggressive = true;
        
            // Increase wanted level slightly for each shot fired by the player
            if (now - world.lastWantedLevelIncrease > 1000) { // Don't spam increases
                world.wantedLevel = Math.min(5, world.wantedLevel + 0.1);
                world.lastWantedLevelIncrease = now;
            }
        }
        
        const angle = this.owner.angle;
        const stats = this.getModifiedStats();
        
        // Update recoil
        this.recoil = stats.recoilAmount;
        playSound('shotgun_shoot', { 
            volume: this.soundVolume, 
            pitch: this.soundPitchBase + (Math.random() * this.soundPitchVariance * 2) - this.soundPitchVariance
        });

        // --- SHELL EJECTION ---
        const portLocalX = this.owner.radius + this.ejectionPortOffset.x;
        const portLocalY = this.ejectionPortOffset.y;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const rotatedPortX = portLocalX * cosA - portLocalY * sinA;
        const rotatedPortY = portLocalX * sinA + portLocalY * cosA;
        const worldEjectX = this.owner.x + rotatedPortX;
        const worldEjectY = this.owner.y + rotatedPortY;
        shells.push(new Shell(worldEjectX, worldEjectY, angle, { ...this.shellSize, type: 'shotgun' }));

        // --- PROJECTILE FIRING ---
        const muzzleDist = this.owner.radius + this.width - this.recoil;
        const basePelletCount = this.pelletCount;
        const totalPellets = Math.max(1, Math.floor(basePelletCount * stats.projectileCount));

        // Generate unique shot ID for damage tracking
        const shotId = Date.now() + Math.random();

        for (let i = 0; i < totalPellets; i++) {
            // Apply both natural shotgun spread and accuracy modifier
            const baseSpread = this.spreadAngle;
            const accuracySpread = (1 - Math.min(1, stats.accuracy)) * (Math.PI / 8);
            const totalSpread = baseSpread + accuracySpread;
            const projectileAngle = this.owner.angle + (Math.random() - 0.5) * totalSpread;

            const projX = this.owner.x + Math.cos(projectileAngle) * muzzleDist;
            const projY = this.owner.y + Math.sin(projectileAngle) * muzzleDist;

            projectiles.push(new Projectile(projX, projY, projectileAngle, {
                radius: stats.projectileRadius,
                mass: stats.projectileMass,
                damage: stats.damage,
                speed: stats.projectileSpeed,
                isHeadshot: Math.random() < stats.headshotChance,
                weaponName: this.name,
                shotId: shotId,
                owner: this.owner,
                piercing: stats.piercing,
                tracking: stats.tracking,
                trackingStrength: stats.trackingStrength,
                bloodyMess: stats.bloodyMess,
                dismemberChance: stats.dismemberChance,
                // New projectile behavior options
                bulletSize: stats.bulletSize,
                pathType: stats.pathType,
                pathAmplitude: stats.pathAmplitude,
                pathFrequency: stats.pathFrequency,
                spiralRadius: stats.spiralRadius,
                maxSpeed: stats.maxSpeed,
                minSpeed: stats.minSpeed,
            }));
        }
    }

    draw(ctx) {
        if (!this.owner) return; // Guard against null owner
        
        const gunX = this.owner.radius - this.recoil;
        const gunY = -this.height / 2; // -7

        const stockColor = this.color; // wood
        const receiverColor = '#2c3e50'; // dark metal grey
        const barrelColor = '#444'; // slightly lighter metal grey
        const pumpColor = '#6d4c41'; // darker wood for pump

        // Define part dimensions
        const stockWidth = 15;
        const stockHeight = this.height; // 14
        
        const receiverWidth = 15;
        const receiverHeight = 12;

        const barrelWidth = 25;
        const barrelHeight = 6;
        
        const pumpWidth = 15;
        const pumpHeight = 8;
        
        // Stock
        ctx.fillStyle = stockColor;
        ctx.fillRect(gunX, gunY, stockWidth, stockHeight);

        // Receiver
        ctx.fillStyle = receiverColor;
        ctx.fillRect(gunX + stockWidth, gunY + (this.height - receiverHeight) / 2, receiverWidth, receiverHeight);
        
        // Barrel
        const barrelX = gunX + stockWidth + receiverWidth;
        const barrelY = gunY + (this.height - barrelHeight) / 2;
        ctx.fillStyle = barrelColor;
        ctx.fillRect(barrelX, barrelY, barrelWidth, barrelHeight);

        // Animate the pump based on pumpProgress
        const pumpAnimProgress = 1 - this.pumpProgress; // Invert so it goes 0 -> 1 -> 0
        const pumpAnimPath = 1 - Math.abs(1 - pumpAnimProgress * 2);
        const pumpTravelDist = 18;
        
        // Pump (under barrel, slightly thicker)
        const pumpX = barrelX + 5 - (pumpAnimPath * pumpTravelDist);
        const pumpY = gunY + (this.height - pumpHeight) / 2;
        ctx.fillStyle = pumpColor;
        ctx.fillRect(pumpX, pumpY, pumpWidth, pumpHeight);
    }
}

export class Knife extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = 'Knife';
        this.icon = './knife_icon.png';
        this.width = 30; // blade length
        this.height = 8; // blade width
        this.color = '#cccccc';
        this.gripPoints = { backHand: { x: 5, y: 0 }, frontHand: null };

        this.fireRate = 400; // ms between swings
        this.lastShotTime = 0;
        
        // Melee specific properties
        this.range = 70;
        this.arc = Math.PI / 3; // 60 degrees
        this.projectileDamage = 50; // Re-using this property for damage
        this.accuracy = 1.0; // Perfect accuracy for melee
        
        // swing animation state
        this.isSwinging = false;
        this.swingProgress = 0;
        this.swingDuration = 150; // ms
        this.lastSwingStartTime = 0;

        this.soundVolume = 0.5;
        this.soundPitchBase = 1.0;
        this.soundPitchVariance = 0.2;

        this.baseKnockback = 1; // Minimal knockback for knife
    }

    update(input, isMouseOverUI, mouseWorldPos) {
        const now = Date.now();

        // Update swing animation
        if (this.isSwinging) {
            this.swingProgress = (now - this.lastSwingStartTime) / this.swingDuration;
            if (this.swingProgress >= 1) {
                this.isSwinging = false;
                this.swingProgress = 0;
            }
        }

        if (input.mouse.down && !isMouseOverUI && (now - this.lastShotTime > this.fireRate)) {
            this.shoot();
            this.lastShotTime = now;
        }
    }

    shoot() { // This is the "swing"
        this.isSwinging = true;
        this.swingProgress = 0;
        this.lastSwingStartTime = Date.now();
        playSound('knife_swing', { 
            volume: this.soundVolume, 
            pitch: this.soundPitchBase + (Math.random() * this.soundPitchVariance * 2) - this.soundPitchVariance
        });

        const playerAngle = this.owner.angle;
        let hitSomeone = false;

        for (const enemy of enemies) {
            const dx = enemy.x - this.owner.x;
            const dy = enemy.y - this.owner.y;
            const dist = Math.hypot(dx, dy);

            // Check if enemy is in range
            if (dist < this.range + enemy.radius) {
                const angleToEnemy = Math.atan2(dy, dx);
                
                let angleDiff = angleToEnemy - playerAngle;
                
                // Handle wraparound for correct angle comparison
                if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                // Check if enemy is within the swing arc
                if (Math.abs(angleDiff) < this.arc / 2) {
                    enemy.takeDamage(this.projectileDamage, playerAngle, {
                        weaponName: this.name,
                        owner: this.owner,
                        knockback: this.baseKnockback
                    });
                    if (!hitSomeone) {
                        playSound('knife_hit', { volume: 0.6 });
                        hitSomeone = true;
                    }
                }
            }
        }
    }

    draw(ctx) {
        if (!this.owner) return; // Guard against null owner
        
        let swingAngleOffset = 0;
        let swingDistOffset = 0;

        if (this.isSwinging) {
            // Use a sine wave for a smooth back-and-forth motion
            const animProgress = Math.sin(this.swingProgress * Math.PI);
            swingAngleOffset = (this.arc / 2) * animProgress;
            swingDistOffset = 15 * animProgress;
        }
        
        ctx.save();
        ctx.rotate(swingAngleOffset);

        const knifeX = this.owner.radius + swingDistOffset - 5; // Start a bit further back to look held
        const knifeY = -this.height / 2;
        const handleLength = 10;
        const bladeLength = this.width;

        // Draw handle
        ctx.fillStyle = '#4a2a1a';
        ctx.fillRect(knifeX, knifeY, handleLength, this.height);
        
        // Draw player's hand on the handle
        ctx.fillStyle = this.owner.color;
        const handRadius = 5;
        ctx.beginPath();
        ctx.arc(knifeX + handleLength / 2, knifeY + this.height / 2, handRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw blade
        const bladeStartX = knifeX + handleLength;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(bladeStartX, knifeY);
        ctx.lineTo(bladeStartX + bladeLength, knifeY + this.height / 2);
        ctx.lineTo(bladeStartX, knifeY + this.height);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

export class Grenade extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = 'Grenade';
        this.icon = './grenade_icon.png';
        this.fireRate = 1000;
        this.ammo = 5;
        this.accuracy = 1.0; // Perfect accuracy for thrown weapons
        this.gripPoints = { backHand: { x: 10, y: 0 }, frontHand: null };
    }

    update(input, isMouseOverUI, mouseWorldPos) {
        this.lastMousePos = mouseWorldPos;
        const now = Date.now();

        // Grenades are single-use per click, no reloading.
        if (input.mouse.down && !isMouseOverUI && (now - this.lastShotTime > this.fireRate)) {
            if (this.ammo > 0) {
                this.shoot();
                this.lastShotTime = now;
            } else {
                if (now - this.lastShotTime > 500) { // prevent spamming sound
                    playSound('empty_click', { volume: 0.5 });
                    this.lastShotTime = now;
                }
            }
        }
    }

    shoot() {
        if (this.ammo <= 0) {
            // This is checked in update, but double check here.
            return;
        }
        this.ammo--;

        playSound('knife_swing', { volume: 0.4, pitch: 0.8 }); // Whoosh sound

        // EJECT PIN
        shells.push(new GrenadePin(this.owner.x, this.owner.y, this.owner.angle));

        const targetX = this.lastMousePos.x;
        const targetY = this.lastMousePos.y;
        
        grenades.push(new GrenadeEntity(this.owner.x, this.owner.y, targetX, targetY));
    }

    draw(ctx) {
        if (!this.owner) return; // Guard against null owner
        
        // Don't draw a gun model for grenades
    }
}

export class ProceduralThrowable extends Weapon {
    constructor(owner, throwableData) {
        super(owner);
        this.name = throwableData.name;
        this.icon = './grenade_icon.png'; // Use generic grenade icon for now
        this.fireRate = 1000;
        this.ammo = 1; // This represents one throwable
        this.magSize = 1;
        this.reserveAmmo = 0;
        this.data = throwableData;
        this.gripPoints = { backHand: { x: 10, y: 0 }, frontHand: null };
    }

    update(input, isMouseOverUI, mouseWorldPos) {
        this.lastMousePos = mouseWorldPos;
        const now = Date.now();

        if (input.mouse.down && !isMouseOverUI && (now - this.lastShotTime > this.fireRate)) {
            if (this.ammo > 0) {
                this.shoot();
                this.lastShotTime = now;
            }
        }
    }

    shoot() {
        if (this.ammo <= 0) return;
        this.ammo--; // Use up the throwable

        playSound('knife_swing', { volume: 0.4, pitch: 0.8 });
        shells.push(new GrenadePin(this.owner.x, this.owner.y, this.owner.angle));

        const targetX = this.lastMousePos.x;
        const targetY = this.lastMousePos.y;
        
        throwables.push(new ThrowableEntity(this.owner.x, this.owner.y, targetX, targetY, this.data));
    }

    draw(ctx) {
        // Don't draw a gun model for throwables
    }
}