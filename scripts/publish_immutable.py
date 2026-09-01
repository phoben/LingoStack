"""Fail-closed immutable COS publishing using Tencent's official Python SDK.

The helper never relies on ETag: multipart ETags are not content SHA-256. Existing
objects are downloaded through the authenticated COS API and compared locally.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
from pathlib import Path
from typing import Protocol


class CosObjectClient(Protocol):
    def head_object(self, *, Bucket: str, Key: str) -> object: ...
    def download_file(self, Bucket: str, Key: str, DestFilePath: str) -> object: ...
    def put_object(self, *, Bucket: str, Key: str, Body: object, **kwargs: object) -> object: ...


class ImmutableConflict(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_not_found(error: Exception) -> bool:
    response = getattr(error, "get_status_code", None)
    return callable(response) and response() == 404


def is_precondition_failed(error: Exception) -> bool:
    response = getattr(error, "get_status_code", None)
    return callable(response) and response() == 412


def existing_object_matches(client: CosObjectClient, *, bucket: str, key: str, expected_sha256: str) -> bool:
    """Download an extant immutable object and compare content, never its ETag."""
    client.head_object(Bucket=bucket, Key=key)
    with tempfile.TemporaryDirectory(prefix="lingostack-cos-immutable-") as directory:
        downloaded = Path(directory) / "remote-object"
        client.download_file(bucket, key, str(downloaded))
        return sha256(downloaded) == expected_sha256


def publish_immutable(
    client: CosObjectClient,
    *,
    bucket: str,
    key: str,
    source: Path,
    cache_control: str,
) -> str:
    """Upload only absent objects; byte-compare existing objects before reuse."""
    if source.stat().st_size > 5 * 1024**3:
        raise RuntimeError("immutable publish requires an object no larger than COS's 5 GB put_object limit")
    local_sha256 = sha256(source)
    try:
        matches = existing_object_matches(
            client, bucket=bucket, key=key, expected_sha256=local_sha256
        )
    except Exception as error:  # COS exposes 404 through its SDK exception.
        if not is_not_found(error):
            raise RuntimeError(f"could not determine immutable object state for {key}") from error
        try:
            # COS's official SDK maps IfNoneMatch to If-None-Match. This gives
            # the absence probe a server-side no-overwrite guarantee, including
            # a concurrent publisher race. `put_object` is deliberately used
            # instead of multipart `upload_file`: updater installers are below
            # COS's 5 GB single-object limit and multipart completion has no
            # equivalent immutable-create precondition.
            with source.open("rb") as body:
                client.put_object(
                    Bucket=bucket,
                    Key=key,
                    Body=body,
                    EnableMD5=False,
                    IfNoneMatch="*",
                    CacheControl=cache_control,
                )
            return "uploaded"
        except Exception as upload_error:
            if not is_precondition_failed(upload_error):
                raise RuntimeError(f"could not create immutable COS object for {key}") from upload_error
            try:
                matches = existing_object_matches(
                    client, bucket=bucket, key=key, expected_sha256=local_sha256
                )
            except Exception as error:
                raise RuntimeError(f"could not verify concurrent immutable object for {key}") from error

    if not matches:
        raise ImmutableConflict(f"immutable COS object differs: {key}")
    return "reused"


def client_from_environment(region: str):
    try:
        from qcloud_cos import CosConfig, CosS3Client
    except ImportError as error:
        raise RuntimeError("cos-python-sdk-v5 must be installed by the release workflow") from error
    secret_id = os.environ.get("COS_SECRET_ID")
    secret_key = os.environ.get("COS_SECRET_KEY")
    if not secret_id or not secret_key:
        raise RuntimeError("COS_SECRET_ID and COS_SECRET_KEY are required")
    return CosS3Client(CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--cache-control", required=True)
    args = parser.parse_args()
    try:
        result = publish_immutable(
            client_from_environment(args.region),
            bucket=args.bucket,
            key=args.key,
            source=args.file,
            cache_control=args.cache_control,
        )
    except Exception as error:
        print(f"immutable publish failed: {error}", file=sys.stderr)
        return 1
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
