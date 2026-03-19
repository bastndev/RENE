import * as https from 'https';

const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.adminforge.de',
    'https://piped-api.garudalinux.org',
    'https://pipedapi.r4fo.com',
    'https://pipedapi.darkness.services',
];

export interface SearchResult {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
    duration: number;
}

export interface StreamInfo {
    url: string;
    title: string;
    artist: string;
    thumbnail: string;
    duration: number;
}

async function tryInstances<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
    let lastError: any;
    for (const baseUrl of PIPED_INSTANCES) {
        try {
            return await fn(baseUrl);
        } catch (error) {
            console.warn(`[RENE Music] Instance ${baseUrl} failed:`, error);
            lastError = error;
        }
    }
    throw lastError || new Error('All instances failed');
}

function httpGet(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Request timeout')), 10000);

        https.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                clearTimeout(timeout);
                httpGet(res.headers.location).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode && res.statusCode >= 400) {
                clearTimeout(timeout);
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error('Invalid JSON response'));
                }
            });
        }).on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

export async function searchMusic(query: string): Promise<SearchResult[]> {
    return tryInstances(async (baseUrl) => {
        // First try music filter
        const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
        let data = await httpGet(url);

        // If no results, try general videos filter
        if (!data.items || data.items.length === 0) {
            const fallbackUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            data = await httpGet(fallbackUrl);
        }

        if (!data.items || !Array.isArray(data.items)) {
            return [];
        }

        return data.items
            .filter((item: any) => item.url && item.title)
            .slice(0, 25)
            .map((item: any) => ({
                videoId: item.url.split('=')[1] || item.url.split('/').pop() || '',
                title: item.title,
                artist: item.uploaderName || 'Unknown',
                thumbnail: item.thumbnail || '',
                duration: item.duration || 0,
            }));
    });
}

export async function getStreamUrl(videoId: string): Promise<StreamInfo> {
    return tryInstances(async (baseUrl) => {
        const url = `${baseUrl}/streams/${encodeURIComponent(videoId)}`;
        const data = await httpGet(url);

        if (!data.audioStreams || data.audioStreams.length === 0) {
            throw new Error('No audio streams available');
        }

        const audioStream = data.audioStreams
            .filter((s: any) => s.mimeType && s.mimeType.startsWith('audio/'))
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        if (!audioStream) {
            throw new Error('No compatible audio stream found');
        }

        return {
            url: audioStream.url,
            title: data.title || 'Unknown',
            artist: data.uploader || 'Unknown',
            thumbnail: data.thumbnailUrl || '',
            duration: data.duration || 0,
        };
    });
}
