declare const acquireVsCodeApi: () => { postMessage: (message: unknown) => void };

import { createAtmMusicController } from '../../screens/atm-music/ui/index';
import { timeScreenContent } from '../../screens/atm-time/time';
import { gameScreenContent } from '../../screens/atm-game/game';

(function () {
    const vscode = acquireVsCodeApi();

    // Mount Time and Game screens
    const atmTimeRoot = document.querySelector('#atm-time-root') as HTMLElement | null;
    const atmGameRoot = document.querySelector('#atm-game-root') as HTMLElement | null;

    if (atmTimeRoot) {
        atmTimeRoot.innerHTML = timeScreenContent;
    }
    if (atmGameRoot) {
        atmGameRoot.innerHTML = gameScreenContent;
    }

    // Initialize Music Controller (handles search, results, player internally)
    const musicController = createAtmMusicController(vscode);

    // Quick Access buttons (Music / Time / Game)
    const quickAccessButtons = Array.from(document.querySelectorAll('.qa-btn')) as HTMLButtonElement[];
    const musicQuickButton = quickAccessButtons[0] || null;

    const showGlobalScreen = (target: 'search' | 'time' | 'game') => {
        // Remove active from ALL screens
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

        // Activate the target screen
        if (target === 'search') {
            document.querySelector('#screen-search')?.classList.add('active');
        } else if (target === 'time') {
            document.querySelector('#screen-time')?.classList.add('active');
        } else if (target === 'game') {
            document.querySelector('#screen-game')?.classList.add('active');
        }

        // Update button styles
        quickAccessButtons.forEach((button) => {
            const isMusicButton = button === musicQuickButton;
            const isActive = isMusicButton ? target === 'search' : button.dataset.screen === target;
            button.classList.toggle('is-active', isActive);

            if (isActive) {
                button.setAttribute('aria-current', 'true');
            } else {
                button.removeAttribute('aria-current');
            }
        });
    };

    // Back-to-search buttons (from Time/Game screens)
    const backToSearchButtons = Array.from(document.querySelectorAll('[data-back-to="search"]')) as HTMLButtonElement[];
    backToSearchButtons.forEach((button) => {
        button.addEventListener('click', () => {
            showGlobalScreen('search');
        });
    });

    // Quick Access button clicks
    quickAccessButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.dataset.screen;

            if (target === 'time' || target === 'game') {
                showGlobalScreen(target);
            }
        });
    });

    // "Music" label click → go to player/results if a track/search is active
    const musicLabel = document.querySelector('#qa-music-label') as HTMLElement | null;
    if (musicLabel) {
        musicLabel.addEventListener('click', (e) => {
            e.stopPropagation(); // don't bubble to the outer qa-btn
            musicController.goToMusic();
        });
    }

    // Search input Enter key -> delegates to music controller
    // NOTE: MusicSearchUI already handles Enter key internally,
    // but this catches it for the main search screen too
    const searchInput = document.querySelector('#search-input') as HTMLInputElement | null;
    if (searchInput) {
        searchInput.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    musicController.search(query);
                }
            }
        });
    }
}());
