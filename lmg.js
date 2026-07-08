import { Weapon } from './weapon.js';

export class LMG extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = 'LMG';
        this.icon = './lmg_icon.png';
        this.width = 65;
        this.height = 14;
        this.color = '#4a4a4a';

        /* @tweakable The amount of kickback the weapon has when firing. */
        this.recoilAmount = 12;

        /* @tweakable The time in milliseconds between each shot. */
        this.fireRate = 120; // Fast firing

        /* @tweakable The number of bullets in a full magazine. */
        this.magSize = 250;
        this.ammo = 250;

        /* @tweakable The maximum number of bullets carried in reserve. */
        this.reserveAmmo = 500;

        /* @tweakable The time in milliseconds to reload the weapon. */
        this.reloadTime = 4500; // Long reload for a box mag
        
        this.isReloading = false;
        this.reloadStartTime = 0;
        this.reloadAnimProgress = 0;
        
        this.gripPoints = { backHand: { x: 15, y: 0 }, frontHand: { x: 40, y: 0 } };
        this.shellSize = { width: 3.5, height: 7 }; // Larger shells
        this.soundVolume = 0.25;
        this.soundPitchBase = 0.7;
        this.soundPitchVariance = 0.08;
        this.ejectionPortOffset = { x: 25, y: -(this.height / 2 + 2) };
        this.headshotChance = 0.10;

        /* @tweakable The base accuracy of the weapon (1.0 is perfect, 0.0 is max spread). */
        this.accuracy = 0.70; // Less accurate than a rifle due to sustained fire
        
        this.magWellPoint = { x: 30, y: 8 };
        
        this.availableFireModes = ['auto'];
        this.fireMode = 'auto';

        // LMGs are heavily modifiable
        this.modSlots = ['receiver', 'barrel', 'magazine', 'sight', 'muzzle', 'stock', 'ammo', 'grip', 'rail'];
        this.attachments = new Array(this.modSlots.length).fill(null);
        
        this.magazineOptions = { width: 20, height: 25, color: '#4a694a' }; // Green box mag
    }

    draw(ctx) {
        if (!this.owner) return;
        
        const gunX = this.owner.radius - this.recoil;
        const gunY = -this.height / 2;

        const barrelColor = '#555';
        const stockColor = '#282828';
        const magazineColor = '#4a694a'; // Olive green

        // Stock
        const stockWidth = 15;
        const stockHeight = 12;
        ctx.fillStyle = stockColor;
        ctx.fillRect(gunX, gunY + (this.height - stockHeight) / 2, stockWidth, stockHeight);
        
        // Body (Receiver)
        const bodyWidth = 30;
        const bodyHeight = this.height;
        ctx.fillStyle = this.color;
        ctx.fillRect(gunX + stockWidth, gunY, bodyWidth, bodyHeight);

        // Barrel
        const barrelWidth = 20;
        const barrelHeight = 6;
        ctx.fillStyle = barrelColor;
        ctx.fillRect(gunX + stockWidth + bodyWidth, gunY + (this.height - barrelHeight) / 2, barrelWidth, barrelHeight);
        
        // Green Box Magazine — slides out during reload
        const magState = this._getMagDrawState();
        if (magState.visible) {
            const magWidth = 20;
            const magHeight = 25;
            ctx.fillStyle = magazineColor;
            ctx.fillRect(gunX + stockWidth + 5, gunY + bodyHeight - 5 + magState.offsetY, magWidth, magHeight);
        }
        
        // Bipod (folded)
        ctx.fillStyle = '#222';
        ctx.fillRect(gunX + stockWidth + bodyWidth - 5, gunY + (this.height - 4) / 2, 8, 4);
    }
}

// End of the plan