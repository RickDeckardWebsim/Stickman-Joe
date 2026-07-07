export class DeadDrop {
    constructor(x, y, type = 'green') { // Default to green
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 30;
        this.radius = 50; // Interaction radius
        this.isOpened = false;
        this.bob = Math.random() * Math.PI * 2;
        this.type = type;
        this.loot = this.generateLoot();

        switch(type) {
            case 'medical':
                this.color = '#e0e0e0'; // white-ish
                this.glowColor = 'rgba(255, 100, 100, 0.4)';
                this.promptText = "MEDICAL CACHE";
                break;
            case 'purple': // attachments
                this.color = '#5e3d7e';
                this.glowColor = 'rgba(150, 100, 255, 0.3)';
                this.promptText = "ATTACHMENT CACHE";
                break;
            case 'silver': // guns
                this.color = '#a0a0a0';
                this.glowColor = 'rgba(200, 200, 200, 0.3)';
                this.promptText = "WEAPON CACHE";
                break;
            case 'gold': // experimental
                this.color = '#b08d00';
                this.glowColor = 'rgba(255, 215, 0, 0.4)';
                this.promptText = "EXPERIMENTAL CACHE";
                break;
            case 'green': // ammo
            default:
                this.color = '#4a5c3a'; // military green
                this.glowColor = 'rgba(100, 255, 100, 0.3)';
                this.promptText = "AMMO CACHE";
                break;
        }
    }

    generateLoot() {
        const loot = [];
        let lootCount;

                const grenadeChance = 0.4; 
                const minGrenades = 1;
                const maxGrenades = 3;
        
        switch (this.type) {
            case 'medical':
                lootCount = Math.floor(Math.random() * 3) + 2; // 2-4 medical items
                for (let i = 0; i < lootCount; i++) {
                    if (Math.random() < 0.5) {
                        loot.push({ type: 'medkit' });
                    } else {
                        loot.push({ type: 'armor' });
                    }
                }
                break;
            case 'purple': // attachments
                lootCount = Math.floor(Math.random() * 3) + 2; // 2-4 attachments
                for (let i = 0; i < lootCount; i++) {
                    loot.push({ type: 'attachment', experimental: false });
                }
                break;
            
            case 'silver': // guns
                lootCount = Math.floor(Math.random() * 2) + 1; // 1-2 guns
                for (let i = 0; i < lootCount; i++) {
                    const weaponTypes = ['Rifle', 'Pistol', 'Shotgun', 'Injection Cannon'];
                    const weaponType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
                    loot.push({ type: 'weapon', weaponType });
                }
                break;

            case 'gold': // experimental
                lootCount = Math.floor(Math.random() * 2) + 1; // 1-2 experimental attachments
                for (let i = 0; i < lootCount; i++) {
                    loot.push({ type: 'attachment', experimental: true });
                }
                break;
            
            case 'green': // ammo
            default:
                lootCount = Math.floor(Math.random() * 3) + 2; // 2-4 ammo packs
                for (let i = 0; i < lootCount; i++) {
                    const weaponTypes = ['Rifle', 'Pistol', 'Shotgun', 'Injection Cannon', 'LMG'];
                    const weaponType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
                    const amount = Math.floor(Math.random() * 60) + 40; // 40-100 rounds
                    loot.push({ type: 'ammo', weaponType, amount });
                }
                break;
        }
        
        // Add grenades to any type of cache
        if (Math.random() < grenadeChance) {
                        const proceduralChance = 0.5;
            if (Math.random() < proceduralChance) {
                loot.push({ type: 'procedural_throwable' });
            } else {
                const amount = Math.floor(Math.random() * (maxGrenades - minGrenades + 1)) + minGrenades;
                loot.push({ type: 'grenade', amount });
            }
        }
        
        return loot;
    }

    update(player, input) {
        this.bob += 0.03;
        
        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        if (dist < this.radius + player.radius && !this.isOpened) {
            if (input.justPressed.has('e')) {
                this.open(player);
                return true; // Signal to remove from world
            }
        }
        return false;
    }

    open(player) {
        this.isOpened = true;
        
        // Import classes dynamically for loot spawning
        import('./weapon.js').then(weaponModule => {
            import('./pistol.js').then(pistolModule => {
                import('./rifle.js').then(rifleModule => {
                    import('./shotgun.js').then(shotgunModule => {
                        import('./injection-cannon.js').then(injectionCannonModule => {
                            import('./lmg.js').then(lmgModule => {
                                import('./medkit.js').then(medkitModule => {
                                    import('./pickup.js').then(pickupModule => {
                                        import('./throwable.js').then(throwableModule => {
                                            this.spawnLoot(player, {
                                                ...weaponModule,
                                                ...pistolModule,
                                                ...rifleModule,
                                                ...shotgunModule,
                                                ...injectionCannonModule,
                                                ...lmgModule,
                                                ...medkitModule,
                                                ...pickupModule,
                                                ...throwableModule,
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    spawnLoot(player, classes) {
        import('./world.js').then(worldModule => {
            import('./currency.js').then(currencyModule => {
                const { pickups } = worldModule;
                const { MoneyPickup, MoneyWallet } = currencyModule;
                
                for (const item of this.loot) {
                    const offsetX = (Math.random() - 0.5) * 80;
                    const offsetY = (Math.random() - 0.5) * 80;
                    const spawnX = this.x + offsetX;
                    const spawnY = this.y + offsetY;
                    
                    switch (item.type) {
                        case 'weapon':
                            let weaponClass = null;
                            if (item.weaponType === 'Rifle') weaponClass = classes.Rifle;
                            else if (item.weaponType === 'Pistol') weaponClass = classes.Pistol;
                            else if (item.weaponType === 'Shotgun') weaponClass = classes.Shotgun;
                            else if (item.weaponType === 'Injection Cannon') weaponClass = classes.InjectionCannon;
                            else if (item.weaponType === 'LMG') weaponClass = classes.LMG;
                            
                            if (weaponClass) {
                                const weaponPickup = new classes.default(spawnX, spawnY, weaponClass, player);
                                
                                // Ensure the weapon instance is properly created before adding attachments
                                if (weaponPickup.itemInstance && weaponPickup.itemInstance.modSlots) {
                                    // Add random attachments to the weapon
                                    this.addRandomAttachments(weaponPickup.itemInstance, classes);
                                }
                                
                                pickups.push(weaponPickup);
                            }
                            break;
                            
                        case 'ammo':
                            pickups.push(new classes.AmmoPickup(spawnX, spawnY, item.weaponType, item.amount));
                            break;
                            
                        case 'attachment':
                            const attachment = classes.generateRandomAttachment(item.experimental);
                            pickups.push(new classes.AttachmentPickup(spawnX, spawnY, attachment));
                            break;
                            
                        case 'medkit':
                            pickups.push(new classes.default(spawnX, spawnY, classes.Medkit, player));
                            break;
                            
                        case 'armor':
                            import('./medkit.js').then(medkitModule => {
                                const { Armor } = medkitModule;
                                pickups.push(new classes.default(spawnX, spawnY, Armor, player));
                            });
                            break;
                            
                        case 'money':
                            pickups.push(new MoneyPickup(spawnX, spawnY, item.amount));
                            break;
                        case 'grenade':
                            const grenadePickup = new classes.default(spawnX, spawnY, classes.Grenade, player);
                            if (grenadePickup.itemInstance) {
                                grenadePickup.itemInstance.ammo = item.amount;
                            }
                            pickups.push(grenadePickup);
                            break;
                        case 'procedural_throwable':
                            const throwableData = classes.generateProceduralThrowable();
                            pickups.push(new classes.ThrowablePickup(spawnX, spawnY, throwableData, player));
                            break;
                    }
                }
            });
        });
    }

    addRandomAttachments(weapon, classes) {
        if (!weapon.modSlots || !classes.generateRandomAttachment) {
            console.warn('Cannot add attachments: missing modSlots or generateRandomAttachment function');
            return;
        }
        
        // Ensure attachments array is properly initialized
        if (!weapon.attachments) {
            weapon.attachments = new Array(weapon.modSlots.length).fill(null);
        }
        
        // Guarantee at least 1 attachment, but can have more (30-70% of available slots)
        const minSlots = Math.max(1, Math.floor(weapon.modSlots.length * 0.3));
        const maxSlots = Math.max(minSlots, Math.floor(weapon.modSlots.length * 0.7));
        const slotsToFill = Math.floor(Math.random() * (maxSlots - minSlots + 1)) + minSlots;
        
        // Randomly select which slots to fill
        const availableSlots = [...Array(weapon.modSlots.length).keys()];
        const slotsToModify = [];
        
        for (let i = 0; i < slotsToFill; i++) {
            if (availableSlots.length === 0) break;
            const randomIndex = Math.floor(Math.random() * availableSlots.length);
            slotsToModify.push(availableSlots.splice(randomIndex, 1)[0]);
        }
        
        // Fill selected slots with compatible attachments
        let attachmentsAdded = 0;
        for (const slotIndex of slotsToModify) {
            const slotType = weapon.modSlots[slotIndex];
            let attempts = 0;
            
            // Try to generate a compatible attachment (max 20 attempts for better success rate)
            while (attempts < 20) {
                const attachment = classes.generateRandomAttachment();
                
                // Check if attachment is compatible with this slot
                const isCompatible = attachment.type === slotType || 
                                   attachment.type === 'experimental' ||
                                   slotType === 'rail';
                
                if (isCompatible) {
                    const success = weapon.attachMod(attachment, slotIndex);
                    if (success) {
                        attachmentsAdded++;
                        console.log(`Dead Drop: Successfully attached ${attachment.name} (${attachment.type}) to ${weapon.name} slot ${slotIndex} (${slotType})`);
                        break;
                    }
                }
                attempts++;
            }
            
            if (attempts >= 20) {
                console.log(`Dead Drop: Failed to find compatible attachment for ${weapon.name} slot ${slotIndex} (${slotType}) after 20 attempts`);
            }
        }
        
        // Fallback: If no attachments were added, force add at least one to any compatible slot
        if (attachmentsAdded === 0) {
            console.log(`Dead Drop: No attachments added, forcing at least one...`);
            for (let slotIndex = 0; slotIndex < weapon.modSlots.length; slotIndex++) {
                if (weapon.attachments[slotIndex] !== null) continue; // Skip already filled slots
                
                const slotType = weapon.modSlots[slotIndex];
                let attempts = 0;
                
                while (attempts < 50) { // More attempts for fallback
                    const attachment = classes.generateRandomAttachment();
                    
                    const isCompatible = attachment.type === slotType || 
                                       attachment.type === 'experimental' ||
                                       slotType === 'rail';
                    
                    if (isCompatible) {
                        const success = weapon.attachMod(attachment, slotIndex);
                        if (success) {
                            attachmentsAdded++;
                            console.log(`Dead Drop: Fallback successfully attached ${attachment.name} (${attachment.type}) to ${weapon.name} slot ${slotIndex} (${slotType})`);
                            break;
                        }
                    }
                    attempts++;
                }
                
                if (attachmentsAdded > 0) break; // Stop once we've added at least one
            }
        }
        
        console.log(`Dead Drop: Added ${attachmentsAdded}/${slotsToModify.length} attachments to ${weapon.name}`);
    }

    draw(ctx, player) {
        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        const bobOffset = Math.sin(this.bob) * 3;
        
        // Glow effect
        ctx.fillStyle = this.glowColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobOffset, this.width * 0.8, 0, Math.PI * 2);
        ctx.fill();
        
        // Main box
        ctx.save();
        ctx.translate(this.x, this.y + bobOffset);
        
        // Box shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(-this.width / 2 + 2, -this.height / 2 + 2, this.width, this.height);
        
        // Box body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // Box outline
        ctx.strokeStyle = '#2a3c1a';
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // Metal corner reinforcements
        ctx.fillStyle = '#666';
        const cornerSize = 6;
        // Top-left
        ctx.fillRect(-this.width / 2, -this.height / 2, cornerSize, cornerSize);
        // Top-right
        ctx.fillRect(this.width / 2 - cornerSize, -this.height / 2, cornerSize, cornerSize);
        // Bottom-left
        ctx.fillRect(-this.width / 2, this.height / 2 - cornerSize, cornerSize, cornerSize);
        // Bottom-right
        ctx.fillRect(this.width / 2 - cornerSize, this.height / 2 - cornerSize, cornerSize, cornerSize);
        
        // Lock mechanism
        ctx.fillStyle = '#333';
        ctx.fillRect(-6, -3, 12, 6);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(-6, -3, 12, 6);
        
        ctx.restore();
        
        // Interaction prompt
        if (dist < this.radius + player.radius && !this.isOpened) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 4;
            ctx.fillText("Press 'E' to open", this.x, this.y + this.height + 20);
            ctx.fillText(this.promptText, this.x, this.y + this.height + 35);
            ctx.shadowBlur = 0;
        }
    }
}