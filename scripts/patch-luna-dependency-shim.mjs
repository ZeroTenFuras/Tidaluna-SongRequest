import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const distDir = new URL("../dist/", import.meta.url);
const pluginName = "@zerotenfuras/song-request";

const dependencyShimPattern = new RegExp(
	`luna\\.core\\.LunaPlugin\\.getByName\\("([^"]+)"\\)\\?\\.addDependant\\(luna\\.core\\.LunaPlugin\\.getByName\\("${escapeRegExp(pluginName)}"\\)\\)`,
	"g",
);

for (const fileName of await readdir(distDir)) {
	if (!fileName.endsWith(".mjs")) continue;

	const bundlePath = join(distDir.pathname, fileName);
	const originalBundle = await readFile(bundlePath, "utf8");
	const patchedBundle = originalBundle.replace(dependencyShimPattern, (_match, dependencyName) => {
		return `(()=>{let p=luna.core.LunaPlugin.getByName("${pluginName}");if(p instanceof luna.core.LunaPlugin)luna.core.LunaPlugin.getByName("${dependencyName}")?.addDependant(p)})()`;
	});

	if (patchedBundle === originalBundle) continue;

	await writeFile(bundlePath, patchedBundle);

	const packagePath = bundlePath.replace(/\.mjs$/, ".json");
	const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
	packageJson.hash = createHash("sha256").update(patchedBundle).digest("base64url").slice(0, 12);
	await writeFile(packagePath, JSON.stringify(packageJson));

	console.log(`Patched Luna dependency shim in ${fileName}`);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
