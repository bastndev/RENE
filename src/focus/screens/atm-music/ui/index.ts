declare const YT: any;

interface VSCodeApi {
    postMessage: (message: unknown) => void;
}

interface TrackResult {
    id: string;
    title: string;
    artist: string;
    album: string;
    thumbnail: string;
    duration: number;
    videoId?: string;
    preview?: string;
}

export interface AtmMusicController {
    search(query: string): void;
}

export function createAtmMusicController(vscode: VSCodeApi): AtmMusicController {
    return new AtmMusicControllerImpl(vscode);
}

class AtmMusicControllerImpl implements AtmMusicController {
    private results: TrackResult[] = [];
    private currentIndex = -1;
    private isPlaying = false;
    private isMuted = false;
    private ytPlayer: any = null;
    private playerReady = false;
    private progressTimer: number | null = null;
    private playbackIndex = -1;
    private selectedTrackIndex = -1;
    private fallbackTried = new Set<number>();
    private isPlayButtonLoading = false;
    private isLoopEnabled = false;
    private activePlayerSource: 'none' | 'youtube' | 'deezer' = 'none';
    private deezerAudio: HTMLAudioElement | null = null;
    private eventController: AbortController | null = null;

    private readonly vscode: VSCodeApi;

    constructor(vscode: VSCodeApi) {
        this.vscode = vscode;
        this.mountScreens();
        this.initializeYouTubePlayer();
        this.bindWebviewMessages();
        this.bindResultsHeaderEvents();
        this.bindBackButtons();
    }

    public search(query: string) {
        const cleanQuery = (query || '').trim();
        if (!cleanQuery) {
            return;
        }

        this.showScreen('results');
        const resultsQueryInput = this.$('#results-query-input') as HTMLInputElement | null;
        if (resultsQueryInput) {
            resultsQueryInput.value = cleanQuery;
        }

        this.showResultsSkeleton();
        this.vscode.postMessage({ type: 'search', query: cleanQuery });
    }

    private mountScreens() {
        const root = this.$('#atm-music-root');
        if (!root) {
            return;
        }

        root.innerHTML = `
            <section id="screen-results" class="screen">
                <div class="screen-header">
                    <button id="back-to-search" class="back-btn" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                        </svg>
                        Search
                    </button>
                    <div class="results-query" role="search" aria-label="Edit search query">
                        <input
                            type="search"
                            id="results-query-input"
                            class="results-query-input"
                            placeholder="Edit search..."
                            autocomplete="off"
                            spellcheck="false"
                            aria-label="Edit and search again"
                        />
                        <button id="results-query-btn" class="results-query-btn" aria-label="Search again" type="button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
                <div id="results-container" class="results-container"></div>
            </section>

            <section id="screen-player" class="screen">
                <div class="screen-header">
                    <button id="back-to-results" class="back-btn" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Back
                    </button>
                    <span id="player-track-info" class="player-track-info"></span>
                </div>
                <div id="player-container" class="player-container"></div>
            </section>
        `;
    }

    private initializeYouTubePlayer() {
        (window as any).onYouTubeIframeAPIReady = () => {
            this.ytPlayer = new YT.Player('youtube-player', {
                height: '360',
                width: '640',
                videoId: '',
                playerVars: {
                    playsinline: 1,
                    autoplay: 0,
                    controls: 0,
                    disablekb: 1,
                    fs: 0,
                    rel: 0,
                    modestbranding: 1,
                },
                events: {
                    onReady: () => {
                        this.playerReady = true;
                    },
                    onStateChange: (event: any) => this.onPlayerStateChange(event),
                    onError: () => this.handlePlaybackError(),
                },
            });
        };
    }

    private bindWebviewMessages() {
        window.addEventListener('message', (event: MessageEvent) => {
            const msg = event.data as { type?: string; results?: TrackResult[]; message?: string };
            switch (msg.type) {
                case 'searchResults':
                    this.renderResults(msg.results || []);
                    break;
                case 'error':
                    this.handleError(msg.message || 'Unknown error');
                    break;
                default:
                    break;
            }
        });
    }

    private bindResultsHeaderEvents() {
        const resultsQueryInput = this.$('#results-query-input') as HTMLInputElement | null;
        const resultsQueryBtn = this.$('#results-query-btn') as HTMLButtonElement | null;

        if (resultsQueryInput) {
            resultsQueryInput.addEventListener('keypress', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    this.search(resultsQueryInput.value);
                }
            });
        }

        if (resultsQueryBtn) {
            resultsQueryBtn.addEventListener('click', () => {
                this.search(resultsQueryInput?.value || '');
            });
        }
    }

    private bindBackButtons() {
        const backToSearch = this.$('#back-to-search') as HTMLButtonElement | null;
        if (backToSearch) {
            backToSearch.addEventListener('click', () => {
                if (this.ytPlayer) {
                    this.ytPlayer.pauseVideo();
                }
                if (this.deezerAudio) {
                    this.deezerAudio.pause();
                }
                this.isPlaying = false;
                this.activePlayerSource = 'none';
                this.showScreen('search');
            });
        }

        const backToResults = this.$('#back-to-results') as HTMLButtonElement | null;
        if (backToResults) {
            backToResults.addEventListener('click', () => {
                this.showScreen('results');
            });
        }
    }

    private showResultsSkeleton() {
        const container = this.$('#results-container');
        if (!container) {
            return;
        }

        container.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const el = document.createElement('div');
            el.className = 'result-item skeleton-item';
            el.innerHTML = `
                <div class="skeleton skeleton-thumbnail"></div>
                <div class="skeleton-info">
                    <div class="skeleton skeleton-line long"></div>
                    <div class="skeleton skeleton-line short"></div>
                </div>
            `;
            container.appendChild(el);
        }
    }

    private renderResults(items: TrackResult[]) {
        this.results = items;
        const container = this.$('#results-container');
        if (!container) {
            return;
        }

        container.innerHTML = '';

        if (!items || items.length === 0) {
            container.innerHTML = '<div class="no-results">No results found. Try a different search.</div>';
            return;
        }

        items.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'result-item';
            el.innerHTML = `
                <img class="result-thumbnail" src="${this.escapeHtml(item.thumbnail)}" alt="" loading="lazy"
                    onerror="this.style.background='rgba(128,128,128,0.15)';this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22/>'">
                <div class="result-info">
                    <div class="result-title">${this.escapeHtml(item.title)}</div>
                    <div class="result-meta">
                        ${this.escapeHtml(item.artist)}${item.album ? ` · ${this.escapeHtml(item.album)}` : ''} · ${this.formatDuration(item.duration)}
                    </div>
                </div>
            `;
            el.addEventListener('click', () => this.selectTrack(i));
            container.appendChild(el);
        });
    }

    private selectTrack(index: number) {
        this.currentIndex = index;
        this.selectedTrackIndex = index;
        this.playbackIndex = index;
        this.fallbackTried = new Set<number>();
        this.activePlayerSource = 'none';
        const track = this.results[index];
        if (!track) {
            return;
        }

        this.showScreen('player');

        if (this.deezerAudio) {
            this.deezerAudio.pause();
            this.deezerAudio = null;
        }

        const trackInfo = this.$('#player-track-info');
        if (trackInfo) {
            trackInfo.innerHTML = `
                <span class="header-track-title">${this.escapeHtml(track.title)}</span>
                <span class="header-track-separator"> - </span>
                <span class="header-track-artist">${this.escapeHtml(track.artist)}</span>
            `;
        }

        this.renderPlayerUI(track);
        this.setPlayButtonLoading(true);
        if (!this.attemptPlaybackAtIndex(index)) {
            this.showPlayerError('No playable track available in this list');
        }
    }

    private renderPlayerUI(track: TrackResult) {
        const container = this.$('#player-container');
        if (!container) {
            return;
        }

        const hasPrev = this.currentIndex > 0;
        const hasNext = this.currentIndex < this.results.length - 1;

        container.innerHTML = `
            <div class="player-content">
                <div class="player-progress">
                    <span id="current-time">0:00</span>
                    <input type="range" id="progress-bar" class="progress-bar" min="0" max="1000" value="0" step="1">
                    <span id="total-time">${this.formatDuration(track.duration)}</span>
                </div>
                <div class="player-controls">
                    <button id="volume-btn" class="control-btn control-btn-sm" aria-label="Volume" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path id="vol-path" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                    </button>
                    <button id="prev-btn" class="control-btn${hasPrev ? '' : ' disabled'}" aria-label="Previous" type="button">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                        </svg>
                    </button>
                    <button id="play-pause-btn" class="control-btn play-btn" aria-label="Play" type="button">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path id="play-path" d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                    <button id="next-btn" class="control-btn${hasNext ? '' : ' disabled'}" aria-label="Next" type="button">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                        </svg>
                    </button>
                    <button id="repeat-btn" class="control-btn control-btn-sm${this.isLoopEnabled ? ' active' : ''}" aria-label="Repeat" type="button">
                        ${this.getRepeatIconSvg(this.isLoopEnabled)}
                    </button>
                </div>
            </div>
        `;

        this.setupPlayerEvents();
    }

    private attemptPlaybackAtIndex(index: number): boolean {
        const track = this.results[index];
        if (!track) {
            return false;
        }

        this.playbackIndex = index;
        this.fallbackTried.add(index);

        if (track.videoId && this.ytPlayer && this.ytPlayer.loadVideoById) {
            this.activePlayerSource = 'youtube';
            this.setPlayButtonLoading(true);
            this.ytPlayer.loadVideoById(track.videoId);
            this.ytPlayer.playVideo();
            return true;
        }

        if (track.preview) {
            this.activePlayerSource = 'deezer';
            this.playDeezerPreview(track);
            return true;
        }

        return this.attemptBackgroundFallback();
    }

    private attemptBackgroundFallback(): boolean {
        if (this.results.length <= 1) {
            return false;
        }

        for (let i = this.selectedTrackIndex + 1; i < this.results.length; i++) {
            if (!this.fallbackTried.has(i) && (this.results[i].preview || this.results[i].videoId)) {
                return this.attemptPlaybackAtIndex(i);
            }
        }

        for (let i = 0; i < this.selectedTrackIndex; i++) {
            if (!this.fallbackTried.has(i) && (this.results[i].preview || this.results[i].videoId)) {
                return this.attemptPlaybackAtIndex(i);
            }
        }

        return false;
    }

    private playDeezerPreview(track: TrackResult) {
        if (!track.preview) {
            this.showPlayerError('No preview available for this track');
            return;
        }

        this.setPlayButtonLoading(true);
        this.activePlayerSource = 'deezer';

        if (this.deezerAudio) {
            this.deezerAudio.pause();
            this.deezerAudio = null;
        }

        const cur = this.$('#current-time');
        const bar = this.$('#progress-bar') as HTMLInputElement | null;
        const total = this.$('#total-time');
        if (cur) {
            cur.textContent = '0:00';
        }
        if (bar) {
            bar.value = '0';
        }
        if (total) {
            total.textContent = '0:30';
        }

        this.deezerAudio = new Audio(track.preview);
        this.deezerAudio.crossOrigin = 'anonymous';

        this.deezerAudio.onplay = () => {
            this.setPlayButtonLoading(false);
            this.isPlaying = true;
            this.updatePlayPauseIcon();
            this.startProgressLoop();
        };

        this.deezerAudio.onpause = () => {
            this.isPlaying = false;
            this.updatePlayPauseIcon();
            this.stopProgressLoop();
        };

        this.deezerAudio.onended = () => {
            this.isPlaying = false;
            this.updatePlayPauseIcon();
            this.stopProgressLoop();
            if (this.isLoopEnabled && this.deezerAudio) {
                this.deezerAudio.currentTime = 0;
                this.deezerAudio.play();
                return;
            }
            if (this.currentIndex < this.results.length - 1) {
                this.selectTrack(this.currentIndex + 1);
            }
        };

        this.deezerAudio.muted = this.isMuted;
        this.deezerAudio.play();
    }

    private onPlayerStateChange(event: any) {
        if (this.activePlayerSource !== 'youtube') {
            return;
        }

        if (event.data === YT.PlayerState.PLAYING) {
            this.setPlayButtonLoading(false);
            this.isPlaying = true;
            this.updatePlayPauseIcon();
            this.startProgressLoop();
        } else if (event.data === YT.PlayerState.BUFFERING) {
            this.setPlayButtonLoading(true);
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.setPlayButtonLoading(false);
            this.isPlaying = false;
            this.updatePlayPauseIcon();
            this.stopProgressLoop();
        } else if (event.data === YT.PlayerState.ENDED) {
            this.setPlayButtonLoading(false);
            this.isPlaying = false;
            this.updatePlayPauseIcon();
            this.stopProgressLoop();
            if (this.isLoopEnabled && this.ytPlayer && this.ytPlayer.seekTo) {
                this.ytPlayer.seekTo(0, true);
                this.ytPlayer.playVideo();
                return;
            }
            if (this.currentIndex < this.results.length - 1) {
                this.selectTrack(this.currentIndex + 1);
            }
        }
    }

    private handlePlaybackError() {
        const currentTrack = this.results[this.playbackIndex];

        if (currentTrack && currentTrack.preview) {
            this.playDeezerPreview(currentTrack);
            return;
        }

        if (this.attemptBackgroundFallback()) {
            return;
        }

        this.showPlayerError('This track cannot be played due to region/copyright restrictions.');
    }

    private startProgressLoop() {
        this.stopProgressLoop();

        const update = () => {
            if (this.activePlayerSource === 'deezer' && this.deezerAudio && this.deezerAudio.duration) {
                this.updateProgressBar(this.deezerAudio.currentTime, this.deezerAudio.duration);
            } else if (this.activePlayerSource === 'youtube' && this.ytPlayer && this.ytPlayer.getCurrentTime) {
                this.updateProgressBar(this.ytPlayer.getCurrentTime(), this.ytPlayer.getDuration());
            }
            this.progressTimer = requestAnimationFrame(update);
        };

        this.progressTimer = requestAnimationFrame(update);
    }

    private stopProgressLoop() {
        if (this.progressTimer) {
            cancelAnimationFrame(this.progressTimer);
            this.progressTimer = null;
        }
    }

    private updateProgressBar(current: number, total: number) {
        const bar = this.$('#progress-bar') as HTMLInputElement | null;
        const cur = this.$('#current-time');
        const tot = this.$('#total-time');

        if (bar && total > 0) {
            bar.value = String((current / total) * 1000);
        }

        if (cur) {
            cur.textContent = this.formatDuration(Math.floor(current));
        }

        if (tot && total > 0) {
            tot.textContent = this.formatDuration(Math.floor(total));
        }
    }

    private setupPlayerEvents() {
        if (this.eventController) {
            this.eventController.abort();
        }
        this.eventController = new AbortController();
        const { signal } = this.eventController;

        const playPauseBtn = this.$('#play-pause-btn') as HTMLButtonElement | null;
        const prevBtn = this.$('#prev-btn') as HTMLButtonElement | null;
        const nextBtn = this.$('#next-btn') as HTMLButtonElement | null;
        const progressBar = this.$('#progress-bar') as HTMLInputElement | null;
        const volumeBtn = this.$('#volume-btn') as HTMLButtonElement | null;
        const repeatBtn = this.$('#repeat-btn') as HTMLButtonElement | null;

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                if (this.isPlayButtonLoading) {
                    return;
                }

                if (this.activePlayerSource === 'youtube') {
                    if (!this.ytPlayer || !this.playerReady) {
                        return;
                    }
                    if (this.isPlaying) {
                        this.ytPlayer.pauseVideo();
                    } else {
                        this.ytPlayer.playVideo();
                    }
                } else if (this.activePlayerSource === 'deezer' && this.deezerAudio) {
                    if (this.isPlaying) {
                        this.deezerAudio.pause();
                    } else {
                        this.deezerAudio.play();
                    }
                }
            }, { signal });
        }

        if (prevBtn && !prevBtn.classList.contains('disabled')) {
            prevBtn.addEventListener('click', () => {
                if (this.currentIndex > 0) {
                    this.selectTrack(this.currentIndex - 1);
                }
            }, { signal });
        }

        if (nextBtn && !nextBtn.classList.contains('disabled')) {
            nextBtn.addEventListener('click', () => {
                if (this.currentIndex < this.results.length - 1) {
                    this.selectTrack(this.currentIndex + 1);
                }
            }, { signal });
        }

        if (progressBar) {
            progressBar.addEventListener('input', (e: Event) => {
                const target = e.target as HTMLInputElement;
                const val = Number(target.value) / 1000;
                if (this.activePlayerSource === 'youtube' && this.ytPlayer && this.ytPlayer.seekTo) {
                    this.ytPlayer.seekTo(val * this.ytPlayer.getDuration(), true);
                } else if (this.activePlayerSource === 'deezer' && this.deezerAudio) {
                    this.deezerAudio.currentTime = val * this.deezerAudio.duration;
                }
            }, { signal });
        }

        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => {
                this.isMuted = !this.isMuted;
                if (this.activePlayerSource === 'youtube' && this.ytPlayer) {
                    if (this.isMuted) {
                        this.ytPlayer.mute();
                    } else {
                        this.ytPlayer.unMute();
                    }
                } else if (this.activePlayerSource === 'deezer' && this.deezerAudio) {
                    this.deezerAudio.muted = this.isMuted;
                }
                this.updateVolumeIcon();
            }, { signal });
        }

        if (repeatBtn) {
            repeatBtn.addEventListener('click', () => {
                this.isLoopEnabled = !this.isLoopEnabled;
                repeatBtn.classList.toggle('active', this.isLoopEnabled);
                repeatBtn.style.opacity = this.isLoopEnabled ? '1' : '';
                repeatBtn.innerHTML = this.getRepeatIconSvg(this.isLoopEnabled);
            }, { signal });
            repeatBtn.style.opacity = this.isLoopEnabled ? '1' : '';
        }
    }

    private setPlayButtonLoading(loading: boolean) {
        this.isPlayButtonLoading = loading;
        const btn = this.$('#play-pause-btn') as HTMLButtonElement | null;
        const icon = document.querySelector('#play-path') as SVGPathElement | null;
        if (!btn) {
            return;
        }

        btn.classList.toggle('loading', loading);
        btn.setAttribute('aria-busy', loading ? 'true' : 'false');
        btn.disabled = loading;

        if (icon) {
            icon.style.opacity = loading ? '0' : '1';
        }
    }

    private updatePlayPauseIcon() {
        const playPath = this.$('#play-path') as SVGPathElement | null;
        if (!playPath) {
            return;
        }

        playPath.setAttribute('d', this.isPlaying ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' : 'M8 5v14l11-7z');

        const btn = this.$('#play-pause-btn');
        if (btn) {
            btn.setAttribute('aria-label', this.isPlaying ? 'Pause' : 'Play');
        }
    }

    private updateVolumeIcon() {
        const volPath = this.$('#vol-path') as SVGPathElement | null;
        if (!volPath) {
            return;
        }

        if (this.isMuted) {
            volPath.setAttribute('d', 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z');
        } else {
            volPath.setAttribute('d', 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
        }
    }

    private getRepeatIconSvg(selected: boolean): string {
        if (selected) {
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 7H17V10L21 6L17 2V5H5V11H7V7Z" fill="currentColor"/>
                <path d="M17 17H7V14L3 18L7 22V19H19V13H17V17Z" fill="currentColor"/>
                <text x="12" y="16" font-size="10" font-weight="bold" text-anchor="middle" fill="currentColor" font-family="sans-serif">1</text>
            </svg>`;
        }

        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 7H17V10L21 6L17 2V5H5V11H7V7Z" fill="currentColor"/>
            <path d="M17 17H7V14L3 18L7 22V19H19V13H17V17Z" fill="currentColor"/>
        </svg>`;
    }

    private handleError(message: string) {
        const resultsContainer = this.$('#results-container');
        const playerContainer = this.$('#player-container');
        const errHtml = `<div class="error-msg">${this.escapeHtml(message)}</div>`;

        const resultsScreen = this.$('#screen-results');
        const playerScreen = this.$('#screen-player');

        if (resultsContainer && resultsScreen && resultsScreen.classList.contains('active')) {
            resultsContainer.innerHTML = errHtml;
        } else if (playerContainer && playerScreen && playerScreen.classList.contains('active')) {
            playerContainer.innerHTML = errHtml;
        }
    }

    private showPlayerError(message: string) {
        const container = this.$('#player-container');
        if (container) {
            container.innerHTML = `<div class="error-msg">${this.escapeHtml(message)}</div>`;
        }
        this.setPlayButtonLoading(false);
        this.isPlaying = false;
    }

    private showScreen(name: 'search' | 'results' | 'player') {
        this.$$('.screen').forEach((screen) => screen.classList.remove('active'));
        const active = this.$(`#screen-${name}`);
        if (active) {
            active.classList.add('active');
        }
    }

    private formatDuration(sec: number): string {
        if (!sec || sec < 0) {
            return '0:00';
        }
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    private escapeHtml(text: string): string {
        const d = document.createElement('div');
        d.textContent = text || '';
        return d.innerHTML;
    }

    private $(selector: string): HTMLElement | null {
        return document.querySelector(selector);
    }

    private $$(selector: string): NodeListOf<HTMLElement> {
        return document.querySelectorAll(selector);
    }
}
