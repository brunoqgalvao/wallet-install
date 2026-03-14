import { apiGet } from "../lib/api.js";
import { loadCredentials } from "../lib/credentials.js";
import { printJson, printTable } from "../lib/output.js";
export async function accountsCommand(args = []) {
    const jsonOutput = args.includes("--json");
    const creds = loadCredentials();
    if (!creds) {
        console.error("Not authenticated. Run: wallet setup");
        process.exit(1);
    }
    const data = await apiGet(creds.apiOrigin, "/api/agent/accounts", creds.agentToken);
    if (jsonOutput) {
        printJson(data);
        return;
    }
    if (!data.accounts || data.accounts.length === 0) {
        console.log("No accounts found.");
        return;
    }
    const rows = data.accounts.map(a => [
        a.name,
        a.type,
        a.institutionName || "-",
        a.connectionLabel,
        a.currencyCode,
    ]);
    printTable(["Name", "Type", "Institution", "Connection", "Currency"], rows);
}
