#!/bin/bash
# Clone Events-Backend into backend/events at the ref in backend/events.ref.
# Used on Heroku (after setup_ssh) and locally to replace the former submodule.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVENTS_DIR="$REPO_ROOT/backend/events"
REF_FILE="$REPO_ROOT/backend/events.ref"
GIT_URL="git@github.com:Study-Compass/Events-Backend.git"

if [[ ! -f "$REF_FILE" ]]; then
    echo "Missing $REF_FILE (expected branch or SHA to clone)"
    exit 1
fi
REF=$(cat "$REF_FILE" | tr -d '[:space:]')

if [[ -d "$EVENTS_DIR/.git" ]]; then
    echo "backend/events already present, skipping clone"
    (cd "$EVENTS_DIR" && git fetch origin && git checkout "$REF" 2>/dev/null || true)
    exit 0
fi

mkdir -p "$(dirname "$EVENTS_DIR")"
git clone "$GIT_URL" "$EVENTS_DIR"
cd "$EVENTS_DIR"
git checkout "$REF"
echo "Cloned Events-Backend at $REF"
