"""
Build/Run Rust standalone binary.
Usage:
  python execution/build_standalone.py --mode run
  python execution/build_standalone.py --mode build
"""

import argparse
import sys

from utils import ENGINE_ROOT, find_cargo, setup_env, run_command, log, success, error


def build_standalone(mode: str):
    setup_env()
    cargo = find_cargo()

    log(f"Standalone {mode}...")
    if mode == "run":
        cmd = [cargo, "run", "-p", "hypersynth-standalone"]
    elif mode == "build":
        cmd = [cargo, "build", "--release", "-p", "hypersynth-standalone"]
    else:
        error(f"Unknown mode: {mode}")
        sys.exit(1)

    exit_code = run_command(cmd, cwd=ENGINE_ROOT)

    if exit_code != 0:
        error(f"Standalone {mode} failed (exit code {exit_code})")
        sys.exit(exit_code)

    success(f"Standalone {mode} complete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build/Run standalone")
    parser.add_argument(
        "--mode", choices=["run", "build"], required=True,
        help="'run' to build+run, 'build' for release build only"
    )
    args = parser.parse_args()
    build_standalone(args.mode)
