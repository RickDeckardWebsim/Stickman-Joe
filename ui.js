import { MoneyWallet, EmptyCan } from './currency.js';
import { Grenade, Weapon, Attachment, ProceduralThrowable } from './weapon.js';
import { world } from './world.js';
import { Medkit } from './medkit.js';
import { playSound } from './audio.js';
import input from './input.js';
import { safehouse } from './safehouse.js';

let uiState = {
    inventoryVisible: false,
    mouseOver: false,
    draggedItemIndex: null,
    draggedItem: null,
    bodyStatusVisible: false,
    gunModVisible: false,
    inspectPanelVisible: false, // New state for inspect panel
    selectedWeapon: null,
    selectedWeaponIndex: null,
    contextMenuVisible: false,
    contextMenuX: 0,
    contextMenuY: 0,
    contextMenuTarget: null,
    stashVisible: false,
};

let uiContainer, hotbarContainer, inventoryPanel, restartButton, bodyStatusPanel, gunModPanel, inspectPanel, contextMenu;

export function toggleInventoryAndBodyStatus() {
    uiState.inventoryVisible = !uiState.inventoryVisible;
    uiState.bodyStatusVisible = uiState.inventoryVisible; // Link visibility

    // If we are closing the inventory, reset mouse state to prevent accidental firing.
    if (!uiState.inventoryVisible) {
        input.mouse.down = false;
    }
}

export function isInventoryOpen() {
    return uiState.inventoryVisible;
}

export function isMouseOverUI() {
    return uiState.mouseOver || uiState.gunModVisible || uiState.contextMenuVisible || uiState.inspectPanelVisible;
}

export function isDraggingItem() {
    return !!uiState.draggedItem;
}

function getSellPrice(item) {
    // Calculate sell price based on item type
    if (item instanceof Medkit) {
        return 175;
    }
    import('./medkit.js').then(medkitModule => {
        const { Armor } = medkitModule;
        if (item instanceof Armor) {
                        return 250;
        }
    });
    if (item instanceof Grenade) {
        return item.ammo * 125;
    }
    if (item instanceof EmptyCan) {
        return item.amount * item.sellValue;
    }
    if (item instanceof Attachment) {
        return 150; // Base price for attachments
    }
    if (item.name === 'Rifle') {
        return 400;
    }
    if (item.name === 'Pistol') {
        return 200;
    }
    if (item.name === 'Shotgun') {
        return 350;
    }
    // Handle ammo pickups
    if (item.weaponType) {
        return Math.floor(3 * item.amount);
    }
    return 10; // Default sell price
}

function canSellItem(item) {
    // Can't sell money wallet, and items must exist
    return item && !(item instanceof MoneyWallet);
}

function createBodyStatusPanel() {
    const panel = document.createElement('div');
    panel.id = 'body-status-panel';
    panel.innerHTML = `
        <div class="body-part-label">STATUS</div>
        <div class="body-part head" data-part="head"></div>
        <div class="body-part torso" data-part="torso"></div>
        <div class="body-part arm-left" data-part="leftArm"></div>
        <div class="body-part arm-right" data-part="rightArm"></div>
        <div class="body-part leg-left" data-part="leftLeg"></div>
        <div class="body-part leg-right" data-part="rightLeg"></div>
    `;
    
    panel.addEventListener('dragover', e => {
        // Only allow dropping if a medkit is being dragged
        if (uiState.draggedItem instanceof Medkit) {
            e.preventDefault();
            // Optional: add a visual cue
            panel.classList.add('drop-target');
        }
    });
    
    panel.addEventListener('dragleave', () => {
        panel.classList.remove('drop-target');
    });

    panel.addEventListener('drop', e => {
        e.preventDefault();
        panel.classList.remove('drop-target');
        const medkit = uiState.draggedItem;
        const player = world.player;
        if (!player || !(medkit instanceof Medkit)) return;

        const partElement = e.target.closest('.body-part');
        if (!partElement) return;

        const limbName = partElement.dataset.part;
        const result = player.useMedkit(limbName, medkit);

        if (result.success) {
            playSound('heal', { volume: 0.7 });
            
            // Consume medkit
            const fromIndex = uiState.draggedItemIndex;
            player.inventory[fromIndex] = null;
        } else {
            playSound('heal_fail', { volume: 0.5 });
            // TODO: show a message to the user, e.g. result.message
        }
        
        handleDragEnd(player);
    });

    return panel;
}

function createGunModPanel() {
    const panel = document.createElement('div');
    panel.id = 'gun-mod-panel';
    panel.innerHTML = `
        <div class="gun-mod-header">
            <h2 id="gun-mod-title">Weapon Modification</h2>
            <button class="gun-mod-close-button">&times;</button>
        </div>
        <div id="gun-mod-content">
            <div class="gun-mod-left-column">
                <div id="gun-mod-weapon-info"></div>
                <div id="gun-mod-stats-container"></div>
            </div>
            <div class="gun-mod-right-column">
                <h3>Modification Slots</h3>
                <div id="gun-mod-slots-container"></div>
            </div>
        </div>
    `;
    
    panel.querySelector('.gun-mod-close-button').onclick = () => {
        uiState.gunModVisible = false;
        updateUI(world.player);
    };
    
    panel.addEventListener('mouseover', () => uiState.mouseOver = true);
    panel.addEventListener('mouseout', () => uiState.mouseOver = false);
    
    return panel;
}

function createContextMenu() {
    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.cssText = `
        display: none;
        position: fixed;
        background-color: rgba(20,20,20,0.95);
        border: 1px solid #555;
        border-radius: 4px;
        padding: 5px 0;
        z-index: 30;
        min-width: 120px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
    `;
    
    const inspectButton = document.createElement('div');
    inspectButton.textContent = 'Inspect';
    inspectButton.style.cssText = `
        padding: 8px 15px;
        color: white;
        cursor: pointer;
        font-family: sans-serif;
        font-size: 14px;
    `;
    inspectButton.onmouseover = () => inspectButton.style.backgroundColor = 'rgba(70,70,70,0.8)';
    inspectButton.onmouseout = () => inspectButton.style.backgroundColor = 'transparent';
    inspectButton.onclick = () => {
        if (uiState.contextMenuTarget) {
            const item = uiState.contextMenuTarget.item;
            if (item instanceof Weapon) {
                openGunModPanel(item, uiState.contextMenuTarget.index);
            } else if (item instanceof Attachment || item instanceof ProceduralThrowable) {
                openInspectPanel(item);
            }
        }
        hideContextMenu();
    };

    const equipArmorButton = document.createElement('div');
    equipArmorButton.textContent = 'Equip Armor';
    equipArmorButton.style.cssText = `
        padding: 8px 15px;
        color: white;
        cursor: pointer;
        font-family: sans-serif;
        font-size: 14px;
        border-top: 1px solid #555;
    `;
    equipArmorButton.onmouseover = () => equipArmorButton.style.backgroundColor = 'rgba(70,70,70,0.8)';
    equipArmorButton.onmouseout = () => equipArmorButton.style.backgroundColor = 'transparent';
    equipArmorButton.onclick = () => {
        if (uiState.contextMenuTarget) {
            equipArmor(uiState.contextMenuTarget.index);
        }
        hideContextMenu();
    };

    const sellButton = document.createElement('div');
    sellButton.textContent = 'Sell Item';
    sellButton.style.cssText = `
        padding: 8px 15px;
        color: white;
        cursor: pointer;
        font-family: sans-serif;
        font-size: 14px;
        border-top: 1px solid #555;
    `;
    sellButton.onmouseover = () => sellButton.style.backgroundColor = 'rgba(70,70,70,0.8)';
    sellButton.onmouseout = () => sellButton.style.backgroundColor = 'transparent';
    sellButton.onclick = () => {
        if (uiState.contextMenuTarget) {
            sellItem(uiState.contextMenuTarget.index);
        }
        hideContextMenu();
    };

    const moveButton = document.createElement('div');
    moveButton.textContent = 'Move to Inventory';
    moveButton.style.cssText = `
        padding: 8px 15px;
        color: white;
        cursor: pointer;
        font-family: sans-serif;
        font-size: 14px;
        border-top: 1px solid #555;
    `;
    moveButton.onmouseover = () => moveButton.style.backgroundColor = 'rgba(70,70,70,0.8)';
    moveButton.onmouseout = () => moveButton.style.backgroundColor = 'transparent';
    moveButton.onclick = () => {
        if (uiState.contextMenuTarget) {
            moveFromStashToInventory(uiState.contextMenuTarget.index);
        }
        hideContextMenu();
    };

    menu.addEventListener('mouseover', () => uiState.mouseOver = true);
    menu.addEventListener('mouseout', () => uiState.mouseOver = false);
    
    menu.appendChild(inspectButton);
    menu.appendChild(equipArmorButton);
    menu.appendChild(sellButton);
    menu.appendChild(moveButton);
    return menu;
}

function moveFromStashToInventory(stashIndex) {
    const player = world.player;
    if (!player || !safehouse) return;
    
    const success = safehouse.transferToInventory(player, stashIndex);
    if (success) {
        hideContextMenu(); // Hide context menu after successful transfer
        updateUI(player);
    }
}

function openInspectPanel(item) {
    uiState.inspectPanelVisible = true;
    updateInspectPanel(item);
    updateUI(world.player);
}

function updateInspectPanel(item) {
    if (!item) {
        uiState.inspectPanelVisible = false;
        return;
    }

    const nameEl = document.getElementById('inspect-item-name');
    const typeEl = document.getElementById('inspect-item-type');
    const descEl = document.getElementById('inspect-item-description');
    const iconDisplayEl = document.getElementById('inspect-icon-display');
    const iconImgEl = document.getElementById('inspect-icon-img');

    nameEl.textContent = item.name;
    iconImgEl.style.display = 'none';
    iconDisplayEl.style.display = 'none';
    iconDisplayEl.style.backgroundColor = '#333'; // Default

    if (item instanceof Attachment) {
        typeEl.textContent = `Type: ${item.type.charAt(0).toUpperCase() + item.type.slice(1)}`;
        descEl.innerHTML = generateAttachmentDescription(item);
        
        iconDisplayEl.style.display = 'flex';
        iconDisplayEl.textContent = item.type.charAt(0).toUpperCase();
        if (item.type === 'beam') {
            iconDisplayEl.style.backgroundColor = '#8e44ad';
        }
    } else if (item instanceof ProceduralThrowable) {
        typeEl.textContent = 'Type: Throwable';
        descEl.innerHTML = generateThrowableDescription(item);
        
        iconImgEl.src = item.icon;
        iconImgEl.style.display = 'block';
    } else {
        // Fallback for other item types if needed
        typeEl.textContent = `Type: Generic`;
        descEl.textContent = 'No detailed information available.';
        iconImgEl.src = item.icon;
        iconImgEl.style.display = 'block';
    }
}

function generateAttachmentDescription(attachment) {
    return generateDescriptionList(attachment.modifiers);
}

function generateThrowableDescription(throwable) {
    let html = '<h4>Effects:</h4><ul>';
    throwable.data.effects.forEach(effect => {
        const effectDetails = generateDescriptionList(effect);
        html += `<li><strong>${effect.type.replace(/_/g, ' ')}</strong>: ${effectDetails}</li>`;
    });
    html += '</ul>';
    html += `<p>Fuse Time: ${(throwable.data.fuseTime / 1000).toFixed(1)}s</p>`;
    if (throwable.data.sticksToEntities) {
        html += `<p style="color: #4CAF50;">Sticky</p>`;
    }
    return html;
}

function generateDescriptionList(modifiers) {
    /* @tweakable The number of decimal places to show for percentage-based stats in the inspect panel. */
    const inspectPanelDecimalPlaces = 1;
    let listHtml = '<ul>';
    Object.entries(modifiers).forEach(([key, value]) => {
        let text = '';
        const isGood = (val, positive) => positive ? val > (key === 'reloadSpeed' || key === 'accuracy' ? 1 : 0) : val < (key === 'fireRate' ? 0 : 1);
        const color = (val, positive) => isGood(val, positive) ? 'var(--inspect-good-color)' : 'var(--inspect-bad-color)';

        switch(key) {
            case 'damage': text = `<span style="color:${color(value, true)}">${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(inspectPanelDecimalPlaces)}% Damage</span>`; break;
            case 'fireRate': text = `<span style="color:${color(value, false)}">${value > 0 ? '+' : ''}${Math.round(value)}ms Fire Rate</span>`; break;
            case 'recoilReduction': text = `<span style="color:${color(value, true)}">-${(value * 100).toFixed(inspectPanelDecimalPlaces)}% Recoil</span>`; break;
            case 'accuracy': text = `<span style="color:${color(value, true)}">${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(inspectPanelDecimalPlaces)}% Accuracy</span>`; break;
            case 'projectileSpeed': text = `<span style="color:${color(value, true)}">${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(inspectPanelDecimalPlaces)}% Bullet Speed</span>`; break;
            case 'projectileCount': text = `<span style="color:${color(value, true)}">${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(inspectPanelDecimalPlaces)}% Projectiles</span>`; break;
            case 'headshotChance': text = `<span style="color:${color(value, true)}">+${(value * 100).toFixed(inspectPanelDecimalPlaces)}% Headshot Chance</span>`; break;
            case 'reloadSpeed': text = `<span style="color:${color(value, true)}">${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(inspectPanelDecimalPlaces)}% Reload Speed</span>`; break;
            case 'knockback': text = `<span style="color:${color(value, true)}">${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(inspectPanelDecimalPlaces)}% Knockback</span>`; break;
            case 'bulletSize': text = `<span>${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(inspectPanelDecimalPlaces)}% Bullet Size</span>`; break;
            case 'magSize': text = `<span style="color:${color(value, true)}">${value > 1 ? '+' : ''}${((value - 1) * 100).toFixed(inspectPanelDecimalPlaces)}% Magazine Size</span>`; break;
            case 'piercing': if(value) text = '<span>Piercing Bullets</span>'; break;
            case 'tracking': if(value) text = '<span>Homing Bullets</span>'; break;
            case 'bouncing': if(value) text = '<span>Bouncing Bullets</span>'; break;
            case 'splitOnHit': if(value) text = '<span>Bullets Fragment on Impact</span>'; break;
            case 'explodeOnHit': if(value) text = '<span>Rounds Explode on Impact</span>'; break;
            case 'radius': text = `<span>Radius: ${value.toFixed(0)}</span>`; break;
            case 'duration': text = `<span>Duration: ${(value / 1000).toFixed(1)}s</span>`; break;
            case 'strength': text = `<span>Strength: ${value.toFixed(1)}</span>`; break;
            case 'rotation': text = `<span>Rotation: ${value.toFixed(1)}</span>`; break;
            case 'damageType': text = `<span>Type: ${value}</span>`; break;
            case 'dismembermentChance': text = `<span>+${(value * 100).toFixed(0)}% Dismember Chance</span>`; break;
            case 'count': text = `<span>Count: ${Math.round(value)}</span>`; break;
            case 'entityType': text = `<span>Spawns: ${value.replace(/_/g, ' ')}</span>`; break;
            // Add other cases as needed
        }
        if (text) listHtml += `<li>${text}</li>`;
    });
    listHtml += '</ul>';
    return listHtml;
}

function sellItem(itemIndex) {
    const player = world.player;
    if (!player) return;
    
    const item = player.inventory[itemIndex];
    if (!canSellItem(item)) return;
    
    const sellPrice = getSellPrice(item);
    let wallet = player.inventory.find(item => item instanceof MoneyWallet);
    
    if (!wallet) {
        // Create a new wallet if none exists
        wallet = new MoneyWallet();
        wallet.amount = 0;
        
        // Find an empty slot to put the new wallet
        const emptySlot = player.inventory.findIndex(item => item === null);
        if (emptySlot !== -1) {
            player.inventory[emptySlot] = wallet;
        } else {
            // If no empty slots, replace the item being sold
            player.inventory[itemIndex] = wallet;
        }
    }
    
    wallet.amount += sellPrice;
    
    // Only set the item slot to null if we didn't replace it with the wallet
    if (player.inventory[itemIndex] !== wallet) {
        player.inventory[itemIndex] = null;
    }
    
    hideContextMenu(); // Hide context menu after selling
    // TODO: Play sell sound
    updateUI(player);
}

function equipArmor(itemIndex) {
    const player = world.player;
    if (!player) return;
    
    const item = player.inventory[itemIndex];
    import('./medkit.js').then(medkitModule => {
        const { Armor } = medkitModule;
        if (!(item instanceof Armor)) return;
        
                const replaceExisting = true;
        
        if (replaceExisting || player.armor === 0) {
            // Equip the armor
            player.armor = item.armorAmount;
            
            // Remove from inventory
            player.inventory[itemIndex] = null;
            
            hideContextMenu();
            updateUI(player);
        }
    });
}

function showContextMenu(x, y, item, itemIndex, isStash = false) {
    uiState.contextMenuVisible = true;
    uiState.contextMenuX = x;
    uiState.contextMenuY = y;
    uiState.contextMenuTarget = { item, index: itemIndex, isStash };
    
    const menu = document.getElementById('context-menu');
    const inspectBtn = menu.children[0];
    const equipArmorBtn = menu.children[1];
    const sellBtn = menu.children[2];
    const moveBtn = menu.children[3];
    
    // Check if the item is something we can inspect
    const canInspect = item instanceof Weapon || item instanceof Attachment || item instanceof ProceduralThrowable;

    // Check if the item is armor
    const player = world.player;
    const currentItem = isStash ? safehouse.stash.getItem(itemIndex) : player.inventory[itemIndex];
    let isArmor = false;
    
    import('./medkit.js').then(medkitModule => {
        const { Armor } = medkitModule;
        isArmor = currentItem instanceof Armor;
        
        if (isStash) {
            // Show only relevant buttons for stash items
            inspectBtn.style.display = canInspect ? 'block' : 'none';
            equipArmorBtn.style.display = 'none'; // Can't equip from stash directly
            sellBtn.style.display = 'none'; // Can't sell from stash
            moveBtn.style.display = 'block';
            
            // Adjust borders
            if (canInspect) {
                moveBtn.style.borderTop = '1px solid #555';
            } else {
                moveBtn.style.borderTop = 'none';
            }
        } else {
            // Show buttons for inventory items
            inspectBtn.style.display = canInspect ? 'block' : 'none';
            equipArmorBtn.style.display = isArmor ? 'block' : 'none';
            sellBtn.style.display = 'block';
            moveBtn.style.display = 'none';
            
            // Adjust borders
            let previousVisible = false;
            if (canInspect) {
                previousVisible = true;
            }
            if (isArmor) {
                equipArmorBtn.style.borderTop = previousVisible ? '1px solid #555' : 'none';
                previousVisible = true;
            }
            if (previousVisible) {
                sellBtn.style.borderTop = '1px solid #555';
            } else {
                sellBtn.style.borderTop = 'none';
            }
        }
    });
    
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function hideContextMenu() {
    uiState.contextMenuVisible = false;
    uiState.contextMenuTarget = null;
    const menu = document.getElementById('context-menu');
    menu.style.display = 'none';
}

function openGunModPanel(weapon, weaponIndex) {
    uiState.gunModVisible = true;
    uiState.selectedWeapon = weapon;
    uiState.selectedWeaponIndex = weaponIndex;
    updateGunModPanel();
    updateUI(world.player);
}

function updateGunModPanel() {
    if (!uiState.selectedWeapon) return;
    
    const weapon = uiState.selectedWeapon;
    const stats = weapon.getModifiedStats();
    
    // Update weapon info
    const weaponInfo = document.getElementById('gun-mod-weapon-info');
    weaponInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <img src="${weapon.icon}" style="width: 48px; height: 48px;">
            <div>
                <h3 style="margin: 0; color: white;">${weapon.name}</h3>
                <p style="margin: 5px 0 0 0; color: #aaa;">Modification Slots: ${weapon.modSlots.length}</p>
            </div>
        </div>
    `;
    
    // --- START: Round projectile count for display ---
    const displayedProjectileCount = Math.round(stats.projectileCount * 10) / 10; // Round to 1 decimal place
    // --- END: Round projectile count for display ---

    // Update stats - add beam-specific stats for beam rifles
    let statsHTML = `
        <h4 style="margin: 0 0 10px 0; color: #ccc;">Current Stats</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 14px;">
            <div>Damage: <span style="color: #4CAF50;">${Math.round(stats.damage)}</span></div>
            <div>Fire Rate: <span style="color: #4CAF50;">${Math.round(stats.fireRate)}ms</span></div>
            <div>Recoil: <span style="color: #4CAF50;">${Math.round(stats.recoilAmount)}</span></div>
            <div>Accuracy: <span style="color: #4CAF50;">${(stats.accuracy * 100).toFixed(0)}%</span></div>
            <div>Projectiles: <span style="color: #4CAF50;">${displayedProjectileCount}</span></div>
            <div>Speed: <span style="color: #4CAF50;">${Math.round(stats.projectileSpeed)}</span></div>
            <div>Headshot: <span style="color: #4CAF50;">${(stats.headshotChance * 100).toFixed(1)}%</span></div>
            <div>Piercing: <span style="color: #4CAF50;">${stats.piercing ? 'Yes' : 'No'}</span></div>`;
    
    // Add beam-specific stats for beam rifles
    if (weapon.name === 'Beam Rifle') {
        statsHTML += `
            <div>Beam Damage: <span style="color: #8e44ad;">${Math.round(stats.beamDamage)}</span></div>
            <div>Fire Damage: <span style="color: #e74c3c;">${Math.round(stats.fireDamage)}</span></div>
            <div>Beam Accuracy: <span style="color: #8e44ad;">${(stats.beamAccuracy * 100).toFixed(0)}%</span></div>
            <div>Beam Stability: <span style="color: #8e44ad;">${(stats.beamStability * 100).toFixed(0)}%</span></div>`;
    } else {
        statsHTML += `
            <div>Burst Size: <span style="color: #4CAF50;">${stats.burstSize || 'N/A'}</span></div>`;
    }
    
    statsHTML += `
            <div>Reload Speed: <span style="color: #4CAF50;">${(stats.reloadSpeed * 100).toFixed(0)}%</span></div>
        </div>`;
    
    const weaponStats = document.getElementById('gun-mod-stats-container');
    weaponStats.innerHTML = statsHTML;
    
    // --- START: Add fire mode selector ---
    const leftColumn = weaponStats.parentElement;

    // Remove old fire mode container if it exists
    const oldFireModeContainer = document.getElementById('gun-mod-fire-mode-container');
    if (oldFireModeContainer) {
        oldFireModeContainer.remove();
    }

    // Update fire modes if the weapon has more than one
    if (weapon.availableFireModes && weapon.availableFireModes.length > 1) {
        const fireModeContainer = document.createElement('div');
        fireModeContainer.id = 'gun-mod-fire-mode-container';
        fireModeContainer.style.marginTop = '15px';

        /* @tweakable The label for the fire mode selection section in the weapon mod panel. */
        const fireModeLabel = 'Fire Mode';
        fireModeContainer.innerHTML = `<h4 style="margin: 0 0 10px 0; color: #ccc;">${fireModeLabel}</h4>`;
        
        const fireModeButtons = document.createElement('div');
        fireModeButtons.style.cssText = `display: flex; gap: 10px; flex-wrap: wrap;`;

        weapon.availableFireModes.forEach(mode => {
            const button = document.createElement('button');
            button.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
            button.style.cssText = `
                padding: 5px 10px;
                font-size: 12px;
                font-weight: bold;
                color: white;
                background-color: #555;
                border: 1px solid #777;
                border-radius: 4px;
                cursor: pointer;
                text-transform: uppercase;
                transition: all 0.2s ease;
            `;
            if (mode === weapon.fireMode) {
                button.style.backgroundColor = '#4CAF50';
                button.style.borderColor = '#66BB6A';
            }
            button.onclick = () => {
                weapon.fireMode = mode;
                playSound('empty_click', { volume: 0.5, pitch: 1.5 }); // Use a clicky sound for feedback
                updateGunModPanel(); // Redraw panel to show active mode
            };
            fireModeButtons.appendChild(button);
        });

        fireModeContainer.appendChild(fireModeButtons);
        
        if (leftColumn) {
            leftColumn.appendChild(fireModeContainer);
        }
    }
    // --- END: Add fire mode selector ---

    // Update mod slots
    const modsContainer = document.getElementById('gun-mod-slots-container');
    modsContainer.innerHTML = '';
    
    weapon.modSlots.forEach((slotType, index) => {
        const slotDiv = document.createElement('div');
        slotDiv.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background-color: rgba(60,60,60,0.8);
            border-radius: 4px;
            border: 2px dashed #666;
            cursor: pointer;
        `;
        
        const slotLabel = document.createElement('span');
        slotLabel.textContent = slotType.charAt(0).toUpperCase() + slotType.slice(1);
        slotLabel.style.cssText = `
            min-width: 80px;
            color: #ccc;
            font-size: 14px;
        `;
        
        const attachment = weapon.attachments[index];
        if (attachment) {
            const attachmentDiv = document.createElement('div');
            attachmentDiv.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
                background-color: rgba(100,150,100,0.3);
                padding: 5px 8px;
                border-radius: 3px;
            `;
            
            const attachmentImg = document.createElement('div');
            attachmentImg.style.cssText = `
                width: 24px;
                height: 24px;
                background-color: #333;
                border: 1px solid #666;
                border-radius: 2px;
            `;
            
            const attachmentName = document.createElement('span');
            attachmentName.textContent = attachment.name;
            attachmentName.style.cssText = 'color: white; font-size: 13px;';
            
            const removeButton = document.createElement('button');
            removeButton.textContent = '×';
            removeButton.style.cssText = `
                background: rgba(200,50,50,0.8);
                border: none;
                color: white;
                width: 20px;
                height: 20px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
            `;
            removeButton.onclick = (e) => {
                e.stopPropagation();
                const removed = weapon.removeMod(index);
                if (removed) {
                    // Try to add back to inventory
                    const player = world.player;
                    const emptySlot = player.inventory.findIndex(item => item === null);
                    if (emptySlot !== -1) {
                        player.inventory[emptySlot] = removed;
                    }
                    updateGunModPanel();
                    updateUI(player);
                }
            };
            
            attachmentDiv.appendChild(attachmentImg);
            attachmentDiv.appendChild(attachmentName);
            attachmentDiv.appendChild(removeButton);
            slotDiv.appendChild(slotLabel);
            slotDiv.appendChild(attachmentDiv);
        } else {
            const emptySlot = document.createElement('div');
            emptySlot.textContent = 'Empty - Click to select';
            emptySlot.style.cssText = `
                flex: 1;
                color: #888;
                font-style: italic;
                font-size: 13px;
            `;
            slotDiv.appendChild(slotLabel);
            slotDiv.appendChild(emptySlot);
            
            // Add click handler to show attachment selection
            slotDiv.onclick = () => showAttachmentSelector(slotType, index, slotDiv);
        }
        
        // Add drag and drop functionality
        slotDiv.addEventListener('dragover', e => {
            const draggedType = uiState.draggedItem ? uiState.draggedItem.type : null;
            const slotType = weapon.modSlots[index];
            if (uiState.draggedItem && (draggedType === slotType || 
                                      draggedType === 'experimental' || 
                                      (slotType === 'receiver' && draggedType === 'experimental') ||
                                      (slotType === 'experimental' && draggedType === 'receiver') ||
                                      slotType === 'rail')) { // Rail slots accept all types
                e.preventDefault();
                slotDiv.style.borderColor = '#4CAF50';
                slotDiv.style.backgroundColor = 'rgba(76,175,80,0.2)';
            }
        });
        
        slotDiv.addEventListener('dragleave', () => {
            slotDiv.style.borderColor = '#666';
            slotDiv.style.backgroundColor = 'rgba(60,60,60,0.8)';
        });
        
        slotDiv.addEventListener('drop', e => {
            e.preventDefault();
            slotDiv.style.borderColor = '#666';
            slotDiv.style.backgroundColor = 'rgba(60,60,60,0.8)';
            
            const attachment = uiState.draggedItem;
            if (attachment) {
                // attachMod handles compatibility check including for experimental mods
                if (weapon.attachMod(attachment, index)) {
                    // Remove from inventory
                    const player = world.player;
                    player.inventory[uiState.draggedItemIndex] = null;
                    updateGunModPanel();
                    updateUI(player);
                }
            }
            handleDragEnd(player);
        });
        
        modsContainer.appendChild(slotDiv);
    });
}

function showAttachmentSelector(slotType, slotIndex, slotElement) {
    const player = world.player;
    const weapon = uiState.selectedWeapon;
    
    const availableAttachments = player.inventory.filter(item => {
        if (!item || !item.type) return false;
        
        // Check compatibility
        return item.type === slotType || item.type === 'experimental' || slotType === 'rail' || 
               (slotType === 'receiver' && item.type === 'experimental') || 
               (slotType === 'experimental' && item.type === 'receiver');
    });
    
    if (availableAttachments.length === 0) {
        return; // No attachments available
    }
    
    // Create dropdown menu
    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
        position: absolute;
        background-color: rgba(20,20,20,0.95);
        border: 1px solid #555;
        border-radius: 4px;
        padding: 5px 0;
        z-index: 35;
        min-width: 200px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        max-height: 200px;
        overflow-y: auto;
    `;
    
    const rect = slotElement.getBoundingClientRect();
    dropdown.style.left = rect.right + 10 + 'px';
    dropdown.style.top = rect.top + 'px';
    
    availableAttachments.forEach(attachment => {
        const attachmentIndexInInventory = player.inventory.indexOf(attachment);
        const option = document.createElement('div');
        option.style.cssText = `
            padding: 8px 15px;
            color: white;
            cursor: pointer;
            font-family: sans-serif;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        const icon = document.createElement('div');
        icon.style.cssText = `
            width: 20px;
            height: 20px;
            background-color: #333;
            border: 1px solid #666;
            border-radius: 2px;
        `;
        
        const text = document.createElement('div');
        text.style.cssText = 'flex: 1;';
        text.innerHTML = `
            <div style="font-weight: bold;">${attachment.name}</div>
            <div style="font-size: 11px; color: #aaa;">${attachment.description}</div>
        `;
        
        option.appendChild(icon);
        option.appendChild(text);
        
        option.onmouseover = () => option.style.backgroundColor = 'rgba(70,70,70,0.8)';
        option.onmouseout = () => option.style.backgroundColor = 'transparent';
        option.onclick = () => {
            const weapon = uiState.selectedWeapon;
            // Remove from inventory first
            player.inventory[attachmentIndexInInventory] = null;

            // Attempt to attach. attachMod will check compatibility.
            if (weapon && weapon.attachMod(attachment, slotIndex)) {
                // Success
                updateGunModPanel();
                updateUI(player);
            } else {
                // Failed, put it back
                player.inventory[attachmentIndexInInventory] = attachment;
            }
            document.body.removeChild(dropdown);
        };
        
        dropdown.appendChild(option);
    });
    
    // Add cancel option
    const cancelOption = document.createElement('div');
    cancelOption.textContent = 'Cancel';
    cancelOption.style.cssText = `
        padding: 8px 15px;
        color: #888;
        cursor: pointer;
        font-family: sans-serif;
        font-size: 14px;
        border-top: 1px solid #555;
        text-align: center;
    `;
    cancelOption.onmouseover = () => cancelOption.style.backgroundColor = 'rgba(70,70,70,0.8)';
    cancelOption.onmouseout = () => cancelOption.style.backgroundColor = 'transparent';
    cancelOption.onclick = () => document.body.removeChild(dropdown);
    
    dropdown.appendChild(cancelOption);
    
    document.body.appendChild(dropdown);
    
    // Remove dropdown when clicking elsewhere
    const removeDropdown = (e) => {
        if (!dropdown.contains(e.target)) {
            if (document.body.contains(dropdown)) {
                document.body.removeChild(dropdown);
            }
            document.removeEventListener('click', removeDropdown);
        }
    };
    setTimeout(() => document.addEventListener('click', removeDropdown), 0);
}

function createStashPanel() {
    const panel = document.createElement('div');
    panel.id = 'stash-panel';
    panel.innerHTML = `
        <div class="stash-header">
            <h3>Safehouse Stash</h3>
            <button id="auto-sort-button" style="padding: 5px 10px; margin-left: 10px; background-color: #4a8a4a; color: white; border: 1px solid #5a9a5a; border-radius: 3px; cursor: pointer; font-size: 12px;">Auto Sort</button>
            <button class="stash-close-button">&times;</button>
        </div>
        <div id="stash-grid"></div>
    `;
    
    panel.querySelector('.stash-close-button').onclick = () => {
        safehouse.isUIOpen = false;
        uiState.stashVisible = false;
        updateUI(world.player);
    };
    
    panel.querySelector('#auto-sort-button').onclick = () => {
        autoSortStash();
        updateUI(world.player);
    };
    
    panel.addEventListener('mouseover', () => uiState.mouseOver = true);
    panel.addEventListener('mouseout', () => uiState.mouseOver = false);
    
    return panel;
}

function autoSortStash() {
    if (!safehouse) return;
    
    const stash = safehouse.stash.stash;
    const stackableGroups = new Map();
    const individualItems = [];
    
    // Group items by stackability
    for (let i = 0; i < stash.length; i++) {
        const item = stash[i];
        if (!item) continue;
        
        let stackKey = null;
        
        // Determine if item can be stacked and create a key
        if (item instanceof MoneyWallet) {
            stackKey = 'money';
        } else if (item instanceof EmptyCan) {
            stackKey = 'empty_cans';
        } else if (item instanceof Grenade) {
            stackKey = 'grenades';
        } else if (item.weaponType && item.amount) { // AmmoPickup
            stackKey = `ammo_${item.weaponType}`;
        }
        
        if (stackKey) {
            if (!stackableGroups.has(stackKey)) {
                stackableGroups.set(stackKey, []);
            }
            stackableGroups.get(stackKey).push(item);
        } else {
            // Individual items (weapons, medkits, attachments)
            individualItems.push(item);
        }
    }
    
    // Clear the stash
    safehouse.stash.stash.fill(null);
    
    let currentIndex = 0;
    
    // Add stacked items first
    for (const [stackKey, items] of stackableGroups) {
        if (items.length === 0) continue;
        
        let combinedItem;
        
        if (stackKey === 'money') {
            combinedItem = new MoneyWallet();
            combinedItem.amount = items.reduce((total, item) => total + item.amount, 0);
        } else if (stackKey === 'empty_cans') {
            combinedItem = new EmptyCan();
            combinedItem.amount = items.reduce((total, item) => total + item.amount, 0);
        } else if (stackKey === 'grenades') {
            combinedItem = new Grenade(null);
            combinedItem.ammo = items.reduce((total, item) => total + item.ammo, 0);
        } else if (stackKey.startsWith('ammo_')) {
            const weaponType = stackKey.replace('ammo_', '');
            const totalAmount = items.reduce((total, item) => total + item.amount, 0);
            import('./pickup.js').then(pickupModule => {
                combinedItem = new pickupModule.AmmoPickup(0, 0, weaponType, totalAmount);
            });
            // For immediate placement, create a basic ammo object
            combinedItem = {
                weaponType: weaponType,
                amount: totalAmount,
                name: `${weaponType} Ammo (${totalAmount})`,
                icon: items[0].icon
            };
        }
        
        if (combinedItem && currentIndex < stash.length) {
            safehouse.stash.stash[currentIndex] = combinedItem;
            currentIndex++;
        }
    }
    
    // Add individual items
    for (const item of individualItems) {
        if (currentIndex < stash.length) {
            safehouse.stash.stash[currentIndex] = item;
            currentIndex++;
        }
    }
    
    // Save the sorted stash
    safehouse.stash.saveToStorage();
}

export function initUI(player) {
    uiContainer = document.getElementById('ui-container');
    uiContainer.addEventListener('mouseover', () => uiState.mouseOver = true);
    uiContainer.addEventListener('mouseout', () => uiState.mouseOver = false);
    
    // Create context menu
    contextMenu = createContextMenu();
    document.body.appendChild(contextMenu);
    
    // Create gun mod panel
    gunModPanel = createGunModPanel();
    document.body.appendChild(gunModPanel);
    
    // Create inspect panel
    inspectPanel = createInspectPanel();
    document.body.appendChild(inspectPanel);
    
    // Create stash panel
    const stashPanel = createStashPanel();
    document.body.appendChild(stashPanel);
    
    // Hide context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (contextMenu && !contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    // --- Create Wanted Level UI ---
    const wantedLevelContainer = document.createElement('div');
    wantedLevelContainer.id = 'wanted-level-container';
    
    const wantedLabel = document.createElement('span');
    wantedLabel.id = 'wanted-level-label';
    wantedLabel.textContent = 'WANTED';
    wantedLevelContainer.appendChild(wantedLabel);
    
    // Create 5 stars for wanted level
    for (let i = 0; i < 5; i++) {
        const star = document.createElement('span');
        star.className = 'wanted-star';
        star.textContent = '★';
        star.dataset.starIndex = i;
        wantedLevelContainer.appendChild(star);
    }
    
    document.body.appendChild(wantedLevelContainer);

    // --- Create Health Bar ---
    const healthBarContainer = document.createElement('div');
    healthBarContainer.id = 'health-bar-container';
    const armorBar = document.createElement('div');
    armorBar.id = 'armor-bar';
    const healthBar = document.createElement('div');
    healthBar.id = 'health-bar';
    const healthText = document.createElement('span');
    healthText.id = 'health-text';
    healthBarContainer.appendChild(armorBar);
    healthBarContainer.appendChild(healthBar);
    healthBarContainer.appendChild(healthText);
    document.body.appendChild(healthBarContainer);

    // --- Get Restart Button (now in HTML) ---
    restartButton = document.getElementById('restart-button');
    restartButton.onclick = () => {
        window.location.reload();
    };

    // --- Create UI Elements ---
    const inventoryToggleContainer = document.createElement('div');
    inventoryToggleContainer.id = 'inventory-toggle-container';

    const inventoryToggle = document.createElement('button');
    inventoryToggle.id = 'inventory-toggle';
    inventoryToggle.innerHTML = `<img src="./inventory_icon.png" alt="Inventory">`;
    inventoryToggle.addEventListener('click', toggleInventoryAndBodyStatus);
    inventoryToggleContainer.appendChild(inventoryToggle);
    
    // --- Create side panels (Inventory and Body Status) ---
    const sidePanelContainer = document.createElement('div');
    sidePanelContainer.id = 'side-panel-container';

    bodyStatusPanel = createBodyStatusPanel();
    sidePanelContainer.appendChild(bodyStatusPanel);

    inventoryPanel = document.createElement('div');
    inventoryPanel.id = 'inventory-panel';
    sidePanelContainer.appendChild(inventoryPanel);
    
    hotbarContainer = document.createElement('div');
    hotbarContainer.id = 'hotbar';

    // --- Populate Slots ---

    for (let i = 0; i < player.inventory.length; i++) {
        const inventorySlot = createSlot(i, player);
        inventoryPanel.appendChild(inventorySlot);
        
        if (i < player.hotbarSize) {
            const hotbarSlot = createSlot(i, player);
            hotbarContainer.appendChild(hotbarSlot);
        }
    }
    
    // --- Add to DOM ---

    uiContainer.appendChild(inventoryToggleContainer);
    uiContainer.appendChild(sidePanelContainer);
    uiContainer.appendChild(hotbarContainer);
    
    updateUI(player);
}

function createSlot(index, player, isStash = false) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (isStash) slot.classList.add('stash-slot');
    slot.dataset.index = index;

    // Draggable only if inventory is visible
    slot.addEventListener('mousedown', () => {
        if (uiState.inventoryVisible) {
            slot.setAttribute('draggable', true);
        } else {
            slot.setAttribute('draggable', false);
        }
    });

    // Add double-click handler for inventory-stash transfers
    slot.addEventListener('dblclick', e => {
        if (!uiState.inventoryVisible) return;
        
        const item = isStash ? safehouse.stash.getItem(index) : player.inventory[index];
        if (!item) return;
        
        // Hide context menu before transfer
        hideContextMenu();
        
        // Add visual feedback
        slot.classList.add('transfer-ready');
        setTimeout(() => slot.classList.remove('transfer-ready'), 200);
        
        if (isStash) {
            // Transfer from stash to inventory
            safehouse.transferToInventory(player, index);
        } else {
            // Transfer from inventory to stash (allow all items now)
            safehouse.transferToStash(player, index);
        }
        
        updateUI(player);
    });

    // Add shift+click handler for inventory-stash transfers
    slot.addEventListener('click', e => {
        if (!uiState.inventoryVisible || !e.shiftKey) return;
        
        const item = isStash ? safehouse.stash.getItem(index) : player.inventory[index];
        if (!item) return;
        
        // Hide context menu before transfer
        hideContextMenu();
        
        // Add visual feedback
        slot.classList.add('transfer-ready');
        setTimeout(() => slot.classList.remove('transfer-ready'), 200);
        
        if (isStash) {
            // Transfer from stash to inventory
            safehouse.transferToInventory(player, index);
        } else {
            // Transfer from inventory to stash
            safehouse.transferToStash(player, index);
        }
        
        updateUI(player);
    });

    slot.addEventListener('dragstart', e => handleDragStart(e, index, player, isStash));
    slot.addEventListener('dragover', e => e.preventDefault());
    slot.addEventListener('drop', e => handleDrop(e, index, player, isStash));
    slot.addEventListener('dragend', () => handleDragEnd(player));
    
    // Add right-click handler for weapons and sellable items
    slot.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        const item = isStash ? safehouse.stash.getItem(index) : player.inventory[index];
        if (item) {
            showContextMenu(e.clientX, e.clientY, item, index, isStash);
        }
    });
    
    if (index < player.hotbarSize && !isStash) {
        const keyHint = document.createElement('span');
        keyHint.className = 'key-hint';
        keyHint.textContent = index + 1;
        slot.appendChild(keyHint);
        
        slot.addEventListener('click', e => {
            // Only switch weapon if not shift-clicking
            if (!e.shiftKey && player.switchWeapon) {
                 player.switchWeapon(index);
                 updateUI(player);
            }
        });
    }

    const img = document.createElement('img');
    slot.appendChild(img);
    
    const attachmentDisplay = document.createElement('div');
    attachmentDisplay.className = 'attachment-display';
    slot.appendChild(attachmentDisplay);
    
    return slot;
}

function handleDragStart(e, index, player, isStash = false) {
    const slot = e.target;
    const item = isStash ? safehouse.stash.getItem(index) : player.inventory[index];
    if (!item) {
        e.preventDefault();
        return;
    }
    uiState.draggedItemIndex = index;
    uiState.draggedItem = item;
    uiState.draggedFromStash = isStash;
    setTimeout(() => slot.classList.add('dragging'), 0);
}

function handleDrop(e, targetIndex, player, isStash = false) {
    e.preventDefault();
    if (uiState.draggedItemIndex === null) return;
    
    const fromStash = uiState.draggedFromStash;
    const toStash = isStash;
    const fromIndex = uiState.draggedItemIndex;
    
    // Hide context menu when any drag/drop operation happens
    hideContextMenu();
    
    // Handle transfers between inventory and stash
    if (fromStash && !toStash) {
        // Stash to inventory
        safehouse.transferToInventory(player, fromIndex);
    } else if (!fromStash && toStash) {
        // Inventory to stash (allow all items now)
        safehouse.transferToStash(player, fromIndex);
    } else if (fromStash && toStash) {
        // Stash to stash (swap)
        if (fromIndex !== targetIndex) {
            const item1 = safehouse.stash.getItem(fromIndex);
            const item2 = safehouse.stash.getItem(targetIndex);
            safehouse.stash.stash[fromIndex] = item2;
            safehouse.stash.stash[targetIndex] = item1;
            safehouse.stash.saveToStorage();
        }
    } else {
        // Inventory to inventory - allow all movement now
        if (fromIndex !== targetIndex) {
            const temp = player.inventory[fromIndex];
            player.inventory[fromIndex] = player.inventory[targetIndex];
            player.inventory[targetIndex] = temp;
            
            // Update current weapon slot if necessary
            if(player.currentWeaponSlot === fromIndex) {
                player.currentWeaponSlot = targetIndex;
            } else if (player.currentWeaponSlot === targetIndex) {
                player.currentWeaponSlot = fromIndex;
            }

            // Update weapon reference
            const item = player.inventory[player.currentWeaponSlot];
            if (item instanceof Weapon) {
                player.weapon = item;
            } else {
                player.weapon = null;
            }
        }
    }
}

function handleDragEnd(player) {
    if (uiState.draggedItemIndex === null) return;
    const draggedItem = player.inventory[uiState.draggedItemIndex];
    if (draggedItem instanceof MoneyWallet) {
        // Prevent wallet from being moved out of its original slot easily
        // This is a simple implementation. More robust would be to swap back.
    }

    uiState.draggedItemIndex = null;
    uiState.draggedItem = null;
    uiState.draggedFromStash = false;
    document.querySelectorAll('.slot.dragging').forEach(s => s.classList.remove('dragging'));
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    updateUI(player);
}

export function updateUI(player) {
    // Update health and armor bars
    const healthBar = document.getElementById('health-bar');
    const armorBar = document.getElementById('armor-bar');
    const healthText = document.getElementById('health-text');
    
    if (healthBar && armorBar && healthText) {
        const healthPercent = (player.health / player.maxHealth) * 100;
        const armorPercent = (player.armor / player.maxArmor) * 100;
        
        healthBar.style.width = `${healthPercent}%`;
        armorBar.style.width = `${armorPercent}%`;
        
        // Change health bar color based on health level
        if (healthPercent < 25) {
            healthBar.style.backgroundColor = '#F44336'; // Red
        } else if (healthPercent < 50) {
            healthBar.style.backgroundColor = '#FF9800'; // Orange
        } else {
            healthBar.style.backgroundColor = '#4CAF50'; // Green
        }
        
        healthText.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;
    }
    
    // Update wanted level stars
    const stars = document.querySelectorAll('.wanted-star');
    const currentWantedLevel = Math.floor(world.wantedLevel);
    stars.forEach((star, index) => {
        if (index < currentWantedLevel) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
    
    // Update stash visibility
    uiState.stashVisible = safehouse && safehouse.isUIOpen;
    const stashPanel = document.getElementById('stash-panel');
    if (stashPanel) {
        stashPanel.style.display = uiState.stashVisible ? 'block' : 'none';
        
        if (uiState.stashVisible) {
            updateStashSlots();
        }
    }
    
    // Update hotbar and inventory
    updateSlots();
    
    // Update body status panel limbs
    updateBodyStatusPanel(player);

    // Show/hide panels based on state
    if (inventoryPanel) {
        inventoryPanel.classList.toggle('visible', uiState.inventoryVisible);
    }
    if (bodyStatusPanel) {
        bodyStatusPanel.classList.toggle('visible', uiState.bodyStatusVisible);
    }
    if (gunModPanel) {
        gunModPanel.style.display = uiState.gunModVisible ? 'block' : 'none';
    }
    if (inspectPanel) {
        inspectPanel.style.display = uiState.inspectPanelVisible ? 'block' : 'none';
    }
    
    // Update game over screen
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) {
        gameOverScreen.style.display = player.isDead ? 'flex' : 'none';
    }
}

function updateSlots() {
    const player = world.player;
    if (!player) return;

    // Update hotbar slots (always show first 5 inventory slots)
    const hotbarSlots = hotbarContainer.querySelectorAll('.slot');
    hotbarSlots.forEach((slot, index) => {
        const item = player.inventory[index]; // Direct mapping to first 5 inventory slots
        const img = slot.querySelector('img');
        
        // Clear existing ammo count and attachment div
        const existingAmmoCount = slot.querySelector('.ammo-count');
        if (existingAmmoCount) {
            slot.removeChild(existingAmmoCount);
        }
        const attachmentDisplay = slot.querySelector('.attachment-display');
        attachmentDisplay.style.display = 'none';
        attachmentDisplay.textContent = '';
        
        if (item) {
            // Check if item is an attachment (has type and modifiers properties)
            if (item instanceof Attachment) {
                // Hide img and show colored rectangle for attachments
                if (img) {
                    img.style.display = 'none';
                }
                attachmentDisplay.style.display = 'flex';
                attachmentDisplay.textContent = item.type.charAt(0).toUpperCase();
                
                // Color code beam attachments purple
                if (item.type === 'beam') {
                    attachmentDisplay.style.backgroundColor = '#8e44ad';
                    attachmentDisplay.style.borderColor = '#9b59b6';
                } else if (item instanceof ProceduralThrowable) {
                    attachmentDisplay.style.backgroundColor = '#6d4c41'; // Brown for procedural
                    attachmentDisplay.style.borderColor = '#8d6e63';
                } else {
                    attachmentDisplay.style.backgroundColor = '#333';
                    attachmentDisplay.style.borderColor = '#666';
                }
            } else {
                // Regular item with icon
                if (img) {
                    img.src = item.icon;
                    img.style.display = 'block';
                }
            }
            
            // Add ammo count for weapons and stackable items
            if (item.magSize > 0 && typeof item.reserveAmmo === 'number') {
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = `${item.ammo}/${item.reserveAmmo}`;
                slot.appendChild(ammoCount);
            } else if (typeof item.ammo === 'number') { // For grenades, which use .ammo as stack
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = item.ammo;
                slot.appendChild(ammoCount);
            } else if (typeof item.amount === 'number' && item.amount > 1) { // For other stackables like cans
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = item.amount;
                slot.appendChild(ammoCount);
            }
            
            slot.classList.remove('empty');
        } else {
            if (img) {
                img.style.display = 'none';
            }
            slot.classList.add('empty');
        }
        
        // Highlight current weapon slot
        if (index === player.currentWeaponSlot) {
            slot.classList.add('active');
        } else {
            slot.classList.remove('active');
        }
    });

    // Update inventory slots
    const inventorySlots = inventoryPanel.querySelectorAll('.slot');
    inventorySlots.forEach((slot, index) => {
        const item = player.inventory[index];
        const img = slot.querySelector('img');
        
        // Clear existing ammo count and attachment div
        const existingAmmoCount = slot.querySelector('.ammo-count');
        if (existingAmmoCount) {
            slot.removeChild(existingAmmoCount);
        }
        const attachmentDisplay = slot.querySelector('.attachment-display');
        attachmentDisplay.style.display = 'none';
        attachmentDisplay.textContent = '';
        
        // Add visual indicator for hotbar slots
        if (index < 5) {
            slot.style.backgroundColor = 'rgba(74,138,74,0.1)';
            slot.style.borderColor = '#4a8a4a';
        } else {
            slot.style.backgroundColor = '';
            slot.style.borderColor = '';
        }
        
        if (item) {
            // Check if item is an attachment (has type and modifiers properties)
            if (item instanceof Attachment) {
                // Hide img and show colored rectangle for attachments
                if (img) img.style.display = 'none';
                if (attachmentDisplay) {
                    attachmentDisplay.style.display = 'flex';
                    attachmentDisplay.textContent = item.type.charAt(0).toUpperCase();
                    
                    // Color code beam attachments purple
                    if (item.type === 'beam') {
                        attachmentDisplay.style.backgroundColor = '#8e44ad';
                        attachmentDisplay.style.borderColor = '#9b59b6';
                    } else if (item instanceof ProceduralThrowable) {
                        attachmentDisplay.style.backgroundColor = '#6d4c41'; // Brown for procedural
                        attachmentDisplay.style.borderColor = '#8d6e63';
                    } else {
                        attachmentDisplay.style.backgroundColor = '#333';
                        attachmentDisplay.style.borderColor = '#666';
                    }
                }
            } else {
                // Regular item with icon
                if (img) {
                    img.src = item.icon;
                    img.style.display = 'block';
                }
            }
            
            // Add ammo/amount count
            if (item.magSize > 0 && typeof item.reserveAmmo === 'number') {
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = `${item.ammo}/${item.reserveAmmo}`;
                slot.appendChild(ammoCount);
            } else if (typeof item.ammo === 'number') { // For grenades, which use .ammo as stack
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = item.ammo;
                slot.appendChild(ammoCount);
            } else if (typeof item.amount === 'number' && item.amount > 1) { // For other stackables like cans and ammo pickups
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = item.amount;
                slot.appendChild(ammoCount);
            }
            
            slot.classList.remove('empty');
        } else {
            if (img) img.style.display = 'none';
            slot.classList.add('empty');
        }
        
        // Remove active highlighting in inventory
        slot.classList.remove('active');
    });
}

function updateStashSlots() {
    if (!safehouse) return;
    
    const stashGrid = document.getElementById('stash-grid');
    if (!stashGrid) return;
    
    // Get existing slots or create them if they don't exist
    let stashSlots = stashGrid.querySelectorAll('.stash-slot');
    
    // If we don't have enough slots, create them
    if (stashSlots.length < safehouse.stash.stash.length) {
        // Clear and recreate all slots
        stashGrid.innerHTML = '';
        for (let i = 0; i < safehouse.stash.stash.length; i++) {
            const slot = createSlot(i, world.player, true);
            stashGrid.appendChild(slot);
        }
        stashSlots = stashGrid.querySelectorAll('.stash-slot');
    }
    
    // Update each slot's content
    stashSlots.forEach((slot, index) => {
        if (index >= safehouse.stash.stash.length) return;
        
        const item = safehouse.stash.getItem(index);
        const img = slot.querySelector('img');
        const attachmentDisplay = slot.querySelector('.attachment-display');
        
        // Clear existing ammo count
        const existingAmmoCount = slot.querySelector('.ammo-count');
        if (existingAmmoCount) {
            slot.removeChild(existingAmmoCount);
        }
        
        // Reset attachment display
        if (attachmentDisplay) {
            attachmentDisplay.style.display = 'none';
            attachmentDisplay.textContent = '';
        }
        
        if (item) {
            if (item instanceof Attachment) {
                if (img) img.style.display = 'none';
                if (attachmentDisplay) {
                    attachmentDisplay.style.display = 'flex';
                    attachmentDisplay.textContent = item.type.charAt(0).toUpperCase();
                    
                    // Color code beam attachments purple
                    if (item.type === 'beam') {
                        attachmentDisplay.style.backgroundColor = '#8e44ad';
                        attachmentDisplay.style.borderColor = '#9b59b6';
                    } else if (item instanceof ProceduralThrowable) {
                        attachmentDisplay.style.backgroundColor = '#6d4c41'; // Brown for procedural
                        attachmentDisplay.style.borderColor = '#8d6e63';
                    } else {
                        attachmentDisplay.style.backgroundColor = '#333';
                        attachmentDisplay.style.borderColor = '#666';
                    }
                }
            } else {
                if (img) {
                    img.src = item.icon;
                    img.style.display = 'block';
                }
            }
            
            // Add ammo/amount count
            if (item.magSize > 0 && typeof item.reserveAmmo === 'number') {
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = `${item.ammo}/${item.reserveAmmo}`;
                slot.appendChild(ammoCount);
            } else if (typeof item.ammo === 'number') { // For grenades, which use .ammo as stack
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = item.ammo;
                slot.appendChild(ammoCount);
            } else if (typeof item.amount === 'number' && item.amount > 1) { // For other stackables like cans and ammo pickups
                const ammoCount = document.createElement('span');
                ammoCount.className = 'ammo-count';
                ammoCount.textContent = item.amount;
                slot.appendChild(ammoCount);
            }
            
            slot.classList.remove('empty');
        } else {
            if (img) img.style.display = 'none';
            slot.classList.add('empty');
        }
    });
    
    // Add slot count indicator
    let slotCounter = stashGrid.parentElement.querySelector('.slot-counter');
    if (!slotCounter) {
        slotCounter = document.createElement('div');
        slotCounter.className = 'slot-counter';
        slotCounter.style.cssText = `
            position: absolute;
            bottom: 10px;
            right: 20px;
            color: #aaa;
            font-size: 12px;
        `;
        stashGrid.parentElement.appendChild(slotCounter);
    }
    
    const usedSlots = safehouse.stash.stash.filter(item => item !== null).length;
    slotCounter.textContent = `${usedSlots}/124 slots used`;
}

function updateBodyStatusPanel(player) {
    if (!bodyStatusPanel) return;
    
    if (!player) return;

    const limbElements = {
        head: bodyStatusPanel.querySelector('[data-part="head"]'),
        torso: bodyStatusPanel.querySelector('[data-part="torso"]'),
        leftArm: bodyStatusPanel.querySelector('[data-part="leftArm"]'),
        rightArm: bodyStatusPanel.querySelector('[data-part="rightArm"]'),
        leftLeg: bodyStatusPanel.querySelector('[data-part="leftLeg"]'),
        rightLeg: bodyStatusPanel.querySelector('[data-part="rightLeg"]')
    };
    
    Object.entries(player.limbs).forEach(([limbName, limb]) => {
        const element = limbElements[limbName];
        if (element) {
            // Remove all status classes
            element.classList.remove('ok', 'damaged', 'crippled');
            
            if (limb.severed) {
                element.classList.add('crippled');
                element.style.display = 'none'; // Hide severed limbs
            } else {
                element.style.display = 'block';
                element.classList.add(limb.status);
            }
        }
    });
}

function createInspectPanel() {
    const panel = document.createElement('div');
    panel.id = 'inspect-panel';
    panel.innerHTML = `
        <div class="inspect-header">
            <h2 id="inspect-title">Item Details</h2>
            <button class="inspect-close-button">&times;</button>
        </div>
        <div id="inspect-content">
            <div id="inspect-icon-container">
                 <div id="inspect-icon-display">?</div>
                 <img id="inspect-icon-img" src="" style="display:none;"/>
            </div>
            <div id="inspect-info">
                <h3 id="inspect-item-name"></h3>
                <p id="inspect-item-type"></p>
                <div id="inspect-item-description"></div>
            </div>
        </div>
    `;

    panel.querySelector('.inspect-close-button').onclick = () => {
        uiState.inspectPanelVisible = false;
        updateUI(world.player);
    };

    panel.addEventListener('mouseover', () => uiState.mouseOver = true);
    panel.addEventListener('mouseout', () => uiState.mouseOver = false);
    return panel;
}