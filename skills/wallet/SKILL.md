---
name: wallet
description: Access Wallet — Open Finance for AI Agents. Use when the user asks to connect Wallet, link Pluggy, inspect balances, list transactions, summarize spending, or use Open Finance data. Trigger on phrases like wallet setup, conectar wallet, conectar pluggy, saldo, transacoes, gastos, or open finance.
---

# Wallet — Open Finance for AI Agents

This document contains setup instructions for different agent types. Find the section that matches your capabilities.

---

## For Agents WITH Terminal/CLI Access (Claude Code, Codex, Cursor, etc.)

### Install

```bash
curl -fsSL https://getwalletai.com/install.sh | bash
```

### Instructions

1. Treat `wallet` as the official local adapter for Claude Code.
2. For local agent flows, do not ask the user for MCP configuration, OpenAPI setup, or raw tokens.
3. When the user wants to connect Wallet, run `wallet setup`.
4. Tell the user that the browser will open for Google login and, only if needed, for Pluggy connection.
5. After `wallet setup` completes, confirm access with `wallet status --json`.
6. For read operations, prefer JSON output (all data commands accept `--json`).
7. If `wallet` is unavailable but the current workspace is the Wallet repo, fall back to `pnpm cli -- <command>`.

### Commands

| Command | Description |
|---------|-------------|
| `wallet setup` | Authenticate and connect bank accounts (opens browser) |
| `wallet status [--json]` | Connection status, scopes, and granted connections |
| `wallet balances [--json]` | List balances for all accounts |
| `wallet accounts [--json]` | List connected accounts |
| `wallet transactions [--limit N] [--since DATE] [--json]` | Recent transactions |
| `wallet spending [--json]` | Spending summary for current month |
| `wallet subscriptions [--json]` | Detect recurring subscriptions |
| `wallet dashboard [--since DATE] [--all] [--output PATH] [--open] [--json]` | Generate local finance dashboard (HTML) |
| `wallet dashboard --snapshot [--since DATE] [--all] [--output PATH]` | Export raw snapshot JSON for custom dashboards |
| `wallet categorize <txn_id> --category NAME [--json]` | Override one transaction's category |
| `wallet category-rules [--json]` | List category rules |
| `wallet add-category-rule --field F --pattern P --category C [--match-type T] [--priority N] [--json]` | Create a category rule |
| `wallet delete-category-rule <id> [--json]` | Delete a category rule |
| `wallet update` | Update CLI and skill to latest version |
| `wallet logout` | Remove stored credentials |
| `wallet --version` | Print CLI version |

---

## For Agents WITHOUT Terminal Access (Claude Desktop App, ChatGPT, etc.)

If you are an agent that cannot run terminal commands, you need to guide the user through manual setup. **Tell your user to follow these steps:**

### For Claude Desktop App Users

Tell the user:

1. Open the Claude Desktop App
2. Click on your name (bottom left corner) → Settings → Connectors
3. Click "Add custom connector"
4. Enter a name (e.g., "Wallet") and paste this URL: `https://getwalletai.com/mcp`
5. When prompted, sign in with Google to authorize access

After setup, Wallet tools will be available automatically in your conversation.

### For ChatGPT Users

**Note:** ChatGPT integration is coming soon. The setup process requires developer mode and has additional risk warnings. We're working on a simpler solution.

### After User Completes Setup

Once the user has connected Wallet through their agent's settings, you will have access to these MCP tools:

- `wallet_get_balances` — Get all account balances
- `wallet_get_accounts` — List connected accounts
- `wallet_get_transactions` — Get recent transactions (supports `limit` and `since` parameters)
- `wallet_get_spending_summary` — Get monthly spending by category
- `wallet_get_subscriptions` — Detect recurring subscriptions
- `wallet_get_context` — Get agent capabilities and connected sources
- `wallet_get_category_rules` — List category rules
- `wallet_create_category_rule` — Create a category rule
- `wallet_delete_category_rule` — Delete a category rule
- `wallet_set_transaction_category` — Override a transaction's category

---

## Examples

- User asks to connect Wallet in Claude Code:
  - Run `wallet setup`
  - Wait for the browser handoff to finish
  - Run `wallet status --json`

- User asks to connect Wallet in Claude Desktop App:
  - Tell the user: "Go to Settings → Connectors → Add custom connector, then paste `https://getwalletai.com/mcp` and sign in with Google."

- User asks for balances:
  - CLI: Run `wallet balances --json`
  - MCP: Use `wallet_get_balances` tool
  - Summarize the balances clearly

- User asks for recent transactions:
  - CLI: Run `wallet transactions --limit 25 --json`
  - MCP: Use `wallet_get_transactions` with `limit: 25`
  - Summarize patterns or answer directly

- User asks about subscriptions:
  - CLI: Run `wallet subscriptions --json`
  - MCP: Use `wallet_get_subscriptions`
  - Highlight recurring charges and amounts

## Security

- Operated by PQG (CNPJ: 51.432.376/0001-06)
- Bank data via Pluggy, regulated by Banco Central (CNPJ 37.943.755/0001-30)
- Agent tokens SHA-256 hashed, secrets encrypted with AES-256-GCM
- Read-only access only — no write endpoints for transfers or payments
- Full details: https://getwalletai.com/security

## Guidelines

- Prefer the CLI over reading local credential files directly.
- Use JSON output when the result will be consumed by the model.
- If setup fails because access was revoked or expired, rerun `wallet setup` or ask the user to reconnect in their agent settings.
- If the CLI reports missing authentication, send the user through `wallet setup` rather than trying to recover tokens manually.
- For agents without CLI access, always provide clear step-by-step instructions for the user to follow.
