#!/usr/bin/env node
import { setupCommand } from "./commands/setup.js";
import { statusCommand } from "./commands/status.js";
import { balancesCommand } from "./commands/balances.js";
import { accountsCommand } from "./commands/accounts.js";
import { transactionsCommand } from "./commands/transactions.js";
import { spendingCommand } from "./commands/spending.js";
import { logoutCommand } from "./commands/logout.js";
const USAGE = `
Wallet CLI - local adapter for Claude Code and other agent runtimes

Usage:
  wallet <command> [options]

Commands:
  setup          Set up authentication and connect your bank account
  status         Show connection status, scopes, and granted connections
  balances       List balances [--json]
  accounts       List connected accounts [--json]
  transactions   List recent transactions [--limit N] [--json]
  spending       Show spending summary [--json]
  logout         Remove stored credentials

Examples:
  wallet setup
  wallet status --json
  wallet balances --json
  wallet transactions --limit 50 --json

Environment:
  WALLET_API_ORIGIN    API endpoint (default: http://localhost:3000)
`;
async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (!command || command === "help" || command === "--help" || command === "-h") {
        console.log(USAGE);
        process.exit(0);
    }
    try {
        switch (command) {
            case "setup":
                await setupCommand(args);
                break;
            case "status":
                await statusCommand(args);
                break;
            case "balances":
                await balancesCommand(args);
                break;
            case "accounts":
                await accountsCommand(args);
                break;
            case "transactions":
                await transactionsCommand(args);
                break;
            case "spending":
                await spendingCommand(args);
                break;
            case "logout":
                await logoutCommand();
                break;
            default:
                console.error(`Unknown command: ${command}`);
                console.log(USAGE);
                process.exit(1);
        }
    }
    catch (error) {
        if (error instanceof Error && error.message.includes("fetch")) {
            // Already handled in api.ts
            process.exit(1);
        }
        console.error("Unexpected error:", error);
        process.exit(1);
    }
}
main();
