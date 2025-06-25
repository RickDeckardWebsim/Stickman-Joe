import { Weapon } from './weapon.js';
import { world, shells, projectiles } from './world.js';
import { Shell } from './shell.js';
import Projectile from './projectile.js';
import { playSound } from './audio.js';

export class InjectionCannon extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = 'Injection Cannon';
        this.icon = './injection_cannon_icon.png';
        this.width = 50;
        this.height = 16;
        this.color = '#e0e0e0';
                this.recoilAmount = 8;
                this.fireRate = 1200;
        
        this.ammo = 5;
        this.magSize = 5;
        this.reserveAmmo = 10;
                this.reloadTime = 2500;

        this.gripPoints = { backHand: { x: 12, y: 0 }, frontHand: { x: 35, y: 0 } };
        this.soundVolume = 0.5;
        this.soundPitchBase = 1.0;
        this.soundPitchVariance = 0.1;
        this.headshotChance = 0;
        this.accuracy = 0.95;
        
        // This is the firing mechanism. The projectile effect is chosen from effectModes.
        this.fireMode = 'semi'; 
        
        // These are the available effects for the projectile.
        this.effectModes = ['zombify', 'hemorrhage'];
        this.currentEffectMode = 'zombify';
        
        // Let the base weapon class know what firing mechanisms it can use.
        this.availableFireModes = ['semi'];
        
        // Custom mod slots for this weapon
        this.modSlots = ['injector', 'sight', 'stock', 'rail'];
        this.attachments = new Array(this.modSlots.length).fill(null);
    }

    fireOneShot(now = Date.now()) {
        if (this.ammo <= 0) return;
        this.ammo--;

        const angle = this.owner.angle;
        const stats = this.getModifiedStats();
        
        this.recoil = stats.recoilAmount;
        playSound('injection_cannon_shoot', { 
            volume: this.soundVolume, 
            pitch: this.soundPitchBase + (Math.random() * this.soundPitchVariance * 2) - this.soundPitchVariance
        });

        // No shell ejection for this weapon
        
        const muzzleDist = this.owner.radius + this.width - this.recoil;
        const projX = this.owner.x + Math.cos(angle) * muzzleDist;
        const projY = this.owner.y + Math.sin(angle) * muzzleDist;

        const maxSpread = Math.PI / 18; // 10 degrees max spread
        const spreadAmount = (1 - Math.min(1, stats.accuracy)) * maxSpread;
        const projectileAngle = angle + (Math.random() - 0.5) * spreadAmount;
        
        const projectileOptions = {
            radius: 3,
            bulletSize: 1.2,
                        damage: 0, // Syringe itself does no damage, only the effect does.
            speed: 30,
            weaponName: this.name,
            owner: this.owner,
            sticksToTarget: true,
        };

        if (this.currentEffectMode === 'zombify') {
            projectileOptions.onHitEffect = 'zombify';
            projectileOptions.color = '#2ecc71';
        } else if (this.currentEffectMode === 'hemorrhage') {
                        const hemorrhageEffect = {
                                bleedChance: 1.0,
                                bleedDps: 15,
            };
            projectileOptions.bleedChance = hemorrhageEffect.bleedChance;
            projectileOptions.bleedDps = hemorrhageEffect.bleedDps;
            projectileOptions.color = '#cc0000';
        }
        
        projectiles.push(new Projectile(projX, projY, projectileAngle, {
            ...projectileOptions,
            onHitEffect: projectileOptions.onHitEffect, // Ensure it's passed correctly
        }));
    }

    draw(ctx) {
        if (!this.owner) return;
        
        const gunX = this.owner.radius - this.recoil;
        const gunY = -this.height / 2;

        const bodyColor = this.color;
        const barrelColor = '#666';
        const canisterColor = 'rgba(150, 255, 150, 0.4)';
        const liquidColor = '#2ecc71';

        // Main Body
        ctx.fillStyle = bodyColor;
        ctx.fillRect(gunX, gunY, this.width * 0.8, this.height);
        
        // Barrel
        ctx.fillStyle = barrelColor;
        ctx.fillRect(gunX + this.width * 0.8, gunY + this.height/2 - 2, this.width * 0.2, 4);

        // Glass Canister on top
        const canisterWidth = this.width * 0.5;
        const canisterHeight = this.height * 0.8;
        ctx.fillStyle = canisterColor;
        ctx.fillRect(gunX + 10, gunY - canisterHeight - 2, canisterWidth, canisterHeight);
        ctx.strokeStyle = '#aaffaa';
        ctx.lineWidth = 1;
        ctx.strokeRect(gunX + 10, gunY - canisterHeight - 2, canisterWidth, canisterHeight);

        // Green liquid inside
        ctx.fillStyle = liquidColor;
        const liquidFill = (this.ammo / this.magSize);
        ctx.fillRect(gunX + 10, gunY - canisterHeight - 2 + (canisterHeight * (1 - liquidFill)), canisterWidth, canisterHeight * liquidFill);
    }
}