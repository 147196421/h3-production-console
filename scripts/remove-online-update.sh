#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用sudo运行此脚本"
  exit 1
fi

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
data_dir="${project_dir}/data"

rm -f \
  /etc/cron.d/h3-console-update \
  /usr/local/sbin/h3-console-update-agent \
  "${data_dir}/network-settings.json" \
  "${data_dir}/git-proxy.config" \
  "${data_dir}/update-request.json" \
  "${data_dir}/update-request.failed.json" \
  "${data_dir}/update-status.json" \
  "${data_dir}/update-agent.lock" \
  "${data_dir}/update-agent.log"

echo "后台在线更新、代理设置及遗留运行文件已移除。"
