#!/usr/bin/env bash
# 兼容旧用法，请优先使用 install.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install.sh" "$@"
