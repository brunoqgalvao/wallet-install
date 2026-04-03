---
name: wallet
description: Access Wallet — Open Finance for AI Agents. Use when the user asks to connect Wallet, link Pluggy, inspect balances, list transactions, summarize spending, or use Open Finance data. Trigger on phrases like wallet setup, conectar wallet, conectar pluggy, saldo, transacoes, gastos, or open finance.
---

# Wallet — Open Finance for AI Agents

## Install

```bash
curl -fsSL https://getwalletai.com/install.sh | bash
```

## Instructions

1. Treat `wallet` as the official local adapter for Claude Code.
2. For local agent flows, do not ask the user for MCP configuration, OpenAPI setup, or raw tokens.
3. When the user wants to connect Wallet, run `wallet setup`.
4. Tell the user that the browser will open for Google login and, only if needed, for Pluggy connection.
5. After `wallet setup` completes, confirm access with `wallet status --json`.
6. For read operations, prefer JSON output (all data commands accept `--json`).
7. If `wallet` is unavailable but the current workspace is the Wallet repo, fall back to `pnpm cli -- <command>`.

## Commands

| Command | Description |
|---------|-------------|
| `wallet setup` | Authenticate and connect bank accounts (opens browser) |
| `wallet status [--json]` | Connection status, scopes, and granted connections |
| `wallet balances [--json]` | List balances for all accounts |
| `wallet accounts [--json]` | List connected accounts |
| `wallet transactions [--limit N] [--since DATE] [--json]` | Recent transactions |
| `wallet spending [--json]` | Spending summary for current month |
| `wallet subscriptions [--json]` | Detect recurring subscriptions |
| `wallet fee-audit [--json]` | Audit bank fees and find avoidable charges |
| `wallet email-status [--json]` | Check Gmail connection status and get access token |
| `wallet dashboard [--since DATE] [--all] [--output PATH] [--open] [--json]` | Generate local finance dashboard (HTML) |
| `wallet dashboard --snapshot [--since DATE] [--all] [--output PATH]` | Export raw snapshot JSON for custom dashboards |
| `wallet categorize <txn_id> --category NAME [--json]` | Override one transaction's category |
| `wallet category-rules [--json]` | List category rules |
| `wallet add-category-rule --field F --pattern P --category C [--match-type T] [--priority N] [--json]` | Create a category rule |
| `wallet delete-category-rule <id> [--json]` | Delete a category rule |
| `wallet update` | Update CLI and skill to latest version |
| `wallet logout` | Remove stored credentials |
| `wallet --version` | Print CLI version |

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

- User asks about subscriptions:
  - Run `wallet subscriptions --json`
  - Highlight recurring charges and amounts

- User wants to categorize spending:
  - Run `wallet spending --json` to see current categories
  - Use `wallet categorize <txn_id> --category "Food"` to override
  - Use `wallet add-category-rule` to create persistent rules

## Try It Out

After setup, suggest prompts like:
- "Quanto gastei com delivery esse mês?"
- "Mostra minhas assinaturas recorrentes"
- "Gera meu dashboard financeiro"
- "Categoriza meus gastos do mês"
- "Quais contas estão conectadas?"

## Security

- Operated by PQG (CNPJ: 51.432.376/0001-06)
- Bank connection via Pluggy, regulated by Banco Central do Brasil as ITP
- Read-only access — no endpoints for transfers or payments
- Agent tokens SHA-256 hashed, secrets encrypted with AES-256-GCM
- Per-agent, per-bank revocation from the dashboard
- Full details: https://getwalletai.com/security

## Guidelines

- Prefer the CLI over reading local credential files directly.
- Use JSON output when the result will be consumed by the model.
- Credentials persist in `~/.wallet/credentials.json` — the user only needs `wallet setup` once.
- If setup fails because access was revoked or expired, rerun `wallet setup`.
- If the CLI reports missing authentication, send the user through `wallet setup` rather than trying to recover tokens manually.
