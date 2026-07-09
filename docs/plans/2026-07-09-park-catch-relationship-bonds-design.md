# Stickman Joe — Park Catch & Relationship Bonds

**Date:** 2026-07-09
**Status:** Approved
**Goal:** NPCs congregate in parks to play catch, forming relationship bonds. Bond strength scales emotional reactions — friends fight for each other or experience heightened stress when a friend is hurt.

## Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Relationship model | `Map<enemyId, strength>` (0..1) | Binary Set can't scale reactions by closeness; Map enables graduated grief, anger, and stress |
| Ball visual | Visible ball projectile (local cosmetic) | Players can see the game of catch happening; no global projectile array, no network physics |
| Ball in multiplayer | 2 snapshot fields (`ballX, ballY`) | Host-authoritative NPC snapshot already carries state; piggyback ball position as cosmetic fields |
| Defensive combat | Brave friends fight, cowardly friends flee | Uses existing `bravery` personality trait; mirrors civilian-conflict pattern |
| Target routing | `ATTACKING_CIVILIAN` for NPC aggressor, `CHASING` for player aggressor | Matches existing target resolution chain; avoids mis-targeting the player |

## Architecture

### 1. Relationship Data Model — Set → Map

**Current:** `this.relationships = new Set()` (enemy.js:131) — binary friend/not-friend.
**Proposed:** `this.relationships = new Map()` keyed by `enemyId`, value is a `0..1` strength score.

**Helper methods on the Enemy class:**

```javascript
setRelationship(id, strength)           // create/overwrite
addRelationshipStrength(id, delta)      // increment, clamped to 1.0
getRelationshipStrength(id)             // returns 0 if absent, else the score
hasRelationship(id)                     // convenience: getRelationshipStrength(id) > 0
```

**Accrual sources:**

| Source | Strength | Where |
|---|---|---|
| Seeded at spawn | `0.3 + random * 0.3` (0.3–0.6) | `main.js:assignRelationships` |
| Cop squadmate | `0.7` | `main.js:assignCopSquadRelationships` |
| Conversation complete | `+0.15` per conversation | `behavior.js` CONVERSING end |
| Catch session complete | `+0.25` per full game | new PLAYING_CATCH state |

**Migration — 5 call sites, all mechanical:**

| File:Line | Current | New |
|---|---|---|
| `main.js:383-384` | `relationships.add(id)` | `setRelationship(id, 0.3 + Math.random() * 0.3)` |
| `main.js:540-541` | `relationships.add(id)` | `setRelationship(id, 0.7)` |
| `behavior.js:444-445` | `relationships.add(id)` | `addRelationshipStrength(id, 0.15)` |
| `cop.js:194` | `relationships.has(id)` | `getRelationshipStrength(id) > 0.3` |
| `witness.js:128` | `relationships.has(id)` | `getRelationshipStrength(id)` + scale reaction |

### 2. Park Catch Activity

#### 2a. Park-Seeking Patrol

NPCs currently only patrol sidewalks (`getSidewalkPatrolPoint`). Without park-seeking, catch never triggers.

**New helper in `city.js`:**

```javascript
export function getParkPoint(city) {
    if (!city || !city.grassAreas || city.grassAreas.length === 0) return null;
    const park = city.grassAreas[Math.floor(Math.random() * city.grassAreas.length)];
    const padding = 0.15;
    return {
        x: park.x + park.width * (padding + Math.random() * (1 - 2 * padding)),
        y: park.y + park.height * (padding + Math.random() * (1 - 2 * padding)),
    };
}
```

**In PATROLLING state** (`behavior.js:407-413`), when generating a new patrol destination:
- `Math.random() < 0.12 * enemy.socialness` → call `getParkPoint(world.city)` instead of `getSidewalkPatrolPoint`
- Route via `getSidewalkPath` — NPC walks sidewalk graph to nearest nav node, then walks into the park

#### 2b. PLAYING_CATCH State

**New state:** `PLAYING_CATCH` — mirrors the existing `CONVERSING` paired-activity lifecycle.

**Trigger** (in PATROLLING, after conversation check at `behavior.js:417`):
- Only civilians (`!isCop, !isHostileActor, !isZombie`)
- NPC is inside a park (`isInPark` helper checks `grassAreas` rectangles)
- `socialness > 0.3`
- Probability gate: `Math.random() < 0.01 * socialness` per frame
- Finds another nearby civilian (40–120px) in PATROLLING/IDLE, also in the same park, not already busy
- On match: both NPCs enter `PLAYING_CATCH`, set `playingCatchWith` ref, `playCatchEndTime = now + 8000 + random * 7000` (8–15s), clear paths

**Ball simulation** — lightweight, no global array, no physics:

Each NPC in the pair tracks a local `ballState`:
```
{ phase: 'thrown'|'inFlight'|'caught'|'held', progress: 0..1, fromX, fromY, toX, toY, holdUntil }
```

- Thrower initiates: `ballState = { phase: 'inFlight', progress: 0, fromX: thrower.x, fromY: thrower.y, toX: catcher.x, toY: catcher.y }`
- Each frame: `progress += dt / 600` (600ms flight)
- Ball position: `x = lerp(fromX, toX, progress)`, `y = lerp(fromY, toY, progress)`, arc: `z = sin(progress * PI) * 20` (visual offset only)
- At `progress >= 1`: roles swap, catcher holds for 200–500ms, then throws back
- Drawn in enemy `draw()` as a small circle — no collision, no global tracking

**State behavior** (`PLAYING_CATCH` case in `runCivilianAI`):
- Speed = 0 (stand still)
- Face the partner
- Manage ball progress + role swaps
- On end (timer expired, partner died/fled/interrupted): `addRelationshipStrength(partner.enemyId, 0.25)` on both sides, return to PATROLLING

**Interruption:** any threat detection (gunshot alert, nearby aggression, player gunfire within 600px) breaks the game immediately. No relationship gain if interrupted before first complete throw cycle.

**Park detection helper** (in `behavior.js`):
```javascript
function isInPark(x, y, city) {
    if (!city || !city.grassAreas) return false;
    for (const g of city.grassAreas) {
        if (x > g.x && x < g.x + g.width && y > g.y && y < g.y + g.height) return true;
    }
    return false;
}
```

#### 2c. Multiplayer Visibility

Host is authoritative for all NPCs. Client renders via `RemoteEnemy` stubs from `snapshotEnemy()`.

**Add 2 fields to `snapshotEnemy` in `net.js`:**
```
ballX, ballY  // ball screen position when in flight, else null
```

Host computes ball position each tick (same as local rendering). Included in snapshot only when NPC is `PLAYING_CATCH` and ball is in flight; `null` otherwise (delta protocol skips unchanged null fields).

**Bandwidth:** ~16 bytes/tick for a pair. Negligible.

**Client rendering** — `drawEnemy(ctx, snap)` in `remote-entity.js`:
```javascript
if (snap.ballX !== null && snap.ballY !== null) {
    ctx.beginPath();
    ctx.arc(snap.ballX, snap.ballY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#e8e8e8';
    ctx.fill();
}
```

No interpolation needed — 20Hz updates over a 600ms flight look fluid. Ball stays out of `projectiles` array (no collision, no physics, no projectile snapshot type).

### 3. Defensive Combat — Friends Protect Friends

**New function in `ai/witness.js`:** `witnessFriendHurt(witness, aggressor, victim)`

Called from `enemy.js` when an NPC takes damage, alongside existing `checkCrimeWitnesses`. For each NPC with a relationship to the victim:

```
strength = witness.getRelationshipStrength(victim.enemyId)
if strength < 0.2: return  // too distant to care
```

#### Target Routing (critical — avoids mis-targeting bug)

The existing target resolution chain (`behavior.js:190`, `enemy.js:736-747`):
```
target = (isCop && policeTarget) || (state === 'ATTACKING_CIVILIAN' && civilianTarget) || player
```

A civilian in `CHASING` with `civilianTarget` set would skip the `ATTACKING_CIVILIAN` branch and fall through to `player`. Therefore:

**Aggressor is the player** → player-combat path:
- `isHostileActor = true`, `state = 'CHASING'`
- Routes to `runCombatAI`, target resolves to `player` ✓
- Aggressiveness boost: `+= strength * 0.3`
- If unarmed, give Pistol + 30 ammo
- `reactionFlash = { type: 'anger', time: now }`

**Aggressor is an NPC** → civilian-combat path (existing pattern from `manageCivilianConflict`):
- `state = 'ATTACKING_CIVILIAN'`, `civilianTarget = aggressor`
- Do NOT set `isHostileActor` — stays in `runCivilianAI`, target resolves to `civilianTarget` ✓
- If unarmed, give Pistol + 30 ammo
- `reactionFlash = { type: 'anger', time: now }`
- Returns to PATROLLING when aggressor dies/escapes (existing `behavior.js:321-328`)

#### Brave vs Cowardly Split

Applies to both routing paths:

- **Brave:** `bravery > 0.25 && strength > 0.4` → fight (above)
- **Cowardly:** else → `state = 'FLEEING'`, `fleeTarget = aggressor`, `stressLevel += 30 * strength`, `reactionFlash = { type: 'fear' }`, panic spreads via existing `spreadPanic`

#### witnessCrime Early-Return

Add `'ATTACKING_CIVILIAN'` to the guard list at `enemy.js:970` so defending friends don't get distracted into re-witnessing and switching targets mid-fight:
```
['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING', 'ATTACKING_CIVILIAN']
```

#### Scaling Grief on Death

Update `witnessRelatedDeath` in `ai/witness.js`:
```javascript
const strength = witness.getRelationshipStrength(deadEnemyId);
if (strength <= 0) return;
witness.grievingTarget = corpse;
witness.state = 'GRIEVING';
const griefDuration = 3000 + strength * 12000 + Math.random() * 3000;
witness.stateChangeCooldown = Date.now() + griefDuration;
witness.reactionFlash = { type: 'grief', time: Date.now() };
witness.shockTime = Date.now() + 1000 + strength * 2000;
witness.stressLevel = Math.max(witness.stressLevel, 40 + strength * 40);
```

#### Cop Squadmate Reaction

Update `cop.js:194` — scale boost by strength:
```javascript
const strength = this.getRelationshipStrength(deadEnemyId);
if (strength > 0.3) {
    this.aggressiveness = Math.min(1.0, this.aggressiveness + strength * 0.3);
    this.bravery = Math.min(1.0, this.bravery + strength * 0.2);
}
```

## Files Changed

| File | Change |
|---|---|
| `enemy.js` | `relationships` Set→Map + 4 helper methods; init `ballState`, `playingCatchWith`; draw ball in `draw()`; call `witnessFriendHurt` on damage; add `ATTACKING_CIVILIAN` to witnessCrime guard |
| `ai/behavior.js` | `PLAYING_CATCH` state + trigger + park-seeking patrol + `isInPark` helper; conversation→strength accrual; export `witnessFriendHurt` usage |
| `ai/witness.js` | `witnessFriendHurt` function; scale `witnessRelatedDeath` by strength; `relationships.has`→`getRelationshipStrength` |
| `city.js` | `getParkPoint(city)` helper |
| `main.js` | `assignRelationships` + cop squad: Set→Map with strength values |
| `cop.js` | Scale squadmate death reaction by strength |
| `net.js` | Add `ballX`, `ballY` to `snapshotEnemy` |
| `remote-entity.js` | Draw ball in `drawEnemy` from snapshot |
| `options.js` | Tweakable params: park-seek chance, catch session duration, bond accrual rates |

**No new files.** No changes to `net.js` protocol structure beyond 2 cosmetic fields. Ball is a local cosmetic, not a global projectile. Single-player feature with multiplayer visibility via snapshot piggyback.
