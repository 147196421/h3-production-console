#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用sudo运行此脚本"
  exit 1
fi

PROJECT_DIR="$(realpath "${1:-.}")"
DATA_DIR="${PROJECT_DIR}/data"
SOURCE_AGENT="${PROJECT_DIR}/scripts/update-agent.sh"
INSTALLED_AGENT="/usr/local/sbin/h3-console-update-agent"
CRON_FILE="/etc/cron.d/h3-console-update"

test -d "${PROJECT_DIR}/.git"
test -f "${PROJECT_DIR}/compose.yaml"
test -f "${SOURCE_AGENT}"
command -v git >/dev/null
command -v docker >/dev/null
command -v flock >/dev/null

install -m 0755 "${SOURCE_AGENT}" "${INSTALLED_AGENT}"
mkdir -p "${DATA_DIR}"
printf '* * * * * root %s %s %s >> %s/update-agent.log 2>&1\n' "${INSTALLED_AGENT}" "${PROJECT_DIR}" "${DATA_DIR}" "${DATA_DIR}" > "${CRON_FILE}"
chmod 0644 "${CRON_FILE}"

if command -v systemctl >/dev/null && systemctl list-unit-files cron.service >/dev/null 2>&1; then
  systemctl enable --now cron
fi

echo "后台一键更新代理已安装，最长一分钟检查一次更新请求。"

