#!/usr/bin/env bash
# Append stdin to a target file, serializing whole-record writes with flock.
# This is for shared harness runtime logs (memory/<today>/log.md, crons/.cron.log).
set -euo pipefail

usage() {
  echo "usage: locked-append.sh <target-file>" >&2
}

if [ "$#" -ne 1 ] || [ -z "${1:-}" ]; then
  usage
  exit 64
fi

target=$1
parent=$(dirname -- "$target")
mkdir -p -- "$parent"

if command -v flock >/dev/null 2>&1; then
  hash_bin=$(command -v sha256sum 2>/dev/null || true)
  if [ -n "$hash_bin" ]; then
    key=$(printf '%s' "$target" | "$hash_bin" | awk '{print $1}')
  else
    key=$(printf '%s' "$target" | tr -c 'A-Za-z0-9._-' '_')
  fi
  lock_dir=${TMPDIR:-/tmp}/openharness-locked-append
  mkdir -p -- "$lock_dir"
  lock_file=$lock_dir/$key.lock
  exec 9>"$lock_file"
  flock 9
  cat >> "$target"
else
  printf 'locked-append.sh: WARNING: flock not found; appending without serialization to %s\n' "$target" >&2
  cat >> "$target"
fi
