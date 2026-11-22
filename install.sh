#!/usr/bin/env bash
# ==============================================================================
# T3 Code Quota UI — One-Command macOS Installer
#
# Upstream Credits:
#   - Official T3 Code: https://github.com/pingdotgg/t3code (MIT License)
#   - Telemetry UI Fork: https://github.com/nanami-0713/t3code (MIT License)
#   - Repository: https://github.com/Leobai03/t3code-quota-ui (MIT License)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Leobai03/t3code-quota-ui/main/install.sh | bash
#
# Options:
#   --lang zh|en     UI language mode (default: zh)
#   --app <path>     Explicit path to T3 Code .app bundle
#   --build-full     Clone MIT telemetry fork & build full standalone t3 (Beta).app from source
#   --relaunch       Quit and relaunch T3 Code automatically after patching
# ==============================================================================

set -euo pipefail

REPO_RAW_BASE="https://raw.githubusercontent.com/Leobai03/t3code-quota-ui/main"
BACKUP_ROOT="${HOME}/.t3/quota-ui-backups"

LANG_MODE="zh"
TARGET_APP=""
BUILD_FULL="0"
AUTO_RELAUNCH="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang)
      LANG_MODE="${2:-zh}"
      shift 2
      ;;
    --lang=*)
      LANG_MODE="${1#*=}"
      shift
      ;;
    --app)
      TARGET_APP="${2:-}"
      shift 2
      ;;
    --app=*)
      TARGET_APP="${1#*=}"
      shift
      ;;
    --build-full|--full)
      BUILD_FULL="1"
      shift
      ;;
    --relaunch|--restart)
      AUTO_RELAUNCH="1"
      shift
      ;;
    -h|--help)
      cat <<'EOF'
T3 Code Quota UI Installer (macOS)

Usage:
  bash install.sh [options]

Options:
  --lang zh|en     Choose Chinese (zh, default) or English (en) UI labels
  --app <path>     Target a specific .app (e.g. "/Applications/T3 Code.app")
  --build-full     Build full Telemetry UI Edition (t3 (Beta).app) from source
  --relaunch       Automatically restart the app after installation
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: install.sh currently targets macOS (.app bundles)." >&2
  exit 1
fi

WORK_TMP="$(mktemp -d "${TMPDIR:-/tmp}/t3code-quota-ui.XXXXXX")"
cleanup() {
  rm -rf "${WORK_TMP}"
}
trap cleanup EXIT

resolve_script() {
  local name="$1"
  local script_dir=""
  if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  fi
  if [[ -n "${script_dir}" && -f "${script_dir}/scripts/${name}" ]]; then
    printf '%s\n' "${script_dir}/scripts/${name}"
    return 0
  fi
  local dest="${WORK_TMP}/${name}"
  echo "==> Downloading ${name}..." >&2
  curl -fsSL "${REPO_RAW_BASE}/scripts/${name}" -o "${dest}"
  printf '%s\n' "${dest}"
}

fix_antigravity_install_metadata() {
  local tools_dir="${HOME}/.t3/tools/antigravity-acp"
  [[ -d "${tools_dir}" ]] || return 0
  while IFS= read -r -d '' meta_file; do
    if ! grep -q '"harness"' "${meta_file}" 2>/dev/null; then
      local parent_dir
      parent_dir="$(dirname "${meta_file}")"
      chmod u+w "${parent_dir}" "${meta_file}" 2>/dev/null || true
      python3 - "${meta_file}" <<'PY' 2>/dev/null || true
import json, sys
p = sys.argv[1]
with open(p, "r", encoding="utf-8") as f:
    data = json.load(f)
if "harness" not in data:
    data["harness"] = None
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
        f.write("\n")
PY
      chmod 0400 "${meta_file}" 2>/dev/null || true
      chmod 0500 "${parent_dir}" 2>/dev/null || true
    fi
  done < <(find "${tools_dir}" -name ".install-complete.json" -print0 2>/dev/null)
}

if [[ "${BUILD_FULL}" == "1" ]]; then
  echo "==> [Full Telemetry Build Mode] Checking build prerequisites (git, node, pnpm)..."
  for cmd in git node pnpm; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      echo "Error: --build-full requires '${cmd}' in PATH. Install it or run without --build-full to patch your existing T3 Code app in 3 seconds." >&2
      exit 1
    fi
  done
  SOURCE_PATCHER="$(resolve_script "apply-source-patches.mjs")"
  SRC_DIR="${WORK_TMP}/t3code-src"
  echo "==> Cloning Telemetry UI branch (nanami-0713/t3code#feat/restrained-telemetry-ui)..."
  git clone --depth 1 -b feat/restrained-telemetry-ui https://github.com/nanami-0713/t3code.git "${SRC_DIR}"
  (
    cd "${SRC_DIR}"
    [[ -f .env.example && ! -f .env ]] && cp .env.example .env
    node "${SOURCE_PATCHER}" "${SRC_DIR}"
    export PATH="${SRC_DIR}/node_modules/.bin:${PATH}"
    pnpm install
    pnpm run dist:desktop:local-update
  )
  LATEST_ZIP="$(ls -t "${HOME}"/.t3/local-updates/T3-Code-*-arm64.zip "${HOME}"/.t3/local-updates/T3-Code-*.zip 2>/dev/null | head -n 1 || true)"
  if [[ -z "${LATEST_ZIP}" ]]; then
    echo "Error: Could not find built desktop archive in ~/.t3/local-updates/" >&2
    exit 1
  fi
  rm -rf "/Applications/t3 (Beta).app"
  ditto -x -k "${LATEST_ZIP}" /Applications/
  TARGET_APP="/Applications/t3 (Beta).app"
fi

if [[ -z "${TARGET_APP}" ]]; then
  CANDIDATES=(
    "/Applications/t3 (Beta).app"
    "/Applications/T3 Code (Beta).app"
    "/Applications/T3 Code.app"
    "${HOME}/Applications/t3 (Beta).app"
    "${HOME}/Applications/T3 Code (Beta).app"
    "${HOME}/Applications/T3 Code.app"
  )
  for candidate in "${CANDIDATES[@]}"; do
    if [[ -d "${candidate}" ]]; then
      TARGET_APP="${candidate}"
      break
    fi
  done
fi

if [[ -z "${TARGET_APP}" || ! -d "${TARGET_APP}" ]]; then
  echo "Error: No T3 Code installation found in /Applications." >&2
  echo "Please install T3 Code from https://t3.codes first (or run with --build-full), then re-run this command." >&2
  exit 1
fi

ASAR_PATH="${TARGET_APP}/Contents/Resources/app.asar"
PLIST_PATH="${TARGET_APP}/Contents/Info.plist"
if [[ ! -f "${ASAR_PATH}" || ! -f "${PLIST_PATH}" ]]; then
  echo "Error: Invalid app bundle structure at ${TARGET_APP}" >&2
  exit 1
fi

APP_BASENAME="$(basename "${TARGET_APP}" .app)"
SAFE_ID="$(printf '%s' "${APP_BASENAME}" | tr ' ()/' '____')"
APP_VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "${PLIST_PATH}" 2>/dev/null || echo "unknown")"
BACKUP_DIR="${BACKUP_ROOT}/${SAFE_ID}"
mkdir -p "${BACKUP_DIR}"

SAVED_VERSION=""
if [[ -f "${BACKUP_DIR}/version.txt" ]]; then
  SAVED_VERSION="$(cat "${BACKUP_DIR}/version.txt")"
fi

if [[ ! -f "${BACKUP_DIR}/app.asar.orig" || "${SAVED_VERSION}" != "${APP_VERSION}" ]]; then
  if ! grep -q "T3_QUOTA_UI_START" "${ASAR_PATH}" 2>/dev/null; then
    echo "==> Backing up original ${APP_BASENAME} (${APP_VERSION}) to ${BACKUP_DIR}..."
    cp -f "${ASAR_PATH}" "${BACKUP_DIR}/app.asar.orig"
    cp -f "${PLIST_PATH}" "${BACKUP_DIR}/Info.plist.orig"
    printf '%s\n' "${APP_VERSION}" > "${BACKUP_DIR}/version.txt"
    printf '%s\n' "${TARGET_APP}" > "${BACKUP_DIR}/target-app.txt"
  else
    echo "==> Existing Quota UI patch detected on ${APP_BASENAME} (${APP_VERSION})."
    printf '%s\n' "${TARGET_APP}" > "${BACKUP_DIR}/target-app.txt"
  fi
else
  echo "==> Restoring clean base from backup (${APP_VERSION}) before applying patch..."
  cp -f "${BACKUP_DIR}/app.asar.orig" "${ASAR_PATH}"
  cp -f "${BACKUP_DIR}/Info.plist.orig" "${PLIST_PATH}"
fi

PATCHER_MJS="$(resolve_script "patch-asar.mjs")"

# Resolve JS runtime: system node (>=18) or bundled Electron binary inside T3 Code
if command -v node >/dev/null 2>&1; then
  echo "==> Applying Quota UI patch using Node ($(node -v))..."
  node "${PATCHER_MJS}" --app "${TARGET_APP}" --lang "${LANG_MODE}"
else
  EXEC_NAME="$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "${PLIST_PATH}")"
  ELECTRON_BIN="${TARGET_APP}/Contents/MacOS/${EXEC_NAME}"
  echo "==> Applying Quota UI patch using bundled Electron runtime..."
  ELECTRON_RUN_AS_NODE=1 "${ELECTRON_BIN}" "${PATCHER_MJS}" --app "${TARGET_APP}" --lang "${LANG_MODE}"
fi

# Clear stale V8 compile cache if present so patched server bundles load immediately
if [[ -d "${TARGET_APP}/Contents/Resources/server-compile-cache" ]]; then
  rm -rf "${TARGET_APP}/Contents/Resources/server-compile-cache/"* 2>/dev/null || true
fi

# Ensure Antigravity release metadata compatibility across T3 builds
fix_antigravity_install_metadata

# Remove quarantine attribute if present & re-sign ad-hoc so macOS accepts modified ASAR
xattr -cr "${TARGET_APP}" 2>/dev/null || true
echo "==> Re-signing ${TARGET_APP}..."
codesign --force --deep --sign - "${TARGET_APP}"
codesign --verify --deep --strict "${TARGET_APP}"

if [[ "${AUTO_RELAUNCH}" == "1" ]]; then
  echo "==> Restarting ${APP_BASENAME}..."
  osascript -e "quit app \"${APP_BASENAME}\"" >/dev/null 2>&1 || true
  sleep 1
  open -a "${TARGET_APP}"
fi

cat <<EOF

====================================================================
  ✅ T3 Code Quota UI Enhanced Edition v1.1.1 Installed!
====================================================================
  • Patched App : ${TARGET_APP}
  • Default UI  : ${LANG_MODE} (Switchable live via [中 / EN] in Usage)
  • Currency    : [¥ CNY / \$ USD] live toggle in Usage toolbar
  • Safe Backup : ${BACKUP_DIR}

  👉 Next Step:
     Press Cmd + Q to quit T3 Code completely, then reopen it!
     (Open "用量与配额 / Usage" to switch [¥ CNY / \$ USD] & [中 / EN])

  🔄 Rollback anytime:
     curl -fsSL ${REPO_RAW_BASE}/uninstall.sh | bash
====================================================================
EOF
