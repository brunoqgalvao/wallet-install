---
name: wallet
description: Connect your bank accounts to Claude Code via Wallet. Use when the user wants to check balances, see transactions, view spending, or connect their financial data. Triggers on phrases like "connect my bank", "show my balances", "financial data", "open finance", "wallet setup".
---

# Wallet - Open Finance for AI Agents

## What This Does

Wallet gives Claude Code secure, scoped access to the user's bank accounts via Open Finance (Pluggy). The user controls which data the agent can see, and can revoke access at any time from the Wallet dashboard.

## Setup Flow

If the user hasn't set up Wallet yet, run the CLI setup command:

```bash
wallet setup
```

This will:
1. Open the browser for Google sign-in
2. If the user has no bank connections, open Pluggy to connect a bank
3. Create an agent token and save credentials to `~/.wallet/credentials.json`

## Available Commands (CLI)

Once set up, the CLI provides these commands:

- `wallet balances` — Show all account balances
- `wallet accounts` — List connected accounts
- `wallet transactions [--limit N]` — Recent transactions
- `wallet spending` — Monthly spending by category
- `wallet status` — Connection status and agent info
- `wallet logout` — Remove stored credentials

All commands support `--json` for structured output.

## MCP Tools (when configured)

When the Wallet MCP server is configured, these tools are available:

- `wallet_get_balances` — Current balances for all accounts
- `wallet_get_accounts` — List of connected accounts
- `wallet_get_transactions` — Recent transactions (with limit param)
- `wallet_get_spending_summary` — Current month spending by category
- `wallet_get_context` — Agent capabilities and connected sources

## Troubleshooting

- **"Agent token is invalid"**: Run `wallet setup` to re-authenticate
- **"Access denied"**: The scope might not be enabled. Check the Wallet dashboard
- **"Could not reach Wallet API"**: Make sure `WALLET_API_ORIGIN` is set correctly
