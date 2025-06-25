import { Weapon } from './weapon.js';
import { world, shells, projectiles } from './world.js';
import { Shell } from './shell.js';
import Projectile from './projectile.js';
import { playSound } from './audio.js';

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
        /* @tweakable The base number of pellets fired by the shotgun. */
        this.pelletCount = 8;
        /* @tweakable The base spread angle of the shotgun pellets, in radians. */
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
        this.magWellPoint = { x: 8, y: 0 }; // Position of the magazine well for reload animation
        
        // Fire modes
        this.availableFireModes = ['semi'];
        this.fireMode = 'semi';

        // 5 mod slots for shotgun + rail
        this.modSlots = ['receiver', 'barrel', 'magazine', 'sight', 'muzzle', 'choke', 'pump', 'ammo', 'rail'];
        this.attachments = new Array(this.modSlots.length).fill(null);
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
        const ammoNeeded = this.magSize - this.ammo;
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
        // Play pump sound shortly after the shot
        setTimeout(() => playSound('shotgun_pump', {volume: 0.4, pitch: 1.1 + (Math.random() - 0.5) * 0.2}), 200);

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
        const totalPellets = Math.round(stats.projectileCount);

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