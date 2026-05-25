import { MediaItem } from "@luna/lib";

import { restartStreamerBot, startStreamerBot, stopStreamerBot } from "./runtime";
import { settings } from "./storage";
import { markTrackStarted } from "./songRequests";
import { trace, unloads } from "./trace";

export { Settings } from "./Settings";
export { settings, trace, unloads };
export { restartStreamerBot };

startStreamerBot();
unloads.add(stopStreamerBot);

MediaItem.onMediaTransition(unloads, async (mediaItem) => {
	markTrackStarted(mediaItem.id);
});

trace.msg.log(`TidaLuna song requests are ${settings.enabled ? "enabled" : "disabled"}.`);
