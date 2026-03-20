import * as vscode from 'vscode';
import YTMusic from 'ytmusic-api';

function getLastFmApiKey(): string {
    const config = vscode.workspace.getConfiguration('rene');
    return config.get<string>('lastfmApiKey', '');
}

export interface SearchResult {
    videoId?: string;
    id: string;
    title: string;
    artist: string;
    album: string;
    thumbnail: string;
    duration: number;
    preview?: string;
    provider: 'youtube' | 'deezer' | 'lastfm';
    canPlay: boolean;
}

const ytmusic = new YTMusic();
let isInitialized = false;

async function initYTMusic(): Promise<void> {
    if (!isInitialized) {
        try {
            await ytmusic.initialize();
            isInitialized = true;
        } catch (error) {
            console.warn('[RENE Music] YouTube Music initialization failed:', error);
        }
    }
}

async function searchYouTubeMusic(query: string): Promise<SearchResult[]> {
    await initYTMusic();

    try {
        const songs = await ytmusic.searchSongs(query);

        return songs.slice(0, 25).map((song: any) => ({
            id: song.videoId,
            videoId: song.videoId,
            title: song.name,
            artist: song.artist?.name || 'Unknown',
            album: song.album?.name || '',
            thumbnail:
                song.thumbnails && song.thumbnails.length > 0
                    ? song.thumbnails[song.thumbnails.length - 1].url
                    : '',
            duration: song.duration || 0,
            provider: 'youtube' as const,
            canPlay: true,
        }));
    } catch (error) {
        console.error('[RENE Music] YouTube search failed:', error);
        return [];
    }
}

async function searchDeezer(query: string): Promise<SearchResult[]> {
    try {
        const response = await fetch(
            `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`,
        );
        const data: any = await response.json();

        if (!data.data) {
            return [];
        }

        return data.data.map((track: any) => ({
            id: `deezer_${track.id}`,
            title: track.title,
            artist: track.artist.name,
            album: track.album.title,
            thumbnail: track.album.cover_big,
            duration: track.duration,
            preview: track.preview,
            provider: 'deezer' as const,
            canPlay: !!track.preview,
        }));
    } catch (error) {
        console.error('[RENE Music] Deezer search error:', error);
        return [];
    }
}

async function searchLastFM(query: string): Promise<SearchResult[]> {
    const apiKey = getLastFmApiKey();
    if (!apiKey) {
        console.warn("[RENE Music] Last.FM API key not configured. Set 'rene.lastfmApiKey' in settings.");
        return [];
    }

    try {
        const response = await fetch(
            `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${apiKey}&format=json&limit=25`,
        );
        const data: any = await response.json();

        if (!data.results?.trackmatches?.track) {
            return [];
        }

        const tracks = Array.isArray(data.results.trackmatches.track)
            ? data.results.trackmatches.track
            : [data.results.trackmatches.track];

        return tracks.map((track: any) => ({
            id: `lastfm_${track.name}_${track.artist}`,
            title: track.name,
            artist: track.artist,
            album: '',
            thumbnail: track.image?.find((i: any) => i.size === 'large')?.['#text'] || '',
            duration: 0,
            provider: 'lastfm' as const,
            canPlay: false,
        }));
    } catch (error) {
        console.error('[RENE Music] LastFM search error:', error);
        return [];
    }
}

export async function searchMusic(query: string): Promise<SearchResult[]> {
    console.log(`[RENE Music] Searching for: "${query}"`);

    const withTimeout = (promise: Promise<SearchResult[]>, ms: number, name: string) =>
        Promise.race<SearchResult[]>([
            promise,
            new Promise<SearchResult[]>((_, reject) => {
                setTimeout(() => reject(new Error(`Timeout: ${name}`)), ms);
            }),
        ]);

    const [youtubeResult, deezerResult] = await Promise.allSettled([
        withTimeout(searchYouTubeMusic(query), 10000, 'YouTube'),
        withTimeout(searchDeezer(query), 10000, 'Deezer'),
    ]);

    const allResults: SearchResult[] = [];

    if (youtubeResult.status === 'fulfilled') {
        allResults.push(...youtubeResult.value);
    } else {
        console.warn('[RENE Music] YouTube search failed/timeout:', youtubeResult.reason);
    }

    if (deezerResult.status === 'fulfilled') {
        allResults.push(...deezerResult.value);
    } else {
        console.warn('[RENE Music] Deezer search failed/timeout:', deezerResult.reason);
    }

    if (allResults.length < 10) {
        const lastfmResults = await searchLastFM(query);
        allResults.push(...lastfmResults);
    }

    return allResults
        .sort((a, b) => {
            const aPlayable = a.canPlay ? 1 : 0;
            const bPlayable = b.canPlay ? 1 : 0;
            return bPlayable - aPlayable;
        })
        .slice(0, 25);
}
