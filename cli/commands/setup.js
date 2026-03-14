import { hostname } from "node:os";
import { apiGet, apiPost } from "../lib/api.js";
import { loadCredentials, saveCredentials } from "../lib/credentials.js";
import { openBrowser } from "../lib/browser.js";
import { printJson } from "../lib/output.js";
export async function setupCommand(args = []) {
    const jsonOutput = args.includes("--json");
    const existing = loadCredentials();
    const origin = process.env.WALLET_API_ORIGIN ?? existing?.apiOrigin ?? "http://localhost:3000";
    // If already configured, check if it still works
    if (existing) {
        try {
            const ctx = (await apiGet(origin, "/api/agent/context", existing.agentToken));
            if (jsonOutput) {
                printJson({
                    status: "already_connected",
                    agent: ctx.agent,
                    scopes: ctx.scopes,
                    sourceConnectionCount: ctx.sourceConnections.length,
                    apiOrigin: origin,
                });
                return;
            }
            console.log(`Already connected as ${ctx.agent.name}`);
            console.log(`Scopes: ${ctx.scopes.join(", ")}`);
            console.log(`Source connections: ${ctx.sourceConnections.length}`);
            console.log("\nSetup complete! Try: wallet balances");
            return;
        }
        catch {
            console.log("Session expired. Re-authenticating...");
        }
    }
    // Start fresh setup
    console.log("Starting Wallet setup...\n");
    const machineName = hostname();
    const startResponse = (await apiPost(origin, "/v1/cli/setup-sessions", {
        machineName,
    }));
    const { setupSessionId, browserUrl, pollToken, pollIntervalMs } = startResponse;
    console.log("Opening browser for Google sign-in...");
    openBrowser(browserUrl);
    console.log("If the browser didn't open, visit:\n  " + browserUrl + "\n");
    console.log("Waiting for authentication...");
    // Poll for completion
    const interval = pollIntervalMs || 1500;
    const maxAttempts = Math.ceil((15 * 60 * 1000) / interval);
    let result = null;
    for (let i = 0; i < maxAttempts; i++) {
        await sleep(interval);
        const poll = (await apiGet(origin, `/v1/cli/setup-sessions/${setupSessionId}/poll?pollToken=${encodeURIComponent(pollToken)}`));
        if (poll.status === "completed") {
            result = poll;
            break;
        }
        if (poll.status === "expired") {
            console.error("\nSetup session expired. Try again: wallet setup");
            process.exit(1);
        }
        if (poll.status === "awaiting_source_connection") {
            if (i === 0 || i % 5 === 0) {
                process.stdout.write("\nWaiting for bank connection...");
            }
        }
        process.stdout.write(".");
    }
    if (!result || result.status !== "completed") {
        console.error("\nSetup timed out. Try again: wallet setup");
        process.exit(1);
    }
    console.log("\n\nSetup complete!");
    // Save credentials
    saveCredentials({
        apiOrigin: origin,
        agentToken: result.accessToken,
        agentId: result.agent.id,
        agentName: result.agent.name,
        createdAt: new Date().toISOString(),
    });
    if (jsonOutput) {
        printJson({
            status: "completed",
            agent: result.agent,
            apiOrigin: origin,
        });
        return;
    }
    console.log(`Agent: ${result.agent.name}`);
    console.log(`Scopes: ${result.agent.scopes.join(", ")}`);
    console.log("\nWallet is ready in Claude Code.");
    console.log("Try: wallet balances");
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
