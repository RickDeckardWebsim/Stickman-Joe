// This class represents the money "item" in the inventory.
export class MoneyWallet {
    constructor() {
        this.name = 'Wallet';
        this.icon = './money_icon.png';
        this.amount = 0;
    }
}

// This class is for the money drop on the ground.
export class MoneyPickup {
    constructor(x, y, value) {
        this.x = x;
        this.y = y;
        this.value = value;
        this.radius = 20; // larger pickup radius
        this.bob = Math.random() * Math.PI * 2;
        this.width = 25;
        this.height = 15;
    }

    update(player, input) { // input is unused but kept for consistent signature
        this.bob += 0.05;

        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        if (dist < this.radius + player.radius) {
            // Find the wallet in player's inventory and add money
            const wallet = player.inventory.find(item => item instanceof MoneyWallet);
            if (wallet) {
                wallet.amount += this.value;
                // TODO: Play a money pickup sound
            }
            return true; // Signal to remove this pickup from the world
        }
        return false;
    }

    draw(ctx, player) {
        const bobOffset = Math.sin(this.bob) * 3;

        ctx.save();
        ctx.translate(this.x, this.y + bobOffset);

        // Green rectangle for money
        ctx.fillStyle = '#4CAF50';
        ctx.strokeStyle = '#2E7D32';
        ctx.lineWidth = 2;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // Dollar sign on it
        ctx.fillStyle = '#C8E6C9';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 1);

        ctx.restore();

        // Display value underneath
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(`$${this.value}`, this.x, this.y + this.height + 10);
        ctx.shadowBlur = 0;
    }
}

// This class represents empty cans that can be collected and sold
export class EmptyCan {
    constructor() {
        this.name = 'Empty Cans';
        this.icon = './money_icon.png'; // Reuse money icon for now
        this.amount = 1; // How many cans in this stack
        this.sellValue = 10; // $10 per can
    }
}

// This class is for can drops on the ground
export class CanPickup {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.bob = Math.random() * Math.PI * 2;
        this.width = 12;
        this.height = 18;
    }

    update(player, input) {
        this.bob += 0.03;

        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        if (dist < this.radius + player.radius) {
            if (input.justPressed.has('e')) {
                // Find existing can stack or create new one
                const existingStack = player.inventory.find(item => item instanceof EmptyCan);
                if (existingStack) {
                    existingStack.amount++;
                    return true;
                }
                
                // Try to add new stack
                const success = player.addItemToInventory(new EmptyCan());
                return success;
            }
        }
        return false;
    }

    draw(ctx, player) {
        const dist = Math.hypot(this.x - player.x, this.y - player.y);
        const bobOffset = Math.sin(this.bob) * 2;

        // Draw simple can shape
        ctx.save();
        ctx.translate(this.x, this.y + bobOffset);

        // Can body (silver/aluminum color)
        ctx.fillStyle = '#c0c0c0';
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // Top and bottom rims
        ctx.fillStyle = '#999';
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, 2);
        ctx.fillRect(-this.width / 2, this.height / 2 - 2, this.width, 2);

        ctx.restore();

        // Interaction prompt
        if (dist < this.radius + player.radius) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 4;
            ctx.fillText("Press 'E' to pick up", this.x, this.y + this.height + 15);
            ctx.fillText("Empty Can ($10)", this.x, this.y + this.height + 30);
            ctx.shadowBlur = 0;
        }
    }
}