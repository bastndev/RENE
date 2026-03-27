import * as https from 'https';
import * as http from 'http';
import { Track } from '../../../../shared/types';
import { IMusicProvider } from './base-provider';

interface JioSaavnImage {
    quality: string;
    link: string;
}

interface JioSaavnDownloadUrl {
    quality: string;
    link: string;
}

interface JioSaavnSong {
    id: string;
    name: string;
    primaryArtists: string;
    album: { name: string; url: string };
    duration: string;
    image: JioSaavnImage[];
    downloadUrl: JioSaavnDownloadUrl[];
    language?: string;
    url?: string;
}

interface JioSaavnResponse {
    status: string;
    data?: {
        results?: JioSaavnSong[];
    };
}

/**
 * JioSaavn API Provider (via unofficial API wrapper)
 * India + Bollywood + International
 * Supports 320kbps MP3
 */
export class JioSaavnProvider implements IMusicProvider {
    readonly name = 'jiosaavn';
    private apiUrl: string;

    constructor(apiUrl?: string) {
        this.apiUrl = (apiUrl || 'https://jiosaavn-api-sigma-sandy.vercel.app').replace(/\/$/, '');
    }

    isAvailable(): boolean {
        return Boolean(this.apiUrl);
    }

    async search(query: string, limit = 20): Promise<Track[]> {
        if (!this.isAvailable()) return [];

        console.log(`[RENE Music] [JioSaavn] Searching: "${query}"`);

        try {
            const encodedQuery = encodeURIComponent(query);
            const url = `${this.apiUrl}/search/songs?query=${encodedQuery}&page=1&limit=${limit}`;

            const data = await this.httpGet(url);
            const parsed: JioSaavnResponse = JSON.parse(data);

            if (parsed.status !== 'SUCCESS' || !parsed.data?.results) {
                return [];
            }

            return parsed.data.results.map((t) => {
                // Get highest quality image
                const highResImage = t.image && t.image.length > 0 
                    ? t.image[t.image.length - 1].link 
                    : '';
                
                // Get 320kbps or best available download URL
                let bestUrl = '';
                let quality = '';
                if (t.downloadUrl && t.downloadUrl.length > 0) {
                    const best = t.downloadUrl.find(d => d.quality === '320kbps') || t.downloadUrl[t.downloadUrl.length - 1];
                    bestUrl = best.link;
                    quality = best.quality;
                }

                return {
                    id: `jiosaavn_${t.id}`,
                    videoId: t.id,
                    title: t.name || 'Untitled',
                    artist: t.primaryArtists || 'Unknown Artist',
                    album: t.album?.name || '',
                    thumbnail: highResImage.replace(/^http:\/\//i, 'https://'),
                    duration: parseInt(t.duration || '0', 10),
                    preview: bestUrl.replace(/^http:\/\//i, 'https://'),
                    provider: 'jiosaavn' as const,
                    canPlay: Boolean(bestUrl),
                    region: t.language === 'english' ? 'global' : 'india',
                    quality: quality,
                    externalUrl: t.url || '',
                    isFullTrack: true,
                };
            }).filter(t => t.canPlay);
        } catch (error) {
            console.error('[RENE Music] [JioSaavn] Search failed:', error);
            return [];
        }
    }

    async getStreamUrl(trackId: string): Promise<string | null> {
        if (!this.isAvailable()) return null;

        try {
            const url = `${this.apiUrl}/songs?id=${trackId}`;
            const data = await this.httpGet(url);
            const parsed = JSON.parse(data);
            
            if (parsed.status === 'SUCCESS' && parsed.data && parsed.data.length > 0) {
                const t = parsed.data[0] as JioSaavnSong;
                if (t.downloadUrl && t.downloadUrl.length > 0) {
                    const best = t.downloadUrl.find(d => d.quality === '320kbps') || t.downloadUrl[t.downloadUrl.length - 1];
                    return best.link.replace(/^http:\/\//i, 'https://');
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    private httpGet(url: string, redirectsLeft = 5): Promise<string> {
        return new Promise((resolve, reject) => {
            if (redirectsLeft <= 0) {
                return reject(new Error('[RENE Music] [JioSaavn] Too many redirects'));
            }
            const protocol = url.startsWith('https') ? https : http;
            protocol.get(url, (res: any) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    // Fix relative redirects
                    const location = res.headers.location.startsWith('/') 
                        ? new URL(res.headers.location, url).toString() 
                        : res.headers.location;
                    return this.httpGet(location, redirectsLeft - 1).then(resolve, reject);
                }

                let data = '';
                res.on('data', (chunk: string) => data += chunk);
                res.on('end', () => resolve(data));
                res.on('error', reject);
            }).on('error', reject);
        });
    }
}
