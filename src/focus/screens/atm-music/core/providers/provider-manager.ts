import { Track } from '../../../../shared/types';
import { IMusicProvider } from './base-provider';
import { NeteaseProvider } from './netease-provider';
import { DeezerProvider } from './deezer-provider';
import { JioSaavnProvider } from './jiosaavn-provider';

/**
 * Aggregates all music providers, manages fallback/priority logic.
 */
export class ProviderManager {
    private providers: IMusicProvider[] = [];

    constructor() {
        this.initializeProviders();
    }

    private initializeProviders() {
        // Always try Netease First (Bundle default)
        this.providers.push(new NeteaseProvider());
        
        // Add Tier 1 (Free Full Streaming)
        this.providers.push(new JioSaavnProvider());
        
        // Add Tier 2 (Metadata + Previews, fallback)
        this.providers.push(new DeezerProvider());

        // Filter and log
        this.providers = this.providers.filter(p => p.isAvailable());
        const names = this.providers.map(p => p.name).join(', ');
        console.log(`[RENE Music] Initialized providers: ${names}`);
    }

    /**
     * Provider priority map — lower number = higher priority.
     * Netease is king 👑
     */
    private static readonly PROVIDER_PRIORITY: Record<string, number> = {
        'netease':  0,
        'jiosaavn': 1,
        'deezer':   2,
    };

    private getProviderPriority(providerName: string): number {
        return ProviderManager.PROVIDER_PRIORITY[providerName] ?? 99;
    }

    /**
     * Search all providers concurrently.
     * Netease results are guaranteed to appear first; other providers
     * fill in if Netease has gaps or doesn't return enough results.
     */
    async searchAll(query: string): Promise<Track[]> {
        if (!query || this.providers.length === 0) return [];

        // Search all providers concurrently (Netease is always index 0)
        const results = await Promise.allSettled(
            this.providers.map(p => p.search(query, 20))
        );

        // Separate Netease results from the rest
        let neteaseResults: Track[] = [];
        let otherResults: Track[] = [];

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            if (res.status === 'fulfilled' && res.value) {
                if (this.providers[i].name === 'netease') {
                    neteaseResults = res.value;
                } else {
                    otherResults = otherResults.concat(res.value);
                }
            }
        }

        // Netease first, then the rest — dedup will handle overlaps
        const merged = [...neteaseResults, ...otherResults];
        return this.deduplicateAndSort(merged, query);
    }

    /**
     * Get correct stream URL delegating to the right provider.
     */
    async getStreamUrl(providerName: string, trackId: string): Promise<string | null> {
        const provider = this.providers.find(p => p.name === providerName);
        if (!provider) return null;
        return provider.getStreamUrl(trackId);
    }

    /**
     * Merge results, deduping by rough title+artist match.
     * Priorities: 
     * 1. Netease > JioSaavn > Deezer (provider priority)
     * 2. Full tracks > Previews
     * 3. Direct string match > partial match
     */
    private deduplicateAndSort(tracks: Track[], query: string): Track[] {
        const unique = new Map<string, Track>();
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const qNorm = normalize(query);

        for (const track of tracks) {
            const titleNorm = normalize(track.title);
            const artistNorm = normalize(track.artist);
            const key = `${titleNorm}_${artistNorm}`;

            const existing = unique.get(key);

            if (!existing) {
                unique.set(key, track);
            } else {
                const existingPrio = this.getProviderPriority(existing.provider);
                const newPrio = this.getProviderPriority(track.provider);

                // Always prefer Netease (lower priority number wins)
                if (newPrio < existingPrio) {
                    unique.set(key, track);
                }
                // Same provider tier: prefer full track over preview
                else if (newPrio === existingPrio && track.isFullTrack && !existing.isFullTrack) {
                    unique.set(key, track);
                }
            }
        }

        const sorted = Array.from(unique.values()).sort((a, b) => {
            // 1. Provider priority (Netease first!)
            const aPrio = this.getProviderPriority(a.provider);
            const bPrio = this.getProviderPriority(b.provider);
            if (aPrio !== bPrio) return aPrio - bPrio;

            // 2. Full tracks before previews
            if (a.isFullTrack && !b.isFullTrack) return -1;
            if (!a.isFullTrack && b.isFullTrack) return 1;

            // 3. Exact query matches before partial
            const aTitle = normalize(a.title);
            const bTitle = normalize(b.title);
            const aExact = aTitle === qNorm || normalize(a.artist) === qNorm;
            const bExact = bTitle === qNorm || normalize(b.artist) === qNorm;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;

            return 0;
        });

        return sorted.slice(0, 50);
    }
}

// Export singleton instance
export const providerManager = new ProviderManager();
