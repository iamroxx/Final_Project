import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parent
load_dotenv(BACKEND_ROOT / ".env")


def check_supabase_connection():
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not service_key:
        return {
            "ok": False,
            "message": "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        }

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }

    started = time.perf_counter()
    try:
        response = requests.get(f"{url}/rest/v1/", headers=headers, timeout=5)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        return {
            "ok": response.status_code < 500,
            "message": "Supabase connection reachable.",
            "elapsedMs": elapsed_ms,
            "statusCode": response.status_code,
        }
    except requests.RequestException as exc:
        return {
            "ok": False,
            "message": f"Supabase connection failed: {exc}",
        }


def run_check() -> int:
    result = check_supabase_connection()
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **result,
    }
    print(json.dumps(payload, indent=2))
    return 0 if result.get("ok") else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check whether the backend can connect to Supabase."
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
