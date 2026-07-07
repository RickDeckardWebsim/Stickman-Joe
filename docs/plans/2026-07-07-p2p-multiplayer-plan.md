# P2P Multiplayer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add 2-player host-client P2P multiplayer to Stickman Joe, deployable on GitHub Pages, where both players share the same host-authoritative city but progress independently.

**Architecture:** PeerJS over WebRTC for browser-to-browser connection. Host runs the full simulation; client renders host-authoritative state via flat typed snapshots + delta compression + viewport culling. Blood/ragdolls/particles stay client-side. Single-player path untouched — all network hooks no-op when `network` is null.

**Tech Stack:** Vanilla JS ES modules, PeerJS (CDN), WebRTC data channels, Canvas 2D, existing game modules.

**Design doc:** `docs/plans/2026-07-07-p2p-multiplayer-design.md`

---

### Task 1: PeerJS CDN Integration + Network Module Skeleton

**Files:**
- Create: `net.js`
- Modify: `index.html` (add PeerJS CDN script before module scripts)

**Step 1: Add PeerJS CDN to index.html**

In `index.html`, add the PeerJS UMD script before the module scripts (after `<div id="ui-container"></div>`, before the existing `<script type="module">` tags):

```html
<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>
```

**Step 2: Create net.js skeleton**

Create `net.js` with the NetworkManager class skeleton — exports a singleton `network` that is null by default, and classes for Host/Client managers:

```javascript
// net.js — P2P multiplayer over PeerJS/WebRTC
// Design: docs/plans/2026-07-07-p2p-multiplayer-design.md

export const NET_VERSION = '1.0';
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;
export const CLIENT_STATE_RATE_HZ = 30;
export const CLIENT_STATE_INTERVAL_MS = 1000 / CLIENT_STATE_RATE_HZ;

// Singleton — null when in single-player (all hooks no-op)
let network = null;
export function getNetwork() { return network; }
export function setNetwork(n) { network = n; }

// HostManager and ClientManager will be filled in by later tasks
export class HostManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.roomCode = null;
        this.connected = false;
    }
}

export class ClientManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.connected = false;
    }
}
```

**Step 3: Verify single-player still loads**

Run: `python -m http.server 8765` then open `http://127.0.0.1:8765/index.html`
Expected: Game loads and plays identically (net.js isn't imported by main.js yet, so zero impact).
Also run: `node --check net.js` (need temp `package.json` with `{"type":"module"}` since it uses export syntax) — Expected: no syntax errors.

**Step 4: Commit**

```bash
git add net.js index.html
git commit -m "feat(net): add PeerJS CDN and net.js skeleton"
```

---

### Task 2: Room Code Generation + Host Connection

**Files:**
- Modify: `net.js`

**Step 1: Implement host() in HostManager**

Add to `HostManager`:

```javascript
async host() {
    return new Promise((resolve, reject) => {
        this.peer = new Peer(); // PeerJS public server, random ID
        this.peer.on('open', (id) => {
            this.roomCode = this._generateRoomCode(id);
            resolve(this.roomCode);
        });
        this.peer.on('error', (err) => {
            reject(err);
        });
        this.peer.on('connection', (conn) => {
            if (this.connection) {
                // Already have a client — reject additional connections
                conn.close();
                return;
            }
            this.connection = conn;
            conn.on('open', () => {
                this.connected = true;
            });
            conn.on('close', () => {
                this.connected = false;
                this.connection = null;
            });
        });
    });
}

_generateRoomCode(peerId) {
    // Short hash: take first 4 chars of peerId, uppercase
    return peerId.substring(0, 4).toUpperCase();
}
```

**Step 2: Verify room code generates**

In a browser console (with game loaded), run:
```javascript
import('./net.js').then(m => {
    const h = new m.HostManager();
    h.host().then(code => console.log('Room code:', code)).catch(e => console.error(e));
});
```
Expected: logs a 4-character uppercase room code (requires internet for PeerJS server).

**Step 3: Commit**

```bash
git add net.js
git commit -m "feat(net): implement host connection and room code generation"
```

---

### Task 3: Client Connection + Join by Room Code

**Files:**
- Modify: `net.js`

**Step 1: Implement join() in ClientManager**

Add to `ClientManager`:

```javascript
async join(roomCode) {
    return new Promise((resolve, reject) => {
        this.peer = new Peer(); // Client also needs a peer ID for WebRTC
        this.peer.on('open', (id) => {
            // Reconstruct host peer ID: room code is first 4 chars, but PeerJS IDs are longer.
            // We need the FULL host ID. Use the room code as the actual peer ID prefix.
            // REVISED: host uses roomCode as the FULL peer ID, not a prefix.
            const conn = this.peer.connect(roomCode, { reliable: false });
            this.connection = conn;
            conn.on('open', () => {
                this.connected = true;
                resolve();
            });
            conn.on('error', (err) => reject(err));
            conn.on('close', () => {
                this.connected = false;
                this.connection = null;
            });
        });
        this.peer.on('error', (err) => reject(err));
    });
}
```

**REVISED room code approach:** The host should use a SHORT, human-readable peer ID (the room code itself) instead of a random ID. Update `HostManager.host()`:

```javascript
async host() {
    return new Promise((resolve, reject) => {
        this.roomCode = this._generateRandomCode();
        this.peer = new Peer(this.roomCode); // Use room code AS the peer ID
        this.peer.on('open', (id) => {
            resolve(this.roomCode);
        });
        this.peer.on('error', (err) => {
            // If ID is taken, generate a new one and retry
            if (err.type === 'unavailable-id') {
                this.roomCode = this._generateRandomCode();
                this.peer = new Peer(this.roomCode);
                this.peer.on('open', () => resolve(this.roomCode));
                this.peer.on('error', (e) => reject(e));
            } else {
                reject(err);
            }
        });
        this.peer.on('connection', (conn) => {
            if (this.connection) { conn.close(); return; }
            this.connection = conn;
            conn.on('open', () => { this.connected = true; });
            conn.on('close', () => { this.connected = false; this.connection = null; });
        });
    });
}

_generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0/O, 1/I)
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
```

**Step 2: Verify loopback connect**

Open two browser tabs. In tab 1 console:
```javascript
import('./net.js').then(m => { window.h = new m.HostManager(); h.host().then(c => console.log('Host code:', c)); });
```
In tab 2 console (using the code from tab 1):
```javascript
import('./net.js').then(m => { window.c = new m.ClientManager(); c.join('CODE').then(() => console.log('Connected!')); });
```
Expected: tab 2 logs "Connected!" and tab 1's `h.connected` becomes true.

**Step 3: Commit**

```bash
git add net.js
git commit -m "feat(net): implement client join by room code with loopback connect"
```

---

### Task 4: Serialization — Snapshot Functions

**Files:**
- Modify: `net.js`

**Step 1: Implement snapshot extraction functions**

Add pure functions to `net.js` that extract gameplay-critical fields from each entity type. These are the wire format from the design doc:

```javascript
// --- Snapshot extraction (host -> client wire format) ---

export function snapshotEnemy(e) {
    return {
        type: 'e',
        id: e.enemyId,
        x: Math.round(e.x * 10) / 10,    // 1 decimal precision saves bytes
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
        // Flat limb booleans (enemy.js:73)
        la: e.leftArm !== false,  // default true if undefined
        ra: e.rightArm !== false,
        ll: e.leftLeg !== false,
        rl: e.rightLeg !== false
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
        limbs: p.limbs,  // nested {status, severed} — serializes as-is via JSON
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

export function snapshotWorldMeta() {
    return {
        type: 'w',
        wantedLevel: world.wantedLevel,
        zombieWantedLevel: world.zombieWantedLevel,
        time: Date.now()
    };
}
```

**Step 2: Verify snapshot functions produce valid JSON**

In browser console (with game running):
```javascript
import('./net.js').then(m => {
    import('./world.js').then(w => {
        if (w.enemies.length > 0) {
            const snap = m.snapshotEnemy(w.enemies[0]);
            console.log('Enemy snapshot:', snap);
            console.log('JSON:', JSON.stringify(snap));
        }
    });
});
```
Expected: logs a flat object with ~15 fields, valid JSON string.

**Step 3: Commit**

```bash
git add net.js
git commit -m "feat(net): implement snapshot extraction for all entity types"
```

---

### Task 5: Delta Tracking + Viewport Culling

**Files:**
- Modify: `net.js`

**Step 1: Implement delta comparison + viewport culling in HostManager**

Add to `HostManager`:

```javascript
// Track last-sent state per entity for delta comparison
this.lastSentState = new Map(); // id -> last snapshot

// Thresholds
const THRESHOLDS = {
    x: 2, y: 2, angle: 0.1,
    health: 0, state: null, isDead: null,
    isCop: null, isZombie: null, isHostile: null, weaponType: null
};

_computeDelta(entity, currentSnap, clientCamX, clientCamY, viewportBuffer = 200) {
    const id = currentSnap.id;
    
    // Viewport culling: skip if entity is far outside client's view
    const dx = currentSnap.x - clientCamX;
    const dy = currentSnap.y - clientCamY;
    const viewDist = Math.hypot(dx, dy);
    // Assume client viewport ~1280x800 in world units; cull beyond ~800px from camera
    if (viewDist > 800 + viewportBuffer && currentSnap.type !== 'P' && currentSnap.type !== 'w') {
        return null; // Outside viewport, don't send
    }
    
    const last = this.lastSentState.get(id);
    if (!last) {
        // Never sent — send full snapshot (caller treats as SPAWN event)
        this.lastSentState.set(id, currentSnap);
        return { type: 'spawn', ...currentSnap };
    }
    
    // Compare fields — only include changed ones
    const delta = { type: 'update', id, t: currentSnap.type };
    let changed = false;
    
    for (const field of Object.keys(currentSnap)) {
        if (field === 'type' || field === 'id') continue;
        const cur = currentSnap[field];
        const prev = last[field];
        const threshold = THRESHOLDS[field];
        
        if (threshold === null) {
            // Any change (booleans, strings, enums)
            if (cur !== prev) {
                delta[field] = cur;
                changed = true;
            }
        } else {
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
        }
    }
    
    if (changed) {
        this.lastSentState.set(id, currentSnap);
        return delta;
    }
    return null;
}

// Track entities that no longer exist (for despawn events)
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
```

**Step 2: Verify delta logic with a manual test**

In browser console, create a mock scenario:
```javascript
import('./net.js').then(m => {
    const h = new m.HostManager();
    h.lastSentState = new Map();
    const snap1 = { type:'e', id:'abc', x:100, y:200, angle:1.5, health:100, state:'IDLE', isCop:false, isZombie:false, isHostile:false, weaponType:null, isDead:false, la:true, ra:true, ll:true, rl:true };
    const snap2 = { ...snap1, x:101, health:90 }; // moved 1px (below threshold), health changed
    const delta = h._computeDelta(snap2, snap2, 0, 0);
    console.log('Delta (should have health but NOT x):', delta);
});
```
Expected: delta contains `health:90` but NOT `x` (1px < 2px threshold).

**Step 3: Commit**

```bash
git add net.js
git commit -m "feat(net): implement delta tracking with viewport culling"
```

---

### Task 6: Remote Entity Stubs + Shared Renderer

**Files:**
- Create: `remote-entity.js`

**Step 1: Create RemoteEntity stub classes + drawEnemy helper**

Create `remote-entity.js` with stub classes that hold snapshot fields and render via a shared helper:

```javascript
// remote-entity.js — client-side render-only stubs for host-authoritative entities

// Shared renderer extracted from Enemy.draw() — used by both host (real enemies)
// and client (remote stubs). Single source of truth for NPC rendering.
export function drawEnemy(ctx, snap) {
    ctx.save();
    ctx.translate(snap.x, snap.y);
    ctx.rotate(snap.angle);
    
    // Body (stickman style matching existing game)
    ctx.strokeStyle = snap.isZombie ? '#5a7d59' : (snap.isCop ? '#3a5a8a' : '#d6a57c');
    ctx.fillStyle = snap.isZombie ? '#5a7d59' : (snap.isCop ? '#3a5a8a' : '#d6a57c');
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
    
    // Legs (respect limb booleans)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(snap.ll ? -5 : 0, 10);
    ctx.moveTo(0, 0);
    ctx.lineTo(snap.rl ? 5 : 0, 10);
    ctx.stroke();
    
    // Arms (respect limb booleans)
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(snap.la ? -8 : 0, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(snap.ra ? 8 : 0, 0);
    ctx.stroke();
    
    // Health bar (if damaged)
    if (snap.health < snap.maxHealth && snap.health > 0) {
        ctx.rotate(-snap.angle); // un-rotate for health bar
        const barW = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW/2, -25, barW, 4);
        ctx.fillStyle = snap.health > snap.maxHealth * 0.5 ? '#4a4' : '#a44';
        ctx.fillRect(-barW/2, -25, barW * (snap.health / snap.maxHealth), 4);
    }
    
    ctx.restore();
}

export function drawPlayer(ctx, snap) {
    ctx.save();
    ctx.translate(snap.x, snap.y);
    ctx.rotate(snap.angle);
    
    // Player body (same stickman style, different color)
    ctx.strokeStyle = '#4a8a4a'; // Green tint to distinguish remote player
    ctx.fillStyle = '#4a8a4a';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -12);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, -18, 7, 0, Math.PI * 2);
    ctx.fill();
    
    // Weapon (if equipped)
    if (snap.weapon && snap.weapon.name) {
        ctx.fillStyle = '#222';
        const w = 30;
        ctx.fillRect(15, -2, w, 4);
    }
    
    ctx.restore();
    
    // Name/health bar above player
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

// Stub classes — hold snapshot fields, interpolate positions, render via helpers
export class RemoteEnemy {
    constructor(snap) { Object.assign(this, snap); this.targetX = snap.x; this.targetY = snap.y; this.targetAngle = snap.angle; }
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
    constructor(snap) { Object.assign(this, snap); this.targetX = snap.x; this.targetY = snap.y; this.targetAngle = snap.angle; }
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

// Simpler stubs for non-animated entities
export class RemotePickup {
    constructor(snap) { Object.assign(this, snap); this.bob = Math.random() * Math.PI * 2; }
    applyDelta(fields) { Object.assign(this, fields); }
    interpolate(alpha) { this.bob += 0.05; }
    draw(ctx) {
        const bobOffset = Math.sin(this.bob) * 5;
        ctx.fillStyle = 'rgba(255, 255, 100, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobOffset, 37, 0, Math.PI * 2);
        ctx.fill();
        // Note: actual icon drawing requires async image load — handled in main render loop
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
```

**Step 2: Verify stubs render**

In browser console (with game running):
```javascript
import('./remote-entity.js').then(m => {
    const c = document.getElementById('game-canvas');
    const ctx = c.getContext('2d');
    const enemy = new m.RemoteEnemy({ type:'e', id:'t1', x:500, y:400, angle:0, health:50, maxHealth:100, state:'IDLE', isCop:false, isZombie:false, isHostile:false, weaponType:null, isDead:false, la:true, ra:true, ll:true, rl:true });
    enemy.draw(ctx);
});
```
Expected: a stickman figure appears at (500,400) on the canvas.

**Step 3: Commit**

```bash
git add remote-entity.js
git commit -m "feat(net): add remote entity stubs and shared renderer"
```

---

### Task 7: Start Menu UI — Host/Join Buttons + Room Code

**Files:**
- Modify: `index.html` (add buttons + room code input HTML)
- Modify: `style.css` (style for new UI elements)
- Modify: `start-menu.js` (wire buttons to NetworkManager)

**Step 1: Add HTML for multiplayer UI**

In `index.html`, add buttons to the `#menu-buttons` div and a new multiplayer overlay:

```html
<!-- Add to #menu-buttons, after existing buttons -->
<button id="host-button">Host Game</button>
<button id="join-button">Join Game</button>
```

Add a new multiplayer overlay div (after `#info-menu`):
```html
<div id="multiplayer-menu">
    <h1 id="mp-title">Multiplayer</h1>
    <div id="mp-content"></div>
    <div id="mp-buttons">
        <button id="mp-back-button">Back</button>
    </div>
</div>
```

**Step 2: Add CSS for multiplayer UI**

In `style.css`, add styling for the multiplayer menu (reuse existing menu styles — pattern match `#options-menu` / `#info-menu`):

```css
#multiplayer-menu {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.85);
    color: white;
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 20;
    font-family: sans-serif;
}

#multiplayer-menu.visible {
    display: flex;
}

#mp-content {
    text-align: center;
    margin: 20px 0;
    font-size: 18px;
}

#mp-content input {
    padding: 10px;
    font-size: 24px;
    text-align: center;
    letter-spacing: 8px;
    text-transform: uppercase;
    width: 200px;
    border: 2px solid #555;
    border-radius: 5px;
    background: #222;
    color: white;
}

#room-code-display {
    font-size: 48px;
    font-weight: bold;
    letter-spacing: 12px;
    color: #4a8a4a;
    margin: 20px 0;
}

#mp-status {
    color: #aaa;
    font-size: 14px;
    margin-top: 10px;
}
```

**Step 3: Wire buttons in start-menu.js**

Add to `start-menu.js`:
- Import NetworkManager classes from `net.js`
- Wire `#host-button` → show multiplayer menu, call `host()`, display room code, wait for connection
- Wire `#join-button` → show room code input, on submit call `join(code)`
- Wire `#mp-back-button` → hide multiplayer menu
- On successful connection → call `startGame()` with a `networkMode` parameter ('host' or 'client')

**Step 4: Verify UI shows correctly**

Load the game, click "Host Game" → should see multiplayer menu with a room code. Click "Join Game" → should see room code input. Click "Back" → returns to main menu.

**Step 5: Commit**

```bash
git add index.html style.css start-menu.js
git commit -m "feat(net): add host/join UI with room code display and input"
```

---

### Task 8: Host Broadcast Loop — Full Snapshot + Deltas

**Files:**
- Modify: `net.js`
- Modify: `main.js` (add post-update network hook)

**Step 1: Implement broadcastTick() in HostManager**

Add to `HostManager`:

```javascript
import { enemies, corpses, pickups, deadDrops, projectiles, grenades, world } from './world.js';
import { snapshotEnemy, snapshotCorpse, snapshotPickup, snapshotDeadDrop, snapshotProjectile, snapshotPlayer, snapshotWorldMeta } from './net.js';

// In HostManager:
broadcastTick(localPlayer, clientCamX, clientCamY) {
    if (!this.connected) return;
    
    const now = Date.now();
    if (now - this.lastTickTime < TICK_INTERVAL_MS) return;
    this.lastTickTime = now;
    
    const currentIds = new Set();
    const deltas = [];
    const events = [];
    
    // Snapshot + delta all enemies
    for (const e of enemies) {
        if (!e || e.health <= 0 && e._despawnSent) continue;
        const snap = snapshotEnemy(e);
        currentIds.add(snap.id);
        const delta = this._computeDelta(e, snap, clientCamX, clientCamY);
        if (delta) {
            if (delta.type === 'spawn') events.push(delta);
            else deltas.push(delta);
        }
    }
    
    // Snapshot + delta pickups
    for (const p of pickups) {
        if (!p) continue;
        const snap = snapshotPickup(p);
        currentIds.add(snap.id);
        const delta = this._computeDelta(p, snap, clientCamX, clientCamY);
        if (delta) { delta.type === 'spawn' ? events.push(delta) : deltas.push(delta); }
    }
    
    // Dead drops
    for (const d of deadDrops) {
        if (!d) continue;
        const snap = snapshotDeadDrop(d);
        currentIds.add(snap.id);
        const delta = this._computeDelta(d, snap, clientCamX, clientCamY);
        if (delta) { delta.type === 'spawn' ? events.push(delta) : deltas.push(delta); }
    }
    
    // Projectiles
    for (const p of projectiles) {
        if (!p) continue;
        const snap = snapshotProjectile(p);
        currentIds.add(snap.id);
        const delta = this._computeDelta(p, snap, clientCamX, clientCamY);
        if (delta) { delta.type === 'spawn' ? events.push(delta) : deltas.push(delta); }
    }
    
    // Player avatar (always send — no viewport culling on player)
    const playerSnap = snapshotPlayer(localPlayer);
    currentIds.add('player');
    const playerDelta = this._computeDelta(localPlayer, playerSnap, clientCamX, clientCamY, 99999);
    if (playerDelta) { playerDelta.type === 'spawn' ? events.push(playerDelta) : deltas.push(playerDelta); }
    
    // World meta (always send)
    const metaSnap = snapshotWorldMeta();
    currentIds.add('worldmeta');
    const metaDelta = this._computeDelta(null, metaSnap, clientCamX, clientCamY, 99999);
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

// Full snapshot on connect
sendFullSnapshot(localPlayer) {
    if (!this.connected) return;
    const entities = [];
    for (const e of enemies) { if (e) entities.push(snapshotEnemy(e)); }
    for (const p of pickups) { if (p) entities.push(snapshotPickup(p)); }
    for (const d of deadDrops) { if (d) entities.push(snapshotDeadDrop(d)); }
    for (const p of projectiles) { if (p) entities.push(snapshotProjectile(p)); }
    entities.push(snapshotPlayer(localPlayer));
    entities.push(snapshotWorldMeta());
    this._send({ t: 'full', entities });
}
```

**Step 2: Add post-update hook to main.js game loop**

In `main.js`, after the entity update section (after `checkRivalSpawnConditions(player)`, ~line 808), add:

```javascript
// Network broadcast (host mode)
if (network && network instanceof HostManager) {
    const clientCam = network.lastClientCamera || { x: camera.x, y: camera.y };
    network.broadcastTick(player, clientCam.x, clientCam.y);
}
```

**Step 3: Verify host sends data (loopback with console logging)**

Host in tab 1, client in tab 2. In tab 2, add a temporary log on the connection:
```javascript
c.connection.on('data', (data) => console.log('Received:', data.t, 'entities:', data.entities?.length || data.e?.length || 0));
```
Start game on host. Expected: tab 2 console logs `full` with ~130 entities, then `delta` messages every 50ms with varying counts.

**Step 4: Commit**

```bash
git add net.js main.js
git commit -m "feat(net): implement host broadcast loop with full snapshot + deltas"
```

---

### Task 9: Client State Application + Remote Entity Rendering

**Files:**
- Modify: `net.js`
- Modify: `main.js` (add client-mode branch + remote entity rendering)

**Step 1: Implement state application in ClientManager**

Add to `ClientManager`:

```javascript
import { RemoteEnemy, RemotePlayer, RemotePickup, RemoteDeadDrop, RemoteProjectile } from './remote-entity.js';

constructor() {
    // ...existing...
    this.remoteEntities = new Map(); // id -> RemoteEntity stub
    this.remotePlayer = null;
    this.worldMeta = null;
}

// Handle incoming data
handleData(data) {
    switch (data.t) {
        case 'full':
            this._applyFullSnapshot(data.entities);
            break;
        case 'delta':
            this._applyDeltas(data.e);
            break;
        case 'events':
            this._applyEvents(data.events);
            break;
        case 'pickupResult':
            this._handlePickupResult(data);
            break;
    }
}

_applyFullSnapshot(entities) {
    this.remoteEntities.clear();
    for (const snap of entities) {
        this._createRemoteEntity(snap);
    }
}

_applyDeltas(deltas) {
    for (const d of deltas) {
        const entity = this.remoteEntities.get(d.id);
        if (entity) {
            entity.applyDelta(d);
        }
    }
}

_applyEvents(events) {
    for (const e of events) {
        if (e.type === 'spawn') {
            this._createRemoteEntity(e);
        } else if (e.type === 'despawn') {
            this.remoteEntities.delete(e.id);
        }
    }
}

_createRemoteEntity(snap) {
    let entity;
    switch (snap.t) {
        case 'e': entity = new RemoteEnemy(snap); break;
        case 'P': entity = new RemotePlayer(snap); this.remotePlayer = entity; break;
        case 'p': entity = new RemotePickup(snap); break;
        case 'd': entity = new RemoteDeadDrop(snap); break;
        case 'j': entity = new RemoteProjectile(snap); break;
        default: return;
    }
    this.remoteEntities.set(snap.id, entity);
}

// Send client state to host (30Hz)
sendClientState(player, camera, input) {
    if (!this.connected) return;
    const now = Date.now();
    if (now - this.lastSendTime < CLIENT_STATE_INTERVAL_MS) return;
    this.lastSendTime = now;
    
    const mouseWorld = {
        x: camera.x + input.mouse.x - canvas.width / 2,
        y: camera.y + input.mouse.y - canvas.height / 2
    };
    const aimAngle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
    
    this._send({
        t: 'clientState',
        x: Math.round(player.x * 10) / 10,
        y: Math.round(player.y * 10) / 10,
        angle: Math.round(player.angle * 100) / 100,
        aimAngle: Math.round(aimAngle * 100) / 100,
        health: Math.round(player.health),
        armor: Math.round(player.armor),
        isDead: player.isDead,
        cameraX: Math.round(camera.x),
        cameraY: Math.round(camera.y),
        input: {
            firing: input.mouse.down,
            fireStartTime: player.weapon ? player.weapon.lastShotTime : 0
        }
    });
}

_send(msg) {
    if (this.connection && this.connection.open) {
        this.connection.send(msg);
    }
}
```

**Step 2: Add client-mode branch to main.js**

At the top of `main.js`, add:
```javascript
import { getNetwork, HostManager, ClientManager } from './net.js';
const network = getNetwork();
let isClient = network instanceof ClientManager;
```

In the game loop, gate the NPC management functions:
```javascript
if (!isClient) {
    manageCivilianSpawning();
    manageCopSpawning(canvas);
    manageCanSpawning();
    manageDeadDropSpawning();
    updateWantedLevel();
    manageCivilianConflict(Date.now());
    checkRivalSpawnConditions(player);
}
```

Add remote entity rendering (after local player draw, before UI):
```javascript
if (isClient && network) {
    // Apply interpolation
    const alpha = 0.3; // interpolation factor
    for (const entity of network.remoteEntities.values()) {
        entity.interpolate(alpha);
        entity.draw(ctx);
    }
    if (network.remotePlayer) {
        network.remotePlayer.interpolate(alpha);
        network.remotePlayer.draw(ctx);
    }
    // Send client state
    network.sendClientState(player, camera, input);
}
```

**Step 3: Verify client sees host's world (loopback)**

Host in tab 1 (start game), client in tab 2 (start game in client mode). Expected: client sees the host's NPCs rendered as stickmen, moving via interpolation. Client's local player moves independently.

**Step 4: Commit**

```bash
git add net.js main.js
git commit -m "feat(net): implement client state application and remote entity rendering"
```

---

### Task 10: Host Receives Client State + Shadow Player

**Files:**
- Modify: `net.js`
- Modify: `main.js` (add pre-update hook for client input)

**Step 1: Implement client state handling in HostManager**

Add to `HostManager`:

```javascript
constructor() {
    // ...existing...
    this.lastClientCamera = { x: 0, y: 0 };
    this.clientState = null;
    this.shadowPlayer = null; // Will be a Player instance representing the remote player
}

// In the connection.on('data') handler:
conn.on('data', (data) => {
    if (data.t === 'clientState') {
        this.clientState = data;
        this.lastClientCamera = { x: data.cameraX, y: data.cameraY };
    } else if (data.t === 'fire') {
        this._handleClientFire(data);
    } else if (data.t === 'pickupRequest') {
        this._handlePickupRequest(data);
    }
});

_handleClientFire(data) {
    if (!this.shadowPlayer) return;
    // Spawn authoritative projectile from client's reported position/angle
    const weapon = this.shadowPlayer.weapon;
    if (!weapon) return;
    // Deduplicate by fireStartTime
    if (weapon._lastClientFireTime === data.fireStartTime) return;
    weapon._lastClientFireTime = data.fireStartTime;
    // Trigger the weapon's fire from the shadow player's position at the client's aim angle
    this.shadowPlayer.x = data.x;
    this.shadowPlayer.y = data.y;
    weapon.fireOneShotAtAngle(data.aimAngle);
}
```

**Step 2: Add pre-update hook to main.js**

Before the entity update section (before `manageCivilianSpawning()`), add:
```javascript
// Network: apply client input (host mode)
if (network && network instanceof HostManager && network.shadowPlayer) {
    network.applyClientInput();
}
```

Implement `applyClientInput()` in HostManager:
```javascript
applyClientInput() {
    if (!this.clientState || !this.shadowPlayer) return;
    // Update shadow player position from client's reported state
    this.shadowPlayer.x = this.clientState.x;
    this.shadowPlayer.y = this.clientState.y;
    this.shadowPlayer.angle = this.clientState.angle;
    this.shadowPlayer.health = this.clientState.health;
    this.shadowPlayer.armor = this.clientState.armor;
    this.shadowPlayer.isDead = this.clientState.isDead;
    
    // Handle firing
    if (this.clientState.input.firing && this.shadowPlayer.weapon) {
        const now = Date.now();
        if (now - this.shadowPlayer.weapon.lastShotTime >= this.shadowPlayer.weapon.fireRate) {
            this._handleClientFire({
                x: this.clientState.x,
                y: this.clientState.y,
                aimAngle: this.clientState.aimAngle,
                fireStartTime: now
            });
        }
    }
}
```

**Step 3: Create shadow player on client connect**

In HostManager, when connection opens:
```javascript
conn.on('open', () => {
    this.connected = true;
    // Create shadow player for the remote client
    import('./player.js').then(PlayerModule => {
        this.shadowPlayer = new PlayerModule.default(world.width / 2 + 100, world.height / 2);
        this.shadowPlayer.isRemote = true;
    });
    // Send full snapshot
    this.sendFullSnapshot(currentPlayer);
});
```

**Step 4: Verify host sees client's player (loopback)**

Host in tab 1, client in tab 2. Client moves around. Expected: host sees a second player (green-tinted) moving in its world, matching the client's movements (with ~100ms delay from network + interpolation).

**Step 5: Commit**

```bash
git add net.js main.js
git commit -m "feat(net): host receives client state, spawns shadow player and authoritative projectiles"
```

---

### Task 11: Pickups — Request/Result Flow

**Files:**
- Modify: `net.js`
- Modify: `main.js` (client-side pickup interaction)

**Step 1: Implement pickup request/result in ClientManager**

Add to `ClientManager`:
```javascript
requestPickup(entityId) {
    this._send({ t: 'pickupRequest', id: entityId });
}

_handlePickupResult(data) {
    if (data.success && data.item) {
        // Add item to local inventory — the item data is a snapshot
        // Reconstruct a minimal item from the snapshot
        const item = this._reconstructItem(data.item);
        if (item) {
            // Use the player's existing addItemToInventory
            // This requires access to the local player — passed in or via callback
            if (this.onPickupResult) this.onPickupResult(item);
        }
    }
    // Remove the remote pickup from view (host already despawned it)
    this.remoteEntities.delete(data.id);
}
```

**Step 2: Implement pickup adjudication in HostManager**

```javascript
_handlePickupRequest(data) {
    // Find the pickup in the host's world
    const idx = pickups.findIndex(p => p && (p.id === data.id || `${p.x},${p.y}` === data.id));
    if (idx === -1) {
        this._send({ t: 'pickupResult', id: data.id, success: false });
        return;
    }
    const pickup = pickups[idx];
    // Serialize the pickup's item for the client
    const itemSnap = snapshotPickup(pickup);
    // Remove from host world
    pickups.splice(idx, 1);
    // Send success to client
    this._send({ t: 'pickupResult', id: data.id, success: true, item: itemSnap });
}
```

**Step 3: Wire client-side pickup interaction in main.js**

In the client's interaction code (the `input.justPressed.has('e')` block), add a check for remote pickups:
```javascript
if (isClient && network) {
    for (const [id, entity] of network.remoteEntities) {
        if (entity instanceof RemotePickup) {
            const dist = Math.hypot(player.x - entity.x, player.y - entity.y);
            if (dist < player.radius + 25) {
                network.requestPickup(id);
                break;
            }
        }
    }
}
```

**Step 4: Verify pickup flow (loopback)**

Host drops a pickup (kill an NPC). Client walks over it, presses E. Expected: client receives item, pickup disappears from both screens.

**Step 5: Commit**

```bash
git add net.js main.js
git commit -m "feat(net): implement host-authoritative pickup request/result flow"
```

---

### Task 12: Error Handling + Disconnect Recovery

**Files:**
- Modify: `net.js`
- Modify: `main.js` (disconnect overlays)

**Step 1: Implement disconnect handlers**

In `ClientManager`:
```javascript
constructor() {
    // ...existing...
    this.onDisconnect = null;
}

// In join(), on conn.on('close'):
conn.on('close', () => {
    this.connected = false;
    this.connection = null;
    if (this.onDisconnect) this.onDisconnect('host');
});
```

In `HostManager`:
```javascript
// In connection handler, on conn.on('close'):
conn.on('close', () => {
    this.connected = false;
    this.connection = null;
    this.shadowPlayer = null;
    // Host returns to single-player seamlessly
});
```

**Step 2: Add disconnect overlay in main.js**

```javascript
if (isClient && network) {
    network.onDisconnect = (reason) => {
        // Show overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);color:white;display:flex;justify-content:center;align-items:center;z-index:100;font-family:sans-serif;font-size:24px;';
        overlay.textContent = reason === 'host' ? 'Host disconnected — returning to menu...' : 'Connection lost...';
        document.body.appendChild(overlay);
        setTimeout(() => location.reload(), 2000);
    };
}
```

**Step 3: Verify disconnect recovery**

Host in tab 1, client in tab 2. Close tab 1. Expected: tab 2 shows "Host disconnected" overlay for 2s, then reloads to start menu.

**Step 4: Commit**

```bash
git add net.js main.js
git commit -m "feat(net): implement disconnect handling and recovery overlays"
```

---

### Task 13: End-to-End Loopback Test + Polish

**Files:**
- Modify: `main.js` (final integration, client rendering order)
- Modify: `net.js` (handshake, version check)

**Step 1: Add version handshake**

In `HostManager`, on connection open, send handshake:
```javascript
conn.on('open', () => {
    conn.send({ t: 'handshake', version: NET_VERSION });
});
```

In `ClientManager`, verify handshake:
```javascript
conn.on('data', (data) => {
    if (data.t === 'handshake') {
        if (data.version !== NET_VERSION) {
            this.connection.close();
            alert('Version mismatch — multiplayer modes are incompatible.');
            return;
        }
        return; // Don't pass handshake to handleData
    }
    this.handleData(data);
});
```

**Step 2: Full loopback test**

1. Open two browser tabs at `http://127.0.0.1:8765/index.html`
2. Tab 1: click "Host Game" → note room code
3. Tab 2: click "Join Game" → enter room code → both start game
4. Verify:
   - [ ] Client sees host's NPCs (107 civilians + cops)
   - [ ] Client sees host's dead drops
   - [ ] Client can move independently
   - [ ] Host sees client's player avatar (green-tinted)
   - [ ] Client fires → host's NPC takes damage → NPC health bar updates on client
   - [ ] Client walks over pickup, presses E → item added to client inventory
   - [ ] Wanted level changes on host → appears on client
   - [ ] Host closes tab → client shows disconnect overlay → returns to menu
5. Verify single-player still works: open one tab, click "Play" (not Host/Join) → game runs identically to pre-multiplayer

**Step 3: Commit**

```bash
git add net.js main.js
git commit -m "feat(net): add version handshake and complete end-to-end integration"
```

---

## Task Summary

| Task | Description | Dependencies |
|---|---|---|
| 1 | PeerJS CDN + net.js skeleton | — |
| 2 | Room code + host connection | 1 |
| 3 | Client join by room code | 2 |
| 4 | Snapshot serialization functions | 1 |
| 5 | Delta tracking + viewport culling | 4 |
| 6 | Remote entity stubs + renderer | 4 |
| 7 | Start menu UI (Host/Join buttons) | 2, 3 |
| 8 | Host broadcast loop | 5, 7 |
| 9 | Client state application + rendering | 6, 8 |
| 10 | Host receives client state + shadow player | 8, 9 |
| 11 | Pickup request/result flow | 10 |
| 12 | Error handling + disconnect recovery | 10 |
| 13 | E2E loopback test + handshake | 11, 12 |
