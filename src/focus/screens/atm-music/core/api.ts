import * as vscode from 'vscode';
import { cloudsearch, song_url } from 'NeteaseCloudMusicApi';
import { Track } from '../../../shared/types';

interface NeteaseSong {
    id: number;
    name: string;
    ar?: { name: string }[];
    al?: { name: string; picUrl: string };
    dt?: number; // duration in ms
}

export async function searchMusic(query: string): Promise<Track[]> {
    console.log(`[RENE Music] Searching NetEase for: "${query}"`);

    try {
        const result = await cloudsearch({
            keywords: query,
            type: 1, // 1: Song
            limit: 30,
            offset: 0
        });

        const data = result.body as any;
        
        if (data.code !== 200 || !data.result || !data.result.songs) {
            console.warn('[RENE Music] NetEase search returned no valid songs.');
            return [];
        }

        const songs: NeteaseSong[] = data.result.songs;
        const ids = songs.map(s => String(s.id)).join(',');

        // Fetch direct, authorized streaming URLs
        const urlResult = await song_url({ id: ids, br: 320000 });
        const urls = (urlResult.body as any).data as any[];

        const urlMap = new Map<number, string>();
        urls.forEach(u => {
            if (u.url) {
                // Ensure HTTPS for VSCode Webview CORS/Mixed-Content rules
                let secureUrl = u.url.replace(/^http:\/\//i, 'https://');
                urlMap.set(u.id, secureUrl);
            }
        });

        const validTracks: Track[] = [];

        songs.forEach((song) => {
            const streamUrl = urlMap.get(song.id);
            if (!streamUrl) return; // Skip songs that are VIP restricted or unplayable

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
            });
        });

        return validTracks;

    } catch (error) {
        console.error('[RENE Music] NetEase search failed:', error);
        return [];
    }
}
