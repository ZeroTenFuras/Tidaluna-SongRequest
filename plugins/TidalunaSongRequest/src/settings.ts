import { ReactiveStore } from "@luna/core";

export const settings = await ReactiveStore.getPluginStorage("TidalunaSongRequest", {
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
});

export type SongRequestSettings = typeof settings;
