import { Track } from '../../../shared/types';
import { providerManager } from './providers/provider-manager';

export async function searchMusic(query: string): Promise<Track[]> {
    return providerManager.searchAll(query);
}
