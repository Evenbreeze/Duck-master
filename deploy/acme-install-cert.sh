#!/usr/bin/env bash
# acme.sh --reloadcmd / --install-cert hook: copy certs and restart Marzban.
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain>" >&2
  exit 1
fi

CERT_DIR="/var/lib/marzban/certs"
ACME_HOME="${HOME}/.acme.sh"
SRC="${ACME_HOME}/${DOMAIN}_ecc"
[[ -d "$SRC" ]] || SRC="${ACME_HOME}/${DOMAIN}"

install -d "$CERT_DIR"
cp "${SRC}/${DOMAIN}.cer" "${CERT_DIR}/${DOMAIN}.cer"
cp "${SRC}/${DOMAIN}.key" "${CERT_DIR}/${DOMAIN}.cer.key"
chmod 644 "${CERT_DIR}/${DOMAIN}.cer" "${CERT_DIR}/${DOMAIN}.cer.key"

if command -v duck >/dev/null 2>&1; then
  duck restart
elif command -v marzban >/dev/null 2>&1; then
  marzban restart
elif [[ -f /opt/marzban/docker-compose.yml ]]; then
  docker compose -f /opt/marzban/docker-compose.yml restart panel
fi

echo "[acme] Installed cert for ${DOMAIN} and restarted Duck panel."
