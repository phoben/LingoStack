import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = new URL("..", import.meta.url);
const artifactDir = new URL("../artifacts/e2e", import.meta.url);

function pnpm(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `pnpm ${args.join(" ")} failed (${signal ?? code ?? "unknown"})`,
          ),
        );
    });
  });
}

const fixtureConfig = {
  ui_language: "zh",
  providers: [
    {
      id: "e2e",
      kind: "open_ai_compatible",
      name: "E2E fixture",
      base_url: "lingostack-e2e://fixture",
      api_key: "not-a-real-key",
      models: ["lingostack-e2e"],
    },
  ],
  models: {
    translate: { provider_id: "e2e", model: "lingostack-e2e" },
    global_default: { provider_id: "e2e", model: "lingostack-e2e" },
  },
};

let tempDir;
try {
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });
  await mkdir(new URL("./screenshots", artifactDir), { recursive: true });
  await mkdir(new URL("./logs", artifactDir), { recursive: true });
  tempDir = await mkdtemp(join(tmpdir(), "lingostack-e2e-"));
  const configPath = join(tempDir, "config.json");
  await writeFile(configPath, JSON.stringify(fixtureConfig), "utf8");
  await pnpm(["test:e2e:build"]);
  await pnpm(["test:e2e:run"], {
    ...process.env,
    LINGOSTACK_E2E_CONFIG_PATH: configPath,
  });
} finally {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
}
