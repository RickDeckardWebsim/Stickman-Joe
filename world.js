export const shells = [];
export const projectiles = [];
export const particles = [];
export const enemies = [];
export const corpses = [];
export const settledCorpses = []; // To store ragdolls that can be reactivated
export const pickups = [];
export const grenades = [];
export const deadDrops = []; // New array for dead drops
export const throwables = []; // New array for procedural throwables

export const world = {
    width: 0,
    height: 0,
    wallThickness: 20,
    city: null, // Will hold city data like buildings, sidewalks etc.
    playerHasBeenAggressive: false, // Track if player has shot anyone
    wantedLevel: 0, // 0-5 wanted level system
    zombieWantedLevel: 0, // Separate wanted level for zombie threat
    player: null,
    lastWantedLevelIncrease: 0,
    lastZombieWantedLevelIncrease: 0, // New tracker for zombie wanted level decay
    bloodDecalManager: null, // Reference to blood decal manager
};

export const camera = {
    x: 0,
    y: 0,
    lerp: 0.1, // Controls how smoothly the camera follows the player
};