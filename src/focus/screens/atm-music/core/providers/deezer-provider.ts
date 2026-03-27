import * as https from 'https';
import { Track } from '../../../../shared/types';
import { IMusicProvider } from './base-provider';

interface DeezerTrack {
    id: number;
    title: string;
    title_short: string;
    duration: number; // seconds
    preview: string;  // 30-second MP3 preview URL
    link: string;
    artist: {
        id: number;
        name: string;
        picture_small: string;
    };
    album: {
        id: number;
        title: string;
        cover_medium: string;
        cover_small: string;
    };
}

interface DeezerSearchResponse {
    data: DeezerTrack[];
    total: number;
}

/**
 * Deezer API Provider
 * Provides 30-second previews for free (no API key needed).
 * Great for metadata enrichment and when other providers are down.
 * 
 * Docs: https://developers.deezer.com/api
 */
export class DeezerProvider implements IMusicProvider {
    readonly name = 'deezer';

    isAvailable(): boolean {
        return true; // No API key needed for search + previews
    }

    async search(query: string, limit = 20): Promise<Track[]> {
        console.log(`[RENE Music] [Deezer] Searching: "${query}"`);

        try {
            const encodedQuery = encodeURIComponent(query);
            const url = `https://api.deezer.com/search?q=${encodedQuery}&limit=${limit}&order=RANKING`;

            const data = await this.httpGet(url);
            const parsed: DeezerSearchResponse = JSON.parse(data);

            if (!parsed.data || !Array.isArray(parsed.data)) {
                return [];
            }

            return parsed.data
                .filter(t => t.preview) // Only include tracks with playable previews
                .map((t) => ({
                    id: `deezer_${t.id}`,
                    videoId: String(t.id),
                    title: t.title || t.title_short || 'Untitled',
                    artist: t.artist?.name || 'Unknown Artist',
                    album: t.album?.title || '',
                    thumbnail: t.album?.cover_medium || t.album?.cover_small || '',
                    duration: t.duration || 0,
                    preview: t.preview, // Direct 30s MP3 URL, HTTPS, no CORS issues
                    provider: 'deezer' as const,
                    canPlay: true,
                    isFullTrack: false, // Only 30-second previews
                    externalUrl: t.link || '',
                    region: 'global',
                    quality: '128k',
                }));

        } catch (error) {
            console.error('[RENE Music] [Deezer] Search failed:', error);
            return [];
        }
    }

    async getStreamUrl(trackId: string): Promise<string | null> {
        try {
            const url = `https://api.deezer.com/track/${trackId}`;
            const data = await this.httpGet(url);
            const parsed = JSON.parse(data) as DeezerTrack;
            return parsed.preview || null;
        } catch {
            return null;
        }
    }

    private httpGet(url: string, redirectsLeft = 5): Promise<string> {
        return new Promise((resolve, reject) => {
            if (redirectsLeft <= 0) {
                return reject(new Error('[RENE Music] [Deezer] Too many redirects'));
            }
            https.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return this.httpGet(res.headers.location, redirectsLeft - 1).then(resolve, reject);
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
                res.on('error', reject);
            }).on('error', reject);
        });
    }
}
