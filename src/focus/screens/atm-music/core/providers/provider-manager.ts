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
     * Search all available providers concurrently.
     * Combines and deduplicates results.
     */
    async searchAll(query: string): Promise<Track[]> {
        if (!query || this.providers.length === 0) return [];

        const results = await Promise.allSettled(
            this.providers.map(p => p.search(query, 10))
        );

        let merged: Track[] = [];
        
        for (const res of results) {
            if (res.status === 'fulfilled' && res.value) {
                merged = merged.concat(res.value);
            }
        }

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
     * 1. Full tracks > Previews
     * 2. Direct string match > partial match
     */
    private deduplicateAndSort(tracks: Track[], query: string): Track[] {
        const unique = new Map<string, Track>();
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const qNorm = normalize(query);

        for (const track of tracks) {
            // Create a fuzzy key based on title and artist
            const titleNorm = normalize(track.title);
            const artistNorm = normalize(track.artist);
            const key = `${titleNorm}_${artistNorm}`;

            const existing = unique.get(key);

            if (!existing) {
                unique.set(key, track);
            } else {
                // If we already have this song, prefer the full track over a preview
                if (track.isFullTrack && !existing.isFullTrack) {
                    unique.set(key, track);
                } 
                // Alternatively prefer NetEase or higher fidelity if available
                else if (track.isFullTrack && existing.isFullTrack && track.provider === 'netease' && existing.provider !== 'netease') {
                     unique.set(key, track);
                }
            }
        }

        const sorted = Array.from(unique.values()).sort((a, b) => {
            // 1. Sort by full track vs preview
            if (a.isFullTrack && !b.isFullTrack) return -1;
            if (!a.isFullTrack && b.isFullTrack) return 1;

            // 2. Exact matches vs partial matches
            const aTitle = normalize(a.title);
            const bTitle = normalize(b.title);
            
            const aExact = aTitle === qNorm || normalize(a.artist) === qNorm;
            const bExact = bTitle === qNorm || normalize(b.artist) === qNorm;
            
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;

            return 0; // maintain original provider order (Netease > Jamendo > Audius > Deezer)
        });

        // Limit to top 50 unique results
        return sorted.slice(0, 50);
    }
}

// Export singleton instance
export const providerManager = new ProviderManager();
