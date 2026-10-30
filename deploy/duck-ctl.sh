#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-/opt/marzban/docker-compose.yml}"
SERVICE="${DUCK_SERVICE:-panel}"
dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

case "${1:-}" in
  up|start)   dc up -d --build ;;
  restart)    dc restart "$SERVICE" ;;
  stop|down)  dc down ;;
  logs)       shift; dc logs -f "$SERVICE" "$@" ;;
  status)     dc ps ;;
  cli)        shift; dc exec -T "$SERVICE" marzban-cli "$@" ;;
  update)     dc build "$SERVICE"; dc up -d "$SERVICE" ;;
  ports)      cat /var/lib/marzban/duck-ports.env 2>/dev/null || cat /var/lib/marzban/xray_config.json ;;
  "")         dc ps ;;
  *)
    echo "duck: up | restart | logs | status | cli | update | ports" >&2
    exit 1
    ;;
esac
