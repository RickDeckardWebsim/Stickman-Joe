import { Weapon } from './weapon.js';

export class Rifle extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = 'Rifle';
        this.icon = './rifle_icon.png';
        this.width = 52;
        this.height = 10;
        this.color = '#383838';
        
        /* @tweakable The amount of kickback the weapon has when firing. */
        this.recoilAmount = 10;

        /* @tweakable The time in milliseconds between each shot. */
        this.fireRate = 150; // ms between shots
        this.lastShotTime = 0;
        this.lastMousePos = { x: 0, y: 0 };
        
        // Ammo & Reloading
        /* @tweakable The number of bullets in a full magazine. */
        this.magSize = 15;
        this.ammo = 15;
        /* @tweakable The maximum number of bullets carried in reserve. */
        this.reserveAmmo = 60;
        /* @tweakable The time in milliseconds to reload the weapon. */
        this.reloadTime = 1250; // ms
        
        this.isReloading = false;
        this.reloadStartTime = 0;
        this.reloadAnimProgress = 0;
        
        this.gripPoints = { backHand: { x: 10, y: 0 }, frontHand: { x: 30, y: 0 } };
        this.shellSize = { width: 3, height: 6 };
        this.soundVolume = 0.2;
        this.soundPitchBase = 0.9;
        this.soundPitchVariance = 0.1;
        this.ejectionPortOffset = { x: 15, y: -(this.height / 2 + 2) };
        this.headshotChance = 0.15;
        this.accuracy = 0.85; // Good accuracy for rifle
        this.magWellPoint = { x: 22, y: 3 }; // Position of the magazine well for reload animation
        
        // Fire modes
        this.availableFireModes = ['auto', 'burst', 'semi'];
        this.fireMode = 'auto';
        this.burstSize = 3;

        // 6 mod slots for rifle
        this.modSlots = ['receiver', 'barrel', 'magazine', 'sight', 'muzzle', 'grip', 'stock', 'ammo', 'rail'];
        this.attachments = new Array(this.modSlots.length).fill(null);
        
        // Magazine options for visual magazine drops
        this.magazineOptions = { width: 6, height: 20, color: '#222' };

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
        
        // Magazine — slides out during reload
        const magState = this._getMagDrawState();
        if (magState.visible) {
            const magWidth = 6;
            const magHeight = 12;
            ctx.fillStyle = magazineColor;
            ctx.fillRect(gunX + stockWidth + 8, gunY + bodyHeight - 2 + magState.offsetY, magWidth, magHeight);
        }
    }
}