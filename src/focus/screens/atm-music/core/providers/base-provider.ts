import { Track } from '../../../../shared/types';

/**
 * Abstract interface that all music providers must implement.
 * Each provider handles its own API authentication and data mapping.
 */
export interface IMusicProvider {
    /** Unique provider identifier */
    readonly name: string;
    
    /** Whether this provider is currently available/configured */
    isAvailable(): boolean;

    /** Search for tracks matching a query */
    search(query: string, limit?: number): Promise<Track[]>;

    /**
     * Get a streamable URL for a track.
     * Returns the direct audio URL or null if unavailable.
     */
    getStreamUrl(trackId: string): Promise<string | null>;
}
