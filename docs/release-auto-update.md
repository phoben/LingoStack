# Windows stable automatic-update release runbook

The executable repository contract for versioning, GitHub Environment secrets,
Tencent COS/CDN setup, deployment order and acceptance evidence is
`.trellis/spec/lingostack-app/backend/version-release-deployment.md`.

This runbook covers the Windows x64 NSIS channel only. The application reads one
signed static Tauri manifest from `https://lsupdates.yugasoft.cn/channels/stable/latest.json`.
GitHub Releases are a public download mirror and changelog, never an in-app update endpoint.

## One-time production gate

Before the first release, an authorized maintainer must configure the CDN domain
with DNS, TLS, a private COS origin and origin authentication. The stable manifest
must use `no-cache` (or a very short TTL); `releases/` and `manifests/<version>/`
must be immutable, long-cache paths. Enable COS versioning and retain previous
stable-manifest object versions.

Create a Tauri updater signing key outside the repository. Store the **private**
key and its password only in the protected GitHub `production` environment and an
independent offline encrypted backup. Record the public-key fingerprint, key owner,
backup-location category and recovery-drill date in the maintainer security record;
do not put private material, password, cloud credentials, or the record itself in
this repository. A completed restore drill is required before stable publication.

The protected `production` environment must contain these secrets:

- `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `TAURI_UPDATER_PUBLIC_KEY`
- `COS_SECRET_ID`, `COS_SECRET_KEY`

It must also contain these non-secret variables: `COS_BUCKET`, `COS_REGION`,
`COS_PREFIX`, and `CDN_DOMAIN`. The CAM identity is limited to object operations
under that prefix and the operation-level `PurgePathCache` permission; Tencent CDN
requires resource `*` for that single action, so no other CDN action may be granted.
It must not administer buckets or delete broad objects. A production-environment
approval is required for every publishing job.

## Publish

1. Ensure the three repository versions match and all release gates pass.
2. Create and push a final `vX.Y.Z` tag. Pre-release tags must not use this flow.
3. Review the no-secret `preflight` result, then approve the `production` job.
4. The job builds a signed NSIS artifact with an ephemeral config. For every
   immutable artifact, signature, and versioned manifest it probes COS exactly:
   an absent object is created with the COS `If-None-Match: *` precondition; an
   existing object is authenticated-downloaded and SHA-256 compared before it is
   reused; a mismatch or uncertain probe stops the release. It never treats an
   ETag (including a multipart ETag) as a content hash. The job then downloads
   the final public CDN `.exe` and `.sig` and verifies them with the production
   updater public key using the same Minisign verifier and base64 encoding as
   Tauri Updater. Only after that and GitHub Release publication does it replace
   `channels/stable/latest.json`.
5. Independently inspect the public manifest, cache headers, GitHub release and
   versioned URLs. From an older Windows NSIS installation, perform a staging
   discovery → explicit download → install → restart test and verify local config remains.

## Failed or bad release

If any step before the final stable-manifest write fails, do not manually publish
the stable manifest. Correct the failure and rerun after checking immutable objects
are byte-for-byte identical. If a bad stable version was published, restore the
previous healthy stable manifest version in COS, purge only its CDN path, and then
publish a higher-version repair. This protects clients that have not upgraded; it
does not downgrade already updated clients. Clients that cannot start use the
GitHub Release installer for manual recovery.

Never rotate the updater trust root by silently replacing a key. First release a
bridge version signed by the old key that embeds the new public key. If the old
private key is lost or compromised, stop automatic publication and use manual
reinstallation; existing clients cannot be safely migrated by assertion alone.

## Tooling evidence and local checks

The release workflow pins Tencent's official `cos-python-sdk-v5==1.9.44` for
COS object API calls and `tccli==3.0.1350.1` for the narrowly scoped CDN purge.
Every native command in a PowerShell release step is invoked directly and followed
immediately by an explicit `$LASTEXITCODE` check, so dependency installation,
upload, signing, GitHub Release, manifest, or CDN purge failures stop publication
immediately. Do not forward these arguments through an advanced function with
`ValueFromRemainingArguments`: PowerShell may bind native flags such as Cargo's
`-p` as the function's common parameters before the child command starts. The
Windows behavior test covers dash-prefixed arguments, fail-before-next-action,
and captured release-note stdout in a real `pwsh` process.

Likewise, never interpolate a Windows file path into `python -c` source: escape
sequences such as `\a` can silently change the path before the COS SDK sees it.
The stable write must call `scripts/publish-stable-manifest.py` and pass bucket,
region, object key, and manifest path as separate arguments. The helper validates
the local manifest before reading credentials or creating a COS client; its
offline dry-run neither reads secrets nor contacts COS.
The immutable helper uses `head_object`, `download_file`, and a conditional
`put_object`; it does not use SDK multipart ETags for identity.

Tauri CLI has no signer verification subcommand. The release verifier therefore
uses `minisign-verify==0.2.5`, the audited verifier already used by
`tauri-plugin-updater 2.10.1`, and mirrors that plugin's documented source
decoding order: base64 updater value → Minisign public key/signature → signature
verification. `pnpm test:release` proves absent/same/different/probe-error COS
branches and valid/tampered Tauri-encoded Minisign fixtures with no cloud call.
The public CDN verification occurs only in a protected release job; it cannot be
claimed as completed until an approved production release runs.
