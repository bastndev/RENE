import { $, escapeHtml } from '../../../../shared/utils';

export type SearchButtonMode = 'disabled' | 'search' | 'forward';

export class MusicSearchUI {
    private searchInput: HTMLInputElement | null = null;
    private searchBtn: HTMLButtonElement | null = null;
    private lastSearchQuery = '';
    private canForward = false;
    private mode: SearchButtonMode = 'disabled';

    constructor(
        private readonly onSearch: (query: string) => void,
        private readonly onForward: () => void
    ) {
        this.searchInput = $('#search-input') as HTMLInputElement | null;
        this.searchBtn = $('#search-btn') as HTMLButtonElement | null;
        this.setupEvents();
        this.updateState();
    }

    public getQuery(): string {
        return (this.searchInput?.value || '').trim();
    }

    public setQuery(query: string) {
        if (this.searchInput) {
            this.searchInput.value = query;
            this.lastSearchQuery = query;
            this.updateState();
        }
    }

    public setCanForward(enabled: boolean) {
        this.canForward = enabled;
        this.updateState();
    }

    private setupEvents() {
        if (this.searchBtn) {
            this.searchBtn.addEventListener('click', () => {
                if (this.mode === 'forward') {
                    this.onForward();
                    return;
                }
                const query = this.getQuery();
                if (query) {
                    this.lastSearchQuery = query;
                    this.onSearch(query);
                }
            });
        }

        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.updateState());
        }
    }

    private updateState() {
        if (!this.searchBtn) {return;}

        const currentQuery = this.getQuery();
        const isUnchanged = currentQuery === this.lastSearchQuery && currentQuery.length > 0;
        const isForward = this.canForward && isUnchanged;

        if (currentQuery.length === 0) {
            this.mode = 'disabled';
        } else if (isForward) {
            this.mode = 'forward';
        } else {
            this.mode = 'search';
        }

        const isDisabled = this.mode === 'disabled';
        this.searchBtn.disabled = isDisabled;
        this.searchBtn.classList.toggle('is-disabled', isDisabled);

        if (this.mode === 'forward') {
            this.searchBtn.setAttribute('aria-label', 'Go forward to results');
        } else if (this.mode === 'search') {
            this.searchBtn.setAttribute('aria-label', 'Search');
        } else {
            this.searchBtn.setAttribute('aria-label', 'Empty search');
        }
    }
}
