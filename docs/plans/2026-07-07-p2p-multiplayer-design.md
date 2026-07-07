# Stickman Joe — P2P Multiplayer Design

**Date:** 2026-07-07
**Status:** Approved (pending implementation)
**Goal:** Add 2-player host-client P2P multiplayer to Stickman Joe, deployable on GitHub Pages, where both players share the same host-authoritative city but progress independently.

## Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Authority model | Host-authoritative shared sim | Fully synchronized 1-1 experience; client-side cosmetics (blood/debris/ragdolls) cut bandwidth |
| Signaling | PeerJS public server | Zero infra, works immediately on GitHub Pages |
| Session size | 2 players (host + 1 client) | Tractable scope; expandable later |
| Sync scope | Delta-compressed + viewport culling | Same 1-1 fidelity, ~3-5 KB/s bandwidth |
| Host migration | None — session ends on host leave | Simplest; honest tradeoff for casual 2-player |
| Client world | Shadow NPCs, host authority overrides | Lightest client CPU, perfectly consistent |

## Architecture

### Connection (PeerJS over WebRTC)

- New module `net.js` owns all networking. Imports PeerJS from CDN.
- `NetworkManager` class with two roles: `HostManager` and `ClientManager`.
- **Host flow**: Host clicks "Host Game" → `NetworkManager.host()` creates a PeerJS peer with random ID → displays a 4-character room code (short hash of peer ID) → waits for one client → on connect, sends FULL snapshot, begins broadcasting deltas at 20Hz.
- **Client flow**: Client clicks "Join Game" → enters room code → `NetworkManager.join(code)` connects to host's peer → on connect, receives FULL snapshot, stops local NPC AI, switches to shadow-render mode.
- Data channel: PeerJS default SCTP-over-UDP (unreliable-but-fast) — dropped packets fine, next tick supersedes.
- Start menu gets two new buttons: "Host Game" and "Join Game" alongside existing Play/Options/Info/Cheats.
- Single-player path untouched. All hooks no-op when `network` is null.

### Serialization Layer

**The feasibility crux.** The existing safehouse serialization pattern (`{className, data}` with dynamic `import()` reconstruction) works for a 124-slot stash saved once. It does NOT scale to 107 enemies + projectiles + pickups broadcast at 20Hz. This design uses flat typed snapshots instead.

**Wire format: flat typed snapshots, NOT class instances.**

Each entity type gets a snapshot shape — a flat object of only gameplay-critical fields the client needs to render the shared world. No methods, no AI refs, no ragdoll data. Built by a central serializer in `net.js`, keyed by type tag. Existing classes stay untouched.

```
type: 'e'  (enemy)     → { id, x, y, angle, health, maxHealth, state, isCop, isZombie, isHostile, weaponType, isDead }
                         limb booleans: { leftArm, rightArm, leftLeg, rightLeg } (flat, matches enemy.js:73)
type: 'c'  (corpse)    → { id, x, y, angle }                    // position only; gore/ragdoll is client-side
type: 'p'  (pickup)    → { id, x, y, itemType, icon, amount }   // icon is the PNG path string
type: 'd'  (deaddrop)  → { id, x, y, color }                    // color indicates loot tier
type: 'g'  (grenade)   → { id, x, y, vx, vy, fuseTime }
type: 'j'  (projectile)→ { id, x, y, vx, vy, type, ownerIsPlayer }
type: 'w'  (worldmeta) → { wantedLevel, zombieWantedLevel, time }  // singleton, sent each tick
type: 'P'  (player)    → {
                          id, x, y, angle, vx, vy,
                          health, maxHealth, armor, isDead,
                          limbs: {                              // nested, matches player.js:44
                            head: {status, severed},
                            torso: {status, severed},
                            leftArm: {status, severed},
                            rightArm: {status, severed},
                            leftLeg: {status, severed},
                            rightLeg: {status, severed}
                          },
                          weapon: {                             // descriptor, not string — covers drawArms() needs
                            name,           // 'Rifle'|'Pistol'|'Shotgun'|'Knife'|'InjectionCannon'|'LMG'|'Grenade'|null
                            recoil,         // for drawArms hand positioning
                            isReloading,    // for reload animation
                            reloadAnimProgress,
                            pumpProgress    // shotgun-specific
                          },
                          walkCycle, isMoving, currentWeaponSlot
                         }
```

**Why `RemoteEntity` stubs, not real class instances on the client:** The real `Enemy` class is 1,344 lines with AI behavior refs, witness-system hooks, ragdoll refs, and `world.player` dependencies. Constructing those from snapshots would require gutting constructors or writing a parallel passive mode. Instead, the client gets tiny stub classes (`RemoteEnemy`, `RemotePickup`, etc.) with just the snapshot fields + a `draw(ctx)` method. The host's `Enemy.draw()` logic gets extracted into a shared `drawEnemy(ctx, snapshot)` helper used by both host and client — single source of truth for rendering.

**Lifecycle events:**
- `SPAWN { type, id, snapshot }` — client creates a `RemoteEntity` stub, adds to `remoteEntities` map keyed by `id`.
- `DESPAWN { type, id }` — client removes it.
- `UPDATE { type, id, fields... }` — client patches existing stub (this is the delta).

**Snapshot extraction on host:** `net.js` reads `world.js` arrays each tick via pure functions (`snapshotEnemy(e)`, `snapshotPickup(p)`, etc.) that pull the ~10-12 gameplay-critical fields per entity. No changes to `Enemy`, `Pickup`, etc.

### Delta Protocol & Viewport Culling

**Three message types:**
```
FULL  { t:'full', entities:[{type,id,...allFields}, ...] }    // once, on connect
DELTA { t:'delta', e:[{type,id,...onlyChangedFields}, ...] }  // every tick (20Hz)
EVENT { t:'spawn'|'despawn', type, id, ...fields }            // immediate, not batched
```

**Full snapshot** — sent once on client connect. Complete state of all entities. Client builds `remoteEntities` map. One-time ~5 KB cost.

**Delta snapshot** — every tick (20Hz / 50ms). Host compares each entity to what it last sent; only sends if a field crossed threshold:

| Field | Threshold (send if changed by >=) |
|---|---|
| x, y | 2 pixels |
| angle | 0.1 radians |
| health | any change |
| state | any change |
| isDead, isCop, isZombie, isHostile, weaponType | any change (boolean/string flips) |
| limbs (nested) | per-limb `severed` flips, `status` enum changes |
| weapon.name | any change |

Entities where no field crossed threshold are omitted. IDLE civilian that didn't move → not in packet.

**Viewport culling** — layered on delta. Host tracks client camera position (client sends `cameraX, cameraY` at 30Hz). Host only considers entities within client viewport + 200px buffer. Enemy 2000px away never enters payload even if it moved.

**Estimated payload:** ~20-30 entities visible after culling, ~5-10 moved >threshold → ~130-260 bytes/tick → **~3-5 KB/s**.

**Events** — sent immediately: spawns (NPC, pickup, dead drop), despawns (NPC died, pickup taken), projectile spawns. Not batched into ticks.

**Client-side interpolation** — client receives at 20Hz, renders at 60fps. Between updates, linearly interpolates each `RemoteEntity`'s x/y/angle toward last received target. Snaps immediately for corrections >50px (teleports/spawns). Buffers 2 ticks (100ms) to eliminate stutter.

### Hit Adjudication (Projectiles, NOT Hitscan)

This game uses **physical traveling projectiles** (`projectiles.push(new Projectile(projX, projY, angle, {...}))` at weapon.js:803,1151), not instant hitscan. The protocol reflects this:

**Client sends `FIRE` event with world-space aim:**
```
FIRE { x, y, aimAngle, weaponName, projectileCount, fireStartTime }
```
- `aimAngle` is computed on the client from its own position + mouse world position (NOT raw screen mouseX/mouseY — host can't reconstruct aim from stale camera).
- `fireStartTime` lets host deduplicate (don't spawn a second projectile if client reports same fire across two packets).

**Host spawns authoritative projectile:**
- Host creates a real `Projectile` in its sim from `{x, y, aimAngle}` with the weapon's spread/properties.
- Projectile travels over multiple frames in host world, collides per host physics, deals damage.
- NPC health/state changes from the hit flow back to client in the next delta (~50-100ms).

**Client-side feedback (muzzle flash only, NOT impact):**
- Immediate on send: muzzle flash + shell ejection + recoil animation (cosmetic, no reconciliation).
- Client also renders a local cosmetic projectile for visual feedback (bullet leaving gun).
- Blood/impact/gore fires ONLY when host's authoritative projectile collision is reported back via delta — ~50-100ms after visual hit on host.
- This is the latency cost of host-authoritative projectiles. Accept for v1. Local projectile prediction with server reconciliation is a future optimization (out of scope).

### Client State (sent to host at 30Hz)
```
{ t:'clientState', x, y, angle, aimAngle, health, armor, isDead, weapon:{name,recoil,isReloading,...}, limbs:{...}, cameraX, cameraY, input:{firing, fireStartTime} }
```
~60 bytes/tick, ~1.8 KB/s. Host uses `cameraX/cameraY` for viewport culling, renders client avatar in its world, processes `input.firing` by spawning authoritative projectile.

### Pickups (Host-Authoritative)

When client's local player walks over a remote pickup and presses E:
1. Client sends `PICKUP_REQUEST {id}` to host.
2. Host adjudicates (still there? inventory room?) → removes from its sim.
3. Host sends `PICKUP_RESULT {id, success, item}` back.
4. Client adds item to local inventory on success.

Keeps pickup state host-authoritative while giving client responsive loot.

## Game-Loop Integration

**Host-side (3 hooks in main.js, all no-op when `network` is null):**

1. **Pre-update** (before entity updates, ~line 802): `network.applyClientInput()` — host reads client's latest `input` and applies to shadow `clientPlayer` (a real `Player` instance owned by host, representing remote player). Lets client's shots participate in host-authoritative hit detection.

2. **Post-update** (after entity updates, before render): `network.broadcastTick()` — host snapshots changed entities, applies viewport culling, sends delta. Spawns/despawns queued during update flush here. Gated at 20Hz (every 3 frames at 60fps).

3. **Client-player update**: host runs shadow `clientPlayer` through same physics/collision as local player, driven by received input. Exists in `remotePlayers` array, rendered into host's world.

**Client-side (isClient flag switches main.js into client mode):**

- **No local AI**: `manageCivilianSpawning()`, `manageCopSpawning()`, `manageCanSpawning()`, `manageDeadDropSpawning()`, `updateWantedLevel()`, `manageCivilianConflict()`, `checkRivalSpawnConditions()` all no-op.
- **City generation**: client still calls `generateCity()` for static geometry rendering (buildings, roads, sidewalks), but no nav-graph AI.
- **Local player**: fully local — movement, input, inventory, health run client-side for responsiveness. Sends state to host at 30Hz.
- **Remote entities**: `network.applyRemoteState()` runs before render, populating `remoteEntities` from deltas. Interpolation smooths positions.
- **Rendering**: existing render loop draws local player + client-side cosmetics (blood, particles, ragdolls), then `remoteEntities` (NPCs, pickups, dead drops, projectiles) from snapshots via `drawEnemy(ctx, snapshot)` helper, then remote player avatar.

## Error Handling & Edge Cases

- **Host disconnect**: client detects via `peer.on('close')` / `connection.on('close')`. Shows "Host disconnected — returning to menu" overlay 2s, then reloads to start menu. Session ends.
- **Client disconnect**: host detects, removes shadow `clientPlayer` from sim, returns to single-player seamlessly.
- **Packet loss**: dropped packets fine (next delta supersedes). If 5 consecutive ticks missed (250ms), client extrapolates using last-known velocity for up to 1s, then freezes entities until new delta arrives.
- **Latency spikes**: client interpolation buffers 2 ticks (100ms) — adds 100ms display latency, eliminates stutter. Imperceptible for casual sandbox.
- **Client joins mid-session**: host sends FULL snapshot (all entities). Client builds `remoteEntities` from scratch. One-time ~5 KB.
- **PeerJS server down**: "Host Game"/"Join Game" buttons show "Multiplayer server unavailable" fallback. Single-player unaffected.
- **Version mismatch**: host sends `HANDSHAKE {version:'1.0'}` on connect. Client rejects with "Version mismatch" if different.

## Testing Strategy

- **Loopback**: host + client in two browser tabs on same machine. Verify: client sees host's NPCs, client can shoot NPCs (host adjudicates), pickups work, wanted level syncs, host disconnect returns client to menu.
- **Two-machine**: host on one machine, client on another (LAN then internet). Verify bandwidth <10 KB/s, interpolation smooth, no stutter under normal latency.
- **Edge cases**: client joins after host has 107 NPCs + 20 dead drops (full snapshot reconstructs), client disconnects mid-firefight (host continues solo), packet loss simulation (extrapolation holds 1s then freezes gracefully).
- **No regression**: single-player mode (no network) runs identically to pre-multiplayer — all hooks no-op, zero overhead.

## New Files

- `net.js` — NetworkManager, HostManager, ClientManager, serialization, delta logic, PeerJS integration
- `remote-entity.js` — RemoteEnemy, RemotePickup, RemoteDeadDrop, RemoteProjectile, RemotePlayer stub classes + shared `drawEnemy(ctx, snapshot)` helper

## Modified Files (minimal, additive)

- `index.html` — add PeerJS CDN script, add Host/Join buttons to start menu
- `main.js` — 3 network hooks (pre-update, post-update, client-mode branch), `isClient` flag
- `start-menu.js` — wire Host/Join buttons to NetworkManager
- `style.css` — styling for room-code input + connection status overlay

## Deferred / Out of Scope (v1)

- Local projectile prediction with server reconciliation (latency optimization)
- Host migration (client takes over on host leave)
- >2 players (topology scales but bandwidth/complexity grow)
- MP3 transcoding (separate optimization pass)
- JS minification/bundling (build-step addition)
