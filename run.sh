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
  blogsite  news site      http://localhost:8000

Example: $0 videos blogsite server
EOF
}

command_for() {
  case "$1" in
    admin)    echo "npm run dev" ;;
    server)   echo "npm run dev" ;;
    videos)   echo "npm run config && npm start" ;;
    blogsite) echo "python3 -u -m http.server 8000" ;;
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
  if [ "$app" != blogsite ] && [ ! -d "$ROOT/$app/node_modules" ]; then
    echo "$app: node_modules missing, running npm install..."
    (cd "$ROOT/$app" && npm install) || exit 1
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
    cd "$ROOT/$app" || exit 1
    # A shell-wide PORT would make every app fight over the same port.
    unset PORT
    FORCE_COLOR=1 bash -c "$(command_for "$app")" 2>&1 | sed -l "s/^/$prefix /"
  ) 2>/dev/null &
done

echo "Started:$selected  (Ctrl+C to stop all)"
wait
