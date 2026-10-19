"""
Project status report — shows build state, phase progress, and health checks.
Usage: python execution/project_status.py
"""

import json
import sys
from pathlib import Path

from utils import (
    PROJECT_ROOT, ENGINE_ROOT, PUBLIC_WASM, CARGO_TARGET_DIR,
    find_cargo, setup_env, run_command_capture, log, success, error
)


def check_wasm_build() -> bool:
    """Check if WASM build exists and is recent."""
    wasm_file = PUBLIC_WASM / "hypersynth_wasm_bg.wasm"
    if wasm_file.exists():
        size_kb = wasm_file.stat().st_size / 1024
        success(f"WASM build: {size_kb:.0f} KB")
        return True
    else:
        error("WASM build: missing")
        return False


def check_rust_toolchain() -> bool:
    """Check Rust is available."""
    try:
        cargo = find_cargo()
        code, stdout, _ = run_command_capture([cargo, "--version"])
        if code == 0:
            success(f"Cargo: {stdout.strip()}")
            return True
    except SystemExit:
        pass
    error("Cargo: not found")
    return False


def check_node() -> bool:
    """Check Node.js is available."""
    import shutil
    node = shutil.which("node")
    if node:
        code, stdout, _ = run_command_capture([node, "--version"])
        if code == 0:
            success(f"Node.js: {stdout.strip()}")
            return True
    error("Node.js: not found")
    return False


def check_dependencies() -> bool:
    """Check node_modules exist."""
    nm = PROJECT_ROOT / "node_modules"
    if nm.exists():
        success("node_modules: installed")
        return True
    error("node_modules: missing (run npm install)")
    return False


def check_plugin_build() -> bool:
    """Check if VST3 plugin build exists."""
    vst_path = Path(CARGO_TARGET_DIR) / "bundled" / "HYPERSYNTH.vst3"
    if vst_path.exists():
        success(f"VST3 plugin: {vst_path}")
        return True
    else:
        log("VST3 plugin: not built")
        return False


def count_engine_files() -> int:
    """Count Rust source files in engine."""
    engine_src = ENGINE_ROOT / "engine" / "src"
    if not engine_src.exists():
        return 0
    return len(list(engine_src.rglob("*.rs")))


def main():
    print("=" * 60)
    print("  HyperSynth — Project Status Report")
    print("=" * 60)
    print()

    # Environment
    print("── Environment ──")
    check_rust_toolchain()
    check_node()
    check_dependencies()
    print()

    # Builds
    print("── Builds ──")
    check_wasm_build()
    check_plugin_build()
    print()

    # Engine
    print("── Engine ──")
    file_count = count_engine_files()
    log(f"Rust source files: {file_count}")
    print()

    # Phase status
    print("── Phase Progress ──")
    phases = [
        ("Phase 0", "באגים + תשתית", "⚠️  בעבודה"),
        ("Phase 1", "מערכת פרמטרים", "❌ לא התחיל"),
        ("Phase 2", "ארכיטקטורת קול", "❌ לא התחיל"),
        ("Phase 3", "מנועי סינתזה", "❌ לא התחיל"),
        ("Phase 4", "פילטרים", "❌ לא התחיל"),
        ("Phase 5", "מודולציה", "❌ לא התחיל"),
        ("Phase 6", "אפקטים", "❌ לא התחיל"),
        ("Phase 7", "מיקסר + Routing", "❌ לא התחיל"),
        ("Phase 8", "WASM + UI Wiring", "❌ לא התחיל"),
        ("Phase 9", "Presets + Polish", "❌ לא התחיל"),
    ]
    for phase, name, status in phases:
        print(f"  {phase}: {name} — {status}")

    print()
    print("=" * 60)


if __name__ == "__main__":
    main()
