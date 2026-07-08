import { Weapon } from './weapon.js';

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
        this.magWellPoint = { x: 8, y: 0 }; // Position of the magazine well for reload animation
        
        // Fire modes
        this.availableFireModes = ['semi', 'burst'];
        this.fireMode = 'semi';
        this.burstSize = 4;

        // 5 mod slots for pistol + rail
        this.modSlots = ['receiver', 'barrel', 'magazine', 'sight', 'muzzle', 'grip', 'ammo', 'rail'];
        this.attachments = new Array(this.modSlots.length).fill(null);
        
        // Magazine options for visual magazine drops
        this.magazineOptions = { width: 4, height: 15, color: '#333' };
    }

    draw(ctx) {
        if (!this.owner) return; // Guard against null owner
        
        const gunX = this.owner.radius - this.recoil;
        const gunY = -this.height / 2;

        const slideColor = '#4a4a4a';
        const gripColor = this.color;

        // Grip (doubles as magazine) — slides out during reload
        const gripWidth = 10;
        const gripHeight = this.height;
        const magState = this._getMagDrawState();
        if (magState.visible) {
            ctx.fillStyle = gripColor;
            ctx.fillRect(gunX, gunY + magState.offsetY, gripWidth, gripHeight);
        }
        
        // Slide
        const slideWidth = 20; // smaller than total width
        const slideHeight = 8;
        ctx.fillStyle = slideColor;
        ctx.fillRect(gunX + gripWidth - 2, gunY + (gripHeight - slideHeight) / 2, slideWidth, slideHeight);
    }
}