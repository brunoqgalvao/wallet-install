import { apiGet } from "../lib/api.js";
import { loadCredentials } from "../lib/credentials.js";
import { printJson } from "../lib/output.js";
export async function statusCommand(args = []) {
    const jsonOutput = args.includes("--json");
    const creds = loadCredentials();
    if (!creds) {
        console.error("Not authenticated. Run: wallet setup");
        process.exit(1);
    }
    const ctx = await apiGet(creds.apiOrigin, "/api/agent/context", creds.agentToken);
    if (jsonOutput) {
        printJson(ctx);
        return;
    }
    console.log("Agent:");
    console.log(`  Name: ${ctx.agent.name}`);
    console.log(`  ID: ${ctx.agent.id}`);
    console.log(`  Kind: ${ctx.agent.kind}`);
    console.log(`  Status: ${ctx.agent.status}`);
    console.log(`  Token configured: ${ctx.agent.tokenConfigured ? "yes" : "no"}`);
    console.log("\nScopes:");
    for (const scope of ctx.scopes) {
        console.log(`  - ${scope}`);
    }
    console.log("\nCapabilities:");
    for (const [capability, enabled] of Object.entries(ctx.capabilities)) {
        if (enabled) {
            console.log(`  - ${capability}`);
        }
    }
    console.log("\nSource connections:");
    if (ctx.sourceConnections.length === 0) {
        console.log("  - none");
        return;
    }
    for (const connection of ctx.sourceConnections) {
        console.log(`  - ${connection.label} (${connection.provider})`);
    }
}
