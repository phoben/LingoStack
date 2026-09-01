import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const marker = "__TAURI_UPDATER_PUBLIC_KEY_AT_RELEASE__";

export function updaterReleaseConfig(template, publicKey) {
  if (!publicKey?.trim() || publicKey.includes("PRIVATE KEY")) {
    throw new Error(
      "TAURI_UPDATER_PUBLIC_KEY must contain the updater public key only.",
    );
  }
  const config = JSON.parse(template);
  if (config.plugins?.updater?.pubkey !== marker) {
    throw new Error(
      "updater release template marker is missing; refusing to overwrite it.",
    );
  }
  config.plugins.updater.pubkey = publicKey.trim();
  return `${JSON.stringify(config, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , output] = process.argv;
  if (!output)
    throw new Error("usage: prepare-updater-release-config.mjs <output-path>");
  const template = await readFile(
    "src-tauri/tauri.release.conf.template.json",
    "utf8",
  );
  const rendered = updaterReleaseConfig(
    template,
    process.env.TAURI_UPDATER_PUBLIC_KEY,
  );
  await writeFile(output, rendered, { encoding: "utf8", mode: 0o600 });
}
