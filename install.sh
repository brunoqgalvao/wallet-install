#!/usr/bin/env bash
set -euo pipefail

# Wallet installer — CLI + MCP Server + Skills
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

# Self-contained bundle — no npm install needed
cat > "$MCP_DIR/package.json" << 'PKG'
{ "type": "module" }
PKG

ok "MCP server installed (self-contained, no dependencies)"

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
  mkdir -p "$SKILLS_TARGET/wallet"
  cp "$SRC_DIR/skills/wallet/SKILL.md" "$SKILLS_TARGET/wallet/SKILL.md"
  ok "Skills installed"
else
  warn "No .claude/ directory found in current project."
  warn "To install skills manually, copy from ~/.wallet/skills/"
  mkdir -p "$INSTALL_DIR/skills/wallet"
  cp "$SRC_DIR/skills/wallet/SKILL.md" "$INSTALL_DIR/skills/wallet/SKILL.md"
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

# --- Configure Claude Desktop MCP ---

CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

if [ "$(uname)" = "Darwin" ] && [ -d "$CLAUDE_CONFIG_DIR" ]; then
  info "Configuring Claude Desktop MCP..."

  if [ -f "$CLAUDE_CONFIG_FILE" ]; then
    # Config file exists — check if wallet is already configured
    if grep -q '"wallet"' "$CLAUDE_CONFIG_FILE" 2>/dev/null; then
      ok "Claude Desktop already configured with Wallet MCP"
    else
      # Add wallet to existing config using python3 (available on all Macs)
      if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json

config_path = '$CLAUDE_CONFIG_FILE'
mcp_path = '$MCP_DIR/index.js'

with open(config_path, 'r') as f:
    config = json.load(f)

if 'mcpServers' not in config:
    config['mcpServers'] = {}

config['mcpServers']['wallet'] = {
    'command': 'node',
    'args': [mcp_path]
}

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
"
        ok "Added Wallet MCP to Claude Desktop config"
      else
        warn "Could not auto-configure Claude Desktop (python3 not found)."
        warn "Add manually to: $CLAUDE_CONFIG_FILE"
      fi
    fi
  else
    # Create config file from scratch
    cat > "$CLAUDE_CONFIG_FILE" << MCPCONFIG
{
  "mcpServers": {
    "wallet": {
      "command": "node",
      "args": ["$MCP_DIR/index.js"]
    }
  }
}
MCPCONFIG
    ok "Created Claude Desktop config with Wallet MCP"
  fi
elif [ "$(uname)" = "Darwin" ]; then
  warn "Claude Desktop not found. To add MCP later, put this in:"
  warn "  ~/Library/Application Support/Claude/claude_desktop_config.json"
  echo ""
  echo "  {"
  echo "    \"mcpServers\": {"
  echo "      \"wallet\": {"
  echo "        \"command\": \"node\","
  echo "        \"args\": [\"$MCP_DIR/index.js\"]"
  echo "      }"
  echo "    }"
  echo "  }"
fi

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
echo -e "  ${BLUE}2.${NC} For ${YELLOW}Claude Code${NC}:"
echo -e "     Run ${YELLOW}wallet setup${NC} then say ${YELLOW}\"show my balances\"${NC}"
echo ""
echo -e "  ${BLUE}3.${NC} For ${YELLOW}Claude Desktop${NC}:"
echo -e "     Restart the app, then ask Claude to use ${YELLOW}wallet_setup${NC}"
echo -e "     (the browser will open for Google sign-in)"
echo ""
echo -e "  API: ${BLUE}$API_ORIGIN${NC}"
echo ""
