import { world } from './world.js';

export class RagdollPoint {
    constructor(x, y, radius = 4) {
        this.x = x;
        this.y = y;
        this.oldx = x;
        this.oldy = y;
        this.friction = 0.98;
        this.gravity = 0;
        this.radius = radius;
    }

    update() {
        const vx = (this.x - this.oldx) * this.friction;
        const vy = (this.y - this.oldy) * this.friction;

        this.oldx = this.x;
        this.oldy = this.y;

        this.x += vx;
        this.y += vy + this.gravity;
    }
}

export class RagdollStick {
    constructor(p0, p1) {
        this.p0 = p0;
        this.p1 = p1;
        this.length = Math.hypot(this.p0.x - this.p1.x, this.p0.y - this.p1.y);
    }

    update() {
        const dx = this.p1.x - this.p0.x;
        const dy = this.p1.y - this.p0.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        const diff = this.length - dist;
        const percent = diff / dist / 2; // /2 because each point moves half the distance
        const offsetX = dx * percent;
        const offsetY = dy * percent;

        this.p0.x -= offsetX;
        this.p0.y -= offsetY;
        this.p1.x += offsetX;
        this.p1.y += offsetY;
    }
}

export default class Ragdoll {
    constructor(x, y, launchVector, color = '#33cc33', options = {}) {
        this.points = [];
        this.sticks = [];
        this.active = true;
        this.settleThreshold = 0.1;
        this.color = color;
        this.hasMissingHeadChunk = options.hasMissingHeadChunk || false;
        this.isHeadExploded = options.isHeadExploded || false;
        this.isSeveredLimb = options.isSeveredLimb || false;
        this.severedLimbType = options.severedLimbType || null;
        this.limbs = options.limbs || {
            leftArm: true,
            rightArm: true,
            leftLeg: true,
            rightLeg: true
        };
        
        if (this.hasMissingHeadChunk) {
            this.missingChunkAngle = Math.random() * Math.PI * 2;
            this.missingChunkSize = Math.PI / 2 + (Math.random() - 0.5) * 0.5; // Angle of the gap
        }

        if (this.isSeveredLimb) {
            this._createSeveredLimb(x, y);
        } else {
            this._createBody(x, y);
        }
        this._applyLaunch(launchVector);
    }
    
    _createSeveredLimb(x, y) {
        const limbRadius = 5;
        
        if (this.severedLimbType === 'leftArm' || this.severedLimbType === 'rightArm') {
            // Create simplified arm: shoulder -> elbow -> wrist -> hand (4 nodes, 3 segments, but we'll use 2 main segments)
            const shoulder = new RagdollPoint(x, y, limbRadius);
            const elbow = new RagdollPoint(x - 15, y + 8, limbRadius);
            const wrist = new RagdollPoint(x - 25, y + 12, limbRadius);
            const hand = new RagdollPoint(x - 30, y + 15, limbRadius);
            
            this.neckPoint = shoulder; // For blood emitter attachment
            this.points.push(shoulder, elbow, wrist, hand);
            this.sticks.push(new RagdollStick(shoulder, elbow));   // Upper arm
            this.sticks.push(new RagdollStick(elbow, wrist));     // Forearm
            // Skip wrist->hand connection to keep it at 2 segments
        } else if (this.severedLimbType === 'leftLeg' || this.severedLimbType === 'rightLeg') {
            // Create simplified leg: hip -> knee -> ankle -> foot (4 nodes, 2 main segments)
            const hip = new RagdollPoint(x, y, limbRadius);
            const knee = new RagdollPoint(x - 8, y + 15, limbRadius);
            const ankle = new RagdollPoint(x - 12, y + 25, limbRadius);
            const foot = new RagdollPoint(x - 15, y + 30, limbRadius);
            
            this.neckPoint = hip; // For blood emitter attachment
            this.points.push(hip, knee, ankle, foot);
            this.sticks.push(new RagdollStick(hip, knee));        // Upper leg
            this.sticks.push(new RagdollStick(knee, ankle));      // Lower leg
            // Skip ankle->foot connection to keep it at 2 segments
        }
    }
    
    _createBody(x, y) {
        const headRadius = 8;
        const neckY = y - 18;
        const waistY = y;
        const armY = y - 15;
        const footY = y + 20;

        const torsoRadius = 6;
        const limbRadius = 5;

        const neck = new RagdollPoint(x, neckY, torsoRadius);
        const waist = new RagdollPoint(x, waistY, torsoRadius);
        
        this.neckPoint = neck; // Expose for blood emitter
        this.points.push(neck, waist);

        if (this.limbs.leftArm) {
            const leftElbow = new RagdollPoint(x - 12, armY - 5, limbRadius);
            const leftHand = new RagdollPoint(x - 20, armY, limbRadius);
            this.points.push(leftElbow, leftHand);
            this.sticks.push(new RagdollStick(neck, leftElbow));     // L upper arm
            this.sticks.push(new RagdollStick(leftElbow, leftHand)); // L forearm
        }
        if (this.limbs.rightArm) {
            const rightElbow = new RagdollPoint(x + 12, armY - 5, limbRadius);
            const rightHand = new RagdollPoint(x + 20, armY, limbRadius);
            this.points.push(rightElbow, rightHand);
            this.sticks.push(new RagdollStick(neck, rightElbow));      // R upper arm
            this.sticks.push(new RagdollStick(rightElbow, rightHand)); // R forearm
        }
        if (this.limbs.leftLeg) {
            const leftKnee = new RagdollPoint(x - 6, footY - 10, limbRadius);
            const leftFoot = new RagdollPoint(x - 10, footY, limbRadius);
            this.points.push(leftKnee, leftFoot);
            this.sticks.push(new RagdollStick(waist, leftKnee));     // L upper leg
            this.sticks.push(new RagdollStick(leftKnee, leftFoot)); // L lower leg
        }
        if (this.limbs.rightLeg) {
            const rightKnee = new RagdollPoint(x + 6, footY - 10, limbRadius);
            const rightFoot = new RagdollPoint(x + 10, footY, limbRadius);
            this.points.push(rightKnee, rightFoot);
            this.sticks.push(new RagdollStick(waist, rightKnee));      // R upper leg
            this.sticks.push(new RagdollStick(rightKnee, rightFoot)); // R lower leg
        }

        if (!this.isHeadExploded) {
            const head = new RagdollPoint(x, neckY - headRadius, headRadius);
            this.headPoint = head;
            this.points.push(head);
            this.sticks.push(new RagdollStick(head, neck));
        } else {
            this.headPoint = null;
        }

        // Sticks define the "skeleton"
        this.sticks.push(new RagdollStick(neck, waist));      // body
    }
    
    _applyLaunch(launchVector) {
        for (const p of this.points) {
            // Give each point a slightly randomized push based on the launch vector
            p.oldx -= launchVector.x + (Math.random() - 0.5) * 4;
            p.oldy -= launchVector.y + (Math.random() - 0.5) * 4;
        }
    }

    _solveCollisions() {
        const points = this.points;
        const pointCount = points.length;
        for (let i = 0; i < pointCount; i++) {
            const p1 = points[i];
            for (let j = i + 1; j < pointCount; j++) {
                const p2 = points[j];

                // Points connected by a stick are handled by the stick constraint,
                // so we don't need to apply a collision response between them.
                // This prevents the constraints from fighting each other.
                let areConnected = false;
                for (const stick of this.sticks) {
                    if ((stick.p0 === p1 && stick.p1 === p2) || (stick.p0 === p2 && stick.p1 === p1)) {
                        areConnected = true;
                        break;
                    }
                }
                if (areConnected) continue;

                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.hypot(dx, dy);
                const min_dist = p1.radius + p2.radius;

                if (dist < min_dist && dist > 0) {
                    const overlap = (min_dist - dist);
                    const percent = overlap / dist / 2;
                    const offsetX = dx * percent;
                    const offsetY = dy * percent;
                    
                    p1.x += offsetX;
                    p1.y += offsetY;
                    p2.x -= offsetX;
                    p2.y -= offsetY;
                }
            }
        }
    }

    update() {
        if (!this.active) return false;

        for (const p of this.points) {
            p.update();
        }

        // Multiple iterations of stick constraints for stability
        for (let i = 0; i < 5; i++) { 
            for (const s of this.sticks) {
                s.update();
            }
            this._solveCollisions();
            for (const p of this.points) {
                this._constrainPoint(p);
            }
        }
        
        let totalSpeed = 0;
        for (const p of this.points) {
            totalSpeed += Math.hypot(p.x - p.oldx, p.y - p.oldy);
        }

        // If the ragdoll has stopped moving, it "settles"
        if (totalSpeed < this.settleThreshold) {
            this.active = false;
            return true; // just settled
        }
        
        return false; // still active
    }

    _constrainPoint(p) {
        const bounceDamping = 0.7;
        
        const vx = p.x - p.oldx;
        const vy = p.y - p.oldy;

        // Building collision
        if (world.city) {
            for (const building of world.city.buildings) {
                if (p.x >= building.x && p.x <= building.x + building.width &&
                    p.y >= building.y && p.y <= building.y + building.height) {
                    
                    // Find closest edge and push out
                    const distToLeft = p.x - building.x;
                    const distToRight = (building.x + building.width) - p.x;
                    const distToTop = p.y - building.y;
                    const distToBottom = (building.y + building.height) - p.y;
                    
                    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                    
                    if (minDist === distToLeft) {
                        p.x = building.x;
                        p.oldx = p.x + vx * bounceDamping;
                    } else if (minDist === distToRight) {
                        p.x = building.x + building.width;
                        p.oldx = p.x + vx * bounceDamping;
                    } else if (minDist === distToTop) {
                        p.y = building.y;
                        p.oldy = p.y + vy * bounceDamping;
                    } else {
                        p.y = building.y + building.height;
                        p.oldy = p.y + vy * bounceDamping;
                    }
                }
            }
        }

        if (p.x < world.wallThickness + p.radius) {
            p.x = world.wallThickness + p.radius;
            p.oldx = p.x + vx * bounceDamping;
        } else if (p.x > world.width - world.wallThickness - p.radius) {
            p.x = world.width - world.wallThickness - p.radius;
            p.oldx = p.x + vx * bounceDamping;
        }
        if (p.y < world.wallThickness + p.radius) {
            p.y = world.wallThickness + p.radius;
            p.oldy = p.y + vy * bounceDamping;
        } else if (p.y > world.height - world.wallThickness - p.radius) {
            p.y = world.height - world.wallThickness - p.radius;
            p.oldy = p.y + vy * bounceDamping;
        }
    }

    explodeHead() {
        if (this.headPoint) {
            // Remove stick connecting head to neck
            this.sticks = this.sticks.filter(s => s.p0 !== this.headPoint && s.p1 !== this.headPoint);
            // Remove headPoint from simulation
            this.points = this.points.filter(p => p !== this.headPoint);
            this.headPoint = null;
            this.isHeadExploded = true;
        }
    }

    draw(ctx) {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';

        for (const stick of this.sticks) {
            ctx.beginPath();
            ctx.moveTo(stick.p0.x, stick.p0.y);
            ctx.lineTo(stick.p1.x, stick.p1.y);
            ctx.stroke();
        }

        if (this.headPoint) {
            ctx.fillStyle = this.color;
            ctx.beginPath();
    
            if (this.hasMissingHeadChunk) {
                const startAngle = this.missingChunkAngle;
                const endAngle = startAngle + (Math.PI * 2 - this.missingChunkSize);
                ctx.arc(this.headPoint.x, this.headPoint.y, this.headPoint.radius, startAngle, endAngle);
            } else {
                ctx.arc(this.headPoint.x, this.headPoint.y, this.headPoint.radius, 0, Math.PI * 2);
            }
            
            ctx.fill();
        }

        // Draw joint centers (for dev use)
        /*
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        for (const p of this.points) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        */
    }
}