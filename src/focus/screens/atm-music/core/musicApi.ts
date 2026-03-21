import * as vscode from 'vscode';
import YTMusic from 'ytmusic-api';
import { Track } from '../../../data/types';

function getLastFmApiKey(): string {
    const config = vscode.workspace.getConfiguration('rene');
    return config.get<string>('lastfmApiKey', '');
}

// Internal Interfaces for API Response Mapping
interface YTSong {
    videoId: string;
    name: string;
    artist?: { name: string };
    album?: { name: string };
    thumbnails?: { url: string }[];
    duration?: number;
}

interface DeezerTrack {
    id: number;
    title: string;
    artist: { name: string };
    album: { title: string; cover_big: string };
    duration: number;
    preview: string;
}

interface LastFMTrack {
    name: string;
    artist: string;
    image?: { '#text': string; size: string }[];
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

async function searchYouTubeMusic(query: string): Promise<Track[]> {
    await initYTMusic();

    try {
        const songs = await ytmusic.searchSongs(query) as unknown as YTSong[];

        return songs.slice(0, 25).map((song) => ({
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

async function searchDeezer(query: string): Promise<Track[]> {
    try {
        const response = await fetch(
            `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`,
        );
        const data = await response.json() as { data?: DeezerTrack[] };

        if (!data.data) {
            return [];
        }

        return data.data.map((track) => ({
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

async function searchLastFM(query: string): Promise<Track[]> {
    const apiKey = getLastFmApiKey();
    if (!apiKey) {
        console.warn("[RENE Music] Last.FM API key not configured. Set 'rene.lastfmApiKey' in settings.");
        return [];
    }

    try {
        const response = await fetch(
            `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${apiKey}&format=json&limit=25`,
        );
        const data = await response.json() as { results?: { trackmatches?: { track: LastFMTrack | LastFMTrack[] } } };

        if (!data.results?.trackmatches?.track) {
            return [];
        }

        const rawTracks = data.results.trackmatches.track;
        const tracks = Array.isArray(rawTracks) ? rawTracks : [rawTracks];

        return tracks.map((track) => ({
            id: `lastfm_${track.name}_${track.artist}`,
            title: track.name,
            artist: track.artist,
            album: '',
            thumbnail: track.image?.find((i) => i.size === 'large')?.['#text'] || '',
            duration: 0,
            provider: 'lastfm' as const,
            canPlay: false,
        }));
    } catch (error) {
        console.error('[RENE Music] LastFM search error:', error);
        return [];
    }
}

export async function searchMusic(query: string): Promise<Track[]> {
    console.log(`[RENE Music] Searching for: "${query}"`);

    const withTimeout = (promise: Promise<Track[]>, ms: number, name: string) =>
        Promise.race<Track[]>([
            promise,
            new Promise<Track[]>((_, reject) => {
                setTimeout(() => reject(new Error(`Timeout: ${name}`)), ms);
            }),
        ]);

    const [youtubeResult, deezerResult] = await Promise.allSettled([
        withTimeout(searchYouTubeMusic(query), 10000, 'YouTube'),
        withTimeout(searchDeezer(query), 10000, 'Deezer'),
    ]);

    const allResults: Track[] = [];

    if (youtubeResult.status === 'fulfilled') {
        allResults.push(...youtubeResult.status === 'fulfilled' ? youtubeResult.value : []);
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
