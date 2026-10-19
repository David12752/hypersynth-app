"""
Build Electron app for distribution.
Usage:
  python execution/build_electron.py [--platform windows|mac|linux]
"""

import argparse
import shutil
import sys

from utils import PROJECT_ROOT, run_command, log, success, error


def find_npm() -> str:
    npm = shutil.which("npm")
    if npm:
        return npm
    error("npm not found. Install Node.js: https://nodejs.org/")
    sys.exit(1)


def build_electron(platform: str = "windows"):
    npm = find_npm()

    # Step 1: Next.js build
    log("Building Next.js...")
    code = run_command([npm, "run", "build"], cwd=PROJECT_ROOT)
    if code != 0:
        error("Next.js build failed")
        sys.exit(code)

    # Step 2: Electron build
    log(f"Building Electron ({platform})...")
    code = run_command([npm, "run", "electron:build"], cwd=PROJECT_ROOT)
    if code != 0:
        error("Electron build failed")
        sys.exit(code)

    success("Electron build complete! Check dist/ for output.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Electron app")
    parser.add_argument(
        "--platform", choices=["windows", "mac", "linux"],
        default="windows", help="Target platform"
    )
    args = parser.parse_args()
    build_electron(args.platform)
