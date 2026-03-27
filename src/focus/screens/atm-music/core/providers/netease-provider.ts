import { cloudsearch, song_url } from 'NeteaseCloudMusicApi';
import { Track } from '../../../../shared/types';
import { IMusicProvider } from './base-provider';

interface NeteaseSong {
    id: number;
    name: string;
    ar?: { name: string }[];
    al?: { name: string; picUrl: string };
    dt?: number;
}

interface NeteaseCloudSearchResponse {
    code: number;
    result?: {
        songs?: NeteaseSong[];
    };
}

interface NeteaseSongUrlResponse {
    code: number;
    data: {
        id: number;
        url: string;
    }[];
}

export class NeteaseProvider implements IMusicProvider {
    readonly name = 'netease';

    isAvailable(): boolean {
        return true; // NeteaseCloudMusicApi is bundled
    }

    async search(query: string, limit = 30): Promise<Track[]> {
        try {
            const result = await cloudsearch({
                keywords: query,
                type: 1,
                limit,
                offset: 0
            });

            const data = result.body as unknown as NeteaseCloudSearchResponse;
            if (data.code !== 200 || !data.result?.songs) {
                return [];
            }

            const songs: NeteaseSong[] = data.result.songs;
            const ids = songs.map(s => String(s.id)).join(',');

            const urlResult = await song_url({ id: ids, br: 320000 });
            const urls = (urlResult.body as unknown as NeteaseSongUrlResponse).data;

            const urlMap = new Map<number, string>();
            urls.forEach(u => {
                if (u.url) {
                    urlMap.set(u.id, u.url.replace(/^http:\/\//i, 'https://'));
                }
            });

            const validTracks: Track[] = [];
            songs.forEach((song) => {
                const streamUrl = urlMap.get(song.id);
                if (!streamUrl) return;

                let picUrl = song.al?.picUrl ? song.al.picUrl.replace(/^http:\/\//i, 'https://') : '';
                if (picUrl) picUrl += '?param=300y300';

                validTracks.push({
                    id: `netease_${song.id}`,
                    videoId: String(song.id),
                    title: song.name,
                    artist: song.ar?.map(a => a.name).join(', ') || 'Unknown Artist',
                    album: song.al?.name || '',
                    thumbnail: picUrl,
                    duration: song.dt ? Math.floor(song.dt / 1000) : 0,
                    preview: streamUrl,
                    provider: 'netease',
                    canPlay: true,
                    isFullTrack: true,
                    region: 'chinese',
                    quality: '320k',
                });
            });

            return validTracks;
        } catch (error) {

            return [];
        }
    }

    async getStreamUrl(trackId: string): Promise<string | null> {
        try {
            const urlResult = await song_url({ id: trackId, br: 320000 });
            const url = (urlResult.body as any).data?.[0]?.url;
            return url ? url.replace(/^http:\/\//i, 'https://') : null;
        } catch {
            return null;
        }
    }
}
