const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const soundBuffers = {};

function unlockAudioContext() {
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            // Remove listeners once the context is unlocked.
            window.removeEventListener('click', unlockAudioContext);
            window.removeEventListener('keydown', unlockAudioContext);
            window.removeEventListener('touchstart', unlockAudioContext);
        }).catch(e => console.error("AudioContext resume failed:", e));
    }
}

// Set up event listeners to unlock the audio context on the first user interaction.
if (audioContext.state === 'suspended') {
    window.addEventListener('click', unlockAudioContext);
    window.addEventListener('keydown', unlockAudioContext);
    window.addEventListener('touchstart', unlockAudioContext);
}

export async function loadSound(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        soundBuffers[name] = audioBuffer;
    } catch (error) {
        console.error(`Failed to load sound: ${name}`, error);
    }
}

export function playSound(name, options = {}) {
    if (audioContext.state === 'suspended') {
        // The audio context has not been unlocked by a user gesture yet.
        // Silently fail instead of causing a console error.
        return;
    }
    
    if (!soundBuffers[name]) {
        // Only warn for sounds that are expected to exist.
        // Avoids console spam for things like 'shotgun_pump' which doesn't have a separate file yet.
        if (['shoot', 'shotgun_shoot', 'knife_swing', 'knife_hit', 'explosion', 'reload', 'empty_click', 'heal', 'heal_fail', 'injection_cannon_shoot', 'zombie_bite'].includes(name)) {
            console.warn(`Sound not loaded: ${name}`);
        }
        return;
    }

    const source = audioContext.createBufferSource();
    source.buffer = soundBuffers[name];

    import('./options.js').then(optionsModule => {
        const { settings } = optionsModule;
        const gainNode = audioContext.createGain();
        const masterVolume = settings.masterVolume ?? 1.0;
        const sfxVolume = settings.sfxVolume ?? 1.0;
        gainNode.gain.value = (options.volume || 1.0) * sfxVolume * masterVolume;

        if (options.pitch) {
            source.playbackRate.value = options.pitch;
        }
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        source.start(0);
    }).catch(() => {
        // Fallback if options module fails to load, though it shouldn't
        const gainNode = audioContext.createGain();
        gainNode.gain.value = options.volume || 1.0;

        if (options.pitch) {
            source.playbackRate.value = options.pitch;
        }
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        source.start(0);
    });
}