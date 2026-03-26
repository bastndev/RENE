import { Track } from '../../../../shared/types';
import { IMusicProvider } from './base-provider';

/**
 * Yandex Music Provider Stub
 * Full implementation requires a token and potentially Python bridge or reverse engineering their signed API.
 * For now, this acts as a placeholder that returns empty until a proper library wrapper is integrated.
 */
export class YandexProvider implements IMusicProvider {
    readonly name = 'yandex';
    private token: string;

    constructor(token?: string) {
        this.token = token || '';
    }

    isAvailable(): boolean {
        // Only mark available if token is provided and we can connect to a running bridge
        // Returning false hides it from ProviderManager entirely
        return Boolean(this.token); 
    }

    async search(query: string, limit = 20): Promise<Track[]> {
        if (!this.isAvailable()) return [];

        console.log(`[RENE Music] [Yandex] Searching: "${query}" - Requires Python bridge implementation`);
        return [];
    }

    async getStreamUrl(trackId: string): Promise<string | null> {
        return null;
    }
}
