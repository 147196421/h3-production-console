#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
archive_path="${1:-$project_dir/h3-production-console.tar.gz}"
tar --exclude='./data/*' --exclude='./.env' --exclude='./h3-production-console.tar.gz' -czf "$archive_path" -C "$project_dir" .
echo "$archive_path"
