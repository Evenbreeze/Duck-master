#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-/opt/marzban/docker-compose.yml}"
SERVICE="${DUCK_SERVICE:-panel}"
dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

case "${1:-}" in
  up|start)   dc up -d --build --force-recreate "$SERVICE" ;;
  restart)    dc up -d --force-recreate "$SERVICE" ;;
  stop|down)  dc down ;;
  logs)       shift; dc logs -f "$SERVICE" "$@" ;;
  status)     dc ps ;;
  cli)        shift; dc exec -T "$SERVICE" marzban-cli "$@" ;;
  update)     dc build --no-cache "$SERVICE"; dc up -d --force-recreate "$SERVICE" ;;
  rebuild)    dc build --no-cache "$SERVICE"; dc up -d --force-recreate "$SERVICE" ;;
  ports)      cat /var/lib/marzban/duck-ports.env 2>/dev/null || cat /var/lib/marzban/xray_config.json ;;
  "")         dc ps ;;
  *)
    echo "duck: up | restart | logs | status | cli | update | rebuild | ports" >&2
    exit 1
    ;;
esac
