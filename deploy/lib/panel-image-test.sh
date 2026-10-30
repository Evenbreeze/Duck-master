# shellcheck shell=bash
# 在镜像内测 Python 依赖（绕过 ENTRYPOINT，避免误跑 alembic）
panel_image_test_imports() {
  local image="${1:-duck-panel:latest}"
  docker run --rm --entrypoint python "$image" -c \
    "import apscheduler; print('panel-image-test OK')"
}

panel_image_has_entrypoint() {
  local image="${1:-duck-panel:latest}"
  docker run --rm --entrypoint test "$image" -x /usr/local/bin/docker-entrypoint.sh
}
