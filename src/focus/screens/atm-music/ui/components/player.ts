import { $, escapeHtml, formatDuration } from '../../../../shared/utils';
import { Track } from '../../../../shared/types';

export class MusicPlayerUI {
    private container: HTMLElement | null = null;
    private trackInfo: HTMLElement | null = null;
    private audioPlayer: HTMLAudioElement;
    private progressTimer: number | null = null;
    private isPlaying = false;
    private isMuted = false;
    private isLoopEnabled = false;
    private suppressPlaybackEvents = false;
    private isSeeking = false;
    private isLoadingState = false;
    private pendingTrack: Track | null = null;

    constructor(
        private readonly onNext: () => void,
        private readonly onPrev: () => void,
        private readonly onBack: () => void,
        private readonly onFallback: () => void
    ) {
        this.container = $('#player-container');
        this.trackInfo = $('#player-track-info');
        this.audioPlayer = new Audio();
        this.audioPlayer.crossOrigin = 'anonymous';
        this.setupAudioEvents();
        this.setupBackEvents();
        this.setupKeyboardEvents();
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

    private parseTrackStreamUrl(track: Track): string | null {
        if (track.videoId) {
            const port = (window as any).STREAM_PORT || 0;
            if (port > 0) {
                return `http://127.0.0.1:${port}/stream?videoId=${track.videoId}`;
            }
        } else if (track.preview) {
            return track.preview;
        }
        return null;
    }

    private attemptPlay(track: Track) {
        this.suppressPlaybackEvents = false;

        const qaBtn = $('#qa-play-btn');
        if (qaBtn) qaBtn.style.display = 'inline-flex';

        const url = this.parseTrackStreamUrl(track);
        
        if (url) {
            this.audioPlayer.pause();
            this.audioPlayer.src = url;
            this.audioPlayer.load();
            
            this.audioPlayer.play().catch(e => {
                console.warn('[RENE Music] Autoplay prevented or failed:', e);
                this.setLoading(false);
            });
        } else {
            this.onFallback();
        }
    }

    public skipToTrack(track: Track, hasPrev: boolean, hasNext: boolean) {
        this.stopPlayback();
        this.updateTrackHeader(track);

        const prevBtn = $('#prev-btn');
        const nextBtn = $('#next-btn');
        if (prevBtn) prevBtn.classList.toggle('disabled', !hasPrev);
        if (nextBtn) nextBtn.classList.toggle('disabled', !hasNext);

        const totalTime = $('#total-time');
        if (totalTime) totalTime.textContent = formatDuration(track.duration);
        
        this.updateProgressVisual(0);
        
        const curTime = $('#current-time');
        if (curTime) curTime.textContent = '0:00';

        this.setLoading(true);
        this.attemptPlay(track);
    }

    private stopPlayback(suppressEvents = false) {
        this.suppressPlaybackEvents = suppressEvents;
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        this.audioPlayer.load();

        this.isPlaying = false;
        this.pendingTrack = null;
        this.stopProgressLoop();
        this.setLoading(false);

        const qaBtn = $('#qa-play-btn');
        if (qaBtn) qaBtn.style.display = 'none';
    }

    public pause() {
        this.audioPlayer.pause();
    }

    public stop() {
        this.stopPlayback(true);
    }

    private setupAudioEvents() {
        this.audioPlayer.onplay = () => {
            if (this.suppressPlaybackEvents) return;
            this.isPlaying = true;
            this.updateIcons();
            this.startProgressLoop();
        };

        this.audioPlayer.onplaying = () => {
            if (this.suppressPlaybackEvents) return;
            this.setLoading(false);
        };

        this.audioPlayer.onwaiting = () => {
            if (this.suppressPlaybackEvents) return;
            // Don't show loading spinner while user is actively seeking
            if (!this.isSeeking) {
                this.setLoading(true);
            }
        };

        this.audioPlayer.onpause = () => {
            if (this.suppressPlaybackEvents) return;
            // Don't stop playback state if the pause was caused by seeking
            if (this.isSeeking) return;
            this.isPlaying = false;
            this.updateIcons();
            this.stopProgressLoop();
        };

        // When the browser finishes seeking to the new position
        this.audioPlayer.onseeked = () => {
            if (this.suppressPlaybackEvents) return;
            this.isSeeking = false;
            this.setLoading(false);
            // Restart the progress loop to ensure UI keeps updating
            if (this.isPlaying || !this.audioPlayer.paused) {
                this.startProgressLoop();
            }
        };

        this.audioPlayer.onended = () => {
            if (this.suppressPlaybackEvents) return;
            if (this.isLoopEnabled) {
                this.audioPlayer.play();
            } else {
                this.onNext();
            }
        };

        this.audioPlayer.onerror = () => {
            if (this.suppressPlaybackEvents) return;
            console.warn('[RENE Music] Audio element error');
            this.onFallback();
        };
    }

    private render(track: Track, hasPrev: boolean, hasNext: boolean) {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="player-content">
                <div class="player-progress">
                    <span id="current-time" class="progress-time" title="Click to toggle elapsed/remaining">0:00</span>
                    <div id="progress-track" class="progress-track">
                        <div id="progress-fill" class="progress-fill"></div>
                        <div id="progress-thumb" class="progress-thumb"></div>
                    </div>
                    <span id="total-time" class="progress-time">0:00</span>
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
        if (!repeatBtn) return;
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
        
        // Toggle time display mode (elapsed vs remaining)
        $('#current-time')?.addEventListener('click', () => this.toggleTimeMode());
        $('#total-time')?.addEventListener('click', () => this.toggleTimeMode());

        this.setupProgressBarEvents();
    }

    private isRemainingMode = false;
    private toggleTimeMode() {
        this.isRemainingMode = !this.isRemainingMode;
        this.updateTimeDisplay();
    }

    private updateTimeDisplay() {
        const curEl = $('#current-time');
        const totEl = $('#total-time');
        if (!curEl || !totEl) return;

        const cur = this.audioPlayer.currentTime || 0;
        const dur = this.audioPlayer.duration || 0;

        if (this.isRemainingMode && dur > 0) {
            curEl.textContent = '-' + formatDuration(Math.max(0, Math.floor(dur - cur)));
        } else {
            curEl.textContent = formatDuration(Math.floor(cur));
        }
        
        if (dur > 0) {
            totEl.textContent = formatDuration(Math.floor(dur));
        }
    }

    /** Custom progress bar drag/click handling — never disabled by loading states */
    private setupProgressBarEvents() {
        const track = $('#progress-track');
        if (!track) return;

        const seekToPosition = (clientX: number) => {
            const rect = track.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            this.updateProgressVisual(ratio);
            this.seek(String(ratio * 1000));
        };

        // Click to seek
        track.addEventListener('mousedown', (e: MouseEvent) => {
            if (this.isLoadingState) return;
            this.isSeeking = true;
            seekToPosition(e.clientX);
            track.classList.add('is-dragging');

            const onMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
            const onUp = () => {
                this.isSeeking = false;
                track.classList.remove('is-dragging');
                if (this.audioPlayer.readyState < 3) {
                    this.setLoading(true);
                }
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // Touch support
        track.addEventListener('touchstart', (e: TouchEvent) => {
            if (this.isLoadingState) return;
            this.isSeeking = true;
            seekToPosition(e.touches[0].clientX);
            track.classList.add('is-dragging');

            const onMove = (ev: TouchEvent) => seekToPosition(ev.touches[0].clientX);
            const onEnd = () => {
                this.isSeeking = false;
                track.classList.remove('is-dragging');
                if (this.audioPlayer.readyState < 3) {
                    this.setLoading(true);
                }
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
            };
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onEnd);
        }, { passive: true });
    }

    private togglePlayback() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.setLoading(true);
            this.audioPlayer.play().catch(() => this.setLoading(false));
        }
    }

    private toggleMute() {
        this.isMuted = !this.isMuted;
        this.audioPlayer.muted = this.isMuted;
        this.updateIcons();
    }

    private toggleLoop() {
        this.isLoopEnabled = !this.isLoopEnabled;
        this.refreshRepeatButton();
    }

    private seek(value: string) {
        const val = Number(value) / 1000;

        // Prefer the real audio duration; fall back to the visible total-time label
        let dur = this.audioPlayer.duration;
        if (!isFinite(dur) || !dur || dur < 1) {
            const totalStr = $('#total-time')?.textContent || '0:00';
            const [m, s] = totalStr.split(':').map(Number);
            dur = (m * 60) + (s || 0);
        }

        if (this.audioPlayer && dur > 0) {
            this.isSeeking = true;
            this.audioPlayer.currentTime = val * dur;
            // Update the timer display immediately so it feels responsive
            const curEl = $('#current-time');
            if (curEl) curEl.textContent = formatDuration(Math.floor(val * dur));
        }
    }

    /** Update the visual fill + thumb position without touching the audio element */
    private updateProgressVisual(ratio: number) {
        const fill = $('#progress-fill');
        const thumb = $('#progress-thumb');
        const pct = Math.max(0, Math.min(100, ratio * 100));
        if (fill) fill.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
    }

    private startProgressLoop() {
        this.stopProgressLoop();
        const update = () => {
            if (!this.isPlaying && this.audioPlayer.paused) return;
            const cur = this.audioPlayer.currentTime;
            
            const totalStr = $('#total-time')?.textContent || '1:00';
            const [m, s] = totalStr.split(':').map(Number);
            const totalSecs = m * 60 + (s || 0);

            let dur = this.audioPlayer.duration;
            if (!isFinite(dur)) {
                dur = totalSecs > 0 ? totalSecs : 1; 
            }

            if (cur !== undefined && dur && !this.isSeeking) {
                const ratio = cur / dur;
                this.updateProgressVisual(ratio);
                this.updateTimeDisplay();
            }
            this.progressTimer = requestAnimationFrame(update);
        };
        this.progressTimer = requestAnimationFrame(update);
    }

    private stopProgressLoop() { if (this.progressTimer) cancelAnimationFrame(this.progressTimer); }

    private setLoading(loading: boolean) {
        this.isLoadingState = loading;
        
        const btn = $('#play-pause-btn');
        if (btn) {
            btn.classList.toggle('loading', loading);
            (btn as HTMLButtonElement).disabled = loading;
        }

        const qaBtn = $('#qa-play-btn');
        if (qaBtn) {
            qaBtn.classList.toggle('loading', loading);
            (qaBtn as HTMLButtonElement).disabled = loading;
        }

        const track = $('#progress-track');
        if (track) {
            track.classList.toggle('loading', loading);
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
                if (this.audioPlayer.src) {
                    this.togglePlayback();
                }
            });
        }
    }

    private setupKeyboardEvents() {
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                // Do not trigger if user is typing in an input or textarea
                const activeTag = document.activeElement?.tagName;
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                    return;
                }
                
                // Only trigger if we are actively viewing the player screen
                const playerScreen = document.getElementById('screen-player');
                if (playerScreen && playerScreen.classList.contains('active')) {
                    e.preventDefault(); // Prevent scrolling or clicking other focused buttons
                    this.togglePlayback();
                }
            }
        });
    }
}
