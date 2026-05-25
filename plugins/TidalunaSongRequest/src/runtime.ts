import { settings } from "./settings";
import { enqueueChatMessage } from "./songRequests";
import { StreamerBotSocket } from "./streamerBot";
import { trace } from "./trace";

let socket: StreamerBotSocket | undefined;

export function startStreamerBot() {
	if (!settings.enabled) return;

	socket?.disconnect();
	socket = new StreamerBotSocket(
		() => ({
			host: settings.host.trim() || "127.0.0.1",
			port: Number(settings.port) || 8080,
			endpoint: settings.endpoint.trim() || "/",
			password: settings.password,
			autoReconnect: settings.enabled,
		}),
		(message) => enqueueChatMessage(message, sendReply),
	);
	socket.connect();
}

export function stopStreamerBot() {
	socket?.disconnect();
	socket = undefined;
}

export function restartStreamerBot() {
	stopStreamerBot();
	startStreamerBot();
}

async function sendReply(message: string) {
	if (!socket) return;
	await socket.sendChatMessage(message).catch(trace.err.withContext("Streamer.bot SendMessage"));
}
