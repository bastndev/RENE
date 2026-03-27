import { WebviewMessage, Track } from '../../../shared/types';
import { MusicSearchUI } from './components/search';
import { MusicResultsUI } from './components/results';
import { MusicPlayerUI } from './components/player';
import { $, escapeHtml } from '../../../shared/utils';

export interface VSCodeApi {
    postMessage: (message: WebviewMessage) => void;
}

export class AtmMusicController {
    private searchUI: MusicSearchUI;
    private resultsUI: MusicResultsUI;
    private playerUI: MusicPlayerUI;
    
    private tracks: Track[] = [];
    private currentIndex = -1;
    private hasCachedSearch = false;
    private musicLabelEl: HTMLElement | null = null;

    constructor(private readonly vscode: VSCodeApi) {
        this.musicLabelEl = $('#qa-music-label');
        this.mountBaseHtml();
        
        this.searchUI = new MusicSearchUI(
            (q) => this.performSearch(q),
            () => this.showScreen('results')
        );

        this.resultsUI = new MusicResultsUI(
            (i) => this.selectTrack(i),
            (q) => this.performSearch(q),
            () => this.backToSearch(),
            () => this.showScreen('player')
        );

        this.playerUI = new MusicPlayerUI(
            () => this.playNext(),
            () => this.playPrev(),
            () => this.showScreen('results'),
            () => this.handlePlaybackFallback()
        );

        this.bindGlobalMessages();
        this.updateMusicLabelState();
    }

    private mountBaseHtml() {
        const root = $('#atm-music-root');
        if (!root) {return;}
        root.innerHTML = `
            <section id="screen-results" class="screen">
                <div class="screen-header">
                    <button id="back-to-search" class="back-btn" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>Search</button>
                    <div class="results-query">
                        <input type="search" id="results-query-input" class="results-query-input" placeholder="Edit search..." autocomplete="off">
                        <button id="results-query-btn" class="results-query-btn" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></button>
                    </div>
                </div>
                <div id="results-container" class="results-container"></div>
            </section>
            <section id="screen-player" class="screen">
                <div class="screen-header">
                    <button id="back-to-results" class="back-btn" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>Back</button>
                    <span id="player-track-info" class="player-track-info"></span>
                </div>
                <div id="player-container" class="player-container"></div>
            </section>
            <div id="music-error-container"></div>
        `;
    }

    private bindGlobalMessages() {
        window.addEventListener('message', (event: MessageEvent) => {
            const msg = event.data as WebviewMessage;
            if (msg.type === 'config' && msg.streamPort) {
                window.STREAM_PORT = msg.streamPort;
            } else if (msg.type === 'searchResults') {
                this.tracks = msg.results || [];
                this.hasCachedSearch = true;
                this.resultsUI.render(this.tracks);
                this.searchUI.setCanForward(true);
                this.updateMusicLabelState();
            } else if (msg.type === 'error') {
                this.showError(msg.message || 'Unknown error');
            }
        });

        // Notify Extension to start the background audio stream server
        this.vscode.postMessage({ type: 'ready' } as WebviewMessage);
    }

    private performSearch(query: string) {
        this.tracks = [];
        this.hasCachedSearch = false;
        this.clearError();
        this.searchUI.setCanForward(false);
        this.resultsUI.setQuery(query);
        this.resultsUI.showSkeleton();
        this.showScreen('results');
        this.updateMusicLabelState();
        this.vscode.postMessage({ type: 'search', query });
    }

    private selectTrack(index: number) {
        this.currentIndex = index;
        const track = this.tracks[index];
        if (track) {
            this.showScreen('player');
            this.playerUI.playTrack(track, index > 0, index < this.tracks.length - 1);
            this.updateMusicLabelState();
        }
    }

    private playNext(silent = false) {
        if (this.currentIndex < this.tracks.length - 1) {
            this.currentIndex++;
            const track = this.tracks[this.currentIndex];
            if (track) {
                if (silent) {
                    // Silent skip: don't re-render the player, just update header and try to play
                    this.playerUI.skipToTrack(
                        track,
                        this.currentIndex > 0,
                        this.currentIndex < this.tracks.length - 1
                    );
                } else {
                    this.selectTrack(this.currentIndex);
                }
            }
        }
    }

    private playPrev() {
        if (this.currentIndex > 0) {this.selectTrack(this.currentIndex - 1);}
    }

    private backToSearch() {
        // Keep current playback alive while browsing back to Search.
        this.showScreen('search');
        this.searchUI.setCanForward(this.hasCachedSearch);
    }

    private showScreen(name: 'search' | 'results' | 'player') {
        // Only manage music-related screens - don't touch time/game
        const musicScreenIds = ['screen-search', 'screen-results', 'screen-player'];
        musicScreenIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.toggle('active', id === `screen-${name}`);
            }
        });

        // Tell results list if there's an active track we can return to
        if (name === 'results') {
            this.resultsUI.setCanForward(this.currentIndex > -1);
        }
    }

    private handlePlaybackFallback() {
        // Silent skip: try the next track without re-rendering
        if (this.currentIndex < this.tracks.length - 1) {
            this.playNext(true);  // silent = true
        } else {
            this.showError('No playable tracks found.');
        }
    }

    private showError(message: string) {
        const container = $('#music-error-container');
        if (container) {
            container.innerHTML = `<div class="error-msg">${escapeHtml(message)}</div>`;
            setTimeout(() => this.clearError(), 5000);
        }
    }

    private clearError() {
        const container = $('#music-error-container');
        if (container) {
            container.innerHTML = '';
        }
    }

    // Public API for external integration
    public search(query: string) { this.searchUI.setQuery(query); this.performSearch(query); }

    /** Navigate to player (if a track is loaded) or results (if a search was made). */
    public goToMusic() {
        if (this.currentIndex > -1) {
            this.showScreen('player');
        } else if (this.hasCachedSearch) {
            this.showScreen('results');
        }
        // else: already on search screen, nothing to do
    }

    private updateMusicLabelState() {
        if (!this.musicLabelEl) {return;}
        const canGo = (this.currentIndex > -1 || this.hasCachedSearch);
        this.musicLabelEl.classList.toggle('is-linkable', canGo);
    }
}
