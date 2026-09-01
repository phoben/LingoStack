import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { updaterReleaseConfig } from "./prepare-updater-release-config.mjs";

const template = await readFile(
  "src-tauri/tauri.release.conf.template.json",
  "utf8",
);

test("release updater config injects only a supplied public key", () => {
  const rendered = updaterReleaseConfig(template, "public-key-value");
  const config = JSON.parse(rendered);
  assert.equal(config.plugins.updater.pubkey, "public-key-value");
  assert.deepEqual(config.plugins.updater.endpoints, [
    "https://lsupdates.gridfriend.cn/channels/stable/latest.json",
  ]);
});

test("release updater config fails closed without a public key or with a private key", () => {
  assert.throws(() => updaterReleaseConfig(template, ""), /PUBLIC_KEY/);
  assert.throws(
    () => updaterReleaseConfig(template, "BEGIN PRIVATE KEY"),
    /public key/,
  );
});
