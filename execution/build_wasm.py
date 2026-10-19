"""
Build WASM bridge — compiles hypersynth-engine to WebAssembly.
Usage: python execution/build_wasm.py [--dev] [--profiling]
"""

import argparse
import shutil
import sys
from pathlib import Path

from utils import (
    ENGINE_ROOT, PUBLIC_WASM, find_cargo, setup_env, run_command,
    log, success, error, ensure_dir
)


def find_wasm_pack() -> str:
    """Find wasm-pack, or suggest installation."""
    wp = shutil.which("wasm-pack")
    if wp:
        return wp
    # Check cargo bin
    fallback = Path.home() / ".cargo" / "bin" / "wasm-pack.exe"
    if fallback.exists():
        return str(fallback)
    error("wasm-pack not found. Install: cargo install wasm-pack")
    sys.exit(1)


def build_wasm(mode: str = "release"):
    setup_env()
    wasm_pack = find_wasm_pack()
    wasm_bridge_dir = ENGINE_ROOT / "wasm-bridge"

    if not wasm_bridge_dir.exists():
        error(f"wasm-bridge directory not found: {wasm_bridge_dir}")
        sys.exit(1)

    # Build with wasm-pack
    cmd = [wasm_pack, "build", "--target", "web"]
    if mode == "release":
        cmd.append("--release")
    elif mode == "dev":
        cmd.append("--dev")
    elif mode == "profiling":
        cmd.append("--profiling")

    log(f"Building WASM ({mode} mode)...")
    exit_code = run_command(cmd, cwd=wasm_bridge_dir)

    if exit_code != 0:
        error("WASM build failed")
        sys.exit(exit_code)

    # Copy output to public/wasm/
    pkg_dir = wasm_bridge_dir / "pkg"
    if not pkg_dir.exists():
        error(f"Build output not found: {pkg_dir}")
        sys.exit(1)

    ensure_dir(PUBLIC_WASM)

    files_to_copy = [
        "hypersynth_wasm_bg.wasm",
        "hypersynth_wasm.js",
        "hypersynth_wasm.d.ts",
        "hypersynth_wasm_bg.wasm.d.ts",
        "package.json",
    ]

    copied = 0
    for fname in files_to_copy:
        src = pkg_dir / fname
        if src.exists():
            shutil.copy2(src, PUBLIC_WASM / fname)
            copied += 1
        else:
            log(f"  Warning: {fname} not found in pkg/")

    success(f"WASM build complete. {copied} files copied to public/wasm/")

    # Validate
    wasm_file = PUBLIC_WASM / "hypersynth_wasm_bg.wasm"
    if wasm_file.exists():
        size_kb = wasm_file.stat().st_size / 1024
        log(f"  WASM size: {size_kb:.0f} KB")
        if size_kb < 10:
            error("WASM file suspiciously small — check build")
    else:
        error("WASM file missing after build!")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build WASM bridge")
    parser.add_argument("--dev", action="store_true", help="Debug build")
    parser.add_argument("--profiling", action="store_true", help="Profiling build")
    args = parser.parse_args()

    if args.dev:
        build_wasm("dev")
    elif args.profiling:
        build_wasm("profiling")
    else:
        build_wasm("release")
