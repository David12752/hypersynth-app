"""
Frontend development helper — start dev server, lint, build.
Usage:
  python execution/dev_frontend.py --start
  python execution/dev_frontend.py --lint
  python execution/dev_frontend.py --build
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


def start_dev(npm: str) -> int:
    log("Starting Next.js dev server...")
    return run_command([npm, "run", "dev"], cwd=PROJECT_ROOT)


def run_lint(npm: str) -> int:
    log("Running ESLint...")
    return run_command([npm, "run", "lint"], cwd=PROJECT_ROOT)


def run_build(npm: str) -> int:
    log("Building Next.js for production...")
    return run_command([npm, "run", "build"], cwd=PROJECT_ROOT)


def main():
    parser = argparse.ArgumentParser(description="Frontend development helper")
    parser.add_argument("--start", action="store_true", help="Start dev server")
    parser.add_argument("--lint", action="store_true", help="Run ESLint")
    parser.add_argument("--build", action="store_true", help="Production build")
    args = parser.parse_args()

    if not any([args.start, args.lint, args.build]):
        parser.print_help()
        sys.exit(1)

    npm = find_npm()

    if args.lint:
        code = run_lint(npm)
        if code != 0:
            error("Lint failed")
            sys.exit(code)
        success("Lint passed")

    if args.build:
        code = run_build(npm)
        if code != 0:
            error("Build failed")
            sys.exit(code)
        success("Build complete")

    if args.start:
        # This blocks (dev server runs until killed)
        code = start_dev(npm)
        sys.exit(code)


if __name__ == "__main__":
    main()
