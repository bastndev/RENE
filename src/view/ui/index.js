(function () {
    const vscode = acquireVsCodeApi();

    // Audio created but never auto-played
    const audio = new Audio();
    audio.preload = 'none';

    // --- State ---
    let results = [];
    let currentIndex = -1;
    let isPlaying = false;
    let isMuted = false;

    // --- DOM helpers ---
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

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
        const queryLabel = $('#results-query');
        if (queryLabel) { queryLabel.textContent = `"${query}"`; }
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

    // --- Select track: show player INSTANTLY with search data (NO API call) ---
    function selectTrack(index) {
        currentIndex = index;
        const track = results[index];
        if (!track) { return; }

        // Stop any current audio
        audio.pause();
        audio.removeAttribute('src');
        isPlaying = false;

        showScreen('player');

        // Set track info in header (white title + gray artist)
        const trackInfo = $('#player-track-info');
        if (trackInfo) {
            trackInfo.innerHTML = `
                <span class="header-track-title">${escapeHtml(track.title)}</span>
                <span class="header-track-separator"> - </span>
                <span class="header-track-artist">${escapeHtml(track.artist)}</span>
            `;
        }

        // Render player IMMEDIATELY with data from search results
        renderPlayerUI(track);
    }

    // --- Render player UI instantly (no skeleton, no API, no album art) ---
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
                    <button id="repeat-btn" class="control-btn control-btn-sm" aria-label="Repeat">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                        </svg>
                    </button>
                </div>
            </div>`;

        setupPlayerEvents();
    }

    // --- Request stream and play (called when user presses Play) ---
    function requestStreamAndPlay() {
        const track = results[currentIndex];
        if (!track) { return; }

        // Request stream URL from extension backend
        vscode.postMessage({ type: 'getStream', videoId: track.videoId });
    }

    // --- When stream is ready, set audio src and play ---
    function onStreamReady(data) {
        if (data.url) {
            audio.src = data.url;
            audio.play().then(() => {
                isPlaying = true;
                updatePlayPauseIcon();
            }).catch(() => {
                isPlaying = false;
                updatePlayPauseIcon();
                showPlayerError('Could not play this track.\nTry another one.');
            });
        }
    }

    // --- Show error in player without destroying controls ---
    function showPlayerError(text) {
        const container = $('#player-container');
        if (container) {
            container.innerHTML = `<div class="error-msg">${escapeHtml(text)}</div>`;
        }
        isPlaying = false;
    }

    // --- Player controls ---
    // Single SVG path-swap (avoids display:flex vs display:none conflicts)
    const PATH_PLAY  = 'M8 5v14l11-7z';
    const PATH_PAUSE = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';

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
                if (isPlaying) {
                    // Pause
                    audio.pause();
                    isPlaying = false;
                    updatePlayPauseIcon();
                } else {
                    // If no src loaded yet, request stream from API
                    if (!audio.src || audio.src === '' || audio.src === location.href) {
                        requestStreamAndPlay();
                    } else {
                        // Resume
                        audio.play().then(() => {
                            isPlaying = true;
                            updatePlayPauseIcon();
                        }).catch(() => {
                            isPlaying = false;
                            updatePlayPauseIcon();
                        });
                    }
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
                if (audio.duration) {
                    audio.currentTime = (e.target.value / 1000) * audio.duration;
                }
            });
        }

        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => {
                isMuted = !isMuted;
                audio.muted = isMuted;
                updateVolumeIcon();
            });
        }

        if (repeatBtn) {
            repeatBtn.addEventListener('click', () => {
                audio.loop = !audio.loop;
                repeatBtn.style.opacity = audio.loop ? '1' : '';
            });
        }
    }

    // --- Audio events ---
    audio.addEventListener('timeupdate', () => {
        const bar = $('#progress-bar');
        const cur = $('#current-time');
        if (bar && audio.duration) {
            bar.value = Math.floor((audio.currentTime / audio.duration) * 1000);
        }
        if (cur) {
            cur.textContent = formatDuration(Math.floor(audio.currentTime));
        }
    });

    audio.addEventListener('loadedmetadata', () => {
        const tot = $('#total-time');
        if (tot) { tot.textContent = formatDuration(Math.floor(audio.duration)); }
    });

    audio.addEventListener('ended', () => {
        if (!audio.loop && currentIndex < results.length - 1) {
            selectTrack(currentIndex + 1);
        } else if (!audio.loop) {
            isPlaying = false;
            updatePlayPauseIcon();
        }
    });

    audio.addEventListener('error', () => {
        if (!audio.src || audio.src === '' || audio.src === location.href) { return; }
        showPlayerError('Could not play this track.\nTry another one.');
    });

    // --- Messages from extension ---
    window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
            case 'searchResults':
                renderResults(msg.results);
                break;
            case 'streamReady':
                onStreamReady(msg);
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

    // Quick access buttons
    $$('.qa-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const query = btn.getAttribute('data-query') || btn.textContent;
            if (searchInput) { searchInput.value = query; }
            doSearch(query);
        });
    });

    // Back buttons
    const backToSearch = $('#back-to-search');
    if (backToSearch) {
        backToSearch.addEventListener('click', () => {
            audio.pause();
            isPlaying = false;
            showScreen('search');
        });
    }

    const backToResults = $('#back-to-results');
    if (backToResults) {
        backToResults.addEventListener('click', () => {
            audio.pause();
            isPlaying = false;
            showScreen('results');
        });
    }
}());
