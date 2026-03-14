#!/usr/bin/env bash
set -euo pipefail

# Wallet installer — CLI + Skills for Claude Code
# Usage: curl -fsSL https://raw.githubusercontent.com/brunoqgalvao/wallet-install/main/install.sh | bash

REPO="brunoqgalvao/wallet-install"
BRANCH="main"
INSTALL_DIR="$HOME/.wallet"
BIN_DIR="$INSTALL_DIR/bin"
MCP_DIR="$INSTALL_DIR/mcp"
API_ORIGIN="https://api-production-a386.up.railway.app"
TARBALL_URL="https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}▸${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Wallet — Open Finance for AI     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# --- Pre-flight checks ---

command -v node >/dev/null 2>&1 || fail "Node.js is required. Install it from https://nodejs.org"

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js 18+ is required (found v$(node -v))"
fi

command -v npm >/dev/null 2>&1 || fail "npm is required"

# --- Download ---

info "Downloading Wallet..."
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$TARBALL_URL" | tar -xz -C "$TMP_DIR"
SRC_DIR="$TMP_DIR/wallet-install-$BRANCH"

if [ ! -d "$SRC_DIR" ]; then
  fail "Download failed. Check your internet connection."
fi

ok "Downloaded"

# --- Install CLI ---

info "Installing CLI to $BIN_DIR..."
mkdir -p "$BIN_DIR"
rm -rf "$BIN_DIR/cli"
cp -r "$SRC_DIR/cli" "$BIN_DIR/cli"

# Create the wallet executable
cat > "$BIN_DIR/wallet" << 'WRAPPER'
#!/usr/bin/env node
import("./cli/index.js");
WRAPPER

chmod +x "$BIN_DIR/wallet"

# Create a package.json so Node resolves the ESM import
cat > "$BIN_DIR/package.json" << 'PKG'
{ "type": "module" }
PKG

ok "CLI installed"

# --- Install MCP server ---

info "Installing MCP server to $MCP_DIR..."
mkdir -p "$MCP_DIR"
cp "$SRC_DIR/mcp/index.js" "$MCP_DIR/index.js"

# MCP server needs @modelcontextprotocol/sdk and zod
cat > "$MCP_DIR/package.json" << 'PKG'
{
  "name": "wallet-mcp-server",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.0"
  }
}
PKG

(cd "$MCP_DIR" && npm install --production --silent 2>/dev/null)
ok "MCP server installed"

# --- Install skills ---

SKILLS_TARGET=""

# Check if we're inside a project with .claude/
if [ -d ".claude" ]; then
  SKILLS_TARGET="$(pwd)/.claude/skills"
elif [ -d "$(git rev-parse --show-toplevel 2>/dev/null)/.claude" ]; then
  SKILLS_TARGET="$(git rev-parse --show-toplevel)/.claude/skills"
fi

if [ -n "$SKILLS_TARGET" ]; then
  info "Installing skills to $SKILLS_TARGET..."
  mkdir -p "$SKILLS_TARGET/wallet" "$SKILLS_TARGET/wallet-claude-code"
  cp "$SRC_DIR/skills/wallet/SKILL.md" "$SKILLS_TARGET/wallet/SKILL.md"
  cp "$SRC_DIR/skills/wallet-claude-code/SKILL.md" "$SKILLS_TARGET/wallet-claude-code/SKILL.md"
  ok "Skills installed"
else
  warn "No .claude/ directory found in current project."
  warn "To install skills manually, copy from ~/.wallet/skills/"
  mkdir -p "$INSTALL_DIR/skills/wallet" "$INSTALL_DIR/skills/wallet-claude-code"
  cp "$SRC_DIR/skills/wallet/SKILL.md" "$INSTALL_DIR/skills/wallet/SKILL.md"
  cp "$SRC_DIR/skills/wallet-claude-code/SKILL.md" "$INSTALL_DIR/skills/wallet-claude-code/SKILL.md"
  info "Skills saved to $INSTALL_DIR/skills/ — copy them to your project's .claude/skills/ later."
fi

# --- PATH setup ---

SHELL_NAME=$(basename "$SHELL")
PROFILE=""

case "$SHELL_NAME" in
  zsh)  PROFILE="$HOME/.zshrc" ;;
  bash)
    if [ -f "$HOME/.bash_profile" ]; then
      PROFILE="$HOME/.bash_profile"
    else
      PROFILE="$HOME/.bashrc"
    fi
    ;;
  fish) PROFILE="$HOME/.config/fish/config.fish" ;;
  *)    PROFILE="$HOME/.profile" ;;
esac

if [ "$SHELL_NAME" = "fish" ]; then
  PATH_LINE="set -gx PATH $BIN_DIR \$PATH"
  API_LINE="set -gx WALLET_API_ORIGIN $API_ORIGIN"
else
  PATH_LINE="export PATH=\"$BIN_DIR:\$PATH\""
  API_LINE="export WALLET_API_ORIGIN=\"$API_ORIGIN\""
fi

if ! grep -q "WALLET_API_ORIGIN" "$PROFILE" 2>/dev/null; then
  echo "" >> "$PROFILE"
  echo "# Wallet CLI" >> "$PROFILE"
  echo "$PATH_LINE" >> "$PROFILE"
  echo "$API_LINE" >> "$PROFILE"
  ok "Added Wallet to PATH and configured API in $PROFILE"
elif ! grep -q "$BIN_DIR" "$PROFILE" 2>/dev/null; then
  echo "$PATH_LINE" >> "$PROFILE"
  ok "Added $BIN_DIR to PATH in $PROFILE"
else
  ok "PATH and API already configured"
fi

# Make wallet available in this session
export PATH="$BIN_DIR:$PATH"
export WALLET_API_ORIGIN="$API_ORIGIN"

# --- Done! ---

echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  Wallet installed successfully!${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "  Next steps:"
echo ""
echo -e "  ${BLUE}1.${NC} Reload your shell:"
echo -e "     ${YELLOW}source $PROFILE${NC}"
echo ""
echo -e "  ${BLUE}2.${NC} Run setup (opens browser for Google sign-in):"
echo -e "     ${YELLOW}wallet setup${NC}"
echo ""
echo -e "  ${BLUE}3.${NC} Then in Claude Code, just say: ${YELLOW}\"show my balances\"${NC}"
echo ""
echo -e "  API: ${BLUE}$API_ORIGIN${NC}"
echo ""
