import Cop from './cop.js';
import { Rifle } from './rifle.js';
import { Shotgun } from './shotgun.js';

export default class Swat extends Cop {
    constructor(x, y) {
        super(x, y);

        this.color = '#2c3e50'; // Dark blue/grey SWAT uniform
        this.health = 150;
        this.maxHealth = 150;
        
        // SWAT are elite, very brave and aggressive
        this.bravery = 0.9 + Math.random() * 0.1;
        this.aggressiveness = 0.8 + Math.random() * 0.2;
        this.panicThreshold = 0.01; // Almost never panic
        this.shockResistance = 0.95; // Extremely resistant

        this.speed = 2.8; // Faster than regular cops
        this.patrolSpeed = this.speed * 0.8;

        /* @tweakable [0-1] How strongly SWAT units lead their shots. 0=none, 1=perfect. */
        this.predictionStrength = 0.65;
        /* @tweakable [0-1] The margin of error for SWAT aiming. 0=perfect, 1=high error. */
        this.predictionError = 0.25;

        // SWAT have even higher knockback resistance due to heavy gear
        this.knockbackResistance = 0.6 + Math.random() * 0.2; // 60-80% resistance
        
        // Even stronger punch due to elite training
        this.punchDamage = 22;
        this.punchKnockback = 10;

        // Equip with a rifle or shotgun
        if (Math.random() < 0.7) { // 70% chance for rifle
            this.weapon = new Rifle(this);
            this.weapon.reloadTime = 600; // SWAT reload very fast
            this.weapon.magSize = 20;
            this.weapon.ammo = this.weapon.magSize;
        } else {
            this.weapon = new Shotgun(this);
            this.weapon.reloadTime = 1200; // Faster shotgun reload
            this.weapon.magSize = 10;
            this.weapon.ammo = this.weapon.magSize;
        }
        
        this.weapon.reserveAmmo = 999; // Infinite ammo for now

        this.isSwat = true; // A flag to identify them easily
        this.isCop = true; // They are a type of cop
    }

    drawOverBody(ctx, player) {
        // This is called by Enemy.draw() in a rotated context.
        // Draw the SWAT helmet and vest.
        
        // Vest
        ctx.fillStyle = '#1a2430'; // Darker vest color
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 0.9, this.radius * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // "SWAT" text on vest
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SWAT', 0, -this.radius * 0.4); // Position on upper back/shoulders
        ctx.restore();

        // Helmet (replaces cop hat)
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.85, 0, Math.PI * 2);
        ctx.fill();
    }
}