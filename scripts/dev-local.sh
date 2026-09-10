#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" != "22" ]; then
  echo "SENTINEL local runtime requires Node 22.x; current runtime is $(node -v)." >&2
  echo "Install/use Node 22 with nvm, then rerun: npm run dev:local" >&2
  exit 1
fi

case " ${NODE_OPTIONS:-} " in
  *" --dns-result-order=ipv4first "*) ;;
  *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first" ;;
esac

LISTEN_PORT="${PORT:-3000}"
echo "SENTINEL local runtime: Node $(node -v), IPv4-first DNS, port ${LISTEN_PORT}"
exec npx vercel dev --listen "$LISTEN_PORT"
