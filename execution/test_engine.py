"""
Run engine tests with validation.
Usage: python execution/test_engine.py [--verbose] [--filter PATTERN]
"""

import argparse
import sys

from utils import ENGINE_ROOT, find_cargo, setup_env, run_command, log, success, error


def test_engine(verbose: bool = False, filter_pattern: str = None):
    setup_env()
    cargo = find_cargo()

    cmd = [cargo, "test", "-p", "hypersynth-engine"]

    if filter_pattern:
        cmd.extend(["--", filter_pattern])
    if verbose:
        cmd.append("--nocapture") if "--" in cmd else cmd.extend(["--", "--nocapture"])

    log("Running engine tests...")
    exit_code = run_command(cmd, cwd=ENGINE_ROOT)

    if exit_code != 0:
        error(f"Tests failed (exit code {exit_code})")
        sys.exit(exit_code)

    success("All engine tests passed!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run engine tests")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show test output")
    parser.add_argument("--filter", "-f", type=str, help="Filter tests by name pattern")
    args = parser.parse_args()
    test_engine(verbose=args.verbose, filter_pattern=args.filter)
