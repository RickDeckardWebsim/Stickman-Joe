import { world } from './world.js';

export class Shell {
    constructor(x, y, angle, options = {}) {
        this.x = x;
        this.y = y;
        this.width = options.width || 3;
        this.height = options.height || 6;
        this.type = options.type || 'default';

        if (this.type === 'shotgun') {
            this.bodyColor = '#cc2222'; // red
            this.tipColor = '#ddc87c';  // gold
        } else if (this.type === 'energy') {
            this.bodyColor = '#8e44ad'; // purple energy cartridge
            this.tipColor = '#e74c3c';  // red energy core
        } else {
            this.bodyColor = '#ddc87c'; // Brass color
            this.tipColor = null;
        }

        // Ejection angle is roughly perpendicular to player's gun, with some randomness
        const ejectionAngle = angle - Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        const ejectionSpeed = Math.random() * 2 + 3;

        this.vx = Math.cos(ejectionAngle) * ejectionSpeed;
        this.vy = Math.sin(ejectionAngle) * ejectionSpeed;
        
        // Add a tiny bit of forward velocity from the gun itself
        this.vx += Math.cos(angle) * 0.5;
        this.vy += Math.sin(angle) * 0.5;

        this.angle = Math.random() * Math.PI * 2;
        this.angularVelocity = (Math.random() - 0.5) * 0.5;

        this.active = true;
        
        this.friction = 0.98;
        this.settleThreshold = 0.05;
    }

    update() {
        if (!this.active) {
            return false;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Building collision
        if (world.city) {
            for (const building of world.city.buildings) {
                if (this.x >= building.x && this.x <= building.x + building.width &&
                    this.y >= building.y && this.y <= building.y + building.height) {
                    
                    // Find closest edge and push out
                    const distToLeft = this.x - building.x;
                    const distToRight = (building.x + building.width) - this.x;
                    const distToTop = this.y - building.y;
                    const distToBottom = (building.y + building.height) - this.y;
                    
                    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                    const bounceDamping = 0.5;
                    
                    if (minDist === distToLeft) {
                        this.x = building.x;
                        this.vx *= -bounceDamping;
                    } else if (minDist === distToRight) {
                        this.x = building.x + building.width;
                        this.vx *= -bounceDamping;
                    } else if (minDist === distToTop) {
                        this.y = building.y;
                        this.vy *= -bounceDamping;
                    } else {
                        this.y = building.y + building.height;
                        this.vy *= -bounceDamping;
                    }
                }
            }
        }

        // Wall bounce logic
        const bounceDamping = 0.5; // Shells are less bouncy
        if (this.x <= world.wallThickness) {
            this.x = world.wallThickness;
            this.vx *= -bounceDamping;
        } else if (this.x >= world.width - world.wallThickness) {
            this.x = world.width - world.wallThickness;
            this.vx *= -bounceDamping;
        }
        if (this.y <= world.wallThickness) {
            this.y = world.wallThickness;
            this.vy *= -bounceDamping;
        } else if (this.y >= world.height - world.wallThickness) {
            this.y = world.height - world.wallThickness;
            this.vy *= -bounceDamping;
        }

        this.vx *= this.friction;
        this.vy *= this.friction;
        this.angularVelocity *= this.friction;

        this.angle += this.angularVelocity;

        const isSettled = Math.abs(this.vx) < this.settleThreshold && 
                          Math.abs(this.vy) < this.settleThreshold && 
                          Math.abs(this.angularVelocity) < this.settleThreshold;

        if (isSettled) {
            this.active = false;
            return true; // Just settled
        }

        return false; // Still active
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.tipColor) {
            const tipRatio = 0.25; // Tip is 25% of shell length
            const tipHeight = this.height * tipRatio;
            const bodyHeight = this.height * (1 - tipRatio);

            // Draw body
            ctx.fillStyle = this.bodyColor;
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, bodyHeight);
            
            // Draw tip/base
            ctx.fillStyle = this.tipColor;
            ctx.fillRect(-this.width / 2, this.height / 2 - tipHeight, this.width, tipHeight);

            // Add energy glow effect for energy shells
            if (this.type === 'energy') {
                ctx.fillStyle = this.tipColor;
                ctx.globalAlpha = 0.3;
                ctx.fillRect(-this.width / 2 - 1, this.height / 2 - tipHeight - 1, this.width + 2, tipHeight + 2);
                ctx.globalAlpha = 1;
            }
        } else {
            // Default single-color shell
            ctx.fillStyle = this.bodyColor;
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        }
        
        ctx.restore();
    }
}

export class Magazine {
    constructor(x, y, angle, options = {}) {
        this.x = x;
        this.y = y;
        this.width = options.width || 5;
        this.height = options.height || 20;
        this.color = options.color || '#444';

        // Mags just drop, they aren't forcefully ejected.
        // Small random velocity.
        const ejectionSpeed = Math.random() * 1.5 + 0.5;
        const ejectionAngle = Math.random() * Math.PI * 2; // Random direction

        this.vx = Math.cos(ejectionAngle) * ejectionSpeed;
        this.vy = Math.sin(ejectionAngle) * ejectionSpeed;

        // Add a bit of downward force to simulate gravity feel
        this.vy += 1;

        this.angle = angle + (Math.random() - 0.5) * 0.5; // Start slightly askew from player
        this.angularVelocity = (Math.random() - 0.5) * 0.2;

        this.active = true;

        this.friction = 0.96; // Heavier, more friction
        this.settleThreshold = 0.05;
    }

    update() {
        if (!this.active) {
            return false;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Building collision
        if (world.city) {
            for (const building of world.city.buildings) {
                if (this.x >= building.x && this.x <= building.x + building.width &&
                    this.y >= building.y && this.y <= building.y + building.height) {
                    
                    // Find closest edge and push out
                    const distToLeft = this.x - building.x;
                    const distToRight = (building.x + building.width) - this.x;
                    const distToTop = this.y - building.y;
                    const distToBottom = (building.y + building.height) - this.y;
                    
                    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                    const bounceDamping = 0.3;
                    
                    if (minDist === distToLeft) {
                        this.x = building.x;
                        this.vx *= -bounceDamping;
                    } else if (minDist === distToRight) {
                        this.x = building.x + building.width;
                        this.vx *= -bounceDamping;
                    } else if (minDist === distToTop) {
                        this.y = building.y;
                        this.vy *= -bounceDamping;
                    } else {
                        this.y = building.y + building.height;
                        this.vy *= -bounceDamping;
                    }
                }
            }
        }

        // Wall bounce logic
        const bounceDamping = 0.3; // Mags are not very bouncy
        if (this.x <= world.wallThickness) {
            this.x = world.wallThickness;
            this.vx *= -bounceDamping;
        } else if (this.x >= world.width - world.wallThickness) {
            this.x = world.width - world.wallThickness;
            this.vx *= -bounceDamping;
        }
        if (this.y <= world.wallThickness) {
            this.y = world.wallThickness;
            this.vy *= -bounceDamping;
        } else if (this.y >= world.height - world.wallThickness) {
            this.y = world.height - world.wallThickness;
            this.vy *= -bounceDamping;
        }

        this.vx *= this.friction;
        this.vy *= this.friction;
        this.angularVelocity *= this.friction;

        this.angle += this.angularVelocity;

        const isSettled = Math.abs(this.vx) < this.settleThreshold &&
                          Math.abs(this.vy) < this.settleThreshold &&
                          Math.abs(this.angularVelocity) < this.settleThreshold;

        if (isSettled) {
            this.active = false;
            return true; // Just settled
        }

        return false; // Still active
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        ctx.restore();
    }
}

export class GrenadePin {
    constructor(x, y, angle, options = {}) {
        this.x = x;
        this.y = y;
        this.radius = options.radius || 4;
        this.color = options.color || '#a0a0a0'; // Metal grey

        // The player pulls the pin and tosses it aside.
        // A sideways and slightly backward motion seems right.
        const ejectionAngle = angle - Math.PI / 2 + (Math.random() - 0.5) * 0.6 - Math.PI/4;
        const ejectionSpeed = Math.random() * 2 + 4; // Fast ejection

        this.vx = Math.cos(ejectionAngle) * ejectionSpeed;
        this.vy = Math.sin(ejectionAngle) * ejectionSpeed;

        this.angle = Math.random() * Math.PI * 2;
        this.angularVelocity = (Math.random() - 0.5) * 0.6;

        this.active = true;

        this.friction = 0.98;
        this.settleThreshold = 0.05;
    }

    update() {
        if (!this.active) {
            return false;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Building collision
        if (world.city) {
            for (const building of world.city.buildings) {
                if (this.x >= building.x && this.x <= building.x + building.width &&
                    this.y >= building.y && this.y <= building.y + building.height) {
                    
                    // Find closest edge and push out
                    const distToLeft = this.x - building.x;
                    const distToRight = (building.x + building.width) - this.x;
                    const distToTop = this.y - building.y;
                    const distToBottom = (building.y + building.height) - this.y;
                    
                    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                    const bounceDamping = 0.3;
                    
                    if (minDist === distToLeft) {
                        this.x = building.x;
                        this.vx *= -bounceDamping;
                    } else if (minDist === distToRight) {
                        this.x = building.x + building.width;
                        this.vx *= -bounceDamping;
                    } else if (minDist === distToTop) {
                        this.y = building.y;
                        this.vy *= -bounceDamping;
                    } else {
                        this.y = building.y + building.height;
                        this.vy *= -bounceDamping;
                    }
                }
            }
        }

        // Wall bounce logic
        const bounceDamping = 0.5;
        if (this.x <= world.wallThickness) {
            this.x = world.wallThickness;
            this.vx *= -bounceDamping;
        } else if (this.x >= world.width - world.wallThickness) {
            this.x = world.width - world.wallThickness;
            this.vx *= -bounceDamping;
        }
        if (this.y <= world.wallThickness) {
            this.y = world.wallThickness;
            this.vy *= -bounceDamping;
        } else if (this.y >= world.height - world.wallThickness) {
            this.y = world.height - world.wallThickness;
            this.vy *= -bounceDamping;
        }

        this.vx *= this.friction;
        this.vy *= this.friction;
        this.angularVelocity *= this.friction;

        this.angle += this.angularVelocity;

        const isSettled = Math.abs(this.vx) < this.settleThreshold &&
                          Math.abs(this.vy) < this.settleThreshold &&
                          Math.abs(this.angularVelocity) < this.settleThreshold;

        if (isSettled) {
            this.active = false;
            return true; // Just settled
        }

        return false; // Still active
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;

        // Draw the ring
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw the pin part
        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(this.radius + 5, 0);
        ctx.stroke();

        ctx.restore();
    }
}