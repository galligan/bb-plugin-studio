#!/usr/bin/env bash
# Cloud Agent bootstrap for bb Plugin Studio.
#
# Runs from the repository root after checkout. Provisions the pinned toolchain
# (Bun + Node) on Cursor's default base image, then installs dependencies.
#
# Why the Node pin: plugins/studio has a test that spawns
# `node --experimental-strip-types` against the real better-sqlite3 native
# addon and asserts empty stderr. That requires a Node that (a) strips types
# without emitting the experimental warning (Node >= 22.18) and (b) keeps
# NODE_MODULE_VERSION 127 so the prebuilt better-sqlite3 binary loads (Node 22.x).
# The base image's default `node` can be an older 22.x that still prints the
# warning, so we pin an explicit >= 22.18 line.
set -euo pipefail

BUN_VERSION="1.3.14"
NODE_VERSION="22.22.2"

log() { printf '[bb-plugin-studio setup] %s\n' "$*"; }

# --- Bun (pinned to package.json's packageManager) ---
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
  log "installing Bun v$BUN_VERSION"
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi
log "bun $(bun --version)"

# --- Node (>= 22.18, ABI 127) via nvm ---
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  log "installing nvm"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
if ! nvm ls "$NODE_VERSION" >/dev/null 2>&1; then
  log "installing Node v$NODE_VERSION"
  nvm install "$NODE_VERSION"
fi
nvm alias default "$NODE_VERSION" >/dev/null
NODE_BIN="$NVM_DIR/versions/node/v${NODE_VERSION}/bin"
export PATH="$NODE_BIN:$PATH"
log "node $(node --version)"

# --- Persist toolchain PATH for future login/interactive shells so `node`
#     resolves to the pinned version ahead of any platform-provided default. ---
MARKER="# bb-plugin-studio toolchain pin"
if ! grep -qF "$MARKER" "$HOME/.bashrc" 2>/dev/null; then
  log "pinning toolchain PATH in ~/.bashrc"
  {
    echo ""
    echo "$MARKER"
    echo 'export BUN_INSTALL="$HOME/.bun"'
    echo "export PATH=\"$NODE_BIN:\$BUN_INSTALL/bin:\$PATH\""
  } >>"$HOME/.bashrc"
fi

# --- Dependencies ---
log "installing workspace dependencies"
bun install --frozen-lockfile

log "done"
