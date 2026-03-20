import * as vscode from 'vscode';
import YTMusic from "ytmusic-api";

function getLastFmApiKey(): string {
	const config = vscode.workspace.getConfiguration('rene');
	return config.get<string>('lastfmApiKey', '');
}

export interface SearchResult {
	videoId?: string; // Para YouTube
	id: string;
	title: string;
	artist: string;
	album: string;
	thumbnail: string;
	duration: number;
	preview?: string; // URL para escuchar directamente
	provider: 'youtube' | 'deezer' | 'lastfm';
	canPlay: boolean; // Si tiene preview/stream disponible
}

const ytmusic = new YTMusic();
let isInitialized = false;

async function initYTMusic(): Promise<void> {
	if (!isInitialized) {
		try {
			await ytmusic.initialize();
			isInitialized = true;
		} catch (error) {
			console.warn("[RENE Music] YouTube Music initialization failed:", error);
		}
	}
}

// Búsqueda en YouTube Music
async function searchYouTubeMusic(query: string): Promise<SearchResult[]> {
	await initYTMusic();
	try {
		const songs = await ytmusic.searchSongs(query);

		return songs.slice(0, 25).map((song: any) => ({
			id: song.videoId,
			videoId: song.videoId,
			title: song.name,
			artist: song.artist?.name || "Unknown",
			album: song.album?.name || "",
			thumbnail:
				song.thumbnails && song.thumbnails.length > 0
					? song.thumbnails[song.thumbnails.length - 1].url
					: "",
			duration: song.duration || 0,
			provider: 'youtube' as const,
			canPlay: true,
		}));
	} catch (error) {
		console.error("[RENE Music] YouTube search failed:", error);
		return [];
	}
}

// Búsqueda en Deezer (sin restricciones de región)
async function searchDeezer(query: string): Promise<SearchResult[]> {
	try {
		const response = await fetch(
			`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`
		);
		const data: any = await response.json();
		
		if (!data.data) return [];

		return data.data.map((track: any) => ({
			id: `deezer_${track.id}`,
			title: track.title,
			artist: track.artist.name,
			album: track.album.title,
			thumbnail: track.album.cover_big,
			duration: track.duration,
			preview: track.preview, // URL directo para reproducir
			provider: 'deezer' as const,
			canPlay: !!track.preview, // Solo si tiene preview disponible
		}));
	} catch (error) {
		console.error("[RENE Music] Deezer search error:", error);
		return [];
	}
}

// Búsqueda en Last.FM (información detallada)
async function searchLastFM(query: string): Promise<SearchResult[]> {
	const API_KEY = getLastFmApiKey();
	if (!API_KEY) {
		console.warn("[RENE Music] Last.FM API key not configured. Set 'rene.lastfmApiKey' in settings.");
		return [];
	}
	
	try {
		const response = await fetch(
			`https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${API_KEY}&format=json&limit=25`
		);
		const data: any = await response.json();

		if (!data.results?.trackmatches?.track) return [];

		const tracks = Array.isArray(data.results.trackmatches.track) 
			? data.results.trackmatches.track 
			: [data.results.trackmatches.track];

		return tracks.map((track: any) => ({
			id: `lastfm_${track.name}_${track.artist}`,
			title: track.name,
			artist: track.artist,
			album: "",
			thumbnail: track.image?.find((i: any) => i.size === 'large')?.['#text'] || "",
			duration: 0,
			provider: 'lastfm' as const,
			canPlay: false, // Last.FM no proporciona stream directo
		}));
	} catch (error) {
		console.error("[RENE Music] LastFM search error:", error);
		return [];
	}
}

// Búsqueda combinada con fallback automático
export async function searchMusic(query: string): Promise<SearchResult[]> {
	console.log(`[RENE Music] Searching for: "${query}"`);

	// 1. YouTube + Deezer en paralelo con Timeout Anticaídas (10 segundos máximo)
	const withTimeout = (promise: Promise<any>, ms: number, name: string) => 
		Promise.race([
			promise, 
			new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${name}`)), ms))
		]);

	const [youtubeResult, deezerResult] = await Promise.allSettled([
		withTimeout(searchYouTubeMusic(query), 10000, 'YouTube'),
		withTimeout(searchDeezer(query), 10000, 'Deezer'),
	]);

	const allResults: SearchResult[] = [];

	if (youtubeResult.status === 'fulfilled') {
		allResults.push(...(youtubeResult.value as SearchResult[]));
	} else {
		console.warn("[RENE Music] YouTube search failed/timeout:", youtubeResult.reason);
	}
	
	if (deezerResult.status === 'fulfilled') {
		allResults.push(...(deezerResult.value as SearchResult[]));
	} else {
		console.warn("[RENE Music] Deezer search failed/timeout:", deezerResult.reason);
	}

	// 2. Last.FM solo si hay pocos resultados
	if (allResults.length < 10) {
		console.log("[RENE Music] Complementando con Last.FM...");
		const lastfmResults = await searchLastFM(query);
		allResults.push(...lastfmResults);
	}

	// Priorizar resultados que se pueden reproducir
	return allResults
		.sort((a, b) => {
			const aPlayable = a.canPlay ? 1 : 0;
			const bPlayable = b.canPlay ? 1 : 0;
			return bPlayable - aPlayable;
		})
		.slice(0, 25);
}
