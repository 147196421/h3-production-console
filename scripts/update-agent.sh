#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${1:-/opt/h3-production-console}"
DATA_DIR="${2:-${PROJECT_DIR}/data}"
REQUEST_FILE="${DATA_DIR}/update-request.json"
STATUS_FILE="${DATA_DIR}/update-status.json"
LOCK_FILE="${DATA_DIR}/update-agent.lock"
GIT_PROXY_CONFIG="${DATA_DIR}/git-proxy.config"

mkdir -p "${DATA_DIR}"
exec 9>"${LOCK_FILE}"
flock -n 9 || exit 0
test -f "${REQUEST_FILE}" || exit 0

write_status() {
  local state="$1"
  local message="$2"
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{\n  "state": "%s",\n  "message": "%s",\n  "finished_at": "%s"\n}\n' "${state}" "${message}" "${timestamp}" > "${STATUS_FILE}.tmp"
  mv "${STATUS_FILE}.tmp" "${STATUS_FILE}"
}

on_error() {
  local code="$?"
  write_status "failed" "更新失败，退出码${code}；请查看data/update-agent.log"
  mv "${REQUEST_FILE}" "${DATA_DIR}/update-request.failed.json" 2>/dev/null || true
  exit "${code}"
}
trap on_error ERR

write_status "running" "正在从GitHub拉取并重新构建容器"
cd "${PROJECT_DIR}"
test -d .git
GIT_NETWORK_ARGS=()
if [ -s "${GIT_PROXY_CONFIG}" ]; then
  GIT_NETWORK_ARGS=(-c "include.path=${GIT_PROXY_CONFIG}")
fi
git -c safe.directory="${PROJECT_DIR}" "${GIT_NETWORK_ARGS[@]}" fetch origin main
git -c safe.directory="${PROJECT_DIR}" "${GIT_NETWORK_ARGS[@]}" merge --ff-only origin/main
install -m 0755 "${PROJECT_DIR}/scripts/update-agent.sh" "/usr/local/sbin/h3-console-update-agent"
docker compose build h3-console
docker compose up -d --force-recreate h3-console
rm -f "${REQUEST_FILE}"
write_status "success" "更新成功，容器已重新启动"
