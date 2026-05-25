import { redux } from "@luna/lib";

import { defaultSettings, settings } from "./storage";
import type { TwitchChatMessage } from "./streamerBot";
import { addTrackToQueue, formatDuration, isTrackInQueue, resolveTrack, type ResolvedTrack } from "./tidal";
import { trace } from "./trace";

type ReplySender = (message: string) => Promise<void> | void;

type QueuedRequest = {
	trackId: redux.ItemId;
	userKey: string;
	userName: string;
	trackTitle: string;
	artists: string;
	addedAt: number;
};

const requestQueue: QueuedRequest[] = [];
let requestChain = Promise.resolve();

export function enqueueChatMessage(message: TwitchChatMessage, reply: ReplySender) {
	requestChain = requestChain
		.then(() => handleChatMessage(message, reply))
		.catch(trace.err.withContext("Handle chat song request"));
}

export function markTrackStarted(trackId: redux.ItemId) {
	const index = requestQueue.findIndex((request) => String(request.trackId) === String(trackId));
	if (index >= 0) requestQueue.splice(index, 1);
}

async function handleChatMessage(message: TwitchChatMessage, reply: ReplySender) {
	if (!settings.enabled) return;

	const text = message.text?.trim();
	if (!text) return;

	const command = getMatchingCommand(text);
	if (command === undefined) return;

	const query = text.slice(command.length).trim();
	if (!query) {
		await safeReply(reply, `Usage: ${command} artist - song or ${command} https://tidal.com/track/123`);
		return;
	}

	const userName = message.user?.name ?? message.user?.login ?? "viewer";
	const userKey = message.user?.id ?? message.user?.login ?? userName;

	pruneRequestsNoLongerQueued();
	if (isUserAtRequestLimit(userKey)) {
		await safeReply(reply, `@${userName}, you already have ${settings.maxRequestsPerUser} song request(s) waiting in the queue.`);
		return;
	}

	const track = await resolveTrack(query);
	if (track === undefined) {
		await safeReply(reply, `@${userName}, I could not find a TIDAL track for "${query}".`);
		return;
	}

	const rejection = getTrackRejection(track);
	if (rejection !== undefined) {
		await safeReply(reply, `@${userName}, ${rejection}`);
		return;
	}

	await addTrackToQueue(track);
	requestQueue.push({
		trackId: track.id,
		userKey,
		userName,
		trackTitle: track.title,
		artists: track.artists,
		addedAt: Date.now(),
	});

	await safeReply(reply, `@${userName}, added "${track.title}" by ${track.artists} to the TIDAL queue.`);
}

function getTrackRejection(track: ResolvedTrack) {
	if (!track.streamable) return `"${track.title}" is not streamable in this TIDAL account/region.`;

	if (settings.maxDurationSeconds > 0 && track.duration > settings.maxDurationSeconds) {
		return `"${track.title}" is ${formatDuration(track.duration)}, longer than the ${formatDuration(settings.maxDurationSeconds)} limit.`;
	}

	if (!settings.allowDuplicates && isDuplicate(track.id)) {
		return `"${track.title}" is already in the request queue.`;
	}

	return undefined;
}

function pruneRequestsNoLongerQueued() {
	for (let index = requestQueue.length - 1; index >= 0; index--) {
		if (!isTrackInQueue(requestQueue[index].trackId)) requestQueue.splice(index, 1);
	}
}

function isUserAtRequestLimit(userKey: string) {
	if (settings.maxRequestsPerUser <= 0) return false;
	return requestQueue.filter((request) => request.userKey === userKey).length >= settings.maxRequestsPerUser;
}

function isDuplicate(trackId: redux.ItemId) {
	const id = String(trackId);
	return requestQueue.some((request) => String(request.trackId) === id) || isTrackInQueue(trackId);
}

async function safeReply(reply: ReplySender, message: string) {
	if (!settings.chatReplies) return;
	await Promise.resolve(reply(message)).catch(trace.err.withContext("Send Streamer.bot chat reply"));
}

function getMatchingCommand(text: string) {
	return getRequestCommands().find((command) => matchesCommand(text, command));
}

function getRequestCommands() {
	const commands = parseCommands(settings.command);
	return commands.length > 0 ? [...new Set(commands)] : [defaultSettings.command];
}

function parseCommands(commandValue: string) {
	return commandValue
		.split(/[\s,;|]+/)
		.map(normalizeCommand)
		.filter((command): command is string => command !== undefined);
}

function normalizeCommand(command: string) {
	const normalized = command.trim();
	if (normalized === "") return undefined;
	return normalized.startsWith("!") ? normalized : `!${normalized}`;
}

function matchesCommand(text: string, command: string) {
	const lowerText = text.toLowerCase();
	const lowerCommand = command.toLowerCase();
	return lowerText === lowerCommand || lowerText.startsWith(`${lowerCommand} `);
}
