import { apiGet } from "../lib/api.js";
import { loadCredentials } from "../lib/credentials.js";
import { formatCurrency, printJson, printTable } from "../lib/output.js";
export async function balancesCommand(args = []) {
    const jsonOutput = args.includes("--json");
    const creds = loadCredentials();
    if (!creds) {
        console.error("Not authenticated. Run: wallet setup");
        process.exit(1);
    }
    const data = await apiGet(creds.apiOrigin, "/api/agent/balances", creds.agentToken);
    if (jsonOutput) {
        printJson(data);
        return;
    }
    if (!data.balances || data.balances.length === 0) {
        console.log("No balances found.");
        return;
    }
    const rows = data.balances.map(b => [
        b.accountName,
        b.institutionName || "-",
        b.connectionLabel,
        formatCurrency(b.balance, b.currencyCode),
    ]);
    printTable(["Account", "Institution", "Connection", "Balance"], rows);
    const total = data.balances.reduce((sum, b) => sum + b.balance, 0);
    console.log(`\nTotal: ${formatCurrency(total, data.balances[0]?.currencyCode)}`);
}
