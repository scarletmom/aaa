#!/usr/bin/env bash
# Usage: ./run.sh all | ./run.sh <app>...   apps: admin server videos blogsite
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APPS="admin server videos blogsite"

usage() {
  cat <<EOF
Usage: $0 all
       $0 <app> [app...]

Apps:
  admin     linkproxy API :5678 + editor http://localhost:5173
  server    videos API     http://localhost:3000
  videos    videos site    http://localhost:4000
  blogsite  news site      http://localhost:5174 (Next.js, player at /player/)

Example: $0 videos blogsite server
EOF
}

command_for() {
  case "$1" in
    admin)    echo "npm run dev" ;;
    server)   echo "npm run dev" ;;
    videos)   echo "npm run config && npm start" ;;
    blogsite) echo "npm run dev" ;;
  esac
}

dir_for() {
  case "$1" in
    blogsite) echo "$ROOT/blogsite/web" ;;
    *)       echo "$ROOT/$1" ;;
  esac
}

SERVER_URL=http://localhost:3000
VIDEOS_URL=http://localhost:4000
BLOGSITE_URL=http://localhost:5174

# Each app's .env may still name other hosts or the old static blogsite on :8000. Real environment
# variables win over .env in all three apps, so these keep the URLs in step with the ports above.
env_for() {
  case "$1" in
    admin)    echo "SITE_URL=$VIDEOS_URL" ;;
    server)   echo "PUBLIC_URL=$SERVER_URL VIDEOS_SITE_URL=$VIDEOS_URL NEWS_SITE_URL=$BLOGSITE_URL" ;;
    videos)   echo "API_URL=$SERVER_URL BLOGSITE_URL=$BLOGSITE_URL" ;;
    blogsite) echo "NEXT_PUBLIC_API_URL=$SERVER_URL" ;;
  esac
}

color_for() {
  case "$1" in
    admin)    echo 35 ;;
    server)   echo 33 ;;
    videos)   echo 36 ;;
    blogsite) echo 32 ;;
  esac
}

if [ $# -eq 0 ]; then
  usage
  exit 1
fi

selected=""
for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    all) selected="$APPS" ;;
    admin|server|videos|blogsite)
      case " $selected " in *" $arg "*) ;; *) selected="$selected $arg" ;; esac ;;
    *) echo "Unknown app: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

for app in $selected; do
  if [ ! -d "$(dir_for "$app")/node_modules" ]; then
    echo "$app: node_modules missing, running npm install..."
    (cd "$(dir_for "$app")" && npm install) || exit 1
  fi
done

kill_tree() {
  local child
  for child in $(pgrep -P "$1"); do kill_tree "$child"; done
  kill "$1" 2>/dev/null
}

stop_all() {
  trap - INT TERM EXIT
  echo
  echo "Stopping..."
  for child in $(pgrep -P $$); do kill_tree "$child"; done
  wait 2>/dev/null
  exit 0
}

trap stop_all INT TERM EXIT

for app in $selected; do
  prefix="$(printf '\033[%sm%-8s\033[0m|' "$(color_for "$app")" "$app")"
  (
    cd "$(dir_for "$app")" || exit 1
    # A shell-wide PORT would make every app fight over the same port.
    unset PORT
    env $(env_for "$app") FORCE_COLOR=1 bash -c "$(command_for "$app")" 2>&1 | sed -l "s/^/$prefix /"
  ) 2>/dev/null &
done

echo "Started:$selected  (Ctrl+C to stop all)"
wait
