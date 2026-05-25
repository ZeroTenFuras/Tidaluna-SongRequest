import { MediaItem, PlayState, redux, TidalApi } from "@luna/lib";

import { settings } from "./storage";
import { trace } from "./trace";

type SearchTracksResponse = {
	items?: redux.Track[];
	tracks?: {
		items?: redux.Track[];
	};
};

export type ResolvedTrack = {
	id: redux.ItemId;
	title: string;
	artists: string;
	duration: number;
	url: string;
	explicit: boolean;
	streamable: boolean;
};

export async function resolveTrack(input: string): Promise<ResolvedTrack | undefined> {
	const trackId = extractTidalTrackId(input);
	if (trackId !== undefined) return resolveTrackById(trackId);

	const track = await searchTrack(input);
	if (track === undefined) return undefined;

	const mediaItem = await MediaItem.fromId(track.id, "track");
	return toResolvedTrack(mediaItem?.tidalItem ?? track);
}

export async function addTrackToQueue(track: ResolvedTrack) {
	await MediaItem.fromId(track.id, "track");

	if (settings.autoPlayWhenIdle && isPlayerIdle()) {
		PlayState.play(track.id);
		return;
	}

	redux.actions["playQueue/ADD_LAST"]({
		context: { type: "search" },
		mediaItemIds: [track.id],
	});
}

export function isTrackInQueue(trackId: redux.ItemId) {
	const id = String(trackId);
	return PlayState.playQueue.elements.some((element: redux.PlayQueueElement) => String(element.mediaItemId) === id);
}

export function formatDuration(seconds: number) {
	const minutes = Math.floor(seconds / 60);
	const rest = Math.floor(seconds % 60);
	return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

async function resolveTrackById(trackId: redux.ItemId) {
	const mediaItem = await MediaItem.fromId(trackId, "track");
	if (mediaItem === undefined) return undefined;
	return toResolvedTrack(mediaItem.tidalItem);
}

async function searchTrack(query: string) {
	const encodedQuery = encodeURIComponent(query);
	const queryArgs = TidalApi.queryArgs();
	const urls = [
		`https://desktop.tidal.com/v1/search/tracks?query=${encodedQuery}&limit=5&offset=0&${queryArgs}`,
		`https://desktop.tidal.com/v1/search?query=${encodedQuery}&types=TRACKS&limit=5&offset=0&${queryArgs}`,
	];

	for (const url of urls) {
		const response = await TidalApi.fetch<SearchTracksResponse>(url).catch(trace.err.withContext("TIDAL search"));
		const tracks = response?.items ?? response?.tracks?.items ?? [];
		const streamableTrack = tracks.find(isTrackStreamable);
		if (streamableTrack !== undefined) return streamableTrack;
		if (tracks[0] !== undefined) return tracks[0];
	}

	return undefined;
}

function toResolvedTrack(track: redux.Track): ResolvedTrack {
	return {
		id: track.id,
		title: formatTitle(track),
		artists: formatArtists(track),
		duration: track.duration,
		url: track.url ?? `https://tidal.com/track/${track.id}`,
		explicit: track.explicit,
		streamable: isTrackStreamable(track),
	};
}

function extractTidalTrackId(input: string): redux.ItemId | undefined {
	const trimmed = input.trim();
	if (/^\d+$/.test(trimmed)) return trimmed;

	const match = trimmed.match(/tidal\.com\/(?:browse\/)?track\/(\d+)/i);
	return match?.[1];
}

function formatArtists(track: redux.Track) {
	const artists = track.artists?.map((artist) => artist.name).filter(Boolean) ?? [];
	if (artists.length > 0) return artists.join(", ");
	return track.artist?.name ?? "Unknown artist";
}

function formatTitle(track: redux.Track) {
	return track.version ? `${track.title} (${track.version})` : track.title;
}

function isTrackStreamable(track: redux.Track) {
	return track.allowStreaming && track.streamReady;
}

function isPlayerIdle() {
	const playbackContext = PlayState.playbackContext;
	const hasCurrentProduct = playbackContext?.actualProductId !== undefined && playbackContext.actualProductId !== null;
	return !hasCurrentProduct && PlayState.playQueue.elements.length === 0;
}
