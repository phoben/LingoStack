import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const text = (path) => readFile(new URL(path, root), "utf8");

function run(command, args) {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

const [
  appCargo,
  productionConfig,
  defaultCapability,
  e2eConfig,
  e2eCapability,
  updaterReleaseTemplate,
  releaseWorkflow,
] = await Promise.all([
  text("src-tauri/Cargo.toml"),
  text("src-tauri/tauri.conf.json"),
  text("src-tauri/capabilities/default.json"),
  text("src-tauri/tauri.e2e.conf.json"),
  text("src-tauri/capabilities/e2e.json"),
  text("src-tauri/tauri.release.conf.template.json"),
  text(".github/workflows/release.yml"),
]);
if (!appCargo.includes("optional = true") || !appCargo.includes("e2e =")) {
  throw new Error(
    "WDIO Cargo dependencies must remain optional behind the e2e feature",
  );
}
if (
  productionConfig.includes('"e2e"') ||
  productionConfig.includes('"withGlobalTauri": true') ||
  /wdio[-:]/.test(defaultCapability)
) {
  throw new Error("production config/capability must not grant WDIO access");
}
if (
  !/tauri-plugin-updater/.test(appCargo) ||
  !/updater:default/.test(defaultCapability)
) {
  throw new Error(
    "the main production window must have the official updater plugin and minimal ACL",
  );
}
if (
  !updaterReleaseTemplate.includes(
    "https://lsupdates.yugasoft.cn/channels/stable/latest.json",
  ) ||
  !updaterReleaseTemplate.includes("__TAURI_UPDATER_PUBLIC_KEY_AT_RELEASE__") ||
  /BEGIN (?:RSA |EC )?PRIVATE KEY/.test(updaterReleaseTemplate)
) {
  throw new Error(
    "release updater template must use the authoritative endpoint and contain no signing secret",
  );
}
if (
  !releaseWorkflow.includes("CDN_DOMAIN: ${{ vars.CDN_DOMAIN }}") ||
  !releaseWorkflow.includes("-not $env:CDN_DOMAIN")
) {
  throw new Error(
    "release workflow must obtain and validate CDN_DOMAIN from the production environment",
  );
}
if (
  !e2eConfig.includes('"withGlobalTauri": true') ||
  !e2eConfig.includes('"identifier": "dev.lingostack.e2e"') ||
  !/wdio:default/.test(e2eCapability) ||
  !/wdio-webdriver:default/.test(e2eCapability)
) {
  throw new Error("E2E overlay/capability must retain the isolated WDIO setup");
}
const tree = execFileSync("cargo", ["tree", "-p", "lingostack-app"], {
  cwd: root,
  encoding: "utf8",
});
if (/tauri-plugin-wdio/.test(tree)) {
  throw new Error("default cargo dependency graph includes a WDIO plugin");
}
run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["build"]);
for (const file of await files(
  fileURLToPath(new URL("../dist", import.meta.url)),
)) {
  if ((await readFile(file, "utf8")).includes("wdioTauri")) {
    throw new Error(
      `production frontend artifact contains WDIO bridge: ${file}`,
    );
  }
}
console.log("production isolation checks passed");
