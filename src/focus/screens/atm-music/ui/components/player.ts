import { $, escapeHtml, formatDuration } from '../../../../shared/utils';
import { Track } from '../../../../shared/types';

declare const YT: any;

export class MusicPlayerUI {
    private container: HTMLElement | null = null;
    private trackInfo: HTMLElement | null = null;
    private ytPlayer: any = null;
    private deezerAudio: HTMLAudioElement | null = null;
    private progressTimer: number | null = null;
    private isPlaying = false;
    private isMuted = false;
    private isLoopEnabled = false;
    private suppressPlaybackEvents = false;
    private activeSource: 'none' | 'youtube' | 'deezer' = 'none';
    private playerReady = false;
    private pendingTrack: Track | null = null;

    constructor(
        private readonly onNext: () => void,
        private readonly onPrev: () => void,
        private readonly onBack: () => void,
        private readonly onFallback: () => void
    ) {
        this.container = $('#player-container');
        this.trackInfo = $('#player-track-info');
        this.initializeYouTube();
        this.setupBackEvents();
    }

    public isRunning(): boolean {
        return this.isPlaying;
    }

    public playTrack(track: Track, hasPrev: boolean, hasNext: boolean) {
        if (!this.container?.querySelector('.player-content')) {
            this.stopPlayback();
            this.render(track, hasPrev, hasNext);
            this.updateTrackHeader(track);
            this.setLoading(true);
            this.attemptPlay(track);
        } else {
            this.skipToTrack(track, hasPrev, hasNext);
        }
    }

    /**
     * Silently try to play a track without re-rendering the player UI.
     * Used both for initial play and for fallback skipping.
     */
    private attemptPlay(track: Track) {
        this.suppressPlaybackEvents = false;

        const qaBtn = $('#qa-play-btn');
        if (qaBtn) qaBtn.style.display = 'inline-flex';

        if (track.videoId) {
            if (!this.playerReady) {
                // Wait for the player to be ready before playing
                this.pendingTrack = track;
                return;
            }
            this.activeSource = 'youtube';
            this.ytPlayer.loadVideoById(track.videoId);
            this.ytPlayer.playVideo();
        } else if (track.preview) {
            this.activeSource = 'deezer';
            this.playDeezer(track.preview);
        } else {
            // This track can't play at all - trigger fallback
            this.onFallback();
        }
    }

    /**
     * Called by the controller when the current track fails.
     * Updates the header text but does NOT re-render the player controls.
     */
    public skipToTrack(track: Track, hasPrev: boolean, hasNext: boolean) {
        this.stopPlayback();
        this.updateTrackHeader(track);

        // Update prev/next button states
        const prevBtn = $('#prev-btn');
        const nextBtn = $('#next-btn');
        if (prevBtn) {
            prevBtn.classList.toggle('disabled', !hasPrev);
        }
        if (nextBtn) {
            nextBtn.classList.toggle('disabled', !hasNext);
        }

        // Update total time and reset progress bar
        const totalTime = $('#total-time');
        if (totalTime) {
            totalTime.textContent = formatDuration(track.duration);
        }
        const bar = $('#progress-bar') as HTMLInputElement | null;
        if (bar) bar.value = '0';
        const curTime = $('#current-time');
        if (curTime) curTime.textContent = '0:00';

        this.setLoading(true);
        this.attemptPlay(track);
    }

    private stopPlayback(suppressEvents = false) {
        this.suppressPlaybackEvents = suppressEvents;

        if (this.activeSource === 'youtube' && this.ytPlayer) {
            this.ytPlayer.stopVideo();
        }
        if (this.deezerAudio) {
            this.deezerAudio.pause();
            this.deezerAudio.src = '';
            this.deezerAudio.load();
        }
        this.isPlaying = false;
        this.activeSource = 'none';
        this.pendingTrack = null;
        this.stopProgressLoop();
        this.setLoading(false);

        const qaBtn = $('#qa-play-btn');
        if (qaBtn) qaBtn.style.display = 'none';
    }

    public pause() {
        if (this.activeSource === 'youtube' && this.ytPlayer) this.ytPlayer.pauseVideo();
        else if (this.activeSource === 'deezer' && this.deezerAudio) this.deezerAudio.pause();
    }

    public stop() {
        // Called when navigating back to Search: ignore delayed media callbacks.
        this.stopPlayback(true);
    }

    private initializeYouTube() {
        (window as any).onYouTubeIframeAPIReady = () => {
            this.ytPlayer = new YT.Player('youtube-player', {
                height: '360', width: '640', videoId: '',
                playerVars: { playsinline: 1, controls: 0, disablekb: 1 },
                events: {
                    onReady: () => { 
                        this.playerReady = true; 
                        if (this.pendingTrack) {
                            this.attemptPlay(this.pendingTrack);
                            this.pendingTrack = null;
                        }
                    },
                    onStateChange: (e: any) => this.onYTStateChange(e),
                    onError: () => {
                        if (this.suppressPlaybackEvents) {
                            return;
                        }
                        this.onFallback();
                    }
                }
            });
        };
    }

    private onYTStateChange(event: any) {
        if (this.suppressPlaybackEvents) {
            return;
        }

        if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.setLoading(false);
            this.updateIcons();
            this.startProgressLoop();
        } else if (event.data === YT.PlayerState.ENDED) {
            if (this.isLoopEnabled) { this.ytPlayer.seekTo(0, true); this.ytPlayer.playVideo(); }
            else this.onNext();
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.updateIcons();
            this.stopProgressLoop();
        }
    }

    private playDeezer(url: string) {
        if (!this.deezerAudio) {
            this.deezerAudio = new Audio();
            this.deezerAudio.crossOrigin = 'anonymous';
        } else {
            this.deezerAudio.pause();
            this.deezerAudio.removeAttribute('src');
            this.deezerAudio.load();
        }

        this.deezerAudio.src = url;

        this.deezerAudio.onplay = () => {
            if (this.suppressPlaybackEvents) {
                return;
            }
            this.isPlaying = true;
            this.setLoading(false);
            this.updateIcons();
            this.startProgressLoop();
        };

        this.deezerAudio.onpause = () => {
            if (this.suppressPlaybackEvents) {
                return;
            }
            this.isPlaying = false;
            this.updateIcons();
            this.stopProgressLoop();
        };

        this.deezerAudio.onended = () => {
            if (this.suppressPlaybackEvents) {
                return;
            }
            if (this.isLoopEnabled) {
                this.deezerAudio?.play();
            } else {
                this.onNext();
            }
        };

        this.deezerAudio.onerror = () => {
            if (this.suppressPlaybackEvents) {
                return;
            }
            this.onFallback();
        };

        // Try to auto-play immediately
        this.deezerAudio.play().catch(() => {
            // Browser blocked autoplay - user needs to click play
            this.setLoading(false);
        });
    }

    private render(track: Track, hasPrev: boolean, hasNext: boolean) {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="player-content">
                <div class="player-progress">
                    <span id="current-time">0:00</span>
                    <input type="range" id="progress-bar" class="progress-bar" min="0" max="1000" value="0">
                    <span id="total-time">${formatDuration(track.duration)}</span>
                </div>
                <div class="player-controls">
                    <button id="volume-btn" class="control-btn control-btn-sm ${this.isMuted ? 'active' : ''}" type="button" aria-pressed="${this.isMuted ? 'true' : 'false'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path id="vol-path" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                    </button>
                    <button id="prev-btn" class="control-btn ${hasPrev ? '' : 'disabled'}" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                    <button id="play-pause-btn" class="control-btn play-btn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path id="play-path" d="M8 5v14l11-7z"/></svg></button>
                    <button id="next-btn" class="control-btn ${hasNext ? '' : 'disabled'}" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
                    <button id="repeat-btn" class="control-btn control-btn-sm ${this.isLoopEnabled ? 'active' : ''}" type="button" aria-pressed="${this.isLoopEnabled ? 'true' : 'false'}">
                        ${this.getRepeatIconSvg()}
                    </button>
                </div>
            </div>`;
        this.setupControlEvents();
    }

    private getRepeatIconSvg() {
        if (this.isLoopEnabled) {
            return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 7H17V10L21 6L17 2V5H5V11H7V7Z" fill="currentColor"/><path d="M17 17H7V14L3 18L7 22V19H19V13H17V17Z" fill="currentColor"/><text x="12" y="16" font-size="10" font-weight="bold" text-anchor="middle" fill="currentColor" font-family="sans-serif">1</text></svg>';
        }

        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 7H17V10L21 6L17 2V5H5V11H7V7Z" fill="currentColor"/><path d="M17 17H7V14L3 18L7 22V19H19V13H17V17Z" fill="currentColor"/></svg>';
    }

    private refreshRepeatButton() {
        const repeatBtn = $('#repeat-btn');
        if (!repeatBtn) {
            return;
        }

        repeatBtn.classList.toggle('active', this.isLoopEnabled);
        repeatBtn.setAttribute('aria-pressed', this.isLoopEnabled ? 'true' : 'false');
        repeatBtn.innerHTML = this.getRepeatIconSvg();
    }

    private setupControlEvents() {
        $('#play-pause-btn')?.addEventListener('click', () => this.togglePlayback());
        $('#prev-btn')?.addEventListener('click', () => this.onPrev());
        $('#next-btn')?.addEventListener('click', () => this.onNext());
        $('#volume-btn')?.addEventListener('click', () => this.toggleMute());
        $('#repeat-btn')?.addEventListener('click', () => this.toggleLoop());
        $('#progress-bar')?.addEventListener('input', (e: any) => this.seek(e.target.value));
    }

    private togglePlayback() {
        if (this.isPlaying) this.pause();
        else { if (this.activeSource === 'youtube') this.ytPlayer.playVideo(); else this.deezerAudio?.play(); }
    }

    private toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.activeSource === 'youtube') this.isMuted ? this.ytPlayer.mute() : this.ytPlayer.unMute();
        else if (this.deezerAudio) this.deezerAudio.muted = this.isMuted;
        this.updateIcons();
    }

    private toggleLoop() {
        this.isLoopEnabled = !this.isLoopEnabled;
        this.refreshRepeatButton();
    }

    private seek(value: string) {
        const val = Number(value) / 1000;
        if (this.activeSource === 'youtube') this.ytPlayer.seekTo(val * this.ytPlayer.getDuration(), true);
        else if (this.deezerAudio) this.deezerAudio.currentTime = val * this.deezerAudio.duration;
    }

    private startProgressLoop() {
        this.stopProgressLoop();
        const update = () => {
            if (!this.isPlaying || this.activeSource === 'none') return;
            const cur = this.activeSource === 'deezer' ? this.deezerAudio?.currentTime : this.ytPlayer?.getCurrentTime();
            const dur = this.activeSource === 'deezer' ? this.deezerAudio?.duration : this.ytPlayer?.getDuration();
            if (cur !== undefined && dur) {
                const bar = $('#progress-bar') as HTMLInputElement | null;
                if (bar) bar.value = String((cur / dur) * 1000);
                $('#current-time')!.textContent = formatDuration(Math.floor(cur));
            }
            this.progressTimer = requestAnimationFrame(update);
        };
        this.progressTimer = requestAnimationFrame(update);
    }

    private stopProgressLoop() { if (this.progressTimer) cancelAnimationFrame(this.progressTimer); }

    private setLoading(loading: boolean) {
        const btn = $('#play-pause-btn');
        if (btn) {
            btn.classList.toggle('loading', loading);
            (btn as HTMLButtonElement).disabled = loading;
        }
    }

    private updateIcons() {
        const playIconD = this.isPlaying ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' : 'M8 5v14l11-7z';
        const playPath = $('#play-path');
        playPath?.setAttribute('d', playIconD);

        const qaPath = $('#qa-play-path');
        qaPath?.setAttribute('d', playIconD);

        const volPath = $('#vol-path');
        volPath?.setAttribute('d', this.isMuted ? 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3z' : 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
        const volumeBtn = $('#volume-btn');
        volumeBtn?.classList.toggle('active', this.isMuted);
        volumeBtn?.setAttribute('aria-pressed', this.isMuted ? 'true' : 'false');
    }

    private updateTrackHeader(track: Track) {
        if (this.trackInfo) {
            this.trackInfo.innerHTML = `<span class="header-track-artist">${escapeHtml(track.artist)}</span><span class="header-track-separator"> - </span><span class="header-track-title">${escapeHtml(track.title)}</span>`;
        }
    }

    private setupBackEvents() {
        $('#back-to-results')?.addEventListener('click', () => this.onBack());
        
        const qaBtn = $('#qa-play-btn');
        if (qaBtn) {
            qaBtn.replaceWith(qaBtn.cloneNode(true));
            $('#qa-play-btn')?.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                if (this.activeSource !== 'none' || this.pendingTrack) {
                    this.togglePlayback();
                }
            });
        }
    }
}
