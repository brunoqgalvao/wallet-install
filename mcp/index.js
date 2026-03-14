#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const AGENT_TOKEN = process.env.WALLET_AGENT_TOKEN;
const API_URL = process.env.WALLET_API_URL ?? process.env.WALLET_API_ORIGIN ?? "http://localhost:3000";
if (!AGENT_TOKEN) {
    console.error("WALLET_AGENT_TOKEN is required. Run 'wallet setup' to configure.");
    process.exit(1);
}
// --- API client ---
async function apiGet(path, params) {
    const url = new URL(path, API_URL);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
    }
    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${AGENT_TOKEN}`,
            Accept: "application/json",
        },
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = body.error?.message ?? response.statusText;
        if (response.status === 401) {
            throw new Error("Agent token is invalid or revoked. Run 'wallet setup' to re-authenticate.");
        }
        if (response.status === 403) {
            throw new Error(`Access denied: ${message}. Check scope settings in the Wallet dashboard.`);
        }
        throw new Error(`API error (${response.status}): ${message}`);
    }
    return response.json();
}
function toolError(error) {
    return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    };
}
function toolResult(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
}
// --- Server ---
const server = new McpServer({
    name: "wallet-mcp-server",
    version: "0.1.0",
});
server.registerTool("wallet_get_balances", {
    title: "Get Account Balances",
    description: "Get current balances for all connected bank accounts. " +
        "Returns accountId, accountName, institutionName, currencyCode, balance, and connectionLabel for each account. " +
        "Requires balances.read scope.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
    try {
        return toolResult(await apiGet("/api/agent/balances"));
    }
    catch (error) {
        return toolError(error);
    }
});
server.registerTool("wallet_get_accounts", {
    title: "Get Connected Accounts",
    description: "List all connected bank accounts. " +
        "Returns id, name, type (checking/savings/credit_card/investment), institutionName, currencyCode, and connectionLabel. " +
        "Requires accounts.read scope.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
    try {
        return toolResult(await apiGet("/api/agent/accounts"));
    }
    catch (error) {
        return toolError(error);
    }
});
server.registerTool("wallet_get_transactions", {
    title: "Get Recent Transactions",
    description: "Get recent transactions across all connected accounts. " +
        "Returns bookedAt, description, merchantName, category, amount (negative=expense), currencyCode, accountName, connectionLabel. " +
        "Requires transactions.read scope.",
    inputSchema: {
        limit: z.number().int().min(1).max(200).default(25).describe("Max transactions to return (1-200, default 25)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ limit }) => {
    try {
        return toolResult(await apiGet("/api/agent/transactions", { limit: String(limit) }));
    }
    catch (error) {
        return toolError(error);
    }
});
server.registerTool("wallet_get_spending_summary", {
    title: "Get Spending Summary",
    description: "Get current month spending summary by category. " +
        "Returns total spending and category breakdown. Only includes expenses (negative amounts). " +
        "Requires transactions.read scope.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
    try {
        return toolResult(await apiGet("/api/agent/spending-summary"));
    }
    catch (error) {
        return toolError(error);
    }
});
server.registerTool("wallet_get_context", {
    title: "Get Agent Context",
    description: "Get this agent's context: enabled scopes, connected sources, and capabilities. " +
        "Useful for checking what data this agent can access before making other calls.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
    try {
        return toolResult(await apiGet("/api/agent/context"));
    }
    catch (error) {
        return toolError(error);
    }
});
// --- Start ---
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Wallet MCP server running via stdio");
}
main().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
});
