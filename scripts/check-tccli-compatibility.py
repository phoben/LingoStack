"""Fail closed if the installed Tencent CLI and Python SDK cannot work together."""

import importlib.metadata
import subprocess
import sys
import sysconfig
from pathlib import Path


EXPECTED_TCCLI = "3.0.1350.1"
EXPECTED_SDK = "3.0.1350"


def installed_version(distribution):
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError as error:
        raise RuntimeError(f"required package is not installed: {distribution}") from error


def tccli_executable():
    name = "tccli.exe" if sys.platform == "win32" else "tccli"
    return Path(sysconfig.get_path("scripts")) / name


def main():
    tccli = installed_version("tccli")
    sdk = installed_version("tencentcloud-sdk-python")
    if tccli != EXPECTED_TCCLI or sdk != EXPECTED_SDK:
        raise RuntimeError(
            "incompatible Tencent CLI/SDK versions: "
            f"tccli={tccli}, tencentcloud-sdk-python={sdk}; "
            f"expected tccli={EXPECTED_TCCLI}, tencentcloud-sdk-python={EXPECTED_SDK}"
        )

    executable = tccli_executable()
    try:
        result = subprocess.run(
            [str(executable), "--version"],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as error:
        raise RuntimeError(f"tccli executable is unavailable: {executable}") from error
    if result.returncode != 0:
        raise RuntimeError(
            f"tccli compatibility check failed with exit code {result.returncode}"
        )
    if result.stdout.strip() != EXPECTED_TCCLI:
        raise RuntimeError(
            f"tccli --version returned {result.stdout.strip()!r}, expected {EXPECTED_TCCLI!r}"
        )
    print(f"tccli compatibility verified: tccli={tccli}, sdk={sdk}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(f"tccli compatibility check failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
