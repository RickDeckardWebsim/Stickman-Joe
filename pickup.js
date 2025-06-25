import { Grenade, ProceduralThrowable } from './weapon.js';

let pickupImages = {};

function getPickupImage(src) {
    if (!pickupImages[src]) {
        const img = new Image();
        img.src = src;
        pickupImages[src] = img;
    }
    return pickupImages[src];
}

export default class ItemPickup {
    constructor(x, y, itemClass, player) {
        this.x = x;
        this.y = y;
        this.itemClass = itemClass;
        this.itemInstance = new itemClass(player);
        this.radius = 25;
        this.bob = Math.random() * Math.PI * 2;
    }

    update(player, input) {
        this.bob += 0.05;

        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        if (dist < this.radius + player.radius) {
            if (input.justPressed.has('e')) {
                // Use the existing item instance instead of creating a new one
                const itemToAdd = this.itemInstance; 
                itemToAdd.owner = player; // Ensure owner is correctly set to player
                const success = player.addItemToInventory(itemToAdd);
                if (success) {
                    return true;
                }
            }
        }
        return false;
    }

    draw(ctx, player) {
        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        const bobOffset = Math.sin(this.bob) * 5;

        // Glow
        ctx.fillStyle = 'rgba(255, 255, 100, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobOffset, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Icon
        const img = getPickupImage(this.itemInstance.icon);
        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, this.x - 20, this.y - 20 + bobOffset, 40, 40);
        }

        // Interaction Prompt
        if (dist < this.radius + player.radius) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("Press 'E' to pick up", this.x, this.y + this.radius + 20);
            ctx.font = '12px sans-serif';
            ctx.fillText(this.itemInstance.name, this.x, this.y + this.radius + 35);
        }
    }
}

export class AmmoPickup {
    constructor(x, y, weaponType, amount) {
        this.x = x;
        this.y = y;
        this.weaponType = weaponType; // 'Rifle', 'Pistol', 'Shotgun', 'BeamRifle'
        this.amount = amount;
        this.radius = 25;
        this.bob = Math.random() * Math.PI * 2;
        this.name = `${weaponType} Ammo (${amount})`;
        
        // Set icon based on weapon type
        const iconMap = {
            'Rifle': './rifle_icon.png',
            'Pistol': './pistol_ammo.png',
            'Shotgun': './shotgun_ammo.png',
            'BeamRifle': './beamrifle_ammo.png',
            'Injection Cannon': './syringe_ammo.png',
            'LMG': './lmg_ammo.png',
        };
        this.icon = iconMap[weaponType] || './rifle_icon.png';
    }

    update(player, input) {
        this.bob += 0.05;

        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        if (dist < this.radius + player.radius) {
            if (input.justPressed.has('e')) {
                // Find matching weapon in player's inventory
                const weapon = player.inventory.find(item => item && item.name === this.weaponType);
                if (weapon) {
                    const ammoToAdd = Math.min(weapon.maxReserveAmmo - weapon.reserveAmmo, this.amount);
                    weapon.reserveAmmo += ammoToAdd;
                    
                    // If there's leftover ammo, reduce the pickup amount
                    this.amount -= ammoToAdd;
                    
                    // If all ammo was used, remove the pickup
                    if (this.amount <= 0) {
                        return true;
                    }
                    
                    // Update the name to reflect remaining amount
                    this.name = `${this.weaponType} Ammo (${this.amount})`;
                    return false; // Don't remove yet, still has ammo
                }
                
                // If no matching weapon, try to add to inventory as a sellable item
                const success = player.addItemToInventory(this);
                return success;
            }
        }
        return false;
    }

    draw(ctx, player) {
        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        const bobOffset = Math.sin(this.bob) * 5;

        // Glow
        ctx.fillStyle = 'rgba(255, 255, 100, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobOffset, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Icon
        const img = getPickupImage(this.icon);
        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, this.x - 20, this.y - 20 + bobOffset, 40, 40);
        }

        // Amount text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(`x${this.amount}`, this.x, this.y + 30 + bobOffset);
        ctx.shadowBlur = 0;

        // Interaction Prompt
        if (dist < this.radius + player.radius) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("Press 'E' to pick up", this.x, this.y + this.radius + 20);
            ctx.font = '12px sans-serif';
            ctx.fillText(this.name, this.x, this.y + this.radius + 35);
        }
    }
}

export class ThrowablePickup {
    constructor(x, y, throwableData, player) {
        this.x = x;
        this.y = y;
        this.itemInstance = new ProceduralThrowable(player, throwableData);
        this.radius = 25;
        this.bob = Math.random() * Math.PI * 2;
    }

    update(player, input) {
        this.bob += 0.05;

        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        if (dist < this.radius + player.radius) {
            if (input.justPressed.has('e')) {
                const itemToAdd = this.itemInstance; 
                itemToAdd.owner = player;
                const success = player.addItemToInventory(itemToAdd);
                if (success) {
                    return true;
                }
            }
        }
        return false;
    }

    draw(ctx, player) {
        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        const bobOffset = Math.sin(this.bob) * 5;

        // Glow
        ctx.fillStyle = 'rgba(150, 100, 255, 0.3)'; // Purple glow for procedural
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobOffset, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Icon
        const img = getPickupImage(this.itemInstance.icon);
        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, this.x - 20, this.y - 20 + bobOffset, 40, 40);
        }

        // Interaction Prompt
        if (dist < this.radius + player.radius) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("Press 'E' to pick up", this.x, this.y + this.radius + 20);
            ctx.font = '12px sans-serif';
            ctx.fillText(this.itemInstance.name, this.x, this.y + this.radius + 35);
        }
    }
}

export class AttachmentPickup {
    constructor(x, y, attachment) {
        this.x = x;
        this.y = y;
        this.attachment = attachment;
        this.radius = 25;
        this.bob = Math.random() * Math.PI * 2;
        this.name = attachment.name;
        this.icon = attachment.icon;
    }

    update(player, input) {
        this.bob += 0.05;

        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        if (dist < this.radius + player.radius) {
            if (input.justPressed.has('e')) {
                const success = player.addItemToInventory(this.attachment);
                if (success) {
                    return true;
                }
            }
        }
        return false;
    }

    draw(ctx, player) {
        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        const bobOffset = Math.sin(this.bob) * 5;

        // Glow with different color for attachments
        ctx.fillStyle = 'rgba(100, 255, 100, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobOffset, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Icon
        const img = getPickupImage(this.icon);
        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, this.x - 20, this.y - 20 + bobOffset, 40, 40);
        }

        // Interaction Prompt
        if (dist < this.radius + player.radius) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("Press 'E' to pick up", this.x, this.y + this.radius + 20);
            ctx.font = '12px sans-serif';
            ctx.fillText(this.attachment.name, this.x, this.y + this.radius + 35);
            ctx.font = '10px sans-serif';
            ctx.fillText(this.attachment.type.charAt(0).toUpperCase() + this.attachment.type.slice(1), this.x, this.y + this.radius + 48);
        }
    }
}