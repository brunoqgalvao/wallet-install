import { apiGet } from "../lib/api.js";
import { loadCredentials } from "../lib/credentials.js";
import { formatCurrency, printJson, printTable } from "../lib/output.js";
export async function spendingCommand(args = []) {
    const jsonOutput = args.includes("--json");
    const creds = loadCredentials();
    if (!creds) {
        console.error("Not authenticated. Run: wallet setup");
        process.exit(1);
    }
    const data = await apiGet(creds.apiOrigin, "/api/agent/spending-summary", creds.agentToken);
    if (jsonOutput) {
        printJson(data);
        return;
    }
    console.log(`Spending Summary - ${data.window}`);
    console.log("=".repeat(50));
    console.log(`Total spent: ${formatCurrency(data.total)}`);
    if (data.categories && data.categories.length > 0) {
        console.log("\nSpend by category:");
        const rows = data.categories.map(c => [
            c.category,
            formatCurrency(c.total),
        ]);
        printTable(["Category", "Amount"], rows);
    }
}
