# Stickman Joe

Stickman Joe is a browser-based top down shooter written entirely in JavaScript. It uses the HTML canvas for rendering and relies on ES modules for its structure. There is no build step – simply serve the files with any static HTTP server and open `index.html` in a modern browser.

## Running

Because the modules must be loaded via HTTP, run a simple server from the project folder and open the page in your browser:

```bash
python3 -m http.server
```

Navigate to `http://localhost:8000/` and the start menu will appear.

## Gameplay Overview

When the page loads you are presented with a start menu that allows you to play, change options or view the info screen. The markup for this menu can be seen in `index.html`:

```html
<div id="start-menu">
    <h1>Stickman Joe</h1>
    <div id="menu-buttons">
        <button id="play-button">Play</button>
        <button id="options-button">Options</button>
        <button id="info-button">Info</button>
        <button id="cheats-button">Cheats</button>
    </div>
</div>
```

The options panel exposes many tweakable variables such as volume and spawn rates. These defaults are declared at the top of `options.js`:

```javascript
/* @tweakable Master volume level (0-1) */
let masterVolume = 1.0;
/* @tweakable Sound effects volume level (0-1) */
let sfxVolume = 1.0;
/* @tweakable Maximum number of active particles */
let particleLimit = 300;
/* @tweakable How quickly blood decals fade (higher is faster) */
let bloodDecalFadeRate = 0.002;
```

### City and World

`city.js` procedurally generates the environment with roads, sidewalks, parks and buildings. Navigation nodes are created for basic pathfinding. Global arrays storing entities reside in `world.js`:

```javascript
export const shells = [];
export const projectiles = [];
export const particles = [];
export const enemies = [];
export const corpses = [];
export const settledCorpses = [];
export const pickups = [];
export const grenades = [];
export const deadDrops = [];
export const throwables = [];

export const world = {
    width: 0,
    height: 0,
    wallThickness: 20,
    city: null,
    playerHasBeenAggressive: false,
    wantedLevel: 0,
    zombieWantedLevel: 0,
    player: null,
    lastWantedLevelIncrease: 0,
    lastZombieWantedLevelIncrease: 0,
    bloodDecalManager: null,
};
```

### Player and Inventory

`player.js` manages the character's movement, health, limb damage and inventory. At start the constructor equips several weapons and a wallet:

```javascript
this.inventory[0] = new Rifle(this);
this.inventory[1] = new Pistol(this);
this.inventory[2] = new Shotgun(this);
this.inventory[3] = new Knife(this);
this.inventory[4] = new InjectionCannon(this);
this.inventory[5] = new Medkit(this);
this.inventory[6] = new LMG(this);
this.inventory[23] = new MoneyWallet();
this.inventory[23].amount = 500;
```

Open the inventory with **Tab** to equip items or use medkits. Items can also be stored in your safehouse where they persist using `localStorage`.

### Combat and Wanted Level

Weapons extend the base `Weapon` class and create projectiles defined in `projectile.js`. Enemies react to gunfire, bleed and can have limbs severed. A dynamic wanted level summons cops, SWAT and even military units. Zombies have their own separate wanted meter.

### Character Animation

Both the player and NPCs maintain a `walkCycle` value that advances while moving, causing the legs to swing. During the update step the player records the direction of travel and updates the cycle:

```javascript
this.isMoving = true;
this.movementAngle = Math.atan2(dy, dx);
const speedRatio = currentSpeed / this.speed;
this.walkCycle += 0.25 * speedRatio;
```

`drawLegs` then rotates the legs toward `movementAngle` and offsets each foot using `Math.sin(walkCycle)` which produces the running motion:

```javascript
ctx.rotate(this.movementAngle);
const legOffset = Math.sin(this.walkCycle) * strideLength;
```

Enemies follow the same pattern with a smaller stride and an optional body bob. When idle, `walkCycle` stops advancing so the legs stay still.

Facing direction is updated each frame. The player faces the mouse pointer:

```javascript
this.angle = Math.atan2(mouseWorldPos.y - this.y, mouseWorldPos.x - this.x);
```

Enemies compute a target angle based on their current state and smoothly turn toward it:

```javascript
this.facingAngle = lerpAngle(this.facingAngle, targetAngle, 0.08 + this.aggressiveness * 0.04);
this.angle = this.facingAngle;
```

Finally the `drawArms` routine places the hands on a weapon using grip point offsets. During reloads or shotgun pumping the front hand animates along a curve before snapping back:

```javascript
frontHandPos.x -= pumpDist * animPath;
ctx.arc(gunX + frontHandPos.x, gunY + frontHandPos.y, handRadius, 0, Math.PI * 2);
```

### Blood System

When a character is wounded, `createBloodSplatter` spawns many `BloodParticle`
instances. Each particle type – droplet, spatter, stream or mist – chooses a
different size and speed and simulates flight until colliding with the ground.
On impact `_handleSurfaceImpact` may generate extra splatter droplets or allow
the main droplet to smear across the floor.

Particles leave a short trail recorded in a circular buffer. Once a droplet
comes to rest or its smear timer expires it is flagged for stamping onto the
dedicated blood decal canvas. The `BloodDecalManager` owns this canvas and
provides helpers like `stampDot` and `stampTrail`:

```javascript
class BloodDecalManager {
    constructor() {
        this.fadeRate = settings.bloodDecalFadeRate;
        this.gridSize = 20;
        this.bloodGrid = null;
    }
```

Decals fade over time during `update()` which subtracts `fadeRate` from grid
cells. You can tweak both the fade rate and blood color from the options menu.
For performance a maximum of 150 active blood particles are allowed before older
ones are culled.

### Persistent Mess

Blood splatter is only part of the grime. Every ejected shell, discarded magazine
or fallen corpse sticks around. When these objects settle they are drawn exactly
once to an offscreen `worldDecalCanvas` so they no longer require per-frame
updates. Below is the portion of the main loop that moves settled shells and
corpses onto that canvas:

```javascript
// Update shells, stamping settled ones to the decal canvas
for (let i = shells.length - 1; i >= 0; i--) {
    const shell = shells[i];
    if (!shell) {
        shells.splice(i, 1);
        continue;
    }
    const justSettled = shell.update();

    if (justSettled) {
        shell.draw(worldDecalCtx);
        shells.splice(i, 1);
    }
}

// Update corpses and move them to settledCorpses when they stop
for (let i = corpses.length - 1; i >= 0; i--) {
    const corpse = corpses[i];
    if (!corpse) {
        corpses.splice(i, 1);
        continue;
    }
    const justSettled = corpse.update();

    if (justSettled) {
        corpse.draw(worldDecalCtx);
        settledCorpses.push(corpse);
        corpses.splice(i, 1);
    }
}
```

Ragdolls stored in `settledCorpses` can still be reactivated. Explosions search
both arrays and, if a corpse was settled, remove it from `settledCorpses` so it
can tumble again:

```javascript
// Ensure the corpse is reactivated if it was settled
if (!corpse.active) {
    corpse.active = true;
    const index = settledCorpses.indexOf(corpse);
    if(index > -1) {
        settledCorpses.splice(index, 1);
        corpses.push(corpse);
    }
}
```

The `worldDecalCanvas` is drawn each frame between the blood decals and the
active objects, ensuring debris and bodies never disappear while keeping the
simulation lightweight.

Finally the global `world` object stores the decal manager for easy access:

```javascript
export const world = {
    /* ... */
    bloodDecalManager: null,
};
```

### Info Screen

The info panel accessible from the start menu explains game mechanics and loot such as "dead drops":

```html
<li><strong>Dead Drops:</strong> These valuable caches are scattered around the city. They come in different colors, indicating the type of loot inside:
    <ul>
        <li><strong>Green:</strong> Ammo</li>
        <li><strong>White:</strong> Medical Supplies</li>
        <li><strong>Purple:</strong> Weapon Attachments</li>
        <li><strong>Silver:</strong> Weapons</li>
        <li><strong>Gold:</strong> Rare & Experimental Gear</li>
    </ul>
</li>
```

## Controls

- **WASD** – move (hold **Shift** to sprint)
- **Mouse** – aim
- **Left Click** – fire or swing weapon
- **R** – reload
- **E** – interact/pick up
- **Tab** – toggle inventory and status

## Development Notes

All source files are plain ES modules located at the repository root. No build tools are necessary. The game was designed to encourage modification, which is echoed in the developer note from `start-menu.js`:

```javascript
const devNoteContent = "This project is a passion project and due to its scale, updates can be slow. You are highly encouraged to remix, modify, and expand upon this game as you see fit! Feel free to turn it into something completely new. The original creator loves to play and comment on remixes, so get creative!";
```

Enjoy exploring the chaotic world of Stickman Joe and feel free to build upon it.
