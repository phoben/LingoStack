import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const target = "windows-x86_64";

function required(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`missing required --${name}`);
  return value;
}

export function parseOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value)
      throw new Error("options must be --name value pairs");
    options.set(key.slice(2), value);
  }
  return options;
}

export async function createStaticManifest({
  version,
  artifact,
  signature,
  baseUrl,
  notes = "",
  publishedAt,
}) {
  if (!SEMVER.test(version) || version.includes("-")) {
    throw new Error(
      "stable update version must be a release SemVer without a prerelease suffix",
    );
  }
  const artifactPath = resolve(artifact);
  const signaturePath = resolve(signature);
  if (!artifactPath.endsWith(".exe") || !signaturePath.endsWith(".exe.sig")) {
    throw new Error(
      "expected a Windows NSIS .exe and matching .exe.sig signature",
    );
  }
  await Promise.all([stat(artifactPath), stat(signaturePath)]);
  const signatureText = (await readFile(signaturePath, "utf8")).trim();
  if (!signatureText) throw new Error("signature file is empty");
  const root = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (root.protocol !== "https:")
    throw new Error("update artifacts must use HTTPS URLs");
  const releasePath = `releases/${version}/${target}/${basename(artifactPath)}`;
  return {
    version,
    notes,
    pub_date: publishedAt ?? new Date().toISOString(),
    platforms: {
      [target]: {
        url: new URL(releasePath, root).toString(),
        signature: signatureText,
      },
    },
  };
}

export async function assertRepositoryVersion(version) {
  if (!SEMVER.test(version)) throw new Error("tag version is not valid SemVer");
  const [packageJson, cargoToml, tauriConfig] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("Cargo.toml", "utf8"),
    readFile("src-tauri/tauri.conf.json", "utf8"),
  ]);
  const packageVersion = JSON.parse(packageJson).version;
  const tauriVersion = JSON.parse(tauriConfig).version;
  const workspace = cargoToml.match(
    /\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
  )?.[1];
  if (
    [packageVersion, tauriVersion, workspace].some((item) => item !== version)
  ) {
    throw new Error(`repository versions must all equal ${version}`);
  }
}

if (process.argv[1]?.endsWith("release-manifest.mjs")) {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (command === "assert-version") {
    await assertRepositoryVersion(required(options, "version"));
  } else if (command === "create") {
    const notesFile = options.get("notes-file");
    const manifest = await createStaticManifest({
      version: required(options, "version"),
      artifact: required(options, "artifact"),
      signature: required(options, "signature"),
      baseUrl: required(options, "base-url"),
      notes: notesFile
        ? await readFile(notesFile, "utf8")
        : (options.get("notes") ?? ""),
      publishedAt: options.get("published-at"),
    });
    await writeFile(
      required(options, "output"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  } else {
    throw new Error(
      "usage: release-manifest.mjs <assert-version|create> [--name value]",
    );
  }
}
