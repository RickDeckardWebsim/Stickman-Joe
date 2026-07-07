import { MoneyWallet } from './currency.js';

class SafehouseStash {
    constructor() {
        this.stash = new Array(124).fill(null); // Expanded stash
        this.loadFromStorage();
    }

    saveToStorage() {
        try {
            const serializedStash = this.stash.map(item => {
                if (!item) return null;
                
                // Serialize the item with all its properties
                const serialized = {
                    className: item.constructor.name,
                    data: {}
                };

                // Copy all enumerable properties
                for (const key in item) {
                    if (item.hasOwnProperty(key)) {
                        const value = item[key];
                        
                        // Handle special cases
                        if (key === 'attachments' && Array.isArray(value)) {
                            serialized.data[key] = value.map(attachment => {
                                if (!attachment) return null;
                                return {
                                    className: attachment.constructor.name,
                                    name: attachment.name,
                                    type: attachment.type,
                                    modifiers: attachment.modifiers,
                                    description: attachment.description,
                                    icon: attachment.icon
                                };
                            });
                        } else if (typeof value !== 'function' && key !== 'owner') {
                            serialized.data[key] = value;
                        }
                    }
                }

                return serialized;
            });

            localStorage.setItem('safehouse_stash', JSON.stringify(serializedStash));
        } catch (error) {
            console.error('Failed to save stash:', error);
        }
    }

    async loadFromStorage() {
        try {
            const saved = localStorage.getItem('safehouse_stash');
            if (!saved) return;

            const serializedStash = JSON.parse(saved);

            // Use Promise.all to load all modules concurrently and correctly
            const [
                weaponModule,
                pistolModule,
                rifleModule,
                shotgunModule,
                injectionCannonModule,
                medkitModule,
                currencyModule,
                pickupModule,
            ] = await Promise.all([
                import('./weapon.js'),
                import('./pistol.js'),
                import('./rifle.js'),
                import('./shotgun.js'),
                import('./injection-cannon.js'),
                import('./medkit.js'),
                import('./currency.js'),
                import('./pickup.js'),
            ]);

            // Combine all exports into a single object for deserialization
            const classes = {
                ...weaponModule,
                ...pistolModule,
                ...rifleModule,
                ...shotgunModule,
                ...injectionCannonModule,
                ...medkitModule,
                ...currencyModule,
                ...pickupModule,
            };
            
            this.deserializeStash(serializedStash, classes);

        } catch (error) {
            console.error('Failed to load stash:', error);
        }
    }

    deserializeStash(serializedStash, classes) {
        this.stash = serializedStash.map(serialized => {
            if (!serialized) return null;

            const ItemClass = classes[serialized.className];
            if (!ItemClass) {
                console.warn(`Unknown class: ${serialized.className}`);
                return null;
            }

            // Create item instance
            let item;
            if (serialized.className === 'MoneyWallet') {
                item = new ItemClass();
            } else {
                item = new ItemClass(null); // No owner for stashed items
            }

            // Restore properties
            for (const key in serialized.data) {
                if (key === 'attachments' && Array.isArray(serialized.data[key])) {
                    item[key] = serialized.data[key].map(attachmentData => {
                        if (!attachmentData) return null;
                        
                        const AttachmentClass = classes.Attachment;
                        if (!AttachmentClass) return null;
                        
                        return new AttachmentClass(
                            attachmentData.name,
                            attachmentData.type,
                            attachmentData.modifiers,
                            attachmentData.description
                        );
                    });
                } else {
                    item[key] = serialized.data[key];
                }
            }

            return item;
        });
    }

    addItem(item) {
        const emptySlot = this.stash.findIndex(slot => slot === null);
        if (emptySlot !== -1) {
            // Remove owner reference when stashing
            if (item.owner) {
                item.owner = null;
            }
            this.stash[emptySlot] = item;
            this.saveToStorage();
            return true;
        }
        return false;
    }

    removeItem(index) {
        if (index >= 0 && index < this.stash.length && this.stash[index]) {
            const item = this.stash[index];
            this.stash[index] = null;
            this.saveToStorage();
            return item;
        }
        return null;
    }

    getItem(index) {
        return this.stash[index] || null;
    }
}

export class Safehouse {
    constructor(building) {
        this.building = building;
        this.interactionRadius = 50; // Reduced from 100 since sign is smaller
        this.stash = new SafehouseStash();
        this.isUIOpen = false;
        
        // Position sign outside the building (in front of it)
        this.sign = {
            x: building.x + building.width / 2,
            y: building.y + building.height + 20, // 20 pixels below building
            width: 60,
            height: 30
        };
    }

    canInteract(player) {
        const signCenterX = this.sign.x;
        const signCenterY = this.sign.y;
        const dist = Math.hypot(player.x - signCenterX, player.y - signCenterY);
        return dist < this.interactionRadius;
    }

    toggleUI() {
        this.isUIOpen = !this.isUIOpen;
    }

    transferToStash(player, inventoryIndex) {
        const item = player.inventory[inventoryIndex];
        if (!item) return false;

        if (this.stash.addItem(item)) {
            player.inventory[inventoryIndex] = null;
            return true;
        }
        return false;
    }

    transferToInventory(player, stashIndex) {
        const item = this.stash.getItem(stashIndex);
        if (!item) return false;

        // Restore owner when taking from stash
        if (item.owner !== undefined) {
            item.owner = player;
        }

        if (player.addItemToInventory(item)) {
            this.stash.removeItem(stashIndex);
            return true;
        }
        return false;
    }
}

export let safehouse = null;

export function initializeSafehouse(city) {
    const safehouseBuilding = city.buildings.find(b => b.isSafehouse);
    if (safehouseBuilding) {
        safehouse = new Safehouse(safehouseBuilding);
    }
}