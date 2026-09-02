"""Publish the mutable stable manifest after every immutable release check passes."""

import argparse
import json
import os
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.dry_run:
        print(
            json.dumps(
                {
                    "bucket": args.bucket,
                    "region": args.region,
                    "key": args.key,
                    "manifest": str(args.manifest),
                }
            )
        )
        return

    if not args.manifest.is_file():
        raise SystemExit(f"--manifest must name an existing file: {args.manifest}")

    secret_id = os.environ["COS_SECRET_ID"]
    secret_key = os.environ["COS_SECRET_KEY"]
    from qcloud_cos import CosConfig, CosS3Client

    client = CosS3Client(
        CosConfig(Region=args.region, SecretId=secret_id, SecretKey=secret_key)
    )
    client.upload_file(
        args.bucket,
        args.key,
        str(args.manifest),
        CacheControl="no-cache",
    )


if __name__ == "__main__":
    main()
