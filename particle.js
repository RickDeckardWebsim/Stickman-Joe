import { world } from './world.js';

export class Particle {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;

        this.angle = Math.random() * Math.PI * 2;
        this.angularVelocity = (Math.random() - 0.5) * 0.5;
        
        this.friction = 0.98;
        this.settleThreshold = 0.05;
        this.active = true;
    }

    _updatePhysics() {
        let hasCollided = false;

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
                    const bounceDamping = 0.7;
                    
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
                    hasCollided = true;
                }
            }
        }

        // Wall bounce
        const bounceDamping = 0.7;
        if (this.x <= world.wallThickness) {
            this.x = world.wallThickness;
            this.vx *= -bounceDamping;
            hasCollided = true;
        } else if (this.x >= world.width - world.wallThickness) {
            this.x = world.width - world.wallThickness;
            this.vx *= -bounceDamping;
            hasCollided = true;
        }
        if (this.y <= world.wallThickness) {
            this.y = world.wallThickness;
            this.vy *= -bounceDamping;
            hasCollided = true;
        } else if (this.y >= world.height - world.wallThickness) {
            this.y = world.height - world.wallThickness;
            this.vy *= -bounceDamping;
            hasCollided = true;
        }

        this.vx *= this.friction;
        this.vy *= this.friction;

        return hasCollided;
    }

    update() {
        if (!this.active) {
            return false;
        }

        this._updatePhysics();
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
        // To be implemented by subclasses
    }
}