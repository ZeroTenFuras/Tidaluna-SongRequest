import React from "react";

import {
	LunaButtonSetting,
	LunaNumberSetting,
	LunaSettings,
	LunaSwitchSetting,
	LunaTextSetting,
} from "@luna/ui";

import { restartStreamerBot, stopStreamerBot } from "./runtime";
import { settings } from "./storage";

type TextChange = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SwitchChange = React.ChangeEvent<HTMLInputElement>;

export const Settings = () => {
	const [enabled, setEnabled] = React.useState(settings.enabled);
	const [host, setHost] = React.useState(settings.host);
	const [endpoint, setEndpoint] = React.useState(settings.endpoint);
	const [password, setPassword] = React.useState(settings.password);
	const [command, setCommand] = React.useState(settings.command);
	const [chatReplies, setChatReplies] = React.useState(settings.chatReplies);
	const [allowDuplicates, setAllowDuplicates] = React.useState(settings.allowDuplicates);
	const [autoPlayWhenIdle, setAutoPlayWhenIdle] = React.useState(settings.autoPlayWhenIdle);

	const reconnect = React.useCallback(() => {
		if (settings.enabled) restartStreamerBot();
		else stopStreamerBot();
	}, []);

	return (
		<LunaSettings>
			<LunaSwitchSetting
				title="Enable song requests"
				desc="Connect to Streamer.bot and listen for Twitch chat song request commands."
				checked={enabled}
				onChange={(_: SwitchChange, checked?: boolean) => {
					const nextEnabled = checked ?? false;
					setEnabled((settings.enabled = nextEnabled));
					if (nextEnabled) restartStreamerBot();
					else stopStreamerBot();
				}}
			/>
			<LunaTextSetting
				title="Streamer.bot host"
				desc="WebSocket Server address from Streamer.bot. The default is 127.0.0.1."
				value={host}
				onChange={(event: TextChange) => setHost((settings.host = event.target.value))}
				onBlur={reconnect}
			/>
			<LunaNumberSetting
				title="Streamer.bot port"
				desc="WebSocket Server port. The default is 8080."
				min={1}
				max={65535}
				value={settings.port}
				onNumber={(port: number) => {
					settings.port = port;
				}}
				onBlur={reconnect}
			/>
			<LunaTextSetting
				title="Streamer.bot endpoint"
				desc="WebSocket endpoint path. The default is /."
				value={endpoint}
				onChange={(event: TextChange) => setEndpoint((settings.endpoint = event.target.value))}
				onBlur={reconnect}
			/>
			<LunaTextSetting
				type="password"
				title="Streamer.bot password"
				desc="Only needed if WebSocket authentication is enabled or if chat replies should use SendMessage."
				value={password}
				onChange={(event: TextChange) => setPassword((settings.password = event.target.value))}
				onBlur={reconnect}
			/>
			<LunaTextSetting
				title="Request command"
				desc="Chat command used for song requests."
				value={command}
				onChange={(event: TextChange) => setCommand((settings.command = event.target.value))}
			/>
			<LunaNumberSetting
				title="Max song length"
				desc="Maximum request duration in seconds. Set to 0 to disable this limit."
				min={0}
				max={7200}
				value={settings.maxDurationSeconds}
				onNumber={(seconds: number) => {
					settings.maxDurationSeconds = seconds;
				}}
			/>
			<LunaNumberSetting
				title="Max queued requests per user"
				desc="How many pending requests a single chatter can have. Set to 0 for no limit."
				min={0}
				max={25}
				value={settings.maxRequestsPerUser}
				onNumber={(count: number) => {
					settings.maxRequestsPerUser = count;
				}}
			/>
			<LunaSwitchSetting
				title="Send chat replies"
				desc="Reply in Twitch chat through Streamer.bot after a request succeeds or fails."
				checked={chatReplies}
				onChange={(_: SwitchChange, checked?: boolean) => setChatReplies((settings.chatReplies = checked ?? false))}
			/>
			<LunaSwitchSetting
				title="Allow duplicate requests"
				desc="Allow the same track to be requested while it is already queued."
				checked={allowDuplicates}
				onChange={(_: SwitchChange, checked?: boolean) => setAllowDuplicates((settings.allowDuplicates = checked ?? false))}
			/>
			<LunaSwitchSetting
				title="Auto-play when idle"
				desc="Start playback immediately if TIDAL has no active queue when the first request arrives."
				checked={autoPlayWhenIdle}
				onChange={(_: SwitchChange, checked?: boolean) => setAutoPlayWhenIdle((settings.autoPlayWhenIdle = checked ?? false))}
			/>
			<LunaButtonSetting title="Reconnect to Streamer.bot" desc="Reconnect after changing connection settings." onClick={reconnect} />
		</LunaSettings>
	);
};
