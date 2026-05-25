import { ReactiveStore } from "@luna/core";

export const defaultSettings = {
	enabled: true,
	host: "127.0.0.1",
	port: 8080,
	endpoint: "/",
	password: "",
	command: "!sr",
	maxDurationSeconds: 600,
	maxRequestsPerUser: 2,
	allowDuplicates: false,
	chatReplies: true,
	autoPlayWhenIdle: true,
};

export type SongRequestSettings = typeof defaultSettings;

export const settings: SongRequestSettings = await ReactiveStore.getPluginStorage("TidalunaSongRequest", defaultSettings).catch((error) => {
	console.warn("[TidalunaSongRequest] Failed to open plugin storage; using in-memory defaults.", error);
	return { ...defaultSettings };
});
