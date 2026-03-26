/**
 * RENE Common Types
 * Unified interfaces for the entire extension and webview.
 */

export type MusicProvider = 'netease' | 'jamendo' | 'jiosaavn' | 'yandex' | 'deezer';

export interface Track {
    id: string;
    videoId: string;
    title: string;
    artist: string;
    album: string;
    thumbnail: string;
    duration: number;
    preview: string;
    provider: MusicProvider;
    canPlay: boolean;
    region?: string;
    quality?: string;
    externalUrl?: string;
    isFullTrack?: boolean;
}

// Message types for Webview <-> Extension communication
export type WebviewMessageType = 
    | 'search' 
    | 'searchResults' 
    | 'error' 
    | 'info'
    | 'ready'
    | 'config';

export interface WebviewMessage {
    type: WebviewMessageType;
    query?: string;
    results?: Track[];
    message?: string;
    streamPort?: number;
}
