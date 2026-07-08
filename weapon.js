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
        names: [
            // Original 22
            'Cop Seeker', 'Civilian Hunter', 'Big Bore', 'Rapid Fire', 'Bleeding Edge', 'Slow Mo', 'Speed Demon',
            'Multi Shot', 'Splitter', 'Bouncer', 'Zigzag', 'Spiral Storm', 'Wave Rider', 'Size Matters',
            'Velocity Chaos', 'Impact Driver', 'Explosive Rounds', 'Fire Starter', 'Toxic Waste', 'Time Bomb',
            'Area Denial', 'Chain Reaction',
            // NEW: 30 wacky experimental mods
            'Gravity Gun', 'Black Hole Bullet', 'Vampire Rounds', 'Chain Lightning', 'Frostbite',
            'Shrink Ray', 'Growth Hormone', 'Confusion Dart', 'Ricochet Freddy', 'Nova Bomb',
            'Ghost Bullet', 'Boomerang Shot', 'Mirror Shot', 'Earthquake Maker', 'Zombie Spore',
            'Rubber Band Ball', 'Cluster Bomb', 'Pulse Wave', 'Magnet Core', 'Flower Bloom',
            'Ping Pong', 'Drunk Missile', 'Overclocked Phaser', 'Dead Man Switch', 'Bubble Gun',
            'Lava Launcher', 'Tornado Spin', 'Gravity Flip', 'Antimatter Round', 'Party Popper'
        ],
        modifiers: [
            // === Original 22 (unchanged) ===
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
            { timedToxic: true, timedToxicInterval: 1800, toxicRadius: 70, toxicDuration: 8000, bouncing: true, reloadSpeed: 0.8, knockback: 1.0 },

            // === NEW 30: Wacky, zany, unique experimental mods ===

            // 23. Gravity Gun — bullets pull enemies toward their flight path
            { gravityWell: true, gravityWellRadius: 120, gravityWellForce: 0.6, damage: 0.8, reloadSpeed: 0.9, knockback: 0.5 },

            // 24. Black Hole Bullet — on hit, creates a singularity that sucks everything in then collapses
            { blackHoleOnHit: true, blackHoleRadius: 200, blackHoleDuration: 1200, blackHoleForce: 0.9, damage: 0.5, reloadSpeed: 0.6, knockback: 0.1 },

            // 25. Vampire Rounds — every hit heals the shooter
            { vampireOnHit: true, vampireHealAmount: 8, damage: 1.2, reloadSpeed: 1.0, knockback: 1.0, bleedChance: 0.2 },

            // 26. Chain Lightning — on hit, lightning arcs to nearby enemies
            { chainLightning: true, chainRange: 180, chainCount: 4, chainDamage: 20, damage: 1.0, reloadSpeed: 0.9, knockback: 0.8 },

            // 27. Frostbite — freezes hit enemies solid for 3 seconds
            { frostOnHit: true, frostDuration: 3000, damage: 0.7, reloadSpeed: 0.95, knockback: 0.5, projectileSpeed: 1.1 },

            // 28. Shrink Ray — hit enemies shrink to half size (easier to hit, less threatening)
            { shrinkRay: true, damage: 0.3, reloadSpeed: 1.1, knockback: 0.3, projectileSpeed: 1.5, accuracy: 1.3 },

            // 29. Growth Hormone — hit enemies DOUBLE in size (hilarious, scary, easier to hit)
            { growRay: true, growScale: 2.5, damage: 0.5, reloadSpeed: 1.0, knockback: 0.8, bulletSize: 1.3 },

            // 30. Confusion Dart — hit enemies go berserk and attack each other
            { confusionOnHit: true, confusionDuration: 6000, damage: 0.4, reloadSpeed: 1.0, knockback: 0.2, projectileSpeed: 1.3 },

            // 31. Ricochet Freddy — after hitting an enemy, bounces toward the NEAREST other enemy
            { ricochetFred: true, bouncing: true, maxBounces: 8, piercing: true, damage: 0.8, reloadSpeed: 1.0, knockback: 1.2 },

            // 32. Nova Bomb — on death/expiry, explodes in a 360° ring of projectiles
            { novaOnDeath: true, novaCount: 16, novaDamage: 12, damage: 1.0, projectileSpeed: 0.7, reloadSpeed: 0.6, knockback: 1.5 },

            // 33. Ghost Bullet — phases through walls and buildings, only hits enemies
            { ghostBullet: true, piercing: true, damage: 1.3, reloadSpeed: 0.9, knockback: 1.0, accuracy: 1.2 },

            // 34. Boomerang Shot — bullet flies out then curves back to the shooter
            { boomerang: true, boomerangTurning: 0.04, damage: 1.5, piercing: true, reloadSpeed: 1.2, knockback: 1.5, projectileSpeed: 1.3 },

            // 35. Mirror Shot — fires a second bullet backward at the same time
            { mirrorShot: true, damage: 0.9, reloadSpeed: 1.0, knockback: 1.0, accuracy: 0.9 },

            // 36. Earthquake Maker — massive knockback + screen shake on hit, low damage
            { knockback: 8.0, damage: 0.5, bulletSize: 2.0, reloadSpeed: 0.7, fireRate: -400, projectileSpeed: 0.6 },

            // 37. Zombie Spore — hit enemies have a chance to turn into zombies on death
            { onHitEffect: 'zombify', damage: 0.6, bleedChance: 0.5, reloadSpeed: 0.9, knockback: 0.3, toxicOnHit: true, toxicRadius: 40, toxicDamage: 2, toxicDuration: 3000 },

            // 38. Rubber Band Ball — insanely bouncy, gains speed with each bounce
            { bouncing: true, maxBounces: 15, projectileSpeed: 1.5, damage: 0.5, reloadSpeed: 1.3, knockback: 2.0, bulletSize: 1.5 },

            // 39. Cluster Bomb — splits into 6 mini-bombs mid-flight that each explode
            { splitOnHit: true, explodeOnHit: true, explosionRadius: 60, explosionDamage: 30, damage: 0.8, fireRate: -200, reloadSpeed: 0.5, knockback: 1.8 },

            // 40. Pulse Wave — emits a shockwave that pushes ALL nearby enemies away
            { knockback: 6.0, bulletSize: 0.5, damage: 0.3, fireRate: -100, reloadSpeed: 1.1, accuracy: 1.5, projectileSpeed: 2.0 },

            // 41. Magnet Core — bullets curve toward the nearest enemy aggressively
            { tracking: true, trackingStrength: 3.0, damage: 1.1, reloadSpeed: 0.9, knockback: 1.0, projectileSpeed: 1.4 },

            // 42. Flower Bloom — bullet splits into 8 petals in a flower pattern on impact
            { splitOnHit: true, projectileCount: 0.3, damage: 0.6, reloadSpeed: 1.1, knockback: 0.8, bleedChance: 0.3, bulletSize: 1.5 },

            // 43. Ping Pong — bounces rapidly between walls with extreme speed
            { bouncing: true, maxBounces: 20, projectileSpeed: 3.0, damage: 0.4, reloadSpeed: 1.5, knockback: 1.0, maxSpeed: 80 },

            // 44. Drunk Missile — wobbles erratically, impossible to predict, surprisingly deadly
            { pathType: 'zigzag', pathAmplitude: 50, pathFrequency: 0.5, damage: 1.8, reloadSpeed: 1.0, knockback: 1.5, accuracy: 0.3 },

            // 45. Overclocked Phaser — insane fire rate, bullets phase through walls, low damage
            { ghostBullet: true, fireRate: 500, damage: 0.3, reloadSpeed: 2.5, knockback: 0.3, accuracy: 0.6, projectileSpeed: 2.5, piercing: true },

            // 46. Dead Man Switch — if you die, all your loaded bullets explode at once
            { timedExplosion: true, timedExplosionDelay: 5000, explosionRadius: 200, explosionDamage: 100, damage: 0.8, reloadSpeed: 0.5, knockback: 2.0 },

            // 47. Bubble Gun — bullets are slow, huge, bouncy, and hilarious
            { bulletSize: 4.0, bouncing: true, maxBounces: 10, projectileSpeed: 0.3, damage: 0.5, reloadSpeed: 1.8, knockback: 3.0, maxSpeed: 8 },

            // 48. Lava Launcher — leaves a trail of fire as it flies, explodes on impact
            { fireAreaOnHit: true, fireAreaRadius: 80, fireAreaDuration: 8000, explodeOnHit: true, explosionRadius: 80, explosionDamage: 40, damage: 1.2, reloadSpeed: 0.5, knockback: 1.5 },

            // 49. Tornado Spin — spirals outward, hitting everything in a huge radius
            { pathType: 'spiral', spiralRadius: 120, pathFrequency: 0.08, piercing: true, damage: 0.8, reloadSpeed: 0.8, knockback: 1.2, bulletSize: 1.5 },

            // 50. Gravity Flip — reversed gravity on hit, enemies fly UPWARD
            { knockback: -5.0, damage: 1.0, reloadSpeed: 0.9, bulletSize: 1.5, fireRate: -100, projectileSpeed: 1.2 },

            // 51. Antimatter Round — deletes a chunk of the world on impact (massive explosion + fire + toxic)
            { explodeOnHit: true, explosionRadius: 250, explosionDamage: 150, fireAreaOnHit: true, fireAreaRadius: 150, fireAreaDuration: 10000, toxicOnHit: true, toxicRadius: 100, toxicDamage: 15, toxicDuration: 12000, damage: 2.0, reloadSpeed: 0.2, knockback: 5.0, fireRate: -800 },

            // 52. Party Popper — fires a burst of confetti-colored bouncing bullets in all directions
            { projectileCount: 8, bouncing: true, maxBounces: 6, damage: 0.3, accuracy: 0.2, reloadSpeed: 1.5, knockback: 2.0, bulletSize: 1.8, fireRate: -200 }
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
            // --- New wacky experimental descriptions ---
            case 'gravityWell':
                if (value) effects.push('Bullets pull enemies toward their path');
                break;
            case 'gravityWellRadius':
                effects.push(`${value.toFixed(0)}px gravity pull radius`);
                break;
            case 'gravityWellForce':
                effects.push(`${(value * 100).toFixed(0)}% gravity pull force`);
                break;
            case 'blackHoleOnHit':
                if (value) effects.push('Creates a singularity on impact');
                break;
            case 'blackHoleRadius':
                effects.push(`${value.toFixed(0)}px black hole radius`);
                break;
            case 'vampireOnHit':
                if (value) effects.push('Heals shooter on hit');
                break;
            case 'vampireHealAmount':
                effects.push(`+${value.toFixed(0)} HP per hit`);
                break;
            case 'chainLightning':
                if (value) effects.push('Lightning chains between enemies');
                break;
            case 'chainCount':
                effects.push(`chains to ${value.toFixed(0)} enemies`);
                break;
            case 'frostOnHit':
                if (value) effects.push('Freezes enemies solid');
                break;
            case 'shrinkRay':
                if (value) effects.push('Shrinks hit enemies');
                break;
            case 'growRay':
                if (value) effects.push('Enlarges hit enemies');
                break;
            case 'confusionOnHit':
                if (value) effects.push('Hit enemies go berserk and attack allies');
                break;
            case 'ricochetFred':
                if (value) effects.push('Ricochets toward nearest enemy after hit');
                break;
            case 'novaOnDeath':
                if (value) effects.push('Explodes in 360° ring on impact');
                break;
            case 'ghostBullet':
                if (value) effects.push('Phases through walls and buildings');
                break;
            case 'boomerang':
                if (value) effects.push('Bullet returns to shooter');
                break;
            case 'mirrorShot':
                if (value) effects.push('Fires a mirrored copy backward');
                break;
            case 'onHitEffect':
                if (value === 'zombify') effects.push('Turns killed enemies into zombies');
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

    // Returns { offsetY, visible } for magazine rendering during reload.
    // Phase 1 (progress 0→0.5): mag slides down and disappears (old mag falling out).
    // Phase 2 (progress 0.5→1): mag hidden (hand inserting new mag).
    // Not reloading: mag visible at normal position.
    _getMagDrawState() {
        if (!this.isReloading || this.reloadAnimProgress <= 0) {
            return { offsetY: 0, visible: true };
        }
        const progress = this.reloadAnimProgress;
        if (progress < 0.5) {
            // Slide down during first half — mag dropping out
            const dropT = progress * 2; // 0→1
            return { offsetY: dropT * 15, visible: true };
        }
        // Second half — mag is out, hand is inserting new one
        return { offsetY: 0, visible: false };
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
            // --- New wacky experimental properties ---
            gravityWell: false,
            gravityWellRadius: 100,
            gravityWellForce: 0.5,
            shrinkRay: false,
            confusionOnHit: false,
            confusionDuration: 5000,
            vampireOnHit: false,
            vampireHealAmount: 5,
            chainLightning: false,
            chainRange: 150,
            chainCount: 3,
            chainDamage: 15,
            blackHoleOnHit: false,
            blackHoleRadius: 200,
            blackHoleDuration: 1000,
            blackHoleForce: 0.8,
            ricochetFred: false,
            frostOnHit: false,
            frostDuration: 3000,
            growRay: false,
            growScale: 2.0,
            mirrorShot: false,
            novaOnDeath: false,
            novaCount: 12,
            novaDamage: 10,
            ghostBullet: false,
            boomerang: false,
            boomerangTurning: 0.05,
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
                    'bloodyMess', 'dismemberChance',
                    'bulletSize', 'pathAmplitude', 'pathFrequency', 'spiralRadius', 'maxSpeed', 'minSpeed', 
                    'reloadSpeed', 'knockback', 'maxBounces', 'explosionRadius', 'explosionDamage',
                    'fireAreaRadius', 'fireAreaDuration', 'toxicRadius', 'toxicDamage', 'toxicDuration',
                    'timedFireInterval', 'timedExplosionDelay', 'timedToxicInterval',
                    'gravityWellRadius', 'gravityWellForce', 'confusionDuration', 'vampireHealAmount',
                    'chainRange', 'chainCount', 'chainDamage', 'blackHoleRadius', 'blackHoleDuration',
                    'blackHoleForce', 'frostDuration', 'growScale', 'novaCount', 'novaDamage', 'boomerangTurning'
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

            // Drop magazine from the magwell position (bottom of gun)
            if (this.magazineOptions) {
                const angle = this.owner.angle;
                // Eject from the magwell point if available, otherwise approximate from ejection port
                const magWell = this.magWellPoint || { x: this.owner.radius + 10, y: 8 };
                const portLocalX = this.owner.radius + magWell.x;
                const portLocalY = magWell.y + 5; // slightly below magwell

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
                ...stats,
                weaponName: this.name,
                owner: this.owner,
                isHeadshot: Math.random() < stats.headshotChance,
                shotId: null,
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