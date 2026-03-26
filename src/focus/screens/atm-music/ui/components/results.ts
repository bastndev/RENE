import { $, escapeHtml, formatDuration } from '../../../../shared/utils';
import { Track } from '../../../../shared/types';
import { buildGradientBanner } from '../../../../shared/ui-ux/gradient-banner';

export class MusicResultsUI {
    private container: HTMLElement | null = null;
    private queryInput: HTMLInputElement | null = null;
    private queryBtn: HTMLButtonElement | null = null;
    private lastQuery = '';
    private canForward = false;

    constructor(
        private readonly onSelect: (index: number) => void,
        private readonly onSearch: (query: string) => void,
        private readonly onBack: () => void,
        private readonly onForward: () => void
    ) {
        this.container = $('#results-container');
        this.queryInput = $('#results-query-input') as HTMLInputElement | null;
        this.queryBtn = $('#results-query-btn') as HTMLButtonElement | null;
        this.setupEvents();
    }

    public setQuery(query: string) {
        if (this.queryInput) {
            this.queryInput.value = query;
            this.lastQuery = query;
            this.updateButtonState();
        }
    }

    public showSkeleton() {
        if (!this.container) return;
        this.container.innerHTML = '';
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
            this.container.appendChild(el);
        }
    }

    public render(items: Track[]) {
        if (!this.container) return;
        this.container.innerHTML = '';

        if (!items || items.length === 0) {
            this.container.innerHTML = '<div class="no-results">No results found. Try a different search.</div>';
            return;
        }

        items.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'result-item';

            const thumb = document.createElement('div');
            thumb.className = 'result-thumbnail';

            const fallback = buildGradientBanner(`${item.id}|${item.title}|${item.artist}`, i);
            thumb.style.setProperty('--fallback-gradient', fallback);

            const hasThumbnail = Boolean(item.thumbnail && item.thumbnail.trim());
            thumb.classList.toggle('has-image', hasThumbnail);
            if (hasThumbnail) {
                thumb.style.setProperty('--thumbnail-image', `url(${item.thumbnail.trim()})`);
            }

            const initial = document.createElement('span');
            initial.className = 'result-thumbnail-initial';
            initial.textContent = (item.title || item.artist || 'M').trim().charAt(0).toUpperCase();
            thumb.appendChild(initial);

            const info = document.createElement('div');
            info.className = 'result-info';
            info.innerHTML = `
                <div class="result-title">${escapeHtml(item.title)}</div>
                <div class="result-meta">
                    ${escapeHtml(item.artist)}${item.album ? ` · ${escapeHtml(item.album)}` : ''} · ${formatDuration(item.duration)}
                </div>
            `;

            el.appendChild(thumb);
            el.appendChild(info);
            el.addEventListener('click', () => this.onSelect(i));
            this.container?.appendChild(el);
        });
    }

    private setupEvents() {
        $('#back-to-search')?.addEventListener('click', () => this.onBack());

        if (this.queryInput) {
            this.queryInput.addEventListener('input', () => this.updateButtonState());
            this.queryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const q = (this.queryInput?.value || '').trim();
                    const isUnchanged = q === this.lastQuery && q.length > 0;
                    if (isUnchanged && this.canForward) {
                        this.onForward();
                    } else if (q && !isUnchanged) {
                        this.onSearch(q);
                    }
                }
            });
        }

        if (this.queryBtn) {
            this.queryBtn.addEventListener('click', () => {
                const q = (this.queryInput?.value || '').trim();
                const isUnchanged = q === this.lastQuery && q.length > 0;
                
                if (isUnchanged && this.canForward) {
                    this.onForward();
                } else if (q && !isUnchanged) {
                    this.onSearch(q);
                }
            });
        }
    }

    public setCanForward(enabled: boolean) {
        this.canForward = enabled;
        this.updateButtonState();
    }

    private updateButtonState() {
        if (!this.queryBtn) return;
        const q = (this.queryInput?.value || '').trim();
        const isUnchanged = q === this.lastQuery && q.length > 0;
        
        // Disable if empty, or if unchanged but we CANNOT go forward
        const isDisabled = q.length === 0 || (isUnchanged && !this.canForward);
        
        this.queryBtn.disabled = isDisabled;
        this.queryBtn.classList.toggle('is-disabled', isDisabled);
        
        if ((isUnchanged && this.canForward) || isDisabled) {
            this.queryBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
        } else {
            // Search icon if changing query
            this.queryBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
        }
    }
}
