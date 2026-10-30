# shellcheck shell=bash
# 服务器上定位 git clone 与 /opt/duck/source 同步（install / fix-panel 共用）

duck_pick_repo_root() {
  local script_dir="$1"
  local explicit="${DUCK_SRC:-}"

  if [[ -n "$explicit" && -f "${explicit}/Dockerfile" ]]; then
    echo "$explicit"
    return 0
  fi
  if [[ -f "${script_dir}/../Dockerfile" ]]; then
    (cd "${script_dir}/.." && pwd)
    return 0
  fi
  local d
  for d in /root/Duck-master /root/Duck-master-2; do
    if [[ -f "${d}/Dockerfile" ]]; then
      echo "$d"
      return 0
    fi
  done
  for d in /home/*/Duck-master /home/*/Duck-master-2; do
    if [[ -f "${d}/Dockerfile" ]]; then
      echo "$d"
      return 0
    fi
  done
  if [[ -f /opt/duck/source/Dockerfile ]]; then
    echo /opt/duck/source
    return 0
  fi
  return 1
}

duck_rsync_repo_to_opt_source() {
  local repo="$1"
  [[ -f "${repo}/Dockerfile" ]] || return 1
  install -d /opt/duck/source
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude '.git' --exclude 'node_modules' --exclude 'venv' --exclude '.venv' \
      --exclude 'db.sqlite3' --exclude 'db.sqlite3-journal' \
      "${repo}/" /opt/duck/source/
  else
    rm -rf /opt/duck/source
    cp -a "${repo}" /opt/duck/source
  fi
}

duck_install_opt_deploy_files() {
  local deploy_src="$1"
  install -d /opt/duck/deploy/lib /opt/marzban
  cp "${deploy_src}/docker-compose.yml" /opt/marzban/docker-compose.yml
  cp "${deploy_src}/docker-compose.yml" /opt/duck/deploy/
  cp "${deploy_src}/install.sh" "${deploy_src}/ports-lib.sh" "${deploy_src}/env.template" \
    "${deploy_src}/xray_config.template.json" \
    "${deploy_src}/fix-panel.sh" "${deploy_src}/reinstall.sh" "${deploy_src}/preflight.sh" \
    "${deploy_src}/duck-ctl.sh" "${deploy_src}/acme-install-cert.sh" \
    /opt/duck/deploy/
  chmod +x /opt/duck/deploy/install.sh /opt/duck/deploy/fix-panel.sh \
    /opt/duck/deploy/reinstall.sh /opt/duck/deploy/preflight.sh \
    /opt/duck/deploy/acme-install-cert.sh
  install -d /opt/duck/deploy/lib
  cp -a "${deploy_src}/lib/." /opt/duck/deploy/lib/
  install -m 755 /opt/duck/deploy/duck-ctl.sh /usr/local/bin/duck
  ln -sf /opt/duck/deploy/fix-panel.sh /usr/local/bin/fix-panel.sh
  ln -sf /opt/duck/deploy/reinstall.sh /usr/local/bin/duck-reinstall.sh
  ln -sf /usr/local/bin/duck /usr/local/bin/marzban
}

duck_git_reset_to_origin() {
  local repo_root="$1"
  git -C "$repo_root" fetch origin
  if git -C "$repo_root" show-ref -q refs/remotes/origin/main; then
    git -C "$repo_root" reset --hard origin/main
  elif git -C "$repo_root" show-ref -q refs/remotes/origin/master; then
    git -C "$repo_root" reset --hard origin/master
  else
    echo "警告: 未找到 origin/main 或 origin/master，尝试 origin/HEAD" >&2
    git -C "$repo_root" reset --hard "@{u}" 2>/dev/null || git -C "$repo_root" reset --hard FETCH_HEAD
  fi
}
