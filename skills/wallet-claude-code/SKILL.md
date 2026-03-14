---
name: wallet-claude-code
description: Access Wallet from Claude Code through the local wallet CLI. Use when the user asks to connect Wallet, link Pluggy, inspect balances, list transactions, summarize spending, or use Open Finance data from Claude Code. Trigger on phrases like wallet setup, conectar wallet, conectar pluggy, saldo, transacoes, gastos, or open finance.
---

# Wallet Claude Code

## Instructions

1. Treat `wallet` as the official local adapter for Claude Code.
2. For local agent flows, do not ask the user for MCP configuration, OpenAPI setup, or raw tokens.
3. When the user wants to connect Wallet, run `wallet setup`.
4. Tell the user that the browser will open for Google login and, only if needed, for Pluggy connection.
5. After `wallet setup` completes, confirm access with `wallet status --json`.
6. For read operations, prefer JSON output:
   - `wallet status --json`
   - `wallet accounts --json`
   - `wallet balances --json`
   - `wallet transactions --limit 50 --json`
   - `wallet spending --json`
7. If `wallet` is not found, tell the user to run the install script.

## Examples

- User asks to connect Wallet in Claude Code:
  - Run `wallet setup`
  - Wait for the browser handoff to finish
  - Run `wallet status --json`

- User asks for balances:
  - Run `wallet balances --json`
  - Summarize the balances clearly

- User asks for recent transactions:
  - Run `wallet transactions --limit 25 --json`
  - Summarize patterns or answer directly

## Guidelines

- Prefer the CLI over reading local credential files directly.
- Use JSON output when the result will be consumed by the model.
- If setup fails because access was revoked or expired, rerun `wallet setup`.
- If the CLI reports missing authentication, send the user through `wallet setup` rather than trying to recover tokens manually.
