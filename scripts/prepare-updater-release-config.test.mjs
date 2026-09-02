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
