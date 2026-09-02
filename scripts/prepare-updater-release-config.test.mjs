import assert from "node:assert/strict";
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

test("release workflow installs the pinned official tccli package", () => {
  assert.match(releaseWorkflow, /"tccli==3\.0\.1350\.1"/);
  assert.doesNotMatch(releaseWorkflow, /tencentcloud-cli/);
});

test("release workflow fails fast when any native publisher command fails", () => {
  const steps = [
    [
      "Create ephemeral updater config",
      "Build signed NSIS installer",
      /Invoke-External node/,
    ],
    [
      "Build signed NSIS installer",
      "Install verified Tencent COS publisher",
      /Invoke-External pnpm/,
    ],
    [
      "Install verified Tencent COS publisher",
      "Publish immutable artifacts, then verify public signature",
      /Invoke-External python -m pip install/,
    ],
    [
      "Publish immutable artifacts, then verify public signature",
      "Publish GitHub release before stable index",
      /Invoke-External cargo run/,
    ],
    [
      "Publish GitHub release before stable index",
      "Publish version manifest then stable manifest last",
      /Invoke-External gh release create/,
    ],
    [
      "Publish version manifest then stable manifest last",
      null,
      /Invoke-External tccli cdn PurgePathCache/,
    ],
  ];

  for (const [name, nextName, command] of steps) {
    const step = workflowStep(name, nextName);
    assert.match(step, /\$ErrorActionPreference = 'Stop'/);
    assert.match(step, /function Invoke-External/);
    assert.match(step, command);
    assert.match(step, /if \(\$LASTEXITCODE -ne 0\) \{ throw/);
    assert.doesNotMatch(step, /^\s+(?:cargo|gh|node|pnpm|python|tccli)\s/m);
  }
});
