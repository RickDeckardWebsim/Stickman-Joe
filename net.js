import { world, enemies, pickups, deadDrops, projectiles } from './world.js';
export const NET_VERSION = '1.0';
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;
export const CLIENT_STATE_RATE_HZ = 30;
export const CLIENT_STATE_INTERVAL_MS = 1000 / CLIENT_STATE_RATE_HZ;

let network = null;
export function getNetwork() { return network; }
export function setNetwork(n) { network = n; }

export class HostManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.roomCode = null;
        this.connected = false;
        this.lastSentState = new Map();
        this.lastTickTime = 0;
    }
    async host() {
        return new Promise((resolve, reject) => {
            this.roomCode = this._generateRandomCode();
            this.peer = new Peer(this.roomCode);
            this.peer.on('open', (id) => resolve(this.roomCode));
            this.peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    this.roomCode = this._generateRandomCode();
                    this.peer = new Peer(this.roomCode);
                    this.peer.on('open', () => resolve(this.roomCode));
                    this.peer.on('error', (e) => reject(e));
                    this._attachConnectionHandler(this.peer);
                } else {
                    reject(err);
                }
            });
            this._attachConnectionHandler(this.peer);
        });
    }

    _attachConnectionHandler(peer) {
        peer.on('connection', (conn) => {
            if (this.connection) { conn.close(); return; }
            this.connection = conn;
            conn.on('open', () => { this.connected = true; });
            conn.on('close', () => { this.connected = false; this.connection = null; });
        });
    }

    _generateRandomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }
    _computeDelta(currentSnap, clientCamX, clientCamY, viewportBuffer = 200) {
        const id = currentSnap.id;

        // Viewport culling: skip if entity is far outside client's view (except player and worldmeta)
        if (currentSnap.type !== 'P' && currentSnap.type !== 'w') {
            const dx = currentSnap.x - clientCamX;
            const dy = currentSnap.y - clientCamY;
            const viewDist = Math.hypot(dx, dy);
            if (viewDist > 800 + viewportBuffer) return null;
        }

        const last = this.lastSentState.get(id);
        if (!last) {
            this.lastSentState.set(id, currentSnap);
            const { type, ...rest } = currentSnap;
            return { type: 'spawn', t: type, ...rest };
        }

        const delta = { type: 'update', id, t: currentSnap.type };
        let changed = false;

        const numericThresholds = { x: 2, y: 2, angle: 0.1 };

        for (const field of Object.keys(currentSnap)) {
            if (field === 'type' || field === 'id') continue;
            const cur = currentSnap[field];
            const prev = last[field];
            const threshold = numericThresholds[field];

            if (threshold !== undefined) {
                // Numeric threshold
                if (typeof cur === 'number' && typeof prev === 'number') {
                    if (Math.abs(cur - prev) >= threshold) {
                        delta[field] = cur;
                        changed = true;
                    }
                } else if (cur !== prev) {
                    delta[field] = cur;
                    changed = true;
                }
            } else {
                // Any change (booleans, strings, objects, enums)
                if (cur !== prev) {
                    delta[field] = cur;
                    changed = true;
                }
            }
        }

        if (changed) {
            this.lastSentState.set(id, currentSnap);
            return delta;
        }
        return null;
    }

    _checkDespawns(currentIds) {
        const despawns = [];
        for (const id of this.lastSentState.keys()) {
            if (!currentIds.has(id)) {
                despawns.push({ type: 'despawn', id });
                this.lastSentState.delete(id);
            }
        }
        return despawns;
    }

    broadcastTick(localPlayer, clientCamX, clientCamY) {
        if (!this.connected) return;

        const now = Date.now();
        if (now - this.lastTickTime < TICK_INTERVAL_MS) return;
        this.lastTickTime = now;

        const currentIds = new Set();
        const deltas = [];
        const events = [];

        // Enemies
        for (const e of enemies) {
            if (!e) continue;
            const snap = snapshotEnemy(e);
            currentIds.add(snap.id);
            const delta = this._computeDelta(snap, clientCamX, clientCamY);
            if (delta) {
                if (delta.type === 'spawn') events.push(delta);
                else deltas.push(delta);
            }
        }

        // Pickups
        for (const p of pickups) {
            if (!p) continue;
            const snap = snapshotPickup(p);
            currentIds.add(snap.id);
            const delta = this._computeDelta(snap, clientCamX, clientCamY);
            if (delta) { delta.type === 'spawn' ? events.push(delta) : deltas.push(delta); }
        }

        // Dead drops
        for (const d of deadDrops) {
            if (!d) continue;
            const snap = snapshotDeadDrop(d);
            currentIds.add(snap.id);
            const delta = this._computeDelta(snap, clientCamX, clientCamY);
            if (delta) { delta.type === 'spawn' ? events.push(delta) : deltas.push(delta); }
        }

        // Projectiles
        for (const p of projectiles) {
            if (!p) continue;
            const snap = snapshotProjectile(p);
            currentIds.add(snap.id);
            const delta = this._computeDelta(snap, clientCamX, clientCamY);
            if (delta) { delta.type === 'spawn' ? events.push(delta) : deltas.push(delta); }
        }

        // Player avatar (always send — no viewport culling)
        const playerSnap = snapshotPlayer(localPlayer);
        currentIds.add('player');
        const playerDelta = this._computeDelta(playerSnap, clientCamX, clientCamY);
        if (playerDelta) { playerDelta.type === 'spawn' ? events.push(playerDelta) : deltas.push(playerDelta); }

        // World meta (always send)
        const metaSnap = snapshotWorldMeta(world);
        currentIds.add('worldmeta');
        const metaDelta = this._computeDelta(metaSnap, clientCamX, clientCamY);
        if (metaDelta) { metaDelta.type === 'spawn' ? events.push(metaDelta) : deltas.push(metaDelta); }

        // Check despawns
        const despawns = this._checkDespawns(currentIds);
        events.push(...despawns);

        // Send events first (immediate), then delta
        if (events.length > 0) {
            this._send({ t: 'events', events });
        }
        if (deltas.length > 0) {
            this._send({ t: 'delta', e: deltas });
        }
    }

    _send(msg) {
        if (this.connection && this.connection.open) {
            this.connection.send(msg);
        }
    }

    sendFullSnapshot(localPlayer) {
        if (!this.connected) return;
        const entities = [];
        for (const e of enemies) { if (e) entities.push(snapshotEnemy(e)); }
        for (const p of pickups) { if (p) entities.push(snapshotPickup(p)); }
        for (const d of deadDrops) { if (d) entities.push(snapshotDeadDrop(d)); }
        for (const p of projectiles) { if (p) entities.push(snapshotProjectile(p)); }
        entities.push(snapshotPlayer(localPlayer));
        entities.push(snapshotWorldMeta(world));
        this._send({ t: 'full', entities });
    }
}

export class ClientManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.connected = false;
    }
    async join(roomCode) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer();
            this.peer.on('open', () => {
                const conn = this.peer.connect(roomCode, { reliable: false });
                this.connection = conn;
                conn.on('open', () => { this.connected = true; resolve(); });
                conn.on('error', (err) => reject(err));
                conn.on('close', () => { this.connected = false; this.connection = null; });
            });
            this.peer.on('error', (err) => reject(err));
        });
    }
}

// --- Snapshot extraction (host -> client wire format) ---
// Pure functions: extract gameplay-critical fields into flat objects
// suitable for JSON serialization over WebRTC. Numeric positions are
// rounded to 1 decimal place to save bytes.

export function snapshotEnemy(e) {
    return {
        type: 'e',
        id: e.enemyId,
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        angle: Math.round(e.angle * 100) / 100,
        health: Math.round(e.health),
        maxHealth: Math.round(e.maxHealth),
        state: e.state,
        isCop: e.isCop,
        isZombie: e.isZombie,
        isHostile: e.isHostileActor,
        weaponType: e.weapon ? e.weapon.name : null,
        isDead: e.health <= 0,
        la: e.limbs.leftArm !== false,
        ra: e.limbs.rightArm !== false,
        ll: e.limbs.leftLeg !== false,
        rl: e.limbs.rightLeg !== false
    };
}

export function snapshotCorpse(c) {
    return {
        type: 'c',
        id: c.id || `${c.x},${c.y}`,
        x: Math.round(c.x * 10) / 10,
        y: Math.round(c.y * 10) / 10,
        angle: Math.round((c.angle || 0) * 100) / 100
    };
}

export function snapshotPickup(p) {
    return {
        type: 'p',
        id: p.id || `${p.x},${p.y}`,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        itemType: p.constructor.name,
        icon: p.icon || null,
        amount: p.amount || 0
    };
}

export function snapshotDeadDrop(d) {
    return {
        type: 'd',
        id: d.id || `${d.x},${d.y}`,
        x: Math.round(d.x * 10) / 10,
        y: Math.round(d.y * 10) / 10,
        color: d.color || '#ffffff'
    };
}

export function snapshotProjectile(p) {
    return {
        type: 'j',
        id: p.id || `${p.x},${p.y},${Date.now()}`,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        vx: Math.round(p.vx * 10) / 10,
        vy: Math.round(p.vy * 10) / 10,
        projType: p.weaponName || 'unknown',
        ownerIsPlayer: p.owner === world.player
    };
}

export function snapshotPlayer(p) {
    return {
        type: 'P',
        id: 'player',
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        angle: Math.round(p.angle * 100) / 100,
        vx: Math.round((p.vx || 0) * 10) / 10,
        vy: Math.round((p.vy || 0) * 10) / 10,
        health: Math.round(p.health),
        maxHealth: Math.round(p.maxHealth),
        armor: Math.round(p.armor),
        isDead: p.isDead,
        limbs: p.limbs,
        weapon: p.weapon ? {
            name: p.weapon.name,
            recoil: Math.round((p.weapon.recoil || 0) * 100) / 100,
            isReloading: p.weapon.isReloading || false,
            reloadAnimProgress: p.weapon.reloadAnimProgress || 0,
            pumpProgress: p.weapon.pumpProgress || 0
        } : null,
        walkCycle: Math.round((p.walkCycle || 0) * 100) / 100,
        isMoving: p.isMoving || false,
        currentWeaponSlot: p.currentWeaponSlot
    };
}

export function snapshotWorldMeta(w) {
    return {
        type: 'w',
        id: 'worldmeta',
        wantedLevel: w.wantedLevel,
        zombieWantedLevel: w.zombieWantedLevel,
        time: Date.now()
    };
}
