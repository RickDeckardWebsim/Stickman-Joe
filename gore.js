import { Particle } from './particle.js';
import { particles, world } from './world.js';
import { RagdollPoint, RagdollStick } from './ragdoll.js';
import { settings } from './options.js';

const MAX_IMPACT_FORCE = 10;

const SMEAR_BASE_CHANCE = 0.4;

const SPLATTER_BASE_CHANCE = 2;

const MIN_SMEAR_FORCE = 0.8;

const MIN_SPLATTER_FORCE = 2.0;

const MIN_SMEAR_SIZE = 1.0;

const MIN_SPLATTER_SIZE = 0.8;

const FORCE_PROBABILITY_WEIGHT = 0.3;

const MIN_TRAIL_DISTANCE = 2;

const IMMEDIATE_DECAL_THRESHOLD = 0.1;

const SMEAR_TO_DECAL_TIME = 1000;

class HeadChunk extends Particle {
    constructor(x, y, vx, vy, size, color) {
        super(x, y, vx, vy);
        this.size = size;
        this.color = color;
        this.friction = 0.92; // Ground friction
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

export class BloodParticle extends Particle {
    constructor(x, y, vx, vy, size, type = 'droplet', colorOverride = null) {
        super(x, y, vx, vy);
        this.size = size;
        this.originalSize = size;
        this.type = type; // 'droplet', 'spatter', 'stream', 'mist'
        this.friction = this.type === 'mist' ? 0.92 : 0.96;

        this.life = this.type === 'mist' ? 10 + Math.random() * 15 : 20 + Math.random() * 20;
        this.maxLife = this.life; // Store initial life for calculations
        this.isSplat = false;
        
        // Circular buffer for smear trail to eliminate allocations
        this.maxTrailLength = this.type === 'stream' ? 8 : 5; // Limit trail length
        this.smearTrail = new Array(this.maxTrailLength); // Fixed-size array
        this.trailHead = 0; // Current write position
        this.trailCount = 0; // Number of valid entries
        
        this.smearDuration = this.type === 'stream' ? 60 + Math.random() * 40 : 40 + Math.random() * 40;
        this.maxSmearDuration = this.smearDuration; // Store initial duration
        this.color = this._getBloodColor(colorOverride);
        
        // Surface interaction properties
        this.viscosity = 0.98;
        this.hasHitSurface = false;
        
        // Performance optimization flags
        this.isOffscreen = false;
        this.lastCullCheck = 0;
        
        // Time-based decay rates (per second instead of per frame)
        this.lifeDecayRate = 1000 / this.maxLife; // How much life to lose per second
        this.smearDecayRate = 1000 / this.maxSmearDuration; // How much smear duration to lose per second
        
        // Decal system properties
        this.lastTrailStamp = { x: this.x, y: this.y };
        this.smearStartTime = 0;
        this.hasBeenStampedToDecal = false;
                this.markedForDecalStamp = false;
    }

    _getBloodColor(colorOverride) {
        let baseRgb;
        if (colorOverride) {
            baseRgb = hexToRgb(colorOverride);
        } else {
            baseRgb = hexToRgb(settings.bloodColor);
        }

        if (!baseRgb) { // Fallback to default red if parsing fails
            baseRgb = { r: 160, g: 15, b: 15 };
        }

        const { r, g, b } = baseRgb;
        const colors = {
            droplet: `rgba(${clamp(r + (Math.random() * 40 - 20), 0, 255)}, ${clamp(g + (Math.random() * 20 - 10), 0, 255)}, ${clamp(b + (Math.random() * 20 - 10), 0, 255)}, ${0.8 + Math.random() * 0.2})`,
            spatter: `rgba(${clamp(r + (Math.random() * 60 - 30), 0, 255)}, ${clamp(g + (Math.random() * 30 - 15), 0, 255)}, ${clamp(b + (Math.random() * 30 - 15), 0, 255)}, ${0.7 + Math.random() * 0.2})`,
            stream: `rgba(${clamp(r + (Math.random() * 40 - 20), 0, 255)}, ${clamp(g + (Math.random() * 20 - 10), 0, 255)}, ${clamp(b + (Math.random() * 20 - 10), 0, 255)}, 0.9)`,
            mist: `rgba(${clamp(r - 40 + Math.random() * 50, 0, 255)}, ${clamp(g - 10 + Math.random() * 10, 0, 255)}, ${clamp(b - 10 + Math.random() * 10, 0, 255)}, ${0.4 + Math.random() * 0.3})`
        };
        return colors[this.type] || colors.droplet;
    }

    update(deltaTime = 16) { // Default to ~60fps if no deltaTime provided
        if (!this.active) {
            return false;
        }

        // Performance optimization: cull check every 10 frames equivalent
        if (Date.now() - this.lastCullCheck > 166) { // ~10 frames at 60fps
            this.checkOffscreen();
            this.lastCullCheck = Date.now();
        }

        // Skip complex physics if offscreen and settled
        if (this.isOffscreen && this.isSplat) {
            this.life -= this.lifeDecayRate * (deltaTime / 1000);
            if (this.life <= 0) {
                this.active = false;
                return true;
            }
            return false;
        }

        if (!this.isSplat) {
            // --- Flying Phase ---
            
            // Capture impact velocity BEFORE applying air resistance
            const impactVelocity = { x: this.vx, y: this.vy };
            
            // Check for collision BEFORE applying air resistance to prevent momentum loss
            const hasCollided = this._updatePhysics();
            
            // Only apply air resistance if we haven't collided
            if (!hasCollided) {
                // Add air resistance based on size
                const airResistance = 1 - (this.size * 0.001);
                this.vx *= Math.pow(airResistance, deltaTime / 16);
                this.vy *= Math.pow(airResistance, deltaTime / 16);
            }

            this.life -= this.lifeDecayRate * (deltaTime / 1000);
            if (hasCollided || this.life <= 0) {
                this.isSplat = true;
                this.hasHitSurface = true;
                this.smearStartTime = Date.now();
                this._handleSurfaceImpact(impactVelocity);
                this._addToTrail(this.x, this.y, this.size);
            }
        } else {
            // --- Pooling and Smearing Phase ---
            this._updatePhysics();
            
            this.smearDuration -= this.smearDecayRate * (deltaTime / 1000);
            
            // Check if particle should be converted to decal
            const currentSpeed = Math.hypot(this.vx, this.vy);
            const timeSpentSmearing = Date.now() - this.smearStartTime;
            
            // Convert to decal if: stopped moving, been smearing for a while, or very small
            if ((currentSpeed < IMMEDIATE_DECAL_THRESHOLD) || 
                (timeSpentSmearing > SMEAR_TO_DECAL_TIME) ||
                (this.size < MIN_SMEAR_SIZE) ||
                (this.smearDuration <= 0)) {
                
                                this.markedForDecalStamp = true;
                return false; // Don't remove yet, let it draw one more frame
            }
            
            // Scale size reduction by deltaTime
            const sizeReductionRate = 0.985;
            this.size *= Math.pow(sizeReductionRate, deltaTime / 16);
            
            // Add to circular buffer trail if moved enough
            const distanceMoved = Math.hypot(this.x - this.lastTrailStamp.x, this.y - this.lastTrailStamp.y);
            if (distanceMoved >= MIN_TRAIL_DISTANCE) {
                this._addToTrail(this.x, this.y, this.size);
                this.lastTrailStamp = { x: this.x, y: this.y };
            }
        }

        return false;
    }

    _stampToDecalCanvas() {
        if (this.hasBeenStampedToDecal) return;
        
        // Get blood decal manager from world
        import('./main.js').then(mainModule => {
            if (window.bloodDecalManager) {
                const trail = this._getTrailEntries();
                if (trail.length > 0) {
                    window.bloodDecalManager.stampTrail(trail, this.color);
                } else {
                    // Single dot if no trail
                    window.bloodDecalManager.stampDot(this.x, this.y, this.size, this.color);
                }
            }
        }).catch(() => {
            // Fallback if bloodDecalManager not available
            console.warn('Blood decal manager not available');
        });
        
        this.hasBeenStampedToDecal = true;
    }

    // Add entry to circular buffer trail
    _addToTrail(x, y, size) {
        this.smearTrail[this.trailHead] = { x, y, size };
        this.trailHead = (this.trailHead + 1) % this.maxTrailLength;
        if (this.trailCount < this.maxTrailLength) {
            this.trailCount++;
        }
    }

    // Get trail entries in order for drawing
    _getTrailEntries() {
        if (this.trailCount === 0) return [];
        
        const entries = [];
        const startIndex = this.trailCount < this.maxTrailLength ? 0 : this.trailHead;
        
        for (let i = 0; i < this.trailCount; i++) {
            const index = (startIndex + i) % this.maxTrailLength;
            entries.push(this.smearTrail[index]);
        }
        
        return entries;
    }

    checkOffscreen() {
        // Get viewport dimensions - use canvas size if available, fallback to reasonable defaults
        let viewportWidth = 1600; // Default fallback
        let viewportHeight = 1200; // Default fallback
        
        // Try to get actual canvas dimensions if available
        if (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) {
            viewportWidth = window.innerWidth;
            viewportHeight = window.innerHeight;
        }
        
        // Make margins relative to viewport size (25% extra on each side)
        const marginX = viewportWidth * 0.25;
        const marginY = viewportHeight * 0.25;
        
        // Handle camera properly with better fallbacks
        if (world.camera) {
            const halfWidth = viewportWidth / 2;
            const halfHeight = viewportHeight / 2;
            
            const cameraLeft = world.camera.x - halfWidth - marginX;
            const cameraRight = world.camera.x + halfWidth + marginX;
            const cameraTop = world.camera.y - halfHeight - marginY;
            const cameraBottom = world.camera.y + halfHeight + marginY;
            
            this.isOffscreen = this.x < cameraLeft || this.x > cameraRight || 
                              this.y < cameraTop || this.y > cameraBottom;
        } else {
            // If no camera available, assume we're within reasonable world bounds
            // Don't cull anything to be safe
            this.isOffscreen = false;
        }
    }

    _checkSurfaceHit() {
        // More sophisticated surface detection
        const speed = Math.hypot(this.vx, this.vy);
        return speed < 0.5; // Particle has slowed to a stop
    }

    _handleSurfaceImpact(impactVelocity = null) {
        // Use provided impact velocity or current velocity as fallback
        const velocityToUse = impactVelocity || { x: this.vx, y: this.vy };
        const impactForce = Math.hypot(velocityToUse.x, velocityToUse.y);
        
        // Normalize force for probability calculations
        const normalizedForce = Math.min(impactForce / MAX_IMPACT_FORCE, 1.0);
        
        // Splatters occur at higher speeds, smearing at lower speeds
        const shouldSplatter = this.size > MIN_SPLATTER_SIZE && impactForce > MIN_SPLATTER_FORCE && 
                              Math.random() < (SPLATTER_BASE_CHANCE + normalizedForce * FORCE_PROBABILITY_WEIGHT);
        const shouldSmear = !shouldSplatter && this.size > MIN_SMEAR_SIZE && impactForce > MIN_SMEAR_FORCE && 
                           Math.random() < (SMEAR_BASE_CHANCE + (1 - normalizedForce) * FORCE_PROBABILITY_WEIGHT);
        
        if (shouldSplatter) {
            // Create splatter: 2-5 smaller droplets in the same general direction
            this._createDirectionalSplatter(impactForce, velocityToUse);
            // Parent droplet sticks in place
            this.vx = 0;
            this.vy = 0;
            this.friction = 0.95; // High friction to stick
            this.smearDuration = 5; // Very short duration, just enough to settle
        } else if (shouldSmear) {
            // Smearing behavior - keep momentum for sliding
            this.friction = this.viscosity * 0.95; // Less friction for smearing
            this.vy *= 0.4; // Reduce but don't eliminate vertical momentum
            this.vx *= 0.8; // Keep horizontal momentum for flowing
        } else {
            // Normal impact behavior - just stick
            this.friction = 0.95;
            this.vy = 0;
            this.vx = 0;
            this.smearDuration = 5; // Short duration to settle quickly
        }
        
        // Larger particles create pools
        if (this.size > 1.5) {
            this.poolSize = this.size * 0.5;
        }
    }

    _createDirectionalSplatter(impactForce, impactVelocity = null) {
        const splatterCount = Math.floor(Math.random() * 4) + 2; // 2-5 droplets
        const velocityToUse = impactVelocity || { x: this.vx, y: this.vy };
        const parentDirection = Math.atan2(velocityToUse.y, velocityToUse.x); // Direction parent was traveling
        
        for (let i = 0; i < splatterCount; i++) {
            // Spread angle around parent direction (within 60 degrees on each side)
            const spreadAngle = (Math.random() - 0.5) * Math.PI * 0.67; // ±60 degrees
            const angle = parentDirection + spreadAngle;
            
            // Speed based on impact force but reduced for smaller droplets
            const speed = (0.6 + Math.random() * 0.8) * Math.min(impactForce * 0.5, 2.5);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            // Smaller size than parent
            const size = this.size * (0.25 + Math.random() * 0.4); // 25-65% of parent size
            
            // Create splatter droplet with short life and high stick tendency
            const splatterDrop = new BloodParticle(
                this.x + Math.cos(angle) * this.size * 0.3, // Offset slightly from parent
                this.y + Math.sin(angle) * this.size * 0.3,
                vx,
                vy,
                size,
                'spatter'
            );
            
            // Make splatter droplets more likely to stick quickly
            splatterDrop.life = 6 + Math.random() * 8; // Shorter flight time
            splatterDrop.smearDuration = 8 + Math.random() * 8; // Short smear duration
            splatterDrop.friction = 0.90; // High friction to stop quickly
            
            particles.push(splatterDrop);
        }
    }

    _createSplatter(impactForce) {
        const splatterCount = Math.min(8, Math.floor(impactForce * 2));
        for (let i = 0; i < splatterCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 0.5 + 0.2) * impactForce * 0.3;
            const size = this.size * (0.2 + Math.random() * 0.3);
            
            particles.push(new BloodParticle(
                this.x + Math.cos(angle) * 2,
                this.y + Math.sin(angle) * 2,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                size,
                'spatter'
            ));
        }
    }

    draw(ctx) {
        // Handle final draw before stamping to decal
        if (this.markedForDecalStamp && !this.hasBeenStampedToDecal) {
            this.drawSmear(ctx);
            return;
        }
        
        // Don't draw if we've been stamped to decal canvas
        if (this.hasBeenStampedToDecal) return;
        
        // If drawing to decal canvas after being deactivated
        if (!this.active && this.trailCount > 0) {
            this.drawSmear(ctx);
            return;
        }
        
        if (!this.active) return; // Don't draw if inactive and has no trail

        if (this.isSplat) {
            // While actively smearing, draw the smear so far
            this.drawSmear(ctx);
        } else {
            // While flying, draw a simple circle
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawSmear(ctx) {
        const trailEntries = this._getTrailEntries();
        
        if (trailEntries.length < 2) {
             if (trailEntries.length === 1) {
                // Draw a single splat if it didn't move
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(trailEntries[0].x, trailEntries[0].y, trailEntries[0].size, 0, Math.PI * 2);
                ctx.fill();
             }
             return;
        }

        ctx.strokeStyle = this.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 1; i < trailEntries.length; i++) {
            const p1 = trailEntries[i-1];
            const p2 = trailEntries[i];
            ctx.lineWidth = Math.max(0.5, p1.size);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    }
}

export class PointBloodEmitter {
    constructor(point, duration = 1000, colorOverride = null) {
        this.active = true;
        this.point = point;
        this.duration = duration;
        this.startTime = Date.now();
        this.lastEmitTime = 0;
        this.emitInterval = 40; // Slightly faster emission
        this.intensity = 1.0; // Decreases over time
        this.colorOverride = colorOverride;
    }

    update(deltaTime = 16) {
        if (!this.active || !this.point) return true; // Return true to be removed

        const now = Date.now();
        if (now > this.startTime + this.duration) {
            this.active = false;
            return true; // Return true to be removed
        }

        // Decrease intensity over time
        this.intensity = 1 - (now - this.startTime) / this.duration;

        if (now > this.lastEmitTime + this.emitInterval) {
            const particleCount = Math.floor(2 * this.intensity) + 1;
            
            for (let i = 0; i < particleCount; i++) {
                const speed = (2 + Math.random() * 2) * this.intensity;
                const angle = Math.random() * Math.PI * 2;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                const size = (Math.random() * 2 + 1) * this.intensity;
                
                // Mix of particle types
                let type = 'droplet';
                if (Math.random() < 0.4 * this.intensity) {
                    type = 'stream';
                } else if (Math.random() < 0.3) {
                    type = 'spatter';
                } else if (Math.random() < 0.1) { // Reduced from 0.15
                    type = 'mist';
                }
                
                particles.push(new BloodParticle(this.point.x, this.point.y, vx, vy, size, type, this.colorOverride));
            }
            this.lastEmitTime = now;
        }

        return false;
    }

    draw(ctx) {
        // This particle is invisible.
    }
}

export class NeckBloodEmitter {
    constructor(ragdollNeckPoint) {
        this.active = true;
        this.neckPoint = ragdollNeckPoint;
        this.duration = 2000; // ms
        this.startTime = Date.now();
        this.lastEmitTime = 0;
        this.emitInterval = 30; // ms
    }

    update(deltaTime = 16) {
        if (!this.active) return true; // Return true to be removed

        const now = Date.now();
        if (now > this.startTime + this.duration) {
            this.active = false;
            return true; // Return true to be removed
        }

        if (now > this.lastEmitTime + this.emitInterval) {
            const particleCount = 2;
            for (let i = 0; i < particleCount; i++) {
                // Eject blood from the neck like a fountain
                const speed = 4 + Math.random() * 4;
                const angle = Math.random() * Math.PI * 2;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                const size = Math.random() * 2.5 + 1;
                
                // Use the neckPoint's current position
                particles.push(new BloodParticle(this.neckPoint.x, this.neckPoint.y, vx, vy, size));
            }
            this.lastEmitTime = now;
        }

        return false; // Continue emitting
    }

    draw(ctx) {
        // This particle is invisible.
    }
}

export function createBloodSplatter(x, y, damage, impactAngle, options = {}) {
    const colorOverride = options.color || null;

    const globalBloodMultiplier = options.bloodyMess || 1.0;

    // Performance limit: max active blood particles
    const currentBloodCount = particles.filter(p => p instanceof BloodParticle).length;
    if (currentBloodCount > 150) { // Limit blood particles
        // Remove oldest blood particles
        for (let i = 0; i < particles.length && currentBloodCount > 150; i++) {
            if (particles[i] instanceof BloodParticle && particles[i].isSplat) {
                particles.splice(i, 1);
                i--;
            }
        }
    }
    
    const particleCount = Math.min(25, Math.ceil(damage / 4)) * globalBloodMultiplier; // Reduced from 35 and /3
    
    for (let i = 0; i < particleCount; i++) {
        // Determine particle type based on damage and random chance
        let particleType = 'droplet';
        if (damage > 50 && Math.random() < 0.2) { // Reduced from 0.3
            particleType = 'stream';
        } else if (damage > 30 && Math.random() < 0.15) { // Reduced from 0.2
            particleType = 'spatter';
        } else if (Math.random() < 0.1) { // Reduced from 0.15
            particleType = 'mist';
        }
        
        // Variable speed and size based on particle type and damage
        let speedMultiplier = 1;
        let sizeMultiplier = 1;
        
        switch(particleType) {
            case 'stream':
                speedMultiplier = 1.5;
                sizeMultiplier = 1.8;
                break;
            case 'spatter':
                speedMultiplier = 1.2;
                sizeMultiplier = 0.8;
                break;
            case 'mist':
                speedMultiplier = 0.6;
                sizeMultiplier = 0.4;
                break;
        }
        
        const speed = (Math.random() * 0.8 + 0.2) * (damage / 15) * speedMultiplier;
        const angle = impactAngle + Math.PI + (Math.random() - 0.5) * Math.PI * 0.9;
        
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        
        const size = (Math.random() * 3 + 1.5) * sizeMultiplier;
        particles.push(new BloodParticle(x, y, vx, vy, size, particleType, colorOverride));
    }
    
    // Reduced additional high-velocity droplets
    if (damage > 40) {
        for (let i = 0; i < 2; i++) { // Reduced from 3
            const speed = (2 + Math.random() * 2) * (damage / 20);
            const angle = impactAngle + Math.PI + (Math.random() - 0.5) * 0.5;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const size = Math.random() * 2 + 2;
            
            particles.push(new BloodParticle(x, y, vx, vy, size, 'stream', colorOverride));
        }
    }
}

export function createHeadChunkParticle(x, y, launchVector, color) {
    const speed = Math.hypot(launchVector.x, launchVector.y) * (1.5 + Math.random());
    const angle = Math.atan2(launchVector.y, launchVector.x) + (Math.random() - 0.5) * 0.5;

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const size = Math.random() * 4 + 4;
    particles.push(new HeadChunk(x, y, vx, vy, size, color));
}