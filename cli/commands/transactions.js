import { apiGet } from "../lib/api.js";
import { loadCredentials } from "../lib/credentials.js";
import { formatCurrency, formatDate, printJson, printTable } from "../lib/output.js";
export async function transactionsCommand(args) {
    const jsonOutput = args.includes("--json");
    const creds = loadCredentials();
    if (!creds) {
        console.error("Not authenticated. Run: wallet setup");
        process.exit(1);
    }
    // Parse --limit flag
    let limit = 20;
    const limitIndex = args.indexOf("--limit");
    if (limitIndex !== -1 && args[limitIndex + 1]) {
        const parsed = parseInt(args[limitIndex + 1], 10);
        if (!isNaN(parsed) && parsed > 0) {
            limit = parsed;
        }
    }
    const data = await apiGet(creds.apiOrigin, `/api/agent/transactions?limit=${limit}`, creds.agentToken);
    if (jsonOutput) {
        printJson(data);
        return;
    }
    if (!data.transactions || data.transactions.length === 0) {
        console.log("No transactions found.");
        return;
    }
    const rows = data.transactions.map(t => [
        formatDate(t.bookedAt),
        t.accountName,
        t.connectionLabel,
        t.description.slice(0, 40),
        formatCurrency(t.amount, t.currencyCode),
        t.category || "-",
    ]);
    printTable(["Date", "Account", "Connection", "Description", "Amount", "Category"], rows);
    console.log(`\nShowing ${data.transactions.length} transactions`);
}
