/* @tweakable Master volume level (0-1) */
let masterVolume = 1.0;
/* @tweakable Sound effects volume level (0-1) */
let sfxVolume = 1.0;
/* @tweakable Maximum number of active particles */
let particleLimit = 300;
/* @tweakable How quickly blood decals fade (higher is faster) */
let bloodDecalFadeRate = 0.002;
/* @tweakable The default color of blood. */
let bloodColor = '#a01010';
/* @tweakable Maximum number of civilians in the world */
let maxCivilians = 50;
/* @tweakable Time in milliseconds between civilian spawns */
let civilianSpawnInterval = 2000;
/* @tweakable Array defining number of regular cops for each wanted level (0-5) */
let copsPerWantedLevel = [0, 2, 4, 6, 4, 0];
/* @tweakable Array defining number of SWAT for each wanted level (0-5) */
let swatPerWantedLevel = [0, 0, 0, 3, 6, 8];
/* @tweakable Array defining number of Military for each wanted level (0-5) */
let militaryPerWantedLevel = [0, 0, 0, 0, 0, 5];
/* @tweakable Base chance for an enemy to drop money (0-1) */
let moneyDropChance = 0.6;
/* @tweakable Base chance for an enemy to drop their weapon (0-1) */
let weaponDropChance = 0.35;
/* @tweakable Chance for a cop to drop a medkit (0-1) */
let medkitDropChance = 0.25;
/* @tweakable Multiplier for all damage dealt by the player */
let playerDamageMultiplier = 1.0;
/* @tweakable Multiplier for all damage dealt by enemies */
let enemyDamageMultiplier = 1.0;
/* @tweakable Multiplier for the player's max health */
let playerHealthMultiplier = 1.0;
/* @tweakable Multiplier for enemies' max health */
let enemyHealthMultiplier = 1.0;

/* @tweakable The duration of the advanced options dropdown animation in seconds. */
const advancedOptionsAnimationDuration = 0.3;

export const settings = {
    get masterVolume() { return masterVolume; },
    set masterVolume(value) { masterVolume = value; },
    get sfxVolume() { return sfxVolume; },
    set sfxVolume(value) { sfxVolume = value; },
    get particleLimit() { return particleLimit; },
    set particleLimit(value) { particleLimit = value; },
    get bloodDecalFadeRate() { return bloodDecalFadeRate; },
    set bloodDecalFadeRate(value) { bloodDecalFadeRate = value; },
    get bloodColor() { return bloodColor; },
    set bloodColor(value) { bloodColor = value; },
    get maxCivilians() { return maxCivilians; },
    set maxCivilians(value) { maxCivilians = value; },
    get civilianSpawnInterval() { return civilianSpawnInterval; },
    set civilianSpawnInterval(value) { civilianSpawnInterval = value; },
    get copsPerWantedLevel() { return copsPerWantedLevel; },
    set copsPerWantedLevel(value) { copsPerWantedLevel = value; },
    get swatPerWantedLevel() { return swatPerWantedLevel; },
    set swatPerWantedLevel(value) { swatPerWantedLevel = value; },
    get militaryPerWantedLevel() { return militaryPerWantedLevel; },
    set militaryPerWantedLevel(value) { militaryPerWantedLevel = value; },
    get moneyDropChance() { return moneyDropChance; },
    set moneyDropChance(value) { moneyDropChance = value; },
    get weaponDropChance() { return weaponDropChance; },
    set weaponDropChance(value) { weaponDropChance = value; },
    get medkitDropChance() { return medkitDropChance; },
    set medkitDropChance(value) { medkitDropChance = value; },
    get playerDamageMultiplier() { return playerDamageMultiplier; },
    set playerDamageMultiplier(value) { playerDamageMultiplier = value; },
    get enemyDamageMultiplier() { return enemyDamageMultiplier; },
    set enemyDamageMultiplier(value) { enemyDamageMultiplier = value; },
    get playerHealthMultiplier() { return playerHealthMultiplier; },
    set playerHealthMultiplier(value) { playerHealthMultiplier = value; },
    get enemyHealthMultiplier() { return enemyHealthMultiplier; },
    set enemyHealthMultiplier(value) { enemyHealthMultiplier = value; },
};

function saveSettings() {
    const settingsToSave = {
        masterVolume,
        sfxVolume,
        particleLimit,
        bloodDecalFadeRate,
        bloodColor,
        maxCivilians,
        civilianSpawnInterval,
        moneyDropChance,
        weaponDropChance,
        medkitDropChance,
        playerDamageMultiplier,
        enemyDamageMultiplier,
        playerHealthMultiplier,
        enemyHealthMultiplier,
    };
    localStorage.setItem('gameSettings', JSON.stringify(settingsToSave));
}

function loadSettings() {
    const saved = localStorage.getItem('gameSettings');
    if (saved) {
        const loadedSettings = JSON.parse(saved);
        Object.keys(loadedSettings).forEach(key => {
            if (settings.hasOwnProperty(key)) {
                settings[key] = loadedSettings[key];
            }
        });
    }
}

function updateDOMFromSettings() {
    document.getElementById('master-volume').value = settings.masterVolume;
    document.getElementById('sfx-volume').value = settings.sfxVolume;
    document.getElementById('particle-limit').value = settings.particleLimit;
    document.getElementById('blood-fade-rate').value = settings.bloodDecalFadeRate;
    document.getElementById('blood-color').value = settings.bloodColor;
    document.getElementById('max-civilians').value = settings.maxCivilians;
    document.getElementById('civ-spawn-interval').value = settings.civilianSpawnInterval;
    document.getElementById('money-drop-chance').value = settings.moneyDropChance;
    document.getElementById('weapon-drop-chance').value = settings.weaponDropChance;
    document.getElementById('medkit-drop-chance').value = settings.medkitDropChance;
    document.getElementById('player-damage-mult').value = settings.playerDamageMultiplier;
    document.getElementById('enemy-damage-mult').value = settings.enemyDamageMultiplier;
    document.getElementById('player-health-mult').value = settings.playerHealthMultiplier;
    document.getElementById('enemy-health-mult').value = settings.enemyHealthMultiplier;
}

export function initOptionsMenu() {
    loadSettings();
    updateDOMFromSettings();

    document.getElementById('master-volume').addEventListener('input', (e) => {
        settings.masterVolume = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('sfx-volume').addEventListener('input', (e) => {
        settings.sfxVolume = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('particle-limit').addEventListener('input', (e) => {
        settings.particleLimit = parseInt(e.target.value, 10);
        saveSettings();
    });
    document.getElementById('blood-fade-rate').addEventListener('input', (e) => {
        settings.bloodDecalFadeRate = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('blood-color').addEventListener('input', (e) => {
        settings.bloodColor = e.target.value;
        saveSettings();
    });
    document.getElementById('max-civilians').addEventListener('input', (e) => {
        settings.maxCivilians = parseInt(e.target.value, 10);
        saveSettings();
    });
    document.getElementById('civ-spawn-interval').addEventListener('input', (e) => {
        settings.civilianSpawnInterval = parseInt(e.target.value, 10);
        saveSettings();
    });
    document.getElementById('money-drop-chance').addEventListener('input', (e) => {
        settings.moneyDropChance = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('weapon-drop-chance').addEventListener('input', (e) => {
        settings.weaponDropChance = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('medkit-drop-chance').addEventListener('input', (e) => {
        settings.medkitDropChance = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('player-damage-mult').addEventListener('input', (e) => {
        settings.playerDamageMultiplier = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('enemy-damage-mult').addEventListener('input', (e) => {
        settings.enemyDamageMultiplier = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('player-health-mult').addEventListener('input', (e) => {
        settings.playerHealthMultiplier = parseFloat(e.target.value);
        saveSettings();
    });
    document.getElementById('enemy-health-mult').addEventListener('input', (e) => {
        settings.enemyHealthMultiplier = parseFloat(e.target.value);
        saveSettings();
    });

    // Advanced options toggle
    document.getElementById('advanced-options-toggle').addEventListener('click', function() {
        const content = document.getElementById('advanced-options-content');
        const isCollapsed = !content.style.maxHeight || content.style.maxHeight === '0px';

        if (isCollapsed) {
            content.style.maxHeight = content.scrollHeight + 'px';
            this.textContent = 'Advanced Settings ▲';
        } else {
            content.style.maxHeight = '0px';
            this.textContent = 'Advanced Settings ▼';
        }
    });
}