"""从 COS 源站读取稳定清单并校验发布版本。"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Protocol


class CosObjectClient(Protocol):
    def get_object(self, *, Bucket: str, Key: str) -> dict[str, object]: ...


def read_manifest_version(client: CosObjectClient, *, bucket: str, key: str) -> str:
    response = client.get_object(Bucket=bucket, Key=key)
    body = response.get("Body")
    if body is None or not hasattr(body, "get_raw_stream"):
        raise RuntimeError("COS stable manifest response has no readable body")
    try:
        content = body.get_raw_stream().read()
        manifest = json.loads(content)
    except (AttributeError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("COS stable manifest is not valid JSON") from error
    version = manifest.get("version") if isinstance(manifest, dict) else None
    if not isinstance(version, str) or not version:
        raise RuntimeError("COS stable manifest has no version")
    return version


def verify_stable_version(
    client: CosObjectClient, *, bucket: str, key: str, expected_version: str
) -> None:
    actual_version = read_manifest_version(client, bucket=bucket, key=key)
    if actual_version != expected_version:
        raise RuntimeError(
            f"COS stable manifest version is {actual_version}, expected {expected_version}"
        )


def client_from_environment(region: str):
    try:
        from qcloud_cos import CosConfig, CosS3Client
    except ImportError as error:
        raise RuntimeError("cos-python-sdk-v5 must be installed by the release workflow") from error
    secret_id = os.environ.get("COS_SECRET_ID")
    secret_key = os.environ.get("COS_SECRET_KEY")
    if not secret_id or not secret_key:
        raise RuntimeError("COS_SECRET_ID and COS_SECRET_KEY are required")
    return CosS3Client(
        CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    try:
        verify_stable_version(
            client_from_environment(args.region),
            bucket=args.bucket,
            key=args.key,
            expected_version=args.version,
        )
    except Exception as error:
        print(f"stable manifest verification failed: {error}", file=sys.stderr)
        return 1
    print(args.version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
