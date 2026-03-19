import YTMusic from "ytmusic-api";

export interface SearchResult {
	videoId: string;
	title: string;
	artist: string;
	album: string;
	thumbnail: string;
	duration: number;
}

const ytmusic = new YTMusic();
let isInitialized = false;

async function initYTMusic() {
	if (!isInitialized) {
		await ytmusic.initialize();
		isInitialized = true;
	}
}

export async function searchMusic(query: string): Promise<SearchResult[]> {
	await initYTMusic();
	try {
		const songs = await ytmusic.searchSongs(query);

		return songs.slice(0, 25).map((song: any) => ({
			videoId: song.videoId,
			title: song.name,
			artist: song.artist?.name || "Unknown",
			album: song.album?.name || "",
			thumbnail:
				song.thumbnails && song.thumbnails.length > 0
					? song.thumbnails[song.thumbnails.length - 1].url
					: "",
			duration: song.duration || 0,
		}));
	} catch (error) {
		console.error("[RENE Music] searchMusic error:", error);
		return [];
	}
}
