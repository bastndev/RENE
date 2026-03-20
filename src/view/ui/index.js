(function () {
    const vscode = acquireVsCodeApi();

    // --- State ---
    let results = [];
    let currentIndex = -1;
    let isPlaying = false;
    let isMuted = false;
    let ytPlayer = null;
    let playerReady = false;
    let progressTimer = null;
    let playbackIndex = -1;
    let selectedTrackIndex = -1;
    let fallbackTried = new Set();
    let isPlayButtonLoading = false;
    let isLoopEnabled = false;
    let activePlayerSource = 'none';

    // --- DOM helpers ---
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // --- YT IFrame Player Setup ---
    window.onYouTubeIframeAPIReady = function() {
        ytPlayer = new YT.Player('youtube-player', {
            height: '360',
            width: '640',
            videoId: '',
            playerVars: {
                'playsinline': 1,
                'autoplay': 0,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'rel': 0,
                'modestbranding': 1
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
            }
        });
    };

    function onPlayerReady(event) {
        playerReady = true;
        console.log("YouTube Player is Ready");
    }

    function onPlayerStateChange(event) {
        if (activePlayerSource !== 'youtube') { return; }

        // YT.PlayerState.PLAYING = 1
        // YT.PlayerState.PAUSED = 2
        // YT.PlayerState.ENDED = 0
        // YT.PlayerState.BUFFERING = 3
        
        if (event.data === YT.PlayerState.PLAYING) {
            setPlayButtonLoading(false);
            isPlaying = true;
            updatePlayPauseIcon();
            startProgressLoop();
        } else if (event.data === YT.PlayerState.BUFFERING) {
            setPlayButtonLoading(true);
        } else if (event.data === YT.PlayerState.PAUSED) {
            setPlayButtonLoading(false);
            isPlaying = false;
            updatePlayPauseIcon();
            stopProgressLoop();
        } else if (event.data === YT.PlayerState.ENDED) {
            setPlayButtonLoading(false);
            isPlaying = false;
            updatePlayPauseIcon();
            stopProgressLoop();
            if (isLoopEnabled && ytPlayer && ytPlayer.seekTo) {
                ytPlayer.seekTo(0, true);
                ytPlayer.playVideo();
                return;
            }
            if (currentIndex < results.length - 1) {
                selectTrack(currentIndex + 1);
            }
        }
    }

    function onPlayerError(event) {
        if (activePlayerSource !== 'youtube') { return; }

        const errorCodes = {
            2: 'Invalid parameter',
            5: 'HTML5 player error',
            100: 'Video not found',
            101: 'Video cannot be played embedded (region/copyright restriction)',
            150: 'Same as 101 (embedded not allowed)'
        };

        const errorMsg = errorCodes[event.data] || `Error code: ${event.data}`;
        console.error("[RENE] YouTube Player Error:", errorMsg);

        // TRY FALLBACK: Si YouTube falla, intentar con Deezer o siguiente resultado
        handlePlaybackError();
    }

    function handlePlaybackError() {
        const currentTrack = results[playbackIndex];
        
        // Opción 1: Si el track tiene preview de Deezer, reproducirlo
        if (currentTrack && currentTrack.preview) {
            console.log("[RENE] Fallback: Reproduciendo preview de Deezer...");
            playDeezerPreview(currentTrack);
            return;
        }

        // Opción 2: buscar fallback en segundo plano sin cambiar UI visible
        if (attemptBackgroundFallback()) {
            return;
        }

        // Opción 3: Si nada funciona, mostrar error
        const track = results[selectedTrackIndex];
        const alternativeMsg = track 
            ? `<div class="error-msg">
                <strong>${escapeHtml(track.title)}</strong> no se puede reproducir en YouTube. <br>
                Intentando alternativas... <br><br>
                <small>Razón: Restricción de región/copyright</small>
              </div>`
            : '<div class="error-msg">No se puede reproducir este track</div>';

        showPlayerError(alternativeMsg);
    }

    // Reproductor alternativo para Deezer Preview
    let deezerAudio = null;

    function playDeezerPreview(track) {
        if (!track.preview) {
            showPlayerError('No preview available for this track');
            return;
        }

        setPlayButtonLoading(true);
        activePlayerSource = 'deezer';

        // Limpiar reproductor anterior
        if (deezerAudio) {
            deezerAudio.pause();
            deezerAudio = null;
        }

        // Crear reproductor de audio para preview
        const container = $('#player-container');
        if (container) {
            const hasControls = !!$('#play-pause-btn') && !!$('#progress-bar') && !!$('#volume-btn');

            if (!hasControls) {
                const hasPrev = currentIndex > 0;
                const hasNext = currentIndex < results.length - 1;

                container.innerHTML = `
                    <div class="player-content">
                        <div class="player-progress">
                            <span id="current-time">0:00</span>
                            <input type="range" id="progress-bar" class="progress-bar" min="0" max="1000" value="0" step="1">
                            <span id="total-time">0:30</span>
                        </div>
                        <div class="player-controls">
                            <button id="volume-btn" class="control-btn control-btn-sm" aria-label="Volume">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <path id="vol-path" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                                </svg>
                            </button>
                            <button id="prev-btn" class="control-btn${hasPrev ? '' : ' disabled'}" aria-label="Previous">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                                </svg>
                            </button>
                            <button id="play-pause-btn" class="control-btn play-btn" aria-label="Play">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path id="play-path" d="M8 5v14l11-7z"/>
                                </svg>
                            </button>
                            <button id="next-btn" class="control-btn${hasNext ? '' : ' disabled'}" aria-label="Next">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                                </svg>
                            </button>
                            <button id="repeat-btn" class="control-btn control-btn-sm${isLoopEnabled ? ' active' : ''}" aria-label="Repeat">
                                    ${getRepeatIconSvg(isLoopEnabled)}
                            </button>
                        </div>
                    </div>`;
            } else {
                const cur = $('#current-time');
                const bar = $('#progress-bar');
                const total = $('#total-time');
                if (cur) { cur.textContent = '0:00'; }
                if (bar) { bar.value = '0'; }
                if (total) { total.textContent = '0:30'; }
            }

            // Crear elemento de audio
            deezerAudio = new Audio(track.preview);
            deezerAudio.crossOrigin = 'anonymous';
            
            deezerAudio.onplay = () => {
                setPlayButtonLoading(false);
                isPlaying = true;
                updatePlayPauseIcon();
                startProgressLoop();
            };

            deezerAudio.onpause = () => {
                isPlaying = false;
                updatePlayPauseIcon();
                stopProgressLoop();
            };

            deezerAudio.onended = () => {
                isPlaying = false;
                updatePlayPauseIcon();
                stopProgressLoop();
                if (isLoopEnabled) {
                    deezerAudio.currentTime = 0;
                    deezerAudio.play();
                    return;
                }
                if (currentIndex < results.length - 1) {
                    selectTrack(currentIndex + 1);
                }
            };

            deezerAudio.ontimeupdate = () => {
                const bar = $('#progress-bar');
                const cur = $('#current-time');
                if (bar && deezerAudio.duration) {
                    bar.value = (deezerAudio.currentTime / deezerAudio.duration) * 1000;
                }
                if (cur) {
                    cur.textContent = formatDuration(Math.floor(deezerAudio.currentTime));
                }
            };

            // Setup eventos del reproductor
            const playPauseBtn = $('#play-pause-btn');
            const prevBtn = $('#prev-btn');
            const nextBtn = $('#next-btn');
            const progressBar = $('#progress-bar');
            const volumeBtn = $('#volume-btn');
            const repeatBtn = $('#repeat-btn');

            if (playPauseBtn) {
                playPauseBtn.onclick = () => {
                    if (isPlaying) {
                        deezerAudio.pause();
                    } else {
                        deezerAudio.play();
                    }
                };
            }

            if (prevBtn && !prevBtn.classList.contains('disabled')) {
                prevBtn.onclick = () => {
                    if (currentIndex > 0) { selectTrack(currentIndex - 1); }
                };
            }

            if (nextBtn && !nextBtn.classList.contains('disabled')) {
                nextBtn.onclick = () => {
                    if (currentIndex < results.length - 1) { selectTrack(currentIndex + 1); }
                };
            }

            if (progressBar) {
                progressBar.oninput = (e) => {
                    if (deezerAudio && deezerAudio.duration) {
                        const seekTo = (e.target.value / 1000) * deezerAudio.duration;
                        deezerAudio.currentTime = seekTo;
                    }
                };
            }

            if (volumeBtn) {
                volumeBtn.onclick = () => {
                    isMuted = !isMuted;
                    deezerAudio.muted = isMuted;
                    updateVolumeIcon();
                };
            }

            if (repeatBtn) {
                repeatBtn.style.opacity = isLoopEnabled ? '1' : '';
                repeatBtn.onclick = () => {
                    isLoopEnabled = !isLoopEnabled;
                    repeatBtn.classList.toggle('active', isLoopEnabled);
                    repeatBtn.style.opacity = isLoopEnabled ? '1' : '';
                    repeatBtn.innerHTML = getRepeatIconSvg(isLoopEnabled);
                };
            }

            // Reproducir automáticamente
            deezerAudio.play();
        }
    }

    // --- Progress Loop ---
    function startProgressLoop() {
        stopProgressLoop();
        progressTimer = setInterval(() => {
            if (deezerAudio && deezerAudio.duration) {
                // Deezer preview
                updateProgressBar(deezerAudio.currentTime, deezerAudio.duration);
            } else if (ytPlayer && ytPlayer.getCurrentTime) {
                // YouTube
                const currentTime = ytPlayer.getCurrentTime();
                const duration = ytPlayer.getDuration();
                updateProgressBar(currentTime, duration);
            }
        }, 1000);
    }

    function stopProgressLoop() {
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    }

    function updateProgressBar(current, total) {
        const bar = $('#progress-bar');
        const cur = $('#current-time');
        const tot = $('#total-time');
        
        if (bar && total > 0) {
            bar.value = (current / total) * 1000;
        }
        if (cur) {
            cur.textContent = formatDuration(Math.floor(current));
        }
        if (tot && total > 0) {
            tot.textContent = formatDuration(Math.floor(total));
        }
    }

    // --- Screen navigation ---
    function showScreen(name) {
        $$('.screen').forEach((s) => s.classList.remove('active'));
        const el = $(`#screen-${name}`);
        if (el) { el.classList.add('active'); }
    }

    // --- Utility ---
    function formatDuration(sec) {
        if (!sec || sec < 0) { return '0:00'; }
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text || '';
        return d.innerHTML;
    }

    // --- Skeleton for results only ---
    function showResultsSkeleton() {
        const container = $('#results-container');
        container.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const el = document.createElement('div');
            el.className = 'result-item skeleton-item';
            el.innerHTML = `
                <div class="skeleton skeleton-thumbnail"></div>
                <div class="skeleton-info">
                    <div class="skeleton skeleton-line long"></div>
                    <div class="skeleton skeleton-line short"></div>
                </div>`;
            container.appendChild(el);
        }
    }

    // --- Search ---
    function doSearch(query) {
        query = (query || '').trim();
        if (!query) { return; }
        showScreen('results');
        const resultsQueryInput = $('#results-query-input');
        if (resultsQueryInput) { resultsQueryInput.value = query; }
        if (searchInput) { searchInput.value = query; }
        showResultsSkeleton();
        vscode.postMessage({ type: 'search', query });
    }

    // --- Render results ---
    function renderResults(items) {
        results = items;
        const container = $('#results-container');
        container.innerHTML = '';

        if (!items || items.length === 0) {
            container.innerHTML = '<div class="no-results">No results found. Try a different search.</div>';
            return;
        }

        items.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'result-item';
            el.innerHTML = `
                <img class="result-thumbnail" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy"
                    onerror="this.style.background='rgba(128,128,128,0.15)';this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22/>'">
                <div class="result-info">
                    <div class="result-title">${escapeHtml(item.title)}</div>
                    <div class="result-meta">
                        ${escapeHtml(item.artist)}${item.album ? ` · ${escapeHtml(item.album)}` : ''} · ${formatDuration(item.duration)}
                    </div>
                </div>`;
            el.addEventListener('click', () => selectTrack(i));
            container.appendChild(el);
        });
    }

    // --- Select track: show player + load in hidden YT player ---
    function selectTrack(index) {
        currentIndex = index;
        selectedTrackIndex = index;
        playbackIndex = index;
        fallbackTried = new Set();
        activePlayerSource = 'none';
        const track = results[index];
        if (!track) { return; }

        showScreen('player');

        // Limpiar reproductor Deezer si estaba activo
        if (deezerAudio) {
            deezerAudio.pause();
            deezerAudio = null;
        }

        // Set track info in header
        const trackInfo = $('#player-track-info');
        if (trackInfo) {
            trackInfo.innerHTML = `
                <span class="header-track-title">${escapeHtml(track.title)}</span>
                <span class="header-track-separator"> - </span>
                <span class="header-track-artist">${escapeHtml(track.artist)}</span>
            `;
        }

        renderPlayerUI(track);
        setPlayButtonLoading(true);
        if (!attemptPlaybackAtIndex(index)) {
            showPlayerError('No playable track available in this list');
        }
    }

    // --- Render player UI instantly ---
    function renderPlayerUI(track) {
        const container = $('#player-container');
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < results.length - 1;

        container.innerHTML = `
            <div class="player-content">
                <div class="player-progress">
                    <span id="current-time">0:00</span>
                    <input type="range" id="progress-bar" class="progress-bar" min="0" max="1000" value="0" step="1">
                    <span id="total-time">${formatDuration(track.duration)}</span>
                </div>
                <div class="player-controls">
                    <button id="volume-btn" class="control-btn control-btn-sm" aria-label="Volume">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path id="vol-path" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                    </button>
                    <button id="prev-btn" class="control-btn${hasPrev ? '' : ' disabled'}" aria-label="Previous">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                        </svg>
                    </button>
                    <button id="play-pause-btn" class="control-btn play-btn" aria-label="Play">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path id="play-path" d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                    <button id="next-btn" class="control-btn${hasNext ? '' : ' disabled'}" aria-label="Next">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                        </svg>
                    </button>
                    <button id="repeat-btn" class="control-btn control-btn-sm${isLoopEnabled ? ' active' : ''}" aria-label="Repeat">
                        ${getRepeatIconSvg(isLoopEnabled)}
                    </button>
                </div>
            </div>`;

        setupPlayerEvents();
    }

    function setPlayButtonLoading(loading) {
        isPlayButtonLoading = loading;
        const btn = $('#play-pause-btn');
        const icon = $('#play-path');
        if (!btn) { return; }

        btn.classList.toggle('loading', loading);
        btn.setAttribute('aria-busy', loading ? 'true' : 'false');
        btn.disabled = loading;

        if (icon) {
            icon.style.opacity = loading ? '0' : '1';
        }
    }

    function attemptPlaybackAtIndex(index) {
        const track = results[index];
        if (!track) { return false; }

        playbackIndex = index;
        fallbackTried.add(index);

        if (track.videoId && ytPlayer && ytPlayer.loadVideoById) {
            activePlayerSource = 'youtube';
            setPlayButtonLoading(true);
            ytPlayer.loadVideoById(track.videoId);
            ytPlayer.playVideo();
            return true;
        }

        if (track.preview) {
            activePlayerSource = 'deezer';
            playDeezerPreview(track);
            return true;
        }

        return attemptBackgroundFallback();
    }

    function attemptBackgroundFallback() {
        if (results.length <= 1) { return false; }

        for (let i = selectedTrackIndex + 1; i < results.length; i++) {
            if (!fallbackTried.has(i) && (results[i].preview || results[i].videoId)) {
                return attemptPlaybackAtIndex(i);
            }
        }

        for (let i = 0; i < selectedTrackIndex; i++) {
            if (!fallbackTried.has(i) && (results[i].preview || results[i].videoId)) {
                return attemptPlaybackAtIndex(i);
            }
        }

        return false;
    }

    function showPlayerError(text) {
        const container = $('#player-container');
        if (container) {
            container.innerHTML = `<div class="error-msg">${escapeHtml(text)}</div>`;
        }
        setPlayButtonLoading(false);
        isPlaying = false;
    }

    // --- Player controls ---
    const PATH_PLAY  = 'M8 5v14l11-7z';
    const PATH_PAUSE = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';

    function getRepeatIconSvg(selected) {
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

    function updatePlayPauseIcon() {
        const pp = $('#play-path');
        if (!pp) { return; }
        pp.setAttribute('d', isPlaying ? PATH_PAUSE : PATH_PLAY);
        const btn = $('#play-pause-btn');
        if (btn) { btn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play'); }
    }

    function updateVolumeIcon() {
        const volPath = $('#vol-path');
        if (!volPath) { return; }
        if (isMuted) {
            volPath.setAttribute('d', 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z');
        } else {
            volPath.setAttribute('d', 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
        }
    }

    function setupPlayerEvents() {
        const playPauseBtn = $('#play-pause-btn');
        const prevBtn = $('#prev-btn');
        const nextBtn = $('#next-btn');
        const progressBar = $('#progress-bar');
        const volumeBtn = $('#volume-btn');
        const repeatBtn = $('#repeat-btn');

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                if (isPlayButtonLoading) return;
                if (activePlayerSource !== 'youtube') return;
                if (!ytPlayer || !playerReady) return;
                
                if (isPlaying) {
                    ytPlayer.pauseVideo();
                } else {
                    ytPlayer.playVideo();
                }
            });
        }

        if (prevBtn && !prevBtn.classList.contains('disabled')) {
            prevBtn.addEventListener('click', () => {
                if (currentIndex > 0) { selectTrack(currentIndex - 1); }
            });
        }

        if (nextBtn && !nextBtn.classList.contains('disabled')) {
            nextBtn.addEventListener('click', () => {
                if (currentIndex < results.length - 1) { selectTrack(currentIndex + 1); }
            });
        }

        if (progressBar) {
            progressBar.addEventListener('input', (e) => {
                if (activePlayerSource !== 'youtube') return;
                if (ytPlayer && ytPlayer.seekTo) {
                    const duration = ytPlayer.getDuration();
                    const seekTo = (e.target.value / 1000) * duration;
                    ytPlayer.seekTo(seekTo, true);
                }
            });
        }

        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => {
                if (activePlayerSource !== 'youtube') return;
                if (!ytPlayer) return;
                isMuted = !isMuted;
                if (isMuted) {
                    ytPlayer.mute();
                } else {
                    ytPlayer.unMute();
                }
                updateVolumeIcon();
            });
        }

        if (repeatBtn) {
            repeatBtn.addEventListener('click', () => {
                if (activePlayerSource !== 'youtube') return;
                isLoopEnabled = !isLoopEnabled;
                repeatBtn.classList.toggle('active', isLoopEnabled);
                repeatBtn.style.opacity = isLoopEnabled ? '1' : '';
                repeatBtn.innerHTML = getRepeatIconSvg(isLoopEnabled);
            });
            repeatBtn.style.opacity = isLoopEnabled ? '1' : '';
        }
    }

    // --- Messages from extension ---
    window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
            case 'searchResults':
                renderResults(msg.results);
                break;
            case 'error':
                handleError(msg.message);
                break;
        }
    });

    function handleError(text) {
        const resultsContainer = $('#results-container');
        const playerContainer = $('#player-container');
        const errHtml = `<div class="error-msg">${escapeHtml(text)}</div>`;

        if (resultsContainer && $('#screen-results').classList.contains('active')) {
            resultsContainer.innerHTML = errHtml;
        } else if (playerContainer && $('#screen-player').classList.contains('active')) {
            playerContainer.innerHTML = errHtml;
        }
    }

    // --- Init events ---
    const searchInput = $('#search-input');
    const searchBtn = $('#search-btn');
    const resultsQueryInput = $('#results-query-input');
    const resultsQueryBtn = $('#results-query-btn');

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { doSearch(searchInput.value); }
        });
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (searchInput) { doSearch(searchInput.value); }
        });
    }

    if (resultsQueryInput) {
        resultsQueryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { doSearch(resultsQueryInput.value); }
        });
    }

    if (resultsQueryBtn) {
        resultsQueryBtn.addEventListener('click', () => {
            if (resultsQueryInput) { doSearch(resultsQueryInput.value); }
        });
    }

    $$('.qa-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const query = btn.getAttribute('data-query') || btn.textContent;
            if (searchInput) { searchInput.value = query; }
            doSearch(query);
        });
    });

    const backToSearch = $('#back-to-search');
    if (backToSearch) {
        backToSearch.addEventListener('click', () => {
            if (ytPlayer) ytPlayer.pauseVideo();
            if (deezerAudio) deezerAudio.pause();
            isPlaying = false;
            activePlayerSource = 'none';
            showScreen('search');
        });
    }

    const backToResults = $('#back-to-results');
    if (backToResults) {
        backToResults.addEventListener('click', () => {
            // Keep playing when going back to results
            showScreen('results');
        });
    }
}());
