"""
Engine development helper — check, test, clippy, bench.
Usage:
  python execution/dev_engine.py --check
  python execution/dev_engine.py --test
  python execution/dev_engine.py --clippy
  python execution/dev_engine.py --bench
  python execution/dev_engine.py --all
"""

import argparse
import sys

from utils import ENGINE_ROOT, find_cargo, setup_env, run_command, log, success, error


def run_check(cargo: str) -> int:
    log("Running cargo check...")
    return run_command([cargo, "check", "-p", "hypersynth-engine"], cwd=ENGINE_ROOT)


def run_test(cargo: str) -> int:
    log("Running cargo test...")
    return run_command([cargo, "test", "-p", "hypersynth-engine"], cwd=ENGINE_ROOT)


def run_clippy(cargo: str) -> int:
    log("Running cargo clippy...")
    return run_command(
        [cargo, "clippy", "-p", "hypersynth-engine", "--", "-W", "clippy::all"],
        cwd=ENGINE_ROOT
    )


def run_bench(cargo: str) -> int:
    log("Running cargo bench...")
    return run_command([cargo, "bench", "-p", "hypersynth-engine"], cwd=ENGINE_ROOT)


def main():
    parser = argparse.ArgumentParser(description="Engine development helper")
    parser.add_argument("--check", action="store_true", help="cargo check")
    parser.add_argument("--test", action="store_true", help="cargo test")
    parser.add_argument("--clippy", action="store_true", help="cargo clippy")
    parser.add_argument("--bench", action="store_true", help="cargo bench")
    parser.add_argument("--all", action="store_true", help="check + clippy + test")
    args = parser.parse_args()

    if not any([args.check, args.test, args.clippy, args.bench, args.all]):
        parser.print_help()
        sys.exit(1)

    setup_env()
    cargo = find_cargo()
    failed = []

    tasks = []
    if args.all:
        tasks = ["check", "clippy", "test"]
    else:
        if args.check:
            tasks.append("check")
        if args.clippy:
            tasks.append("clippy")
        if args.test:
            tasks.append("test")
        if args.bench:
            tasks.append("bench")

    runners = {
        "check": run_check,
        "clippy": run_clippy,
        "test": run_test,
        "bench": run_bench,
    }

    for task in tasks:
        code = runners[task](cargo)
        if code != 0:
            failed.append(task)
            error(f"{task} failed (exit code {code})")
        else:
            success(f"{task} passed")

    print()
    if failed:
        error(f"Failed: {', '.join(failed)}")
        sys.exit(1)
    else:
        success("All tasks passed!")


if __name__ == "__main__":
    main()
