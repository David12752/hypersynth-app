"""
Shared utilities for all execution scripts.
Handles: cargo discovery, environment setup, path resolution, logging.
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path
from datetime import datetime

# ─── Paths ────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENGINE_ROOT = PROJECT_ROOT / "hypersynth-engine"
PUBLIC_WASM = PROJECT_ROOT / "public" / "wasm"
TMP_DIR = PROJECT_ROOT / ".tmp"

# Unicode-safe target dir (avoids bindgen issues with Hebrew paths)
CARGO_TARGET_DIR = os.environ.get("CARGO_TARGET_DIR", r"C:\hypersynth-target")


def find_cargo() -> str:
    """Find cargo executable, checking PATH then fallback locations."""
    cargo = shutil.which("cargo")
    if cargo:
        return cargo

    fallback = Path.home() / ".cargo" / "bin" / "cargo.exe"
    if fallback.exists():
        return str(fallback)

    print("ERROR: cargo not found. Install Rust: https://rustup.rs/")
    sys.exit(1)


def setup_env():
    """Set environment variables needed for Rust builds."""
    os.environ.setdefault("CARGO_TARGET_DIR", CARGO_TARGET_DIR)

    # ASIO SDK (optional)
    asio_candidates = [
        PROJECT_ROOT / "third_party" / "asio_sdk",
        Path(os.environ.get("TEMP", "")) / "asio_sdk",
        Path.home() / "asio_sdk",
    ]
    for candidate in asio_candidates:
        if candidate.exists() and "CPAL_ASIO_DIR" not in os.environ:
            os.environ["CPAL_ASIO_DIR"] = str(candidate)
            break

    # LLVM (for ASIO/bindgen)
    llvm_candidates = [
        Path(r"C:\Program Files\LLVM\bin"),
        Path(r"C:\Program Files (x86)\LLVM\bin"),
    ]
    for candidate in llvm_candidates:
        if candidate.exists() and "LIBCLANG_PATH" not in os.environ:
            os.environ["LIBCLANG_PATH"] = str(candidate)
            break

    # Ensure target dir exists
    Path(CARGO_TARGET_DIR).mkdir(parents=True, exist_ok=True)


def run_command(cmd: list[str], cwd: Path = None, env: dict = None) -> int:
    """Run a command with real-time output. Returns exit code."""
    merged_env = {**os.environ, **(env or {})}
    log(f"Running: {' '.join(cmd)}")
    if cwd:
        log(f"  in: {cwd}")

    result = subprocess.run(cmd, cwd=cwd, env=merged_env)
    return result.returncode


def run_command_capture(cmd: list[str], cwd: Path = None) -> tuple[int, str, str]:
    """Run a command and capture output. Returns (exit_code, stdout, stderr)."""
    result = subprocess.run(
        cmd, cwd=cwd, capture_output=True, text=True, env=os.environ
    )
    return result.returncode, result.stdout, result.stderr


def log(msg: str):
    """Print a timestamped log message."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")


def success(msg: str):
    log(f"✓ {msg}")


def error(msg: str):
    log(f"✗ {msg}")


def ensure_dir(path: Path):
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)
