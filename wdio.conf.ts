import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(root, "artifacts", "e2e");
const appBinary = path.join(
  root,
  "target",
  "debug",
  process.platform === "win32" ? "lingostack-app.exe" : "lingostack-app",
);

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./e2e/**/*.e2e.ts"],
  maxInstances: 1,
  logLevel: "info",
  outputDir: path.join(artifacts, "wdio"),
  waitforTimeout: 10_000,
  connectionRetryTimeout: 30_000,
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 30_000 },
  reporters: [
    [
      "junit",
      {
        outputDir: path.join(artifacts, "junit"),
        outputFileFormat: () => "results.xml",
        addWorkerLogs: true,
      },
    ],
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        driverProvider: "embedded",
        embeddedPort: 4445,
        appBinaryPath: appBinary,
        startTimeout: 90_000,
        commandTimeout: 30_000,
        statusPollTimeout: 10_000,
        captureBackendLogs: true,
        captureFrontendLogs: true,
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": { application: appBinary },
    },
  ],
  afterTest: async (_test, _context, { error }) => {
    if (error) {
      await mkdir(path.join(artifacts, "screenshots"), { recursive: true });
      const filename = `failure-${Date.now()}.png`;
      await browser.saveScreenshot(
        path.join(artifacts, "screenshots", filename),
      );
    }
  },
};
