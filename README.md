# Wallet Install

One-command installer for the Wallet CLI + Claude Code skills.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/brunoqgalvao/wallet-install/main/install.sh | bash
```

## What gets installed

- **`wallet` CLI** → `~/.wallet/bin/wallet`
- **MCP server** → `~/.wallet/mcp/`
- **Claude Code skills** → `.claude/skills/wallet/` and `.claude/skills/wallet-claude-code/` in your current project

## After install

```bash
# 1. Reload your shell
source ~/.zshrc  # or ~/.bashrc

# 2. Set your API endpoint
export WALLET_API_ORIGIN=https://your-api-url.example.com

# 3. Run setup (opens browser for Google sign-in)
wallet setup

# 4. In Claude Code, just say: "show my balances"
```

## Requirements

- Node.js 18+
- A Claude Code project (for skills installation)
