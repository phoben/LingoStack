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
  schema_version: 2,
  ui_language: "zh",
  providers: [
    {
      id: "e2e",
      protocol: "open_ai_responses",
      preset_id: "openai-responses",
      name: "OpenAI Responses E2E fixture",
      base_url: "https://api.openai.com",
      api_key: "not-a-real-key",
      auth: "bearer",
      parameter_profile: {
        protocol: "open_ai_responses",
        endpoint_scope: "https://api.openai.com",
        supports_temperature: true,
        max_output_field: "max_output_tokens",
        supports_reasoning: true,
      },
      models: [
        {
          id: "lingostack-e2e",
          origin: "user_entered",
          supported_features: [
            "translate",
            "naming",
            "explain",
            "doc_translate",
          ],
          supports_temperature: true,
          supports_max_output: true,
          supports_reasoning: true,
        },
      ],
    },
  ],
  models: {
    translate: {
      provider_id: "e2e",
      model: "lingostack-e2e",
      generation: {
        max_output_tokens: 256,
        reasoning_effort: "low",
      },
    },
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
