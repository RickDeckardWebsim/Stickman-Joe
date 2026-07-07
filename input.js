const inputState = {
    keys: new Set(),
    justPressed: new Set(),
    mouse: {
        x: 0,
        y: 0,
        down: false,
    }
};

const canvas = document.getElementById('game-canvas');

window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'tab') {
        e.preventDefault(); // Prevent default browser focus change
    }
    if (!inputState.keys.has(key)) {
        inputState.justPressed.add(key);
    }
    inputState.keys.add(key);
});

window.addEventListener('keyup', e => {
    inputState.keys.delete(e.key.toLowerCase());
});

window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    inputState.mouse.x = e.clientX - rect.left;
    inputState.mouse.y = e.clientY - rect.top;
});

window.addEventListener('mousedown', () => {
    if (!inputState.mouse.down) {
        inputState.justPressed.add('mouse');
    }
    inputState.mouse.down = true;
});

window.addEventListener('mouseup', () => {
    inputState.mouse.down = false;
});

export function clearJustPressed() {
    inputState.justPressed.clear();
}

export default inputState;