"""
Build VST3/CLAP plugin with NIH-plug.
Usage:
  python execution/build_plugin.py [--debug] [--install]
"""

import argparse
import shutil
import sys
from pathlib import Path

from utils import (
    ENGINE_ROOT, find_cargo, setup_env, run_command,
    log, success, error, CARGO_TARGET_DIR
)


def build_plugin(debug: bool = False, install: bool = False):
    setup_env()
    cargo = find_cargo()
    profile = "debug" if debug else "release"

    # Step 1: Build
    log(f"Building plugin ({profile})...")
    build_cmd = [cargo, "build", "-p", "hypersynth-plugin"]
    if not debug:
        build_cmd.append("--release")

    exit_code = run_command(build_cmd, cwd=ENGINE_ROOT)
    if exit_code != 0:
        error("Plugin build failed")
        sys.exit(exit_code)

    # Step 2: Bundle
    log("Bundling VST3...")
    bundle_cmd = [cargo, "nih-plug", "bundle", "hypersynth-plugin"]
    if not debug:
        bundle_cmd.append("--release")

    exit_code = run_command(bundle_cmd, cwd=ENGINE_ROOT)
    if exit_code != 0:
        error("Plugin bundle failed. Is cargo-nih-plug installed?")
        log("Install with: cargo install cargo-nih-plug")
        sys.exit(exit_code)

    # Step 3: Copy with canonical name
    bundled_dir = Path(CARGO_TARGET_DIR) / "bundled"
    source_vst3 = bundled_dir / "hypersynth-plugin.vst3"
    target_vst3 = bundled_dir / "HYPERSYNTH.vst3"

    if source_vst3.exists():
        if target_vst3.exists():
            shutil.rmtree(target_vst3)
        shutil.copytree(source_vst3, target_vst3)
        success(f"Plugin bundled: {target_vst3}")
    else:
        error(f"Bundle output not found: {source_vst3}")
        sys.exit(1)

    # Step 4: Install (optional)
    if install:
        if sys.platform == "win32":
            vst3_system = Path(r"C:\Program Files\Common Files\VST3")
        elif sys.platform == "darwin":
            vst3_system = Path.home() / "Library" / "Audio" / "Plug-Ins" / "VST3"
        else:
            vst3_system = Path.home() / ".vst3"

        dest = vst3_system / "HYPERSYNTH.vst3"
        log(f"Installing to {dest}...")
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(target_vst3, dest)
        success("Plugin installed to system VST3 path")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build VST3/CLAP plugin")
    parser.add_argument("--debug", action="store_true", help="Debug build")
    parser.add_argument("--install", action="store_true", help="Install to system VST3 path")
    args = parser.parse_args()
    build_plugin(debug=args.debug, install=args.install)
