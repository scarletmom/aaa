#!/usr/bin/env bash
set -euo pipefail

# Usage: ./push.sh ["commit message"]  (message only needed when there are uncommitted changes)
# Requires GITHUB_TOKEN env var set to a fine-grained PAT with repo access.

REPO_URL="github.com/scarletmom/aaa.git"
BRANCH="main"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Error: GITHUB_TOKEN is not set." >&2
  echo "Add GITHUB_TOKEN=your_fine_grained_token to .env" >&2
  exit 1
fi

if [ ! -d .git ]; then
  git init
  git branch -M "$BRANCH"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://${REPO_URL}"
fi

if [ -n "$(git status --porcelain)" ]; then
  if [ $# -lt 1 ]; then
    echo "You have uncommitted changes. Usage: $0 \"commit message\"" >&2
    exit 1
  fi
  git add -A
  git commit -m "$1"
elif [ $# -ge 1 ]; then
  echo "Nothing to commit, pushing existing commits..."
fi

# No -u: it would store the token-bearing URL in .git/config.
git push "https://${GITHUB_TOKEN}@${REPO_URL}" "$BRANCH":"$BRANCH"

echo "Pushed to https://${REPO_URL}"
