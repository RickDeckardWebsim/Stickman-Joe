// remote-entity.js — client-side render-only stubs for host-authoritative entities

export function drawEnemy(ctx, snap) {
    ctx.save();
    ctx.translate(snap.x, snap.y);
    ctx.rotate(snap.angle);

    const color = snap.isZombie ? '#5a7d59' : (snap.isCop ? '#3a5a8a' : '#d6a57c');
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;

    // Torso
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -10);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(0, -15, 5, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(snap.ll ? -5 : 0, 10);
    ctx.moveTo(0, 0);
    ctx.lineTo(snap.rl ? 5 : 0, 10);
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(snap.la ? -8 : 0, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(snap.ra ? 8 : 0, 0);
    ctx.stroke();

    // Health bar
    if (snap.health < snap.maxHealth && snap.health > 0) {
        ctx.rotate(-snap.angle);
        const barW = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW/2, -25, barW, 4);
        ctx.fillStyle = snap.health > snap.maxHealth * 0.5 ? '#4a4' : '#a44';
        ctx.fillRect(-barW/2, -25, barW * (snap.health / snap.maxHealth), 4);
    }

    ctx.restore();

    // Draw catch ball in world space (outside NPC transform)
    if (snap.ballX !== null && snap.ballY !== null) {
        ctx.beginPath();
        ctx.arc(snap.ballX, snap.ballY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#e8e8e8';
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

export function drawPlayer(ctx, snap) {
    ctx.save();
    ctx.translate(snap.x, snap.y);
    ctx.rotate(snap.angle);

    ctx.strokeStyle = '#4a8a4a';
    ctx.fillStyle = '#4a8a4a';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -12);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -18, 7, 0, Math.PI * 2);
    ctx.fill();

    // Weapon
    if (snap.weapon && snap.weapon.name) {
        ctx.fillStyle = '#222';
        ctx.fillRect(15, -2, 30, 4);
    }

    ctx.restore();

    // Label + health bar (un-rotated)
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Player 2', snap.x, snap.y - 35);

    if (snap.health < snap.maxHealth) {
        const barW = 40;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(snap.x - barW/2, snap.y - 30, barW, 4);
        ctx.fillStyle = '#4a4';
        ctx.fillRect(snap.x - barW/2, snap.y - 30, barW * (snap.health / snap.maxHealth), 4);
    }
    ctx.restore();
}

export class RemoteEnemy {
    constructor(snap) {
        Object.assign(this, snap);
        this.targetX = snap.x;
        this.targetY = snap.y;
        this.targetAngle = snap.angle;
    }
    applyDelta(fields) {
        if (fields.x !== undefined) this.targetX = fields.x;
        if (fields.y !== undefined) this.targetY = fields.y;
        if (fields.angle !== undefined) this.targetAngle = fields.angle;
        Object.assign(this, fields);
    }
    interpolate(alpha) {
        this.x += (this.targetX - this.x) * alpha;
        this.y += (this.targetY - this.y) * alpha;
        this.angle += (this.targetAngle - this.angle) * alpha;
    }
    draw(ctx) { drawEnemy(ctx, this); }
}

export class RemotePlayer {
    constructor(snap) {
        Object.assign(this, snap);
        this.targetX = snap.x;
        this.targetY = snap.y;
        this.targetAngle = snap.angle;
    }
    applyDelta(fields) {
        if (fields.x !== undefined) this.targetX = fields.x;
        if (fields.y !== undefined) this.targetY = fields.y;
        if (fields.angle !== undefined) this.targetAngle = fields.angle;
        Object.assign(this, fields);
    }
    interpolate(alpha) {
        this.x += (this.targetX - this.x) * alpha;
        this.y += (this.targetY - this.y) * alpha;
        this.angle += (this.targetAngle - this.angle) * alpha;
    }
    draw(ctx) { drawPlayer(ctx, this); }
}

export class RemotePickup {
    constructor(snap) {
        Object.assign(this, snap);
        this.bob = Math.random() * Math.PI * 2;
    }
    applyDelta(fields) { Object.assign(this, fields); }
    interpolate(alpha) { this.bob += 0.05; }
    draw(ctx) {
        const bobOffset = Math.sin(this.bob) * 5;
        ctx.fillStyle = 'rgba(255, 255, 100, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobOffset, 37, 0, Math.PI * 2);
        ctx.fill();
    }
}

export class RemoteDeadDrop {
    constructor(snap) { Object.assign(this, snap); }
    applyDelta(fields) { Object.assign(this, fields); }
    interpolate(alpha) {}
    draw(ctx) {
        ctx.fillStyle = this.color || '#888';
        ctx.fillRect(this.x - 15, this.y - 15, 30, 30);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - 15, this.y - 15, 30, 30);
    }
}

export class RemoteProjectile {
    constructor(snap) { Object.assign(this, snap); }
    applyDelta(fields) { Object.assign(this, fields); }
    interpolate(alpha) {}
    draw(ctx) {
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}
