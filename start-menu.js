/* @tweakable Styling for the info panel. Affects colors of title, text, and background. */
const infoPanelStyles = {
    titleGlowColor: '#ffff00',
    contentBackgroundColor: 'rgba(20, 20, 20, 0.8)',
    headingColor: '#ffff00',
    strongTextColor: '#ffffaa'
};

/* @tweakable The title for the developer note section in the info panel. */
const devNoteTitle = "A Note from the Developer";

/* @tweakable The content for the developer note section in the info panel. */
const devNoteContent = "This project is a passion project and due to its scale, updates can be slow. You are highly encouraged to remix, modify, and expand upon this game as you see fit! Feel free to turn it into something completely new. The original creator loves to play and comment on remixes, so get creative!";

export function initStartMenu(startGameCallback) {
    document.documentElement.style.setProperty('--info-glow-color', infoPanelStyles.titleGlowColor);
    document.documentElement.style.setProperty('--info-content-bg-color', infoPanelStyles.contentBackgroundColor);
    document.documentElement.style.setProperty('--info-h2-color', infoPanelStyles.headingColor);
    document.documentElement.style.setProperty('--info-strong-color', infoPanelStyles.strongTextColor);

    const devNoteContainer = document.getElementById('developer-note-container');
    if (devNoteContainer) {
        devNoteContainer.innerHTML = `
            <h3>${devNoteTitle}</h3>
            <p>${devNoteContent}</p>
        `;
    }

    const startMenu = document.getElementById('start-menu');
    const playButton = document.getElementById('play-button');
    const optionsButton = document.getElementById('options-button');
    const cheatsButton = document.getElementById('cheats-button');
    const infoButton = document.getElementById('info-button');
    const optionsMenu = document.getElementById('options-menu');
    const infoMenu = document.getElementById('info-menu');
    const backButton = document.getElementById('back-button');
    const infoBackButton = document.getElementById('info-back-button');

    if (!startMenu || !playButton || !optionsButton || !cheatsButton || !infoButton || !optionsMenu || !infoMenu || !backButton || !infoBackButton) {
        console.error("Start menu, options menu or info menu elements not found!");
        // If the menu isn't there, just start the game.
        startGameCallback();
        return;
    }

    playButton.addEventListener('click', () => {
        /* @tweakable The duration of the start menu fade-out animation in milliseconds. */
        const fadeOutDuration = 500;
        
        startMenu.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        startMenu.style.opacity = '0';

        setTimeout(() => {
            startMenu.style.display = 'none';

            // Show the game UI
            const uiContainer = document.getElementById('ui-container');
            const healthBarContainer = document.getElementById('health-bar-container');
            const wantedLevelContainer = document.getElementById('wanted-level-container');

            if (uiContainer) uiContainer.style.display = 'flex';
            if (healthBarContainer) healthBarContainer.style.display = 'block';
            if (wantedLevelContainer) wantedLevelContainer.style.display = 'flex';

            // Use another timeout to allow the display property to be applied before changing opacity
            setTimeout(() => {
                if (uiContainer) uiContainer.style.opacity = '1';
                if (healthBarContainer) healthBarContainer.style.opacity = '1';
                if (wantedLevelContainer) wantedLevelContainer.style.opacity = '1';
            }, 20); // a small delay is enough

            startGameCallback();
        }, fadeOutDuration);
    });

    optionsButton.addEventListener('click', () => {
        startMenu.style.display = 'none';
        optionsMenu.style.display = 'flex';
    });

    infoButton.addEventListener('click', () => {
        startMenu.style.display = 'none';
        infoMenu.style.display = 'flex';
    });

    backButton.addEventListener('click', () => {
        optionsMenu.style.display = 'none';
        startMenu.style.display = 'flex';
    });

    infoBackButton.addEventListener('click', () => {
        infoMenu.style.display = 'none';
        startMenu.style.display = 'flex';
    });

    cheatsButton.addEventListener('click', () => {
        // Placeholder for cheats menu functionality
        alert("Cheats menu is not yet implemented.");
        console.log("Cheats button clicked.");
    });
}