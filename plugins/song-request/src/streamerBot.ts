import { trace } from "./trace";

type StreamerBotRequest = Record<string, unknown> & {
	request: string;
};

type PendingRequest = {
	resolve: (message: StreamerBotMessage) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
};

export type TwitchChatMessage = {
	text?: unknown;
	message?: unknown;
	rawInput?: unknown;
	input?: unknown;
	messageId?: string | null;
	parts?: Array<{ text?: unknown }> | null;
	user?: {
		id?: string | null;
		login?: string | null;
		name?: string | null;
	} | null;
};

type StreamerBotMessage = {
	id?: string;
	status?: "ok" | "error";
	error?: string;
	request?: string;
	authentication?: {
		salt?: string;
		challenge?: string;
	};
	event?: {
		source?: string;
		type?: string;
	};
	data?: unknown;
};

export type StreamerBotConfig = {
	host: string;
	port: number;
	endpoint: string;
	password: string;
	autoReconnect: boolean;
};

export class StreamerBotSocket {
	private websocket?: WebSocket;
	private requestId = 0;
	private reconnectTimer?: ReturnType<typeof setTimeout>;
	private pending = new Map<string, PendingRequest>();
	private subscribed = false;
	private closedIntentionally = false;

	constructor(
		private readonly getConfig: () => StreamerBotConfig,
		private readonly onChatMessage: (message: TwitchChatMessage) => void,
	) {}

	public connect() {
		this.closedIntentionally = false;
		const existingState = this.websocket?.readyState;
		if (existingState === WebSocket.OPEN || existingState === WebSocket.CONNECTING) return;

		const url = this.buildUrl();
		trace.msg.log(`Connecting to Streamer.bot at ${url}`);
		this.websocket = new WebSocket(url);
		this.subscribed = false;

		this.websocket.addEventListener("message", (event) => {
			this.handleRawMessage(event.data).catch(trace.err.withContext("Streamer.bot message"));
		});
		this.websocket.addEventListener("close", () => {
			this.rejectPending(new Error("Streamer.bot websocket closed"));
			if (!this.closedIntentionally && this.getConfig().autoReconnect) this.scheduleReconnect();
		});
		this.websocket.addEventListener("error", () => {
			trace.msg.err("Streamer.bot websocket error");
		});
	}

	public disconnect() {
		this.closedIntentionally = true;
		if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = undefined;
		this.rejectPending(new Error("Streamer.bot websocket disconnected"));
		this.websocket?.close();
		this.websocket = undefined;
		this.subscribed = false;
	}

	public async sendChatMessage(message: string) {
		await this.sendRequest({
			request: "SendMessage",
			platform: "twitch",
			bot: true,
			internal: false,
			message,
		});
	}

	private async handleRawMessage(raw: unknown) {
		const message = this.parseMessage(raw);
		if (message === undefined) return;

		if (message.id !== undefined && this.pending.has(message.id)) {
			const pending = this.pending.get(message.id)!;
			clearTimeout(pending.timeout);
			this.pending.delete(message.id);
			if (message.status === "error") pending.reject(new Error(message.error ?? `Streamer.bot request ${message.id} failed`));
			else pending.resolve(message);
			return;
		}

		if (message.request === "Hello") {
			await this.handleHello(message);
			return;
		}

		if (message.event?.source === "Twitch" && message.event.type === "ChatMessage") {
			this.onChatMessage(message.data as TwitchChatMessage);
		}
	}

	private async handleHello(message: StreamerBotMessage) {
		const auth = message.authentication;
		const password = this.getConfig().password;

		if (auth?.salt && auth.challenge) {
			if (!password) {
				trace.msg.warn("Streamer.bot requested websocket authentication, but no password is configured.");
			} else {
				const authentication = await this.makeAuthentication(password, auth.salt, auth.challenge);
				await this.sendRequest({ request: "Authenticate", authentication });
			}
		}

		await this.subscribeToChat();
	}

	private async subscribeToChat() {
		if (this.subscribed) return;
		await this.sendRequest({
			request: "Subscribe",
			events: {
				Twitch: ["ChatMessage"],
			},
		});
		this.subscribed = true;
		trace.msg.log("Subscribed to Streamer.bot Twitch.ChatMessage events");
	}

	private sendRequest(payload: StreamerBotRequest) {
		const websocket = this.websocket;
		if (websocket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Streamer.bot websocket is not connected"));

		const id = `tidaluna-song-request-${++this.requestId}`;
		const request = { id, ...payload };

		return new Promise<StreamerBotMessage>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (!this.pending.has(id)) return;
				this.pending.delete(id);
				reject(new Error(`Streamer.bot request timed out: ${payload.request}`));
			}, 10000);

			this.pending.set(id, { resolve, reject, timeout });
			try {
				websocket.send(JSON.stringify(request));
			} catch (error) {
				clearTimeout(timeout);
				this.pending.delete(id);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private scheduleReconnect() {
		if (this.reconnectTimer !== undefined) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.connect();
		}, 5000);
	}

	private rejectPending(error: Error) {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pending.clear();
	}

	private parseMessage(raw: unknown): StreamerBotMessage | undefined {
		if (typeof raw !== "string") return undefined;
		try {
			return JSON.parse(raw) as StreamerBotMessage;
		} catch (error) {
			trace.msg.warn("Could not parse Streamer.bot websocket payload", error);
			return undefined;
		}
	}

	private buildUrl() {
		const { host, port } = this.getConfig();
		let endpoint = this.getConfig().endpoint.trim() || "/";
		if (!endpoint.startsWith("/")) endpoint = `/${endpoint}`;
		return `ws://${host}:${port}${endpoint}`;
	}

	private async makeAuthentication(password: string, salt: string, challenge: string) {
		const secret = await this.sha256Base64(password + salt);
		return this.sha256Base64(secret + challenge);
	}

	private async sha256Base64(value: string) {
		const bytes = new TextEncoder().encode(value);
		const hash = await crypto.subtle.digest("SHA-256", bytes);
		let binary = "";
		for (const byte of new Uint8Array(hash)) binary += String.fromCharCode(byte);
		return btoa(binary);
	}
}
