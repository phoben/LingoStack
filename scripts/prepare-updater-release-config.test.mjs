import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { updaterReleaseConfig } from "./prepare-updater-release-config.mjs";

const template = await readFile(
  "src-tauri/tauri.release.conf.template.json",
  "utf8",
);
const developmentConfig = JSON.parse(
  await readFile("src-tauri/tauri.conf.json", "utf8"),
);
const releaseWorkflow = await readFile(".github/workflows/release.yml", "utf8");

function workflowStep(name, nextName) {
  const start = releaseWorkflow.indexOf(`      - name: ${name}`);
  assert.notEqual(start, -1, `workflow is missing ${name}`);
  const end = nextName
    ? releaseWorkflow.indexOf(`      - name: ${nextName}`, start + 1)
    : releaseWorkflow.length;
  return releaseWorkflow.slice(
    start,
    end === -1 ? releaseWorkflow.length : end,
  );
}

test("release updater config injects the public key and enables signed updater artifacts", () => {
  const rendered = updaterReleaseConfig(template, "public-key-value");
  const config = JSON.parse(rendered);
  assert.equal(config.plugins.updater.pubkey, "public-key-value");
  assert.deepEqual(config.plugins.updater.endpoints, [
    "https://lsupdates.yugasoft.cn/channels/stable/latest.json",
  ]);
  assert.equal(config.bundle.createUpdaterArtifacts, true);
});

test("development config does not opt normal builds into updater artifact generation", () => {
  assert.notEqual(developmentConfig.bundle?.createUpdaterArtifacts, true);
});

test("release updater config fails closed without a public key or with a private key", () => {
  assert.throws(() => updaterReleaseConfig(template, ""), /PUBLIC_KEY/);
  assert.throws(
    () => updaterReleaseConfig(template, "BEGIN PRIVATE KEY"),
    /public key/,
  );
});

test("release workflow installs a compatible pinned Tencent CLI and SDK pair", () => {
  assert.match(releaseWorkflow, /"tccli==3\.0\.1350\.1"/);
  assert.match(releaseWorkflow, /"tencentcloud-sdk-python==3\.0\.1350"/);
  assert.doesNotMatch(releaseWorkflow, /tencentcloud-cli/);
  const installStep = workflowStep(
    "Install verified Tencent COS publisher",
    "Publish immutable artifacts, then verify public signature",
  );
  assert.match(installStep, /& python scripts\/check-tccli-compatibility\.py/);
});

test("stable manifest upload passes the Windows path as an argv value, never Python source", () => {
  const stableStep = workflowStep(
    "Publish version manifest then stable manifest last",
    null,
  );
  assert.match(
    stableStep,
    /& python scripts\/publish-stable-manifest\.py --bucket "\$env:COS_BUCKET" --region "\$env:COS_REGION" --key "\$prefix\/channels\/stable\/latest\.json" --manifest "\$manifest"/,
  );
  assert.doesNotMatch(stableStep, /& python -c /);
});

test("release workflow fails fast when any native publisher command fails", () => {
  const steps = [
    [
      "Create ephemeral updater config",
      "Build signed NSIS installer",
      /& node/,
    ],
    [
      "Build signed NSIS installer",
      "Install verified Tencent COS publisher",
      /& pnpm/,
    ],
    [
      "Install verified Tencent COS publisher",
      "Publish immutable artifacts, then verify public signature",
      /& python -m pip install/,
    ],
    [
      "Publish immutable artifacts, then verify public signature",
      "Publish GitHub release before stable index",
      /& cargo run/,
    ],
    [
      "Publish GitHub release before stable index",
      "Publish version manifest then stable manifest last",
      /& gh release create/,
    ],
    [
      "Publish version manifest then stable manifest last",
      null,
      /& tccli cdn PurgePathCache/,
    ],
  ];

  for (const [name, nextName, command] of steps) {
    const step = workflowStep(name, nextName);
    assert.match(step, /\$ErrorActionPreference = 'Stop'/);
    assert.match(step, command);
    assert.match(step, /if \(\$LASTEXITCODE -ne 0\) \{ throw/);
    assert.doesNotMatch(step, /Invoke-External/);
  }

  const nativeInvocations = [
    ...releaseWorkflow.matchAll(
      /^\s*(?:\$\w+\s*=\s*)?&\s+(node|pnpm|python|cargo|gh|tccli)\b[^\r\n]*\r?\n([^\r\n]*)/gm,
    ),
  ];
  assert.equal(nativeInvocations.length, 14);
  for (const [, command, followingLine] of nativeInvocations) {
    assert.match(
      followingLine,
      new RegExp(
        `^\\s*if \\(\\$LASTEXITCODE -ne 0\\) \\{ throw "${command} failed with exit code \\$LASTEXITCODE" \\}$`,
      ),
      `${command} must be immediately followed by its exit-code guard`,
    );
  }
});

test(
  "PowerShell release checks preserve native arguments, failures, and captured notes",
  { skip: process.platform !== "win32" },
  () => {
    execFileSync(
      "pwsh",
      ["-NoProfile", "-File", "scripts/test-release-pwsh.ps1"],
      {
        cwd: process.cwd(),
        stdio: "inherit",
      },
    );
  },
);
