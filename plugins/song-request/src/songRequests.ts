import { redux } from "@luna/lib";

import { defaultSettings, settings } from "./storage";
import type { TwitchChatMessage } from "./streamerBot";
import { addTrackToQueue, formatDuration, isQueueUidInQueue, removeQueueUid, resolveTrack, type ResolvedTrack } from "./tidal";
import { trace } from "./trace";

type ReplySender = (message: string) => Promise<void> | void;

type QueuedRequest = {
	trackId: redux.ItemId;
	queueUid?: string;
	userKey: string;
	userName: string;
	trackTitle: string;
	artists: string;
	addedAt: number;
};

type ParsedCommand = {
	command: string;
	query: string;
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
	if (shouldIgnoreSharedChatMessage(message)) return;

	const text = getMessageText(message)?.trim();
	if (!text) return;

	const userName = message.user?.name ?? message.user?.login ?? "viewer";
	const userKey = getUserKey(message, userName);

	pruneRequestsNoLongerPending();

	const wrongSongCommand = parseCommandMessage(text, getWrongSongCommands());
	if (wrongSongCommand !== undefined) {
		await handleWrongSongCommand(wrongSongCommand, userKey, userName, reply);
		return;
	}

	const removeCommand = parseCommandMessage(text, getRemoveCommands());
	if (removeCommand !== undefined) {
		await handleRemoveCommand(removeCommand, message, userName, reply);
		return;
	}

	const request = parseCommandMessage(text, getRequestCommands());
	if (request === undefined) return;

	const { command, query } = request;
	trace.msg.log(`Matched song request command ${command}`);
	if (!query) {
		await safeReply(reply, `Usage: ${command} artist - song or ${command} https://tidal.com/track/123`);
		return;
	}

	if (isUserAtRequestLimit(userKey)) {
		await safeReply(reply, `@${userName}, you already have ${settings.maxRequestsPerUser} song request(s) waiting in the queue.`);
		return;
	}

	try {
		const track = await resolveTrack(query);
		if (track === undefined) {
			trace.msg.warn(`No TIDAL track found for request "${query}".`);
			await safeReply(reply, `@${userName}, I could not find a TIDAL track for "${query}".`);
			return;
		}

		trace.msg.log(`Resolved song request "${query}" to ${track.id}: ${track.title} by ${track.artists}.`);
		const rejection = getTrackRejection(track);
		if (rejection !== undefined) {
			trace.msg.warn(`Rejected song request ${track.id}: ${rejection}`);
			await safeReply(reply, `@${userName}, ${rejection}`);
			return;
		}

		const queueUid = await addTrackToQueue(track, getPendingRequestQueueUids());
		if (queueUid !== undefined) {
			requestQueue.push({
				trackId: track.id,
				queueUid,
				userKey,
				userName,
				trackTitle: track.title,
				artists: track.artists,
				addedAt: Date.now(),
			});
		} else {
			trace.msg.log(`Request ${track.id} is not pending in the plugin queue.`);
		}

		await safeReply(reply, `@${userName}, added "${track.title}" by ${track.artists} to the TIDAL queue.`);
	} catch (error) {
		trace.msg.err.withContext(`Failed to process song request "${query}"`)(error);
		await safeReply(reply, `@${userName}, I hit an error while adding that TIDAL request.`);
	}
}



function shouldIgnoreSharedChatMessage(message: TwitchChatMessage) {
	if (!settings.ignoreSharedChatGuestMessages) return false;

	const isGuestMessage = message.isFromSharedChatGuest === true || (message.isInSharedChat === true && message.isSharedChatHost === false);
	if (!isGuestMessage) return false;

	const source = message.sharedChatSource?.login ?? message.sharedChatSource?.name ?? "unknown shared chat";
	trace.msg.log(`Ignoring shared chat guest message from ${source}.`);
	return true;
}

function getMessageText(message: TwitchChatMessage) {
	for (const value of [message.text, message.message, message.rawInput, message.input]) {
		if (typeof value === "string" && value.trim() !== "") return value;
	}

	const partsText = message.parts
		?.map((part) => (typeof part.text === "string" ? part.text : ""))
		.join("")
		.trim();
	return partsText || undefined;
}


async function handleWrongSongCommand(command: ParsedCommand, userKey: string, userName: string, reply: ReplySender) {
	const request = findLatestOwnRequest(userKey);
	if (request === undefined) {
		await safeReply(reply, `@${userName}, you do not have any pending song request to remove.`);
		return;
	}

	const removed = removeQueuedRequest(request);
	if (!removed) {
		await safeReply(reply, `@${userName}, I could not remove your latest request because it is no longer pending.`);
		return;
	}

	trace.msg.log(`${userName} removed own request ${request.trackId} with ${command.command}.`);
	await safeReply(reply, `@${userName}, removed your request: "${request.trackTitle}" by ${request.artists}.`);
}

async function handleRemoveCommand(command: ParsedCommand, message: TwitchChatMessage, userName: string, reply: ReplySender) {
	if (!isModerator(message)) {
		await safeReply(reply, `@${userName}, only moderators can remove other users' song requests.`);
		return;
	}

	if (!command.query) {
		await safeReply(reply, `Usage: ${command.command} user/login or song title fragment`);
		return;
	}

	const request = findModerationRemovalRequest(command.query);
	if (request === undefined) {
		await safeReply(reply, `@${userName}, I could not find a pending request matching "${command.query}".`);
		return;
	}

	const removed = removeQueuedRequest(request);
	if (!removed) {
		await safeReply(reply, `@${userName}, I found that request but could not remove it because it is no longer pending.`);
		return;
	}

	trace.msg.log(`${userName} removed request ${request.trackId} from ${request.userName} with ${command.command}.`);
	await safeReply(reply, `@${userName}, removed ${request.userName}'s request: "${request.trackTitle}" by ${request.artists}.`);
}

function findLatestOwnRequest(userKey: string) {
	for (let index = requestQueue.length - 1; index >= 0; index--) {
		const request = requestQueue[index];
		if (request.userKey === userKey) return request;
	}
	return undefined;
}

function findModerationRemovalRequest(query: string) {
	const needle = normalizeLookup(query.replace(/^@/, ""));
	if (!needle) return undefined;

	return requestQueue.find((request) => {
		const haystacks = [request.userName, request.userKey, request.trackTitle, request.artists, `${request.trackTitle} ${request.artists}`];
		return haystacks.some((value) => normalizeLookup(String(value)).includes(needle));
	});
}

function removeQueuedRequest(request: QueuedRequest) {
	const index = requestQueue.indexOf(request);
	if (index >= 0) requestQueue.splice(index, 1);

	if (request.queueUid === undefined) return false;
	return removeQueueUid(request.queueUid);
}

function isModerator(message: TwitchChatMessage) {
	const user = message.user;
	if (user === undefined || user === null) return false;

	const type = user.type?.toLowerCase();
	if (type === "moderator" || type === "broadcaster") return true;
	if (typeof user.role === "number" && user.role >= 3) return true;

	return user.badges?.some((badge) => {
		const name = badge.name?.toLowerCase();
		return name === "moderator" || name === "broadcaster";
	}) ?? false;
}

function getUserKey(message: TwitchChatMessage, fallbackName: string) {
	return message.user?.id ?? message.user?.login ?? fallbackName;
}

function normalizeLookup(value: string) {
	return normalizeWhitespace(value).toLowerCase();
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

function pruneRequestsNoLongerPending() {
	for (let index = requestQueue.length - 1; index >= 0; index--) {
		const { queueUid } = requestQueue[index];
		if (queueUid !== undefined && !isQueueUidInQueue(queueUid)) requestQueue.splice(index, 1);
	}
}

function getPendingRequestQueueUids() {
	return requestQueue.map((request) => request.queueUid).filter((queueUid): queueUid is string => queueUid !== undefined);
}

function isUserAtRequestLimit(userKey: string) {
	if (settings.maxRequestsPerUser <= 0) return false;
	return requestQueue.filter((request) => request.userKey === userKey).length >= settings.maxRequestsPerUser;
}

function isDuplicate(trackId: redux.ItemId) {
	const id = String(trackId);
	return requestQueue.some((request) => String(request.trackId) === id);
}

async function safeReply(reply: ReplySender, message: string) {
	if (!settings.chatReplies) return;
	await Promise.resolve(reply(message)).catch(trace.err.withContext("Send Streamer.bot chat reply"));
}

function parseCommandMessage(text: string, commands: string[]): ParsedCommand | undefined {
	const match = normalizeWhitespace(text).match(/^(\S+)(?:\s+([\s\S]*))?$/);
	if (!match) return undefined;

	const messageCommand = normalizeCommandToken(match[1]);
	const command = commands.find((configuredCommand) => normalizeCommandToken(configuredCommand) === messageCommand);
	if (command === undefined) return undefined;

	return {
		command,
		query: match[2]?.trim() ?? "",
	};
}

function getRequestCommands() {
	return getConfiguredCommands(settings.command, defaultSettings.command);
}

function getRemoveCommands() {
	return getConfiguredCommands(settings.removeCommand, defaultSettings.removeCommand);
}

function getWrongSongCommands() {
	return getConfiguredCommands(settings.wrongSongCommand, defaultSettings.wrongSongCommand);
}

function getConfiguredCommands(commandValue: string | undefined, defaultCommand: string) {
	const commands = parseCommands(commandValue);
	return commands.length > 0 ? [...new Set(commands)] : [defaultCommand];
}

function parseCommands(commandValue: string | undefined) {
	return (commandValue ?? "")
		.split(/[\s,;|]+/)
		.map(normalizeCommand)
		.filter((command): command is string => command !== undefined);
}

function normalizeCommand(command: string) {
	const normalized = normalizeWhitespace(command);
	if (normalized === "") return undefined;
	return normalized.startsWith("!") ? normalized : `!${normalized}`;
}

function normalizeCommandToken(command: string) {
	return normalizeWhitespace(command).toLowerCase();
}

function normalizeWhitespace(value: string) {
	return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}
