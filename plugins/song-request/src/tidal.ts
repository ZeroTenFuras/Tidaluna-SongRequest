import { MediaItem, PlayState, redux, TidalApi } from "@luna/lib";

import { settings } from "./storage";
import { trace, unloads } from "./trace";

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

export async function addTrackToQueue(track: ResolvedTrack, pendingRequestQueueUids: string[] = []) {
	await MediaItem.fromId(track.id, "track");

	if (settings.autoPlayWhenIdle && isPlayerIdle()) {
		trace.msg.log(`Starting requested track ${track.id} because the player is idle.`);
		PlayState.play(track.id);
		return undefined;
	}

	const beforeUids = new Set(PlayState.playQueue.elements.map((element) => element.uid));
	const insertIndex = getRequestInsertIndex(pendingRequestQueueUids);
	trace.msg.log(`Adding requested track ${track.id} to the TIDAL queue at index ${insertIndex}.`);
	redux.actions["playQueue/ADD_AT_INDEX"]({
		context: { type: "search" },
		mediaItemIds: [track.id],
		index: insertIndex,
	});

	const queuedElement = await waitForQueuedElement(track.id, beforeUids);
	if (queuedElement === undefined) trace.msg.warn(`Could not determine queue uid for requested track ${track.id}. FIFO ordering may be less accurate for the next request.`);
	return queuedElement?.uid;
}

async function waitForQueuedElement(trackId: redux.ItemId, beforeUids: Set<string>) {
	for (let attempt = 0; attempt < 10; attempt++) {
		const queuedElement = PlayState.playQueue.elements.find((element) => !beforeUids.has(element.uid) && String(element.mediaItemId) === String(trackId));
		if (queuedElement !== undefined) return queuedElement;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return undefined;
}

export function isQueueUidInQueue(queueUid: string) {
	return PlayState.playQueue.elements.some((element) => element.uid === queueUid);
}

export function removeQueueUid(queueUid: string) {
	if (!isQueueUidInQueue(queueUid)) return false;
	redux.actions["playQueue/REMOVE_ELEMENT"]({ uid: queueUid });
	return true;
}

function getRequestInsertIndex(pendingRequestQueueUids: string[]) {
	const { currentIndex, elements } = PlayState.playQueue;
	let insertIndex = Math.max(0, currentIndex + 1);

	for (const queueUid of pendingRequestQueueUids) {
		const requestIndex = elements.findIndex((element) => element.uid === queueUid);
		if (requestIndex >= insertIndex) insertIndex = requestIndex + 1;
	}

	return insertIndex;
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
	const response = await searchTrackWithRedux(query).catch(trace.err.withContext("TIDAL redux search"));
	const reduxTracks = response?.tracks.items ?? [];
	trace.msg.log(`TIDAL search for "${query}" returned ${reduxTracks.length} track(s).`);

	const reduxTrack = pickBestTrack(reduxTracks);
	if (reduxTrack !== undefined) return reduxTrack;

	const apiTracks = await searchTrackWithApi(query);
	return pickBestTrack(apiTracks);
}

async function searchTrackWithRedux(query: string) {
	return redux.interceptActionResp(
		() => redux.actions["search/SEARCH_TRACK_FOR_TRACK_PICKER"]({ searchPhrase: query, limit: 5 }),
		unloads,
		["search/SEARCH_RESULT_SUCCESS"],
		["search/SEARCH_RESULT_FAIL"],
		{ timeoutMs: 10000 },
	);
}

async function searchTrackWithApi(query: string) {
	const encodedQuery = encodeURIComponent(query);
	const queryArgs = TidalApi.queryArgs();
	const urls = [
		`https://desktop.tidal.com/v1/search/tracks?query=${encodedQuery}&limit=5&offset=0&${queryArgs}`,
		`https://desktop.tidal.com/v1/search?query=${encodedQuery}&types=TRACKS&limit=5&offset=0&${queryArgs}`,
	];
	const tracks: redux.Track[] = [];

	for (const url of urls) {
		const response = await TidalApi.fetch<SearchTracksResponse>(url).catch(trace.err.withContext("TIDAL API search"));
		tracks.push(...(response?.items ?? response?.tracks?.items ?? []));
	}

	trace.msg.log(`TIDAL API fallback search for "${query}" returned ${tracks.length} track(s).`);
	return tracks;
}

function pickBestTrack(tracks: redux.Track[]) {
	return tracks.find(isTrackStreamable) ?? tracks[0];
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
