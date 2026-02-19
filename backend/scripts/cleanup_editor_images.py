"""Cleanup orphan editor images.

Usage:
  python scripts/cleanup_editor_images.py            # dry-run
  python scripts/cleanup_editor_images.py --apply    # delete orphan files
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.services import editor_image_service


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually delete orphan files")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = editor_image_service.cleanup_orphan_editor_images(db, dry_run=not args.apply)
    finally:
        db.close()

    print("Editor image cleanup result")
    print(f"  dry_run: {result['dry_run']}")
    print(f"  referenced_count: {result['referenced_count']}")
    print(f"  existing_count: {result['existing_count']}")
    print(f"  orphan_count: {result['orphan_count']}")
    print(f"  deleted_count: {result['deleted_count']}")
    if result["orphan_urls"]:
        print("  orphan_urls:")
        for url in result["orphan_urls"]:
            print(f"    - {url}")


if __name__ == "__main__":
    main()

