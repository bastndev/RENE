/**
 * Multi-Provider Music Search System
 * Intenta buscar en múltiples APIs con fallback automático
 */

export interface TrackResult {
    id: string;
    title: string;
    artist: string;
    album?: string;
    thumbnail?: string;
    duration?: number;
    preview?: string; // URL para escuchar
    provider: 'youtube' | 'deezer' | 'lastfm' | 'soundcloud';
    canPlay: boolean;
}

// Búsqueda en Deezer primero (sin restricciones de región)
export async function searchDeezer(query: string): Promise<TrackResult[]> {
    try {
        const response = await fetch(
            `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`
        );
        const data: any = await response.json();
        
        if (!data.data) return [];

        return data.data.map((track: any) => ({
            id: track.id.toString(),
            title: track.title,
            artist: track.artist.name,
            album: track.album.title,
            thumbnail: track.album.cover_big,
            duration: track.duration,
            preview: track.preview, // ← URL directo! Funciona en cualquier región
            provider: 'deezer' as const,
            canPlay: !!track.preview,
        }));
    } catch (error) {
        console.error('[RENE] Deezer search error:', error);
        return [];
    }
}

// ===== LAST.FM API (Info detallada) =====
export async function searchLastFM(query: string): Promise<TrackResult[]> {
    const API_KEY = 'a4f0f9f5c5f5f5f5f5f5f5f5f5f5f5f5'; // Usar tu propia clave
    
    try {
        const response = await fetch(
            `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${API_KEY}&format=json&limit=25`
        );
        const data: any = await response.json();

        if (!data?.results?.trackmatches?.track) return [];

        const trackArray: any[] = Array.isArray(data.results.trackmatches.track) 
            ? data.results.trackmatches.track 
            : [data.results.trackmatches.track];

        return trackArray.map((track: any) => ({
            id: `lastfm_${track.name}_${track.artist}`,
            title: track.name,
            artist: track.artist,
            album: '',
            thumbnail: track.image?.find((i: any) => i.size === 'large')?.['#text'],
            duration: 0,
            preview: '', // Last.FM no provee preview
            provider: 'lastfm' as const,
            canPlay: false,
        }));
    } catch (error) {
        console.error('[RENE] LastFM search error:', error);
        return [];
    }
}

// ===== SOUNDCLOUD API (Fallback) =====
export async function searchSoundCloud(query: string): Promise<TrackResult[]> {
    // Nota: SoundCloud requiere client_id, usando fetch directo a widget
    try {
        const response = await fetch(
            `https://soundcloud.com/search?q=${encodeURIComponent(query)}`
        );
        // SoundCloud es complicado sin token oficial, saltamos por ahora
        return [];
    } catch (error) {
        console.error('[RENE] SoundCloud search error:', error);
        return [];
    }
}

// ===== BÚSQUEDA COMBINADA CON FALLBACK =====
export async function searchMusicWithFallback(query: string): Promise<TrackResult[]> {
    const results: TrackResult[] = [];

    // 1. Intentar Deezer primero (sin restricciones de región)
    console.log('[RENE] Buscando en Deezer...');
    const deezerResults = await searchDeezer(query);
    results.push(...deezerResults);

    // Si Deezer tiene buenos resultados, devolver
    if (deezerResults.length > 0) {
        console.log(`[RENE] ✅ Encontrados ${deezerResults.length} resultados en Deezer`);
        return results.slice(0, 25);
    }

    // 2. Fallback a LastFM para información
    console.log('[RENE] Fallback a LastFM...');
    const lastfmResults = await searchLastFM(query);
    results.push(...lastfmResults);

    // 3. Entre todos, priorizar los que tienen preview
    return results.sort((a, b) => {
        const aCanPlay = a.canPlay ? 1 : 0;
        const bCanPlay = b.canPlay ? 1 : 0;
        return bCanPlay - aCanPlay;
    }).slice(0, 25);
}

// ===== ALTERNATIVA: YouTube Music con fallback =====
export async function getYouTubeFallback(videoId: string): Promise<string | null> {
    // Si YouTube falla, intentar obtener stream alternativo
    try {
        // Aquí podrías buscar el mismo track en Deezer
        const trackInfo = await fetch(
            `https://www.youtube.com/watch?v=${videoId}`
        );
        return videoId;
    } catch {
        return null;
    }
}
