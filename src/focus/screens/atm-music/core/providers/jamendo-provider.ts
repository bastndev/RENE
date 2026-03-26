import * as https from 'https';
import { Track } from '../../../../shared/types';
import { IMusicProvider } from './base-provider';

interface JamendoTrack {
    id: string;
    name: string;
    artist_name: string;
    album_name: string;
    image: string;
    duration: number;
    audio: string;          // Direct MP3 stream URL
    audiodownload: string;  // Download URL (might need auth)
    shareurl: string;
}

/**
 * Jamendo API Provider
 * 500,000+ Creative Commons & royalty-free tracks
 * Provides full-length MP3 streaming for free.
 * 
 * API Docs: https://developer.jamendo.com/v3.0/docs
 */
export class JamendoProvider implements IMusicProvider {
    readonly name = 'jamendo';
    private clientId: string;

    constructor(clientId?: string) {
        // Jamendo provides a free "demo" client_id for testing
        // Users should register at developer.jamendo.com for production
        this.clientId = clientId || 'b0838540';
    }

    isAvailable(): boolean {
        return Boolean(this.clientId);
    }

    async search(query: string, limit = 20): Promise<Track[]> {
        if (!this.isAvailable()) return [];

        console.log(`[RENE Music] [Jamendo] Searching: "${query}"`);

        try {
            const encodedQuery = encodeURIComponent(query);
            const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${this.clientId}&format=json&limit=${limit}&search=${encodedQuery}&include=musicinfo&order=relevance`;

            const data = await this.httpGet(url);
            const parsed = JSON.parse(data);

            if (!parsed.results || !Array.isArray(parsed.results)) {
                return [];
            }

            return (parsed.results as JamendoTrack[]).map((t) => ({
                id: `jamendo_${t.id}`,
                videoId: t.id,
                title: t.name || 'Untitled',
                artist: t.artist_name || 'Unknown Artist',
                album: t.album_name || '',
                thumbnail: t.image ? t.image.replace(/^http:\/\//i, 'https://') : '',
                duration: t.duration || 0,
                // Jamendo `audio` field is a direct MP3 stream URL
                preview: t.audio ? t.audio.replace(/^http:\/\//i, 'https://') : '',
                provider: 'jamendo' as const,
                canPlay: Boolean(t.audio),
                isFullTrack: true,
                externalUrl: t.shareurl || '',
                region: 'global',
                quality: '320k',
            })).filter(t => t.canPlay);

        } catch (error) {
            console.error('[RENE Music] [Jamendo] Search failed:', error);
            return [];
        }
    }

    async getStreamUrl(trackId: string): Promise<string | null> {
        if (!this.isAvailable()) return null;

        try {
            const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${this.clientId}&format=json&id=${trackId}`;
            const data = await this.httpGet(url);
            const parsed = JSON.parse(data);
            const track = parsed.results?.[0] as JamendoTrack | undefined;
            return track?.audio ? track.audio.replace(/^http:\/\//i, 'https://') : null;
        } catch {
            return null;
        }
    }

    private httpGet(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                // Handle redirects
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return this.httpGet(res.headers.location).then(resolve, reject);
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
                res.on('error', reject);
            }).on('error', reject);
        });
    }
}
