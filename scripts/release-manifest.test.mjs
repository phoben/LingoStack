import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createStaticManifest } from "./release-manifest.mjs";

async function fixture(signature = "valid-signature") {
  const dir = await mkdtemp(join(tmpdir(), "lingostack-update-manifest-"));
  const artifact = join(dir, "LingoStack_0.0.3_x64-setup.exe");
  const sig = `${artifact}.sig`;
  await Promise.all([
    writeFile(artifact, "installer"),
    writeFile(sig, signature),
  ]);
  return { artifact, sig };
}

test("creates the official static updater shape with HTTPS immutable URLs", async () => {
  const { artifact, sig } = await fixture();
  const manifest = await createStaticManifest({
    version: "0.0.3",
    artifact,
    signature: sig,
    baseUrl: "https://lsupdates.yugasoft.cn/",
    notes: "Fixed update flow.",
    publishedAt: "2026-08-31T00:00:00Z",
  });
  assert.deepEqual(manifest, {
    version: "0.0.3",
    notes: "Fixed update flow.",
    pub_date: "2026-08-31T00:00:00Z",
    platforms: {
      "windows-x86_64": {
        url: "https://lsupdates.yugasoft.cn/releases/0.0.3/windows-x86_64/LingoStack_0.0.3_x64-setup.exe",
        signature: "valid-signature",
      },
    },
  });
});

test("fails before a stable manifest is written for prereleases, bad URLs, or missing signatures", async () => {
  const { artifact, sig } = await fixture("");
  await assert.rejects(
    () =>
      createStaticManifest({
        version: "0.0.3-beta.1",
        artifact,
        signature: sig,
        baseUrl: "https://lsupdates.yugasoft.cn",
      }),
    /stable update version/,
  );
  await assert.rejects(
    () =>
      createStaticManifest({
        version: "0.0.3",
        artifact,
        signature: sig,
        baseUrl: "http://lsupdates.yugasoft.cn",
      }),
    /signature file is empty/,
  );
});

test("CLI carries GitHub release notes into the static manifest as plain text", async () => {
  const { artifact, sig } = await fixture();
  const notes = join(tmpdir(), `lingostack-release-notes-${Date.now()}.md`);
  const output = join(
    tmpdir(),
    `lingostack-release-manifest-${Date.now()}.json`,
  );
  await writeFile(notes, "- Fixed automatic updates\n");

  execFileSync(
    process.execPath,
    [
      "scripts/release-manifest.mjs",
      "create",
      "--version",
      "0.0.3",
      "--artifact",
      artifact,
      "--signature",
      sig,
      "--base-url",
      "https://lsupdates.yugasoft.cn",
      "--notes-file",
      notes,
      "--output",
      output,
    ],
    { cwd: process.cwd() },
  );

  assert.equal(
    JSON.parse(await readFile(output, "utf8")).notes,
    "- Fixed automatic updates\n",
  );
});
