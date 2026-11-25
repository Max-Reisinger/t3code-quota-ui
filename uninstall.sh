#!/usr/bin/env bash
# ==============================================================================
# T3 Code Quota UI — One-Command Safe Rollback / Uninstaller
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Leobai03/t3code-quota-ui/main/uninstall.sh | bash
# ==============================================================================

set -euo pipefail

BACKUP_ROOT="${HOME}/.t3/quota-ui-backups"
TARGET_APP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      TARGET_APP="${2:-}"
      shift 2
      ;;
    --app=*)
      TARGET_APP="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Usage: bash uninstall.sh [--app \"/Applications/T3 Code.app\"]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "${BACKUP_ROOT}" ]]; then
  echo "No backups found in ${BACKUP_ROOT}. Nothing to restore."
  exit 0
fi

restored_count=0

for dir in "${BACKUP_ROOT}"/*; do
  [[ -d "${dir}" ]] || continue
  app_path=""
  if [[ -f "${dir}/target-app.txt" ]]; then
    app_path="$(cat "${dir}/target-app.txt")"
  fi
  if [[ -n "${TARGET_APP}" && "${app_path}" != "${TARGET_APP}" ]]; then
    continue
  fi
  if [[ -z "${app_path}" || ! -d "${app_path}" ]]; then
    continue
  fi
  if [[ "${app_path}" != /* || "${app_path}" != *.app || "${app_path}" == *".."* || ! -f "${app_path}/Contents/Info.plist" || ! -f "${app_path}/Contents/Resources/app.asar" ]]; then
    echo "==> Skipping invalid bundle path recorded in ${dir}/target-app.txt: ${app_path}" >&2
    continue
  fi
  if [[ ! -f "${dir}/app.asar.orig" || ! -f "${dir}/Info.plist.orig" ]]; then
    echo "==> Skipping ${app_path}: no original backup snapshot recorded (app was already customized before backup)."
    continue
  fi

  echo "==> Restoring original bundle for ${app_path}..."
  cp -f "${dir}/app.asar.orig" "${app_path}/Contents/Resources/app.asar"
  cp -f "${dir}/Info.plist.orig" "${app_path}/Contents/Info.plist"
  if [[ -d "${app_path}/Contents/Resources/server-compile-cache" ]]; then
    rm -rf "${app_path}/Contents/Resources/server-compile-cache/"* 2>/dev/null || true
  fi
  xattr -cr "${app_path}" 2>/dev/null || true
  codesign --force --deep --sign - "${app_path}"
  codesign --verify --deep --strict "${app_path}"
  rm -rf "${dir}"
  restored_count=$((restored_count + 1))
  echo "==> Successfully restored: ${app_path}"
done

if [[ "${restored_count}" -eq 0 ]]; then
  echo "No matching backup snapshot found to restore."
else
  echo ""
  echo "✅ Rollback complete! Press Cmd + Q and reopen T3 Code to load the original UI."
fi
