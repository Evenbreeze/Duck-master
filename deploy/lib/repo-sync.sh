# shellcheck shell=bash

duck_pick_repo_root() {
  local script_dir="$1"
  [[ -n "${DUCK_SRC:-}" && -f "${DUCK_SRC}/Dockerfile" ]] && { echo "$DUCK_SRC"; return 0; }
  [[ -f "${script_dir}/../Dockerfile" ]] && { (cd "${script_dir}/.." && pwd); return 0; }
  [[ -f /root/Duck-master/Dockerfile ]] && { echo /root/Duck-master; return 0; }
  for d in /home/*/Duck-master; do
    [[ -f "${d}/Dockerfile" ]] && { echo "$d"; return 0; }
  done
  [[ -f /opt/duck/source/Dockerfile ]] && { echo /opt/duck/source; return 0; }
  return 1
}

duck_rsync_repo_to_opt_source() {
  local repo="$1"
  install -d /opt/duck/source
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude '.git' --exclude 'node_modules' --exclude 'venv' \
      --exclude 'db.sqlite3' \
      "${repo}/" /opt/duck/source/
  else
    rm -rf /opt/duck/source
    cp -a "${repo}" /opt/duck/source
  fi
}

duck_install_opt_deploy_files() {
  local d="$1"
  install -d /opt/duck/deploy/lib /opt/marzban
  cp "$d/docker-compose.yml" /opt/marzban/docker-compose.yml
  cp "$d/install.sh" "$d/ports-lib.sh" "$d/fix-panel.sh" "$d/reinstall.sh" "$d/preflight.sh" \
    "$d/duck-ctl.sh" "$d/acme-install-cert.sh" "$d/env.template" "$d/xray_config.template.json" \
    "$d/docker-compose.yml" /opt/duck/deploy/
  cp -a "$d/lib/." /opt/duck/deploy/lib/
  chmod +x /opt/duck/deploy/*.sh
  install -m 755 /opt/duck/deploy/duck-ctl.sh /usr/local/bin/duck
  ln -sf /opt/duck/deploy/fix-panel.sh /usr/local/bin/fix-panel.sh
  ln -sf /usr/local/bin/duck /usr/local/bin/marzban
}
