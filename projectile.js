import { world, enemies } from './world.js';

export default class Projectile {
    constructor(x, y, angle, options = {}) {
        this.x = x;
        this.y = y;
        this.radius = options.radius || 4;
        this.bulletSize = options.bulletSize || 1.0; // New: affects visual size and collision
        this.mass = options.mass || 1;
        this.damage = options.damage || 20;
        this.color = options.color || '#ffcc00'; // Yellowish, like a tracer
        this.speed = options.speed || 25;
        this.maxSpeed = options.maxSpeed || this.speed;
        this.minSpeed = options.minSpeed || this.speed * 0.1;
        this.isHeadshot = options.isHeadshot || false;
        this.weaponName = options.weaponName || 'Unknown';
        this.shotId = options.shotId || null;
        this.owner = options.owner || null;
        this.piercing = options.piercing || false;
        this.tracking = options.tracking || false;
                this.trackingStrength = options.trackingStrength || 1.1;
        this.hasHit = false; // For piercing projectiles
        this.seeksCops = options.seeksCops || false;
        this.civilianDamage = options.civilianDamage || 1.0;
        this.bleedChance = options.bleedChance || 0.0;
        this.bleedDps = options.bleedDps || 0;
        this.bloodyMess = options.bloodyMess || 1.0; // New gore modifier
        this.dismemberChance = options.dismemberChance || 0.0; // New dismemberment modifier
        this.splitOnHit = options.splitOnHit || false;
        this.bouncing = options.bouncing || false;
        this.bounceCount = 0;
        this.maxBounces = options.maxBounces || 3;
        this.onHitEffect = options.onHitEffect || null; // 'zombify', etc.
        this.sticksToTarget = options.sticksToTarget || false;
        this.stuckTo = null;
        this.stuckOffset = { x: 0, y: 0 };
        
        // New hit reaction modifiers
        this.explodeOnHit = options.explodeOnHit || false;
        this.explosionRadius = options.explosionRadius || 100;
        this.explosionDamage = options.explosionDamage || 50;
        this.fireAreaOnHit = options.fireAreaOnHit || false;
        this.fireAreaRadius = options.fireAreaRadius || 80;
        this.fireAreaDuration = options.fireAreaDuration || 5000;
        this.toxicOnHit = options.toxicOnHit || false;
        this.toxicRadius = options.toxicRadius || 60;
        this.toxicDamage = options.toxicDamage || 3;
        this.toxicDuration = options.toxicDuration || 8000;
        
        // Timer-based effects
        this.timedFireArea = options.timedFireArea || false;
        this.timedFireInterval = options.timedFireInterval || 3000;
        this.timedExplosion = options.timedExplosion || false;
        this.timedExplosionDelay = options.timedExplosionDelay || 2000;
        this.timedToxic = options.timedToxic || false;
        this.timedToxicInterval = options.timedToxicInterval || 2500;
        
        // Timer tracking
        this.creationTime = Date.now();
        this.lastTimedEffect = 0;

        // New path modifier properties
        this.pathType = options.pathType || 'straight'; // 'straight', 'zigzag', 'spiral', 'wave'
        this.pathProgress = 0;
                this.pathAmplitude = options.pathAmplitude || 20;
                this.pathFrequency = options.pathFrequency || 0.1;
                this.spiralRadius = options.spiralRadius || 50;
        this.baseAngle = angle; // Store original firing angle
        
        // Initialize velocity
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        
        // Tracking variables
        this.trackingTarget = null;
        
        // Apply bullet size to visual and collision radius
        this.visualRadius = this.radius * this.bulletSize;
        this.collisionRadius = this.radius * Math.sqrt(this.bulletSize); // Square root for more balanced scaling
        this.knockback = options.knockback || 0;
        
        // Bouncing fix - ensure proper initialization
        this.bounceResistance = 0.1; // Minimum speed after bounce to continue bouncing
        this.lastBounceTime = 0;
        this.bounceCooldown = 100; // Prevent rapid successive bounces
    }

    update() {
        if (this.stuckTo) {
            if (this.stuckTo.health <= 0 || (this.onHitEffect === 'zombify' && this.stuckTo.isZombie)) {
                // If the target dies, or if it has been successfully zombified,
                // the projectile should detach.
                this.stuckTo = null;
                
                // If it's a zombifying projectile, it should just disappear.
                if (this.onHitEffect === 'zombify') {
                    this.vx = 0;
                    this.vy = 0;
                    // Returning true will signal for its removal from the projectiles array in the main loop
                    return true;
                }

                // For other projectiles, give a little velocity so it falls to the ground
                this.vx = (Math.random() - 0.5) * 2;
                this.vy = (Math.random() - 0.5) * 2;
            } else {
                // Check for timed effects even while stuck
                this.handleTimerEffects(Date.now());
                if (this.onHitEffect === 'zombify') {
                    return; // No other updates for zombify projectiles
                }

                // Update position to stay stuck to the target
                this.x = this.stuckTo.x + this.stuckOffset.x;
                this.y = this.stuckTo.y + this.stuckOffset.y;
                return; // Don't do other updates
            }
        }

        this.pathProgress += 0.1;
        const now = Date.now();
        
        // Handle timer-based effects
        this.handleTimerEffects(now);
        
        // Apply path modifiers before tracking
        this.applyPathModifiers();
        
        // Enhanced tracking behavior
        if ((this.tracking || this.seeksCops) && this.owner) {
            let targets = [];
            if (this.owner === world.player) {
                if (this.seeksCops) {
                    targets = enemies.filter(e => e.isCop);
                } else {
                    targets = enemies;
                }
            } else {
                targets = [world.player];
            }
            
            let closestTarget = null;
            let closestDist = Infinity;
            
            for (const target of targets) {
                if (!target || target.health <= 0) continue;
                const dist = Math.hypot(this.x - target.x, this.y - target.y);
                if (dist < closestDist && dist < 300) { // Max tracking range
                    closestDist = dist;
                    closestTarget = target;
                }
            }
            
            if (closestTarget) {
                const targetAngle = Math.atan2(closestTarget.y - this.y, closestTarget.x - this.x);
                const currentAngle = Math.atan2(this.vy, this.vx);
                
                let angleDiff = targetAngle - currentAngle;
                if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                
                const trackingStrength = this.seeksCops ? 0.15 : this.trackingStrength;
                const newAngle = currentAngle + angleDiff * trackingStrength;
                this.vx = Math.cos(newAngle) * this.speed;
                this.vy = Math.sin(newAngle) * this.speed;
            }
        }
        
        this.x += this.vx;
        this.y += this.vy;
    }

    handleTimerEffects(now) {
        const timeAlive = now - this.creationTime;
        
        // Timed fire area effect
        if (this.timedFireArea && timeAlive > this.timedFireInterval && now - this.lastTimedEffect > this.timedFireInterval) {
            this.createFireArea(this.x, this.y, this.fireAreaRadius, this.fireAreaDuration);
            this.lastTimedEffect = now;
        }
        
        // Timed explosion effect
        if (this.timedExplosion && timeAlive > this.timedExplosionDelay) {
            this.createExplosion(this.x, this.y, this.explosionRadius, this.explosionDamage);
            return true; // Remove projectile after explosion
        }
        
        // Timed toxic area effect
        if (this.timedToxic && timeAlive > this.timedToxicInterval && now - this.lastTimedEffect > this.timedToxicInterval) {
            this.createToxicArea(this.x, this.y, this.toxicRadius, this.toxicDuration);
            this.lastTimedEffect = now;
        }
        
        return false;
    }

    createSplitProjectiles() {
        if (!this.splitOnHit) return [];
        
        const fragments = [];
        const fragmentCount = 3 + Math.floor(Math.random() * 3); // 3-5 fragments
        
        for (let i = 0; i < fragmentCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = this.speed * (0.6 + Math.random() * 0.4);
            
            fragments.push(new Projectile(this.x, this.y, angle, {
                radius: this.radius * 0.7,
                mass: this.mass * 0.5,
                damage: this.damage * 0.4,
                speed: speed,
                weaponName: this.weaponName + ' Fragment',
                owner: this.owner,
                civilianDamage: this.civilianDamage,
                bleedChance: this.bleedChance * 0.5
            }));
        }
        
        return fragments;
    }

    bounce(hitNormal) {
        const now = Date.now();
        
        // Prevent rapid successive bounces and ensure minimum speed
        if (!this.bouncing || this.bounceCount >= this.maxBounces || 
            now - this.lastBounceTime < this.bounceCooldown) {
            return false;
        }
        
        const currentSpeed = Math.hypot(this.vx, this.vy);
        if (currentSpeed < this.bounceResistance) {
            return false; // Too slow to bounce
        }
        
        // Reflect velocity off the surface
        const dot = this.vx * hitNormal.x + this.vy * hitNormal.y;
        this.vx = this.vx - 2 * dot * hitNormal.x;
        this.vy = this.vy - 2 * dot * hitNormal.y;
        
        // Reduce speed with each bounce but maintain minimum
        const speedReduction = 0.75;
        const newSpeed = Math.max(this.bounceResistance * 2, currentSpeed * speedReduction);
        
        const velMag = Math.hypot(this.vx, this.vy);
        if (velMag > 0) {
            this.vx = (this.vx / velMag) * newSpeed;
            this.vy = (this.vy / velMag) * newSpeed;
            this.speed = newSpeed;
        }
        
        this.bounceCount++;
        this.lastBounceTime = now;
        
        // Create bounce effect
        this.createBounceEffect();
        
        return true;
    }

    createBounceEffect() {
        // Create small spark particles at bounce location
        import('./world.js').then(worldModule => {
            const { particles } = worldModule;
            for (let i = 0; i < 3; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 2 + 1;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                particles.push(new BounceSparkParticle(this.x, this.y, vx, vy));
            }
        });
    }

    createExplosion(x, y, radius, damage) {
        import('./world.js').then(worldModule => {
            const { enemies, particles } = worldModule;
            import('./visual-effects.js').then(effectsModule => {
                // Create explosion visual effect
                particles.push(new effectsModule.Explosion(x, y, radius));
            });
            
            // Damage all entities in radius
            this.damageInRadius(x, y, radius, damage, 'explosion');
        });
    }

    createFireArea(x, y, radius, duration) {
        import('./world.js').then(worldModule => {
            const { particles } = worldModule;
            particles.push(new FireAreaEffect(x, y, radius, duration, this.fireAreaOnHit ? this.fireAreaRadius : 5));
        });
    }

    createToxicArea(x, y, radius, duration) {
        import('./world.js').then(worldModule => {
            const { particles } = worldModule;
            particles.push(new ToxicAreaEffect(x, y, radius, duration, this.toxicOnHit ? this.toxicRadius : 5));
        });
    }

    damageInRadius(x, y, radius, damage, effectType) {
        import('./world.js').then(worldModule => {
            const { enemies, world } = worldModule;
            
            // Damage player if in range
            if (world.player && !world.player.isDead) {
                const distToPlayer = Math.hypot(x - world.player.x, y - world.player.y);
                if (distToPlayer <= radius) {
                    const falloff = 1 - (distToPlayer / radius);
                    const finalDamage = damage * falloff;
                    const impactAngle = Math.atan2(world.player.y - y, world.player.x - x);
                    world.player.takeDamage(finalDamage, impactAngle, {
                        weaponName: this.weaponName + ` (${effectType})`,
                        owner: this.owner
                    });
                }
            }
            
            // Damage enemies in range
            for (const enemy of enemies) {
                if (enemy.health <= 0) continue;
                const dist = Math.hypot(x - enemy.x, y - enemy.y);
                if (dist <= radius) {
                    const falloff = 1 - (dist / radius);
                    const finalDamage = damage * falloff;
                    const impactAngle = Math.atan2(enemy.y - y, enemy.x - x);
                    enemy.takeDamage(finalDamage, impactAngle, {
                        weaponName: this.weaponName + ` (${effectType})`,
                        owner: this.owner
                    });
                }
            }
        });
    }

    handleHitEffects(hitX, hitY) {
        // Explosion on hit
        if (this.explodeOnHit) {
            this.createExplosion(hitX, hitY, this.explosionRadius, this.explosionDamage);
        }
        
        // Fire area on hit
        if (this.fireAreaOnHit) {
            this.createFireArea(hitX, hitY, this.fireAreaRadius, this.fireAreaDuration);
        }
        
        // Toxic area on hit
        if (this.toxicOnHit) {
            this.createToxicArea(hitX, hitY, this.toxicRadius, this.toxicDuration);
        }
    }

    applyPathModifiers() {
        const currentSpeed = Math.hypot(this.vx, this.vy);
        
        switch(this.pathType) {
            case 'zigzag':
                const zigzagOffset = Math.sin(this.pathProgress * this.pathFrequency) * this.pathAmplitude;
                const perpAngle = this.baseAngle + Math.PI / 2;
                this.x += Math.cos(perpAngle) * zigzagOffset * 0.1;
                this.y += Math.sin(perpAngle) * zigzagOffset * 0.1;
                break;
                
            case 'spiral':
                const target = world.player; // Always orbit the player
                if (target && !target.isDead) {
                    const distToTarget = Math.hypot(this.x - target.x, this.y - target.y);
                    const angleToTarget = Math.atan2(this.y - target.y, this.x - target.x);
            
                    // Force towards/away from target to maintain orbit radius
                    const radiusError = distToTarget - this.spiralRadius;
                                        const radialCorrectionStrength = 0.1;
                    const radialForceFactor = -radiusError * radialCorrectionStrength; 
                    const radialVx = Math.cos(angleToTarget) * radialForceFactor;
                    const radialVy = Math.sin(angleToTarget) * radialForceFactor;
            
                    // Tangential force to make it orbit
                    const tangentialAngle = angleToTarget + Math.PI / 2;
                                        const orbitSpeedFactor = 1.0; 
                    const tangentialSpeed = this.speed * this.pathFrequency * 10 * orbitSpeedFactor;
                    const tangentialVx = Math.cos(tangentialAngle) * tangentialSpeed;
                    const tangentialVy = Math.sin(tangentialAngle) * tangentialSpeed;
                    
                    // Combine forces
                    const lerpFactor = 0.2;
                    this.vx = (1 - lerpFactor) * this.vx + lerpFactor * (radialVx + tangentialVx);
                    this.vy = (1 - lerpFactor) * this.vy + lerpFactor * (radialVy + tangentialVy);
            
                    // Re-normalize to maintain speed
                    const currentMag = Math.hypot(this.vx, this.vy);
                    if (currentMag > 0) {
                        this.vx = (this.vx / currentMag) * this.speed;
                        this.vy = (this.vy / currentMag) * this.speed;
                    }
                }
                break;
                
            case 'wave':
                const waveOffset = Math.sin(this.pathProgress * this.pathFrequency) * this.pathAmplitude;
                const waveAngle = this.baseAngle + Math.PI / 2;
                const waveStrength = 0.05;
                this.vx += Math.cos(waveAngle) * waveOffset * waveStrength;
                this.vy += Math.sin(waveAngle) * waveOffset * waveStrength;
                
                // Normalize speed
                const waveMag = Math.hypot(this.vx, this.vy);
                if (waveMag > 0) {
                    this.vx = (this.vx / waveMag) * currentSpeed;
                    this.vy = (this.vy / waveMag) * currentSpeed;
                }
                break;
        }
        
        // Apply speed variation
        if (this.maxSpeed !== this.minSpeed) {
            const speedVariation = Math.sin(this.pathProgress * 0.05) * 0.5 + 0.5;
            const targetSpeed = this.minSpeed + (this.maxSpeed - this.minSpeed) * speedVariation;
            const currentMag = Math.hypot(this.vx, this.vy);
            if (currentMag > 0) {
                this.vx = (this.vx / currentMag) * targetSpeed;
                this.vy = (this.vy / currentMag) * targetSpeed;
                this.speed = targetSpeed;
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Custom drawing for syringes
        if (this.onHitEffect === 'zombify' || this.bleedDps > 0) {
            const angle = Math.atan2(this.vy, this.vx);
            ctx.rotate(angle);

            const s_length = 15;
            const s_width = 3;

            // Plunger
            ctx.fillStyle = '#888';
            ctx.fillRect(-s_length, -s_width/2, s_length * 0.4, s_width);
            
            // Body
            ctx.fillStyle = 'rgba(200, 220, 255, 0.7)';
            ctx.fillRect(-s_length * 0.6, -s_width/2, s_length * 0.6, s_width);

            // Liquid
            ctx.fillStyle = this.color;
            ctx.fillRect(-s_length * 0.6, -s_width/2, s_length * 0.5, s_width);

            // Needle
            ctx.fillStyle = '#ccc';
            ctx.fillRect(0, -1, s_length * 0.4, 2);
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, this.visualRadius, 0, Math.PI * 2);
            
            // Special colors for special projectiles
            if (this.explodeOnHit || this.timedExplosion) {
                ctx.fillStyle = '#ff6600'; // Orange for explosive
            } else if (this.fireAreaOnHit || this.timedFireArea) {
                ctx.fillStyle = '#ff3300'; // Red for fire
            } else if (this.toxicOnHit || this.timedToxic) {
                ctx.fillStyle = '#33ff33'; // Green for toxic
            } else if (this.bouncing) {
                ctx.fillStyle = '#00ccff'; // Cyan for bouncing
            } else {
                ctx.fillStyle = this.color;
            }
            
            ctx.fill();
            
            // Add size-based visual effects
            if (this.bulletSize > 1.5) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            
            // Add special effect glows
            if (this.explodeOnHit || this.timedExplosion || this.fireAreaOnHit || this.timedFireArea) {
                ctx.beginPath();
                ctx.arc(0, 0, this.visualRadius * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 100, 0, 0.3)';
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

// New particle effects for special projectile behaviors
class BounceSparkParticle {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = 0.5;
        this.decay = 0.05;
        this.size = Math.random() * 2 + 1;
        this.active = true;
    }

    update() {
        if (!this.active) return false;
        
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.9;
        this.vy *= 0.9;
        
        this.life -= this.decay;
        if (this.life <= 0) {
            this.active = false;
        }
        
        return false;
    }

    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class FireAreaEffect {
    constructor(x, y, radius, duration, damage) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.duration = duration;
        this.damage = damage;
        this.startTime = Date.now();
        this.lastDamageTime = 0;
        this.damageInterval = 500; // Damage every 500ms
        this.active = true;
    }

    update() {
        const now = Date.now();
        if (now - this.startTime > this.duration) {
            this.active = false;
            return false;
        }
        
        // Apply damage to entities in area
        if (now - this.lastDamageTime > this.damageInterval) {
            this.applyDamage();
            this.lastDamageTime = now;
        }
        
        return false;
    }

    applyDamage() {
        import('./world.js').then(worldModule => {
            const { enemies } = worldModule;
            
            // Damage player
            if (world.player && !world.player.isDead) {
                const dist = Math.hypot(this.x - world.player.x, this.y - world.player.y);
                if (dist <= this.radius) {
                    world.player.takeDamage(this.damage, 0, { weaponName: 'Fire Area' });
                }
            }
            
            // Damage enemies
            for (const enemy of enemies) {
                if (enemy.health <= 0) continue;
                const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                if (dist <= this.radius) {
                    enemy.takeDamage(this.damage, 0, { weaponName: 'Fire Area' });
                }
            }
        });
    }

    draw(ctx) {
        if (!this.active) return;
        
        const progress = (Date.now() - this.startTime) / this.duration;
        const alpha = 1 - progress;
        
        // Draw fire effect
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = '#ff4400';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw inner core
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class ToxicAreaEffect {
    constructor(x, y, radius, duration, damage) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.duration = duration;
        this.damage = damage;
        this.startTime = Date.now();
        this.lastDamageTime = 0;
        this.damageInterval = 1000; // Damage every 1000ms
        this.active = true;
    }

    update() {
        const now = Date.now();
        if (now - this.startTime > this.duration) {
            this.active = false;
            return false;
        }
        
        // Apply damage to entities in area
        if (now - this.lastDamageTime > this.damageInterval) {
            this.applyDamage();
            this.lastDamageTime = now;
        }
        
        return false;
    }

    applyDamage() {
        import('./world.js').then(worldModule => {
            const { enemies } = worldModule;
            
            // Damage player
            if (world.player && !world.player.isDead) {
                const dist = Math.hypot(this.x - world.player.x, this.y - world.player.y);
                if (dist <= this.radius) {
                    world.player.takeDamage(this.damage, 0, { weaponName: 'Toxic Area' });
                }
            }
            
            // Damage enemies
            for (const enemy of enemies) {
                if (enemy.health <= 0) continue;
                const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                if (dist <= this.radius) {
                    enemy.takeDamage(this.damage, 0, { weaponName: 'Toxic Area' });
                }
            }
        });
    }

    draw(ctx) {
        if (!this.active) return;
        
        const progress = (Date.now() - this.startTime) / this.duration;
        const alpha = 1 - progress;
        const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
        
        // Draw toxic cloud effect
        ctx.save();
        ctx.globalAlpha = alpha * 0.4 * pulse;
        ctx.fillStyle = '#44ff44';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw inner core
        ctx.globalAlpha = alpha * 0.6 * pulse;
        ctx.fillStyle = '#88ff88';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}