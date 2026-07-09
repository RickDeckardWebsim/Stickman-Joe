# Park Catch & Relationship Bonds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** NPCs congregate in parks to play catch, forming relationship bonds whose strength scales emotional reactions — friends fight for each other or experience heightened stress when a friend is hurt.

**Architecture:** Migrate `enemy.relationships` from `Set` to `Map<enemyId, strength>` (0..1). Add a `PLAYING_CATCH` civilian state with park-seeking patrol. Add a `witnessFriendHurt` function with correct target routing (`ATTACKING_CIVILIAN` for NPC aggressors, `CHASING` for player aggressor). Scale grief/stress by bond strength. Ball is a local cosmetic with 2 snapshot fields for multiplayer visibility.

**Tech Stack:** Vanilla ES modules, HTML canvas, no build step.

---

### Task 1: Relationship Map Migration — Enemy Class

**Files:**
- Modify: `enemy.js:130-131` (relationship init), `enemy.js:130-140` (add catch fields)

**Step 1: Change `relationships` from Set to Map + add helper methods + catch fields**

In the Enemy constructor, replace line 131:

```javascript
        // --- Relationship System ---
        this.relationships = new Map(); // Map<enemyId, strength(0..1)>
        this.enemyId = Math.random().toString(36).substr(2, 9); // Unique ID
```

Add catch/activity fields after `conversationEndTime` (line 136):

```javascript
        this.conversingWith = null; // Reference to NPC currently in conversation with
        this.conversationEndTime = 0; // When the current conversation ends
        this.playingCatchWith = null; // Reference to NPC currently playing catch with
        this.playCatchEndTime = 0; // When the current catch session ends
        this.ballState = null; // { phase, progress, fromX, fromY, toX, toY, holdUntil } — local cosmetic
```

Add 4 helper methods on the Enemy class (after the `witnessCrime` method, around line 995):

```javascript
    setRelationship(id, strength) {
        this.relationships.set(id, Math.min(1, Math.max(0, strength)));
    }

    addRelationshipStrength(id, delta) {
        const current = this.relationships.get(id) || 0;
        this.setRelationship(id, current + delta);
    }

    getRelationshipStrength(id) {
        return this.relationships.get(id) || 0;
    }

    hasRelationship(id) {
        return this.getRelationshipStrength(id) > 0;
    }
```

**Step 2: Verify no syntax errors**

Run: `python serve.py` then open browser console — check for module load errors.
Expected: No errors referencing `relationships` or the new methods.

**Step 3: Commit**

```bash
git add enemy.js
git commit -m "refactor(relationships): migrate Set to Map<id,strength> + helper methods + catch fields"
```

---

### Task 2: Migrate All Call Sites — Set.add → Map

**Files:**
- Modify: `main.js:382-384`, `main.js:540-541`
- Modify: `ai/behavior.js:444-445`
- Modify: `cop.js:194`

**Step 1: Update `assignRelationships` in main.js:382-384**

Replace:
```javascript
                if (Math.random() < 0.15) {
                    newEnemy.relationships.add(existingEnemy.enemyId);
                    existingEnemy.relationships.add(newEnemy.enemyId);
```
With:
```javascript
                if (Math.random() < 0.15) {
                    const strength = 0.3 + Math.random() * 0.3; // 0.3–0.6
                    newEnemy.setRelationship(existingEnemy.enemyId, strength);
                    existingEnemy.setRelationship(newEnemy.enemyId, strength);
```

**Step 2: Update cop squad in main.js:540-541**

Replace:
```javascript
            squad[i].relationships.add(squad[j].enemyId);
            squad[j].relationships.add(squad[i].enemyId);
```
With:
```javascript
            squad[i].setRelationship(squad[j].enemyId, 0.7);
            squad[j].setRelationship(squad[i].enemyId, 0.7);
```

**Step 3: Update conversation end in ai/behavior.js:444-445**

Replace:
```javascript
                    enemy.relationships.add(enemy.conversingWith.enemyId);
                    enemy.conversingWith.relationships.add(enemy.enemyId);
```
With:
```javascript
                    enemy.addRelationshipStrength(enemy.conversingWith.enemyId, 0.15);
                    enemy.conversingWith.addRelationshipStrength(enemy.enemyId, 0.15);
```

**Step 4: Update cop squadmate death in cop.js:194**

Replace:
```javascript
        if (this.relationships.has(deadEnemyId)) {
            // Enraged response to losing a squadmate
            this.aggressiveness = Math.min(1.0, this.aggressiveness + 0.3);
            this.bravery = Math.min(1.0, this.bravery + 0.2);
```
With:
```javascript
        const strength = this.getRelationshipStrength(deadEnemyId);
        if (strength > 0.3) {
            // Enraged response to losing a squadmate — scaled by bond strength
            this.aggressiveness = Math.min(1.0, this.aggressiveness + strength * 0.3);
            this.bravery = Math.min(1.0, this.bravery + strength * 0.2);
```

**Step 5: Verify in browser**

Run: open game, play for 30s, check console for errors.
Expected: No errors. NPCs behave normally — conversations still form relationships.

**Step 6: Commit**

```bash
git add main.js ai/behavior.js cop.js
git commit -m "refactor(relationships): migrate all Set.add/has call sites to Map helpers"
```

---

### Task 3: Scale Grief by Bond Strength

**Files:**
- Modify: `ai/witness.js:127-136`

**Step 1: Update `witnessRelatedDeath` in ai/witness.js:127-136**

Replace:
```javascript
export function witnessRelatedDeath(witness, deadEnemyId, corpse) {
    if (witness.relationships.has(deadEnemyId)) {
        witness.grievingTarget = corpse;
        witness.state = 'GRIEVING';
        const griefDuration = 5000 + Math.random() * 5000;
        witness.stateChangeCooldown = Date.now() + griefDuration;
        witness.reactionFlash = { type: 'grief', time: Date.now() };
        witness.shockTime = Date.now() + 1500;
    }
}
```
With:
```javascript
export function witnessRelatedDeath(witness, deadEnemyId, corpse) {
    const strength = witness.getRelationshipStrength(deadEnemyId);
    if (strength <= 0) return;
    witness.grievingTarget = corpse;
    witness.state = 'GRIEVING';
    // Scale duration by bond: 3s acquaintance → 15s best friend
    const griefDuration = 3000 + strength * 12000 + Math.random() * 3000;
    witness.stateChangeCooldown = Date.now() + griefDuration;
    witness.reactionFlash = { type: 'grief', time: Date.now() };
    witness.shockTime = Date.now() + 1000 + strength * 2000;
    // Stress spike scaled by closeness
    witness.stressLevel = Math.max(witness.stressLevel, 40 + strength * 40);
}
```

**Step 2: Verify in browser**

Run: start game, shoot a civilian whose friend is nearby, observe grief duration varies.
Expected: Close friends grieve longer (10-15s) than acquaintances (3-6s).

**Step 3: Commit**

```bash
git add ai/witness.js
git commit -m "feat(relationships): scale grief duration and stress by bond strength"
```

---

### Task 4: Park-Seeking Patrol

**Files:**
- Modify: `city.js` (add `getParkPoint` after `getSidewalkPatrolPoint`, around line 655)
- Modify: `ai/behavior.js:407-413` (PATROLLING destination), top of file (import `getParkPoint`)

**Step 1: Add `getParkPoint` to city.js**

Insert after the `getSidewalkPatrolPoint` function (after its closing brace, around line 655):

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

**Step 2: Import `getParkPoint` in ai/behavior.js**

Update the import on line 2:
```javascript
import { getSidewalkPatrolPoint, hasLineOfSight, getSidewalkPath, findNearestSidewalk, isOnSidewalk, getParkPoint } from '../city.js';
```

**Step 3: Add park-seeking to PATROLLING in ai/behavior.js:407-413**

Replace:
```javascript
        case 'PATROLLING':
            // The pathing logic is now handled by the main enemy update loop.
            if (!enemy.path || enemy.path.length === 0) {
                const endPoint = getSidewalkPatrolPoint(world.city);
                enemy.path = getSidewalkPath(world.city, enemy.x, enemy.y, endPoint.x, endPoint.y);
                enemy.pathIndex = 0;
            }
            currentSpeed = enemy.patrolSpeed;
```
With:
```javascript
        case 'PATROLLING':
            // The pathing logic is now handled by the main enemy update loop.
            if (!enemy.path || enemy.path.length === 0) {
                let endPoint;
                // Social NPCs occasionally head to a park instead of a sidewalk point
                if (Math.random() < 0.12 * enemy.socialness) {
                    endPoint = getParkPoint(world.city);
                }
                if (!endPoint) {
                    endPoint = getSidewalkPatrolPoint(world.city);
                }
                enemy.path = getSidewalkPath(world.city, enemy.x, enemy.y, endPoint.x, endPoint.y);
                enemy.pathIndex = 0;
            }
            currentSpeed = enemy.patrolSpeed;
```

**Step 4: Verify in browser**

Run: start game, watch NPCs for 30s, observe some NPCs walk into parks (grass areas).
Expected: Social NPCs visibly enter park areas. No console errors.

**Step 5: Commit**

```bash
git add city.js ai/behavior.js
git commit -m "feat(npc): social NPCs seek out parks for congregation"
```

---

### Task 5: PLAYING_CATCH State — Trigger + Logic

**Files:**
- Modify: `ai/behavior.js` (add `isInPark` helper, add catch trigger in PATROLLING, add `PLAYING_CATCH` case)

**Step 1: Add `isInPark` helper to ai/behavior.js**

Add near the top of the file (after the imports, before `lerpAngle`):

```javascript
function isInPark(x, y, city) {
    if (!city || !city.grassAreas) return false;
    for (const g of city.grassAreas) {
        if (x > g.x && x < g.x + g.width && y > g.y && y < g.y + g.height) return true;
    }
    return false;
}
```

**Step 2: Add catch trigger in PATROLLING case**

After the conversation trigger block (after the closing `}` of the `if (!enemy.conversingWith && Math.random() < 0.005 * enemy.socialness)` block, around line 435), insert:

```javascript

            // --- Catch trigger: find a nearby NPC to play catch with in a park ---
            if (!enemy.playingCatchWith && !enemy.conversingWith &&
                enemy.socialness > 0.3 && isInPark(enemy.x, enemy.y, world.city) &&
                Math.random() < 0.01 * enemy.socialness) {
                for (const other of enemies) {
                    if (other === enemy || other.health <= 0 || other.isCop ||
                        other.isHostileActor || other.isZombie) continue;
                    if (other.playingCatchWith || other.conversingWith) continue;
                    if (other.state !== 'PATROLLING' && other.state !== 'IDLE') continue;
                    const dist = Math.hypot(enemy.x - other.x, enemy.y - other.y);
                    if (dist < 120 && dist > 40 && isInPark(other.x, other.y, world.city)) {
                        // Start catch session
                        enemy.playingCatchWith = other;
                        enemy.playCatchEndTime = now + 8000 + Math.random() * 7000;
                        enemy.state = 'PLAYING_CATCH';
                        enemy.path = [];
                        enemy.ballState = { phase: 'held', progress: 0, fromX: enemy.x, fromY: enemy.y, toX: other.x, toY: other.y, holdUntil: now + 500 };
                        other.playingCatchWith = enemy;
                        other.playCatchEndTime = enemy.playCatchEndTime;
                        other.state = 'PLAYING_CATCH';
                        other.path = [];
                        other.ballState = null; // Other NPC waits to receive
                        break;
                    }
                }
            }
```

**Step 3: Add `PLAYING_CATCH` case to the switch statement**

Add after the `CONVERSING` case (after its `break;`, around line 457):

```javascript

        case 'PLAYING_CATCH':
            currentSpeed = 0;
            if (!enemy.playingCatchWith || enemy.playingCatchWith.health <= 0 || now > enemy.playCatchEndTime) {
                // End catch — form/strengthen a relationship
                if (enemy.playingCatchWith && enemy.playingCatchWith.health > 0) {
                    // Only gain bond if at least one throw completed
                    if (enemy.ballState || enemy.playingCatchWith.ballState) {
                        enemy.addRelationshipStrength(enemy.playingCatchWith.enemyId, 0.25);
                        enemy.playingCatchWith.addRelationshipStrength(enemy.enemyId, 0.25);
                    }
                }
                enemy.playingCatchWith = null;
                enemy.ballState = null;
                enemy.state = 'PATROLLING';
                enemy.path = [];
            } else {
                // Face the partner
                const partner = enemy.playingCatchWith;
                const angle = Math.atan2(partner.y - enemy.y, partner.x - enemy.x);
                enemy.facingAngle = angle;
                enemy.angle = angle;

                // Update ball state — only the thrower manages the ball
                if (enemy.ballState) {
                    const bs = enemy.ballState;
                    if (bs.phase === 'held') {
                        if (now >= bs.holdUntil) {
                            // Throw the ball
                            bs.phase = 'inFlight';
                            bs.progress = 0;
                            bs.fromX = enemy.x;
                            bs.fromY = enemy.y;
                            bs.toX = partner.x;
                            bs.toY = partner.y;
                        }
                    } else if (bs.phase === 'inFlight') {
                        bs.progress += (1 / 60) / 0.6; // ~600ms flight at 60fps
                        if (bs.progress >= 1) {
                            // Ball caught — transfer ownership to partner
                            bs.phase = 'held';
                            bs.progress = 0;
                            bs.holdUntil = now + 200 + Math.random() * 300;
                            bs.fromX = partner.x;
                            bs.fromY = partner.y;
                            bs.toX = enemy.x;
                            bs.toY = enemy.y;
                            // Give ball to partner
                            partner.ballState = bs;
                            enemy.ballState = null;
                        } else {
                            // Update target if partner moved
                            bs.toX = partner.x;
                            bs.toY = partner.y;
                        }
                    }
                }
            }
            break;
```

**Step 4: Verify in browser**

Run: start game, wait for NPCs to enter parks, observe two NPCs standing face-to-face.
Expected: NPCs in parks occasionally pair up and stand still (ball draws in next task).

**Step 5: Commit**

```bash
git add ai/behavior.js
git commit -m "feat(npc): PLAYING_CATCH state with park trigger and ball logic"
```

---

### Task 6: Ball Rendering — Local

**Files:**
- Modify: `enemy.js:1875` (draw method)

**Step 1: Add ball drawing to the Enemy `draw` method**

In the `draw(ctx, player)` method (line 1875), find the end of the method (before the closing brace). Add:

```javascript
        // Draw catch ball if in flight
        if (this.ballState && this.ballState.phase === 'inFlight') {
            const bs = this.ballState;
            const bx = bs.fromX + (bs.toX - bs.fromX) * bs.progress;
            const by = bs.fromY + (bs.toY - bs.fromY) * bs.progress;
            const arcOffset = Math.sin(bs.progress * Math.PI) * 20;
            ctx.beginPath();
            ctx.arc(bx, by - arcOffset, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#e8e8e8';
            ctx.fill();
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
```

**Step 2: Verify in browser**

Run: start game, watch parks. When two NPCs pair up, a ball should arc between them.
Expected: Visible ball arcing back and forth between paired NPCs in parks.

**Step 3: Commit**

```bash
git add enemy.js
git commit -m "feat(npc): render catch ball as local cosmetic"
```

---

### Task 7: Break Catch on Threat

**Files:**
- Modify: `ai/behavior.js:99-113` (civilian flee trigger in `decideState`)

**Step 1: Add catch-breaking to the civilian flee logic in `decideState`**

In `decideState`, the civilian flee block (around line 103-113) currently breaks conversations. Add catch-breaking alongside it. Replace:

```javascript
        if (aggressionNearby || playerIsAggressive) {
            // Break any active conversation before fleeing
            if (enemy.conversingWith) {
                enemy.conversingWith.conversingWith = null;
                enemy.conversingWith.state = 'PATROLLING';
                enemy.conversingWith = null;
            }
            enemy.state = 'FLEEING';
```
With:
```javascript
        if (aggressionNearby || playerIsAggressive) {
            // Break any active conversation before fleeing
            if (enemy.conversingWith) {
                enemy.conversingWith.conversingWith = null;
                enemy.conversingWith.state = 'PATROLLING';
                enemy.conversingWith = null;
            }
            // Break any active catch game before fleeing
            if (enemy.playingCatchWith) {
                enemy.playingCatchWith.playingCatchWith = null;
                enemy.playingCatchWith.ballState = null;
                enemy.playingCatchWith.state = 'PATROLLING';
                enemy.playingCatchWith.path = [];
                enemy.playingCatchWith = null;
                enemy.ballState = null;
            }
            enemy.state = 'FLEEING';
```

**Step 2: Verify in browser**

Run: start game, wait for catch to start, shoot near the playing NPCs.
Expected: Both NPCs immediately stop playing and flee. Ball disappears.

**Step 3: Commit**

```bash
git add ai/behavior.js
git commit -m "feat(npc): break catch game when threat detected"
```

---

### Task 8: Defensive Combat — witnessFriendHurt

**Files:**
- Modify: `ai/witness.js` (add `witnessFriendHurt` function, export it)
- Modify: `enemy.js:8` (import it), `enemy.js:1114-1120` (call it on damage), `enemy.js:970` (add ATTACKING_CIVILIAN to guard)

**Step 1: Add `witnessFriendHurt` to ai/witness.js**

Add at the end of the file (after `updateAlerts`), and add the Pistol import at the top:

```javascript
import { Pistol } from '../pistol.js';
```

```javascript
// === Friend Hurt — friends defend or flee based on bravery and bond ===
export function witnessFriendHurt(witness, aggressor, victim) {
    if (witness === victim || witness === aggressor) return;
    if (witness.health <= 0 || witness.isZombie || witness.isCop) return;
    // Skip if already in a high-priority state
    if (['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING', 'ATTACKING_CIVILIAN', 'PLAYING_CATCH'].includes(witness.state)) return;

    const strength = witness.getRelationshipStrength(victim.enemyId);
    if (strength < 0.2) return; // Too distant to care

    // Break any social activity
    if (witness.conversingWith) {
        witness.conversingWith.conversingWith = null;
        witness.conversingWith.state = 'PATROLLING';
        witness.conversingWith = null;
    }
    if (witness.playingCatchWith) {
        witness.playingCatchWith.playingCatchWith = null;
        witness.playingCatchWith.ballState = null;
        witness.playingCatchWith.state = 'PATROLLING';
        witness.playingCatchWith.path = [];
        witness.playingCatchWith = null;
        witness.ballState = null;
    }

    const isBrave = witness.bravery > 0.25 && strength > 0.4;

    if (isBrave) {
        // Fight the aggressor
        if (!witness.weapon) {
            witness.weapon = new Pistol(witness);
            witness.weapon.reserveAmmo = 30;
        }
        witness.reactionFlash = { type: 'anger', time: Date.now() };
        witness.aggressiveness = Math.min(1.0, witness.aggressiveness + strength * 0.3);

        if (aggressor === world.player) {
            // Player aggressor — use combat path, target resolves to player
            witness.isHostileActor = true;
            witness.state = 'CHASING';
            witness.lastKnownPlayerPos = { x: aggressor.x, y: aggressor.y };
        } else {
            // NPC aggressor — use civilian combat path, targets the aggressor
            witness.state = 'ATTACKING_CIVILIAN';
            witness.civilianTarget = aggressor;
        }
    } else {
        // Flee in heightened panic
        witness.state = 'FLEEING';
        witness.fleeTarget = aggressor;
        witness.lastSeenFleeTargetTime = Date.now();
        witness.reactionFlash = { type: 'fear', time: Date.now() };
        witness.stressLevel = Math.min(100, witness.stressLevel + 30 * strength);
        witness.stateChangeCooldown = Date.now() + 2000 + strength * 3000;
    }
}
```

**Step 2: Import `witnessFriendHurt` in enemy.js**

Update line 8:
```javascript
import { witnessCrime, witnessDeath, witnessRelatedDeath, spreadPanic, checkCrimeWitnesses, witnessFriendHurt } from './ai/witness.js';
```

**Step 3: Call `witnessFriendHurt` when an NPC survives damage**

In `takeDamage` at the "NPC SURVIVED" branch (line 1114-1120), add the call. Replace:

```javascript
        } else if (wasAlive && this.health > 0 && !this.isZombie) {
            // --- NPC SURVIVED ---
            const minPainShockDuration = 200;
            const maxPainShockDuration = 700;
            this.shockTime = Math.max(this.shockTime, Date.now() + minPainShockDuration + Math.random() * (maxPainShockDuration - minPainShockDuration));
            this.reactionFlash = { type: 'fear', time: Date.now() };
        }
```
With:
```javascript
        } else if (wasAlive && this.health > 0 && !this.isZombie) {
            // --- NPC SURVIVED ---
            const minPainShockDuration = 200;
            const maxPainShockDuration = 700;
            this.shockTime = Math.max(this.shockTime, Date.now() + minPainShockDuration + Math.random() * (maxPainShockDuration - minPainShockDuration));
            this.reactionFlash = { type: 'fear', time: Date.now() };

            // Notify friends of the hurt — they may defend or flee
            if (options.owner) {
                for (const friend of enemies) {
                    if (friend === this || friend === options.owner) continue;
                    witnessFriendHurt(friend, options.owner, this);
                }
            }
        }
```

**Step 4: Add `ATTACKING_CIVILIAN` to the `witnessCrime` guard at enemy.js:970**

Replace:
```javascript
        if (['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING'].includes(this.state)) return;
```
With:
```javascript
        if (['CHASING', 'STRAFING', 'FLEEING', 'GRIEVING', 'SEARCHING', 'ATTACKING_CIVILIAN'].includes(this.state)) return;
```

**Step 5: Verify in browser**

Run: start game, shoot a civilian near their friend (identified by grief reaction on death). Shoot but don't kill the first civilian.
Expected: Brave friend turns hostile and shoots at you. Cowardly friend flees. Both react before the friend dies.

**Step 6: Commit**

```bash
git add ai/witness.js enemy.js
git commit -m "feat(relationships): friends defend or flee when a friend is hurt, scaled by bond"
```

---

### Task 9: Multiplayer Ball Visibility

**Files:**
- Modify: `net.js:480-499` (`snapshotEnemy`)
- Modify: `remote-entity.js:3-51` (`drawEnemy`)

**Step 1: Add `ballX`, `ballY` to `snapshotEnemy` in net.js**

In the `snapshotEnemy` function, add two fields before the closing `}`. Replace:

```javascript
        ll: e.limbs.leftLeg !== false,
        rl: e.limbs.rightLeg !== false
    };
```
With:
```javascript
        ll: e.limbs.leftLeg !== false,
        rl: e.limbs.rightLeg !== false,
        ballX: (e.ballState && e.ballState.phase === 'inFlight')
            ? Math.round((e.ballState.fromX + (e.ballState.toX - e.ballState.fromX) * e.ballState.progress) * 10) / 10
            : null,
        ballY: (e.ballState && e.ballState.phase === 'inFlight')
            ? Math.round((e.ballState.fromY + (e.ballState.toY - e.ballState.fromY) * e.ballState.progress) * 10) / 10
            : null
    };
```

**Step 2: Draw ball in `drawEnemy` in remote-entity.js**

In the `drawEnemy` function, after the health bar (before `ctx.restore()`, around line 49), add:

```javascript
    // Draw catch ball from snapshot
    if (snap.ballX !== null && snap.ballY !== null) {
        ctx.beginPath();
        ctx.arc(snap.ballX, snap.ballY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#e8e8e8';
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
```

Note: `drawEnemy` uses `ctx.save()` / `ctx.translate(snap.x, snap.y)` / `ctx.rotate(snap.angle)` at the top (lines 4-6). The ball coordinates are in world space, so draw it AFTER `ctx.restore()` — adjust placement to just before the function's final `ctx.restore()` is wrong. Actually, the ball coords are world-space, but the context is translated to the NPC. So we need to draw the ball relative to the NPC's transform. Use world-space minus NPC position:

Actually, the simplest correct approach: draw the ball in world space, outside the NPC's local transform. Add it after `ctx.restore()` at the end of `drawEnemy`:

```javascript
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
```

**Step 3: Verify (single-player first, then multiplayer if testable)**

Run: single-player — ball still draws locally (no regression). If multiplayer testable: host + client tabs, client should see balls arcing between NPCs in parks.
Expected: No regression in single-player. Ball visible on client in multiplayer.

**Step 4: Commit**

```bash
git add net.js remote-entity.js
git commit -m "feat(multiplayer): ball visible on client via snapshot piggyback"
```

---

### Task 10: Tweakable Options + Final Verification

**Files:**
- Modify: `options.js:34` (add tweakables before `advancedOptionsAnimationDuration`), `options.js:74` (add to settings object)

**Step 1: Add tweakable variables to options.js**

After line 34 (`enemyHealthMultiplier`), add:

```javascript
/* @tweakable Chance for social NPCs to seek parks when patrolling (0-1, multiplied by socialness) */
let parkSeekChance = 0.12;
/* @tweakable Strength gained per completed conversation (0-1) */
let conversationBondGain = 0.15;
/* @tweakable Strength gained per completed catch session (0-1) */
let catchBondGain = 0.25;
/* @tweakable Minimum relationship strength to trigger defensive reaction (0-1) */
let friendHurtThreshold = 0.2;
```

**Step 2: Add to settings object**

Before the closing `};` of `settings` (line 74), add:

```javascript
    get parkSeekChance() { return parkSeekChance; },
    set parkSeekChance(value) { parkSeekChance = value; },
    get conversationBondGain() { return conversationBondGain; },
    set conversationBondGain(value) { conversationBondGain = value; },
    get catchBondGain() { return catchBondGain; },
    set catchBondGain(value) { catchBondGain = value; },
    get friendHurtThreshold() { return friendHurtThreshold; },
    set friendHurtThreshold(value) { friendHurtThreshold = value; },
```

**Step 3: Replace hardcoded values in behavior.js with settings references**

In `ai/behavior.js` PATROLLING park-seek: `0.12 * enemy.socialness` → `settings.parkSeekChance * enemy.socialness` (and import `settings` from `../options.js`).

In conversation end: `0.15` → `settings.conversationBondGain`.

In catch end: `0.25` → `settings.catchBondGain`.

In `witnessFriendHurt`: `0.2` → `settings.friendHurtThreshold`.

**Step 4: Full playtest**

Run: start game, observe for 2 minutes:
- NPCs enter parks ✓
- Pairs form and play catch with visible ball ✓
- Shooting near a pair breaks the game ✓
- Shooting a civilian makes their friend defend (brave) or flee (cowardly) ✓
- Killing a civilian makes their friend grieve (duration scales by closeness) ✓
- No console errors ✓

**Step 5: Commit**

```bash
git add options.js ai/behavior.js ai/witness.js
git commit -m "feat(options): tweakable params for park-catch and relationship bonds"
```
