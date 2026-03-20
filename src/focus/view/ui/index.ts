declare const acquireVsCodeApi: () => { postMessage: (message: unknown) => void };

import { createAtmMusicController } from '../../screens/atm-music/ui/index';

(function () {
    const vscode = acquireVsCodeApi();
    const musicController = createAtmMusicController(vscode);

    const searchInput = document.querySelector('#search-input') as HTMLInputElement | null;

    if (searchInput) {
        searchInput.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                musicController.search(searchInput.value);
            }
        });
    }
}());
