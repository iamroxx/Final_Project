import argparse
import json
import sys
import time
from datetime import datetime, timezone

from firebase_connection import check_firestore_connection


def run_check() -> int:
    result = check_firestore_connection()
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **result,
    }
    print(json.dumps(payload, indent=2))
    return 0 if result.get("ok") else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check whether the backend can connect to Firebase Firestore."
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Keep checking until interrupted.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=10.0,
        help="Seconds between checks when --watch is used.",
    )
    args = parser.parse_args()

    if args.interval <= 0:
        print("--interval must be greater than 0", file=sys.stderr)
        return 2

    if not args.watch:
        return run_check()

    exit_code = 0
    try:
        while True:
            exit_code = run_check()
            time.sleep(args.interval)
    except KeyboardInterrupt:
        return exit_code


if __name__ == "__main__":
    raise SystemExit(main())