#!/usr/bin/env node

// src/commands/setup.ts
import { hostname } from "os";

// src/lib/update-notifier.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// src/lib/version.ts
var CLI_VERSION = true ? "0.2.0" : "0.0.0-dev";

// src/lib/update-notifier.ts
var NOTICE_DIR = join(homedir(), ".wallet");
var NOTICE_FILE = join(NOTICE_DIR, "update-notice.json");
var LATEST_VERSION_HEADER = "x-wallet-cli-latest-version";
var UPDATE_COMMAND_HEADER = "x-wallet-cli-update-command";
var NOTICE_TTL_MS = 24 * 60 * 60 * 1e3;
function maybeNotifyCliUpdate(headers) {
  const latestVersion = headers.get(LATEST_VERSION_HEADER)?.trim();
  if (!latestVersion || compareVersions(CLI_VERSION, latestVersion) >= 0) {
    return;
  }
  const state = loadUpdateNoticeState();
  if (!shouldNotify(state, latestVersion)) {
    return;
  }
  const updateCommand2 = headers.get(UPDATE_COMMAND_HEADER)?.trim() ?? "curl -fsSL https://getwalletai.com/install.sh | bash";
  console.error(`Wallet CLI update available: ${CLI_VERSION} -> ${latestVersion}`);
  console.error(`Run: ${updateCommand2}`);
  saveUpdateNoticeState({
    latestVersion,
    lastNotifiedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function shouldNotify(state, latestVersion) {
  if (!state || state.latestVersion !== latestVersion) {
    return true;
  }
  const lastNotifiedAt = Date.parse(state.lastNotifiedAt);
  if (Number.isNaN(lastNotifiedAt)) {
    return true;
  }
  return Date.now() - lastNotifiedAt >= NOTICE_TTL_MS;
}
function loadUpdateNoticeState() {
  try {
    if (!existsSync(NOTICE_FILE)) {
      return null;
    }
    return JSON.parse(readFileSync(NOTICE_FILE, "utf-8"));
  } catch {
    return null;
  }
}
function saveUpdateNoticeState(state) {
  try {
    if (!existsSync(NOTICE_DIR)) {
      mkdirSync(NOTICE_DIR, { recursive: true });
    }
    writeFileSync(NOTICE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
  }
}
function compareVersions(currentVersion, latestVersion) {
  const currentParts = parseVersionParts(currentVersion);
  const latestParts = parseVersionParts(latestVersion);
  const maxLength = Math.max(currentParts.length, latestParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const latestPart = latestParts[index] ?? 0;
    if (currentPart < latestPart) {
      return -1;
    }
    if (currentPart > latestPart) {
      return 1;
    }
  }
  return 0;
}
function parseVersionParts(version) {
  return version.split(".").map((part) => {
    const match = /^(\d+)/.exec(part);
    return match?.[1] ? Number.parseInt(match[1], 10) : 0;
  });
}

// src/lib/api.ts
var ApiError = class extends Error {
  constructor(status, statusText, body) {
    super(`HTTP ${status}: ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.name = "ApiError";
  }
};
async function handleResponse(res, options = {}) {
  maybeNotifyCliUpdate(res.headers);
  if (res.status === 401) {
    if (options.allowUnauthorized) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, res.statusText, body);
    }
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (options.allowForbidden) {
      throw new ApiError(res.status, res.statusText, body);
    }
    const message = body.message || "Access denied";
    console.error(`${message}`);
    console.error("This scope may not be enabled for your agent.");
    process.exit(1);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.message || res.statusText;
    if (res.status >= 500) {
      console.error("Server error:", message);
    } else {
      console.error("Error:", message);
    }
    throw new ApiError(res.status, res.statusText, body);
  }
  return res.json();
}
async function apiGet(origin, path, token, options) {
  try {
    const res = await fetch(`${origin}${path}`, {
      headers: buildHeaders(token)
    });
    return handleResponse(res, options);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error(`Could not reach Wallet API at ${origin}. Is it running?`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
async function apiPost(origin, path, body, token, options) {
  try {
    const headers = buildHeaders(token, {
      "Content-Type": "application/json"
    });
    const fetchOptions = {
      method: "POST",
      headers
    };
    if (body !== void 0) {
      fetchOptions.body = JSON.stringify(body);
    }
    const res = await fetch(`${origin}${path}`, fetchOptions);
    return handleResponse(res, options);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error(`Could not reach Wallet API at ${origin}. Is it running?`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
async function apiDelete(origin, path, token, options) {
  try {
    const res = await fetch(`${origin}${path}`, {
      method: "DELETE",
      headers: buildHeaders(token)
    });
    return handleResponse(res, options);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error(`Could not reach Wallet API at ${origin}. Is it running?`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
function buildHeaders(token, extraHeaders = {}) {
  return {
    ...extraHeaders,
    "X-Wallet-CLI-Version": CLI_VERSION,
    ...token ? { Authorization: `Bearer ${token}` } : {}
  };
}

// src/lib/agent-context.ts
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function readNullableString(value) {
  return typeof value === "string" ? value : null;
}
function readStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function readBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function readNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function readMetadata(value) {
  return isRecord(value) ? value : null;
}
function normalizeAccount(value) {
  const account = isRecord(value) ? value : {};
  return {
    id: readString(account.id),
    name: readString(account.name, "Account"),
    type: readString(account.type, "unknown"),
    currencyCode: readString(account.currencyCode, "BRL"),
    balance: readNumber(account.balance),
    lastFourDigits: readNullableString(account.lastFourDigits)
  };
}
function normalizeSourceConnection(value, index) {
  const connection = isRecord(value) ? value : {};
  const accounts = Array.isArray(connection.accounts) ? connection.accounts.map((account) => normalizeAccount(account)) : [];
  return {
    id: readString(connection.id, `connection_${index + 1}`),
    label: readString(
      connection.label,
      readString(connection.institutionName, `Connection ${index + 1}`)
    ),
    provider: readString(connection.provider, "unknown"),
    status: readString(connection.status, "active"),
    institutionName: readNullableString(connection.institutionName),
    metadata: readMetadata(connection.metadata),
    lastSyncAt: readNullableString(connection.lastSyncAt),
    createdAt: readString(connection.createdAt, (/* @__PURE__ */ new Date(0)).toISOString()),
    totalBalance: typeof connection.totalBalance === "number" ? connection.totalBalance : accounts.reduce((sum, account) => sum + account.balance, 0),
    accounts
  };
}
function normalizeAgentContext(value, creds) {
  const context = isRecord(value) ? value : {};
  const agent = isRecord(context.agent) ? context.agent : {};
  const scopes = readStringArray(context.scopes);
  const rawConnections = Array.isArray(context.sourceConnections) ? context.sourceConnections : Array.isArray(context.connections) ? context.connections : [];
  const sourceConnections = rawConnections.map(
    (connection, index) => normalizeSourceConnection(connection, index)
  );
  const capabilities = isRecord(context.capabilities) ? context.capabilities : {};
  return {
    agent: {
      id: readString(agent.id, creds.agentId),
      name: readString(agent.name, creds.agentName ?? "Wallet agent"),
      kind: readString(agent.kind, "claude_code"),
      status: readString(agent.status, creds.agentToken ? "active" : "unknown"),
      tokenConfigured: readBoolean(agent.tokenConfigured, Boolean(creds.agentToken)),
      tokenPreview: readNullableString(agent.tokenPreview),
      tokenIssuedAt: readNullableString(agent.tokenIssuedAt),
      lastUsedAt: readNullableString(agent.lastUsedAt),
      createdAt: readString(agent.createdAt, creds.createdAt),
      scopes: readStringArray(agent.scopes).length > 0 ? readStringArray(agent.scopes) : scopes,
      sourceConnectionIds: readStringArray(agent.sourceConnectionIds).length > 0 ? readStringArray(agent.sourceConnectionIds) : sourceConnections.map((connection) => connection.id)
    },
    sourceConnections,
    scopes,
    capabilities: {
      accounts: readBoolean(capabilities.accounts, scopes.includes("accounts.read")),
      balances: readBoolean(capabilities.balances, scopes.includes("balances.read")),
      transactions: readBoolean(capabilities.transactions, scopes.includes("transactions.read")),
      transactionPreferences: readBoolean(
        capabilities.transactionPreferences,
        scopes.includes("transactions.write")
      )
    }
  };
}

// src/lib/credentials.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, unlinkSync } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";
var CREDENTIALS_DIR = join2(homedir2(), ".wallet");
var CREDENTIALS_FILE = join2(CREDENTIALS_DIR, "credentials.json");
function loadCredentials() {
  try {
    if (!existsSync2(CREDENTIALS_FILE)) {
      return null;
    }
    const data = readFileSync2(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function saveCredentials(creds) {
  if (!existsSync2(CREDENTIALS_DIR)) {
    mkdirSync2(CREDENTIALS_DIR, { recursive: true });
  }
  writeFileSync2(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), "utf-8");
}
function deleteCredentials() {
  if (existsSync2(CREDENTIALS_FILE)) {
    unlinkSync(CREDENTIALS_FILE);
  }
}

// src/lib/browser.ts
import { exec } from "child_process";
import { resolve } from "path";
import { pathToFileURL } from "url";
function openBrowser(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Invalid URL protocol");
    }
  } catch {
    console.error("Invalid URL:", url);
    return;
  }
  const platform = process.platform;
  let cmd;
  if (platform === "darwin") {
    cmd = `open "${url.replace(/"/g, '\\"')}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url.replace(/"/g, '\\"')}"`;
  } else {
    cmd = `xdg-open "${url.replace(/"/g, '\\"')}"`;
  }
  exec(cmd, (error) => {
    if (error) {
      console.error("Could not open browser. Please visit:", url);
    }
  });
}
function openFile(path) {
  const fileUrl = pathToFileURL(resolve(path)).toString();
  const platform = process.platform;
  let cmd;
  if (platform === "darwin") {
    cmd = `open "${fileUrl.replace(/"/g, '\\"')}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${fileUrl.replace(/"/g, '\\"')}"`;
  } else {
    cmd = `xdg-open "${fileUrl.replace(/"/g, '\\"')}"`;
  }
  exec(cmd, (error) => {
    if (error) {
      console.error("Could not open file automatically. Open it manually:", resolve(path));
    }
  });
}

// src/lib/options.ts
var DEFAULT_API_ORIGIN = "http://localhost:3000";
function parseCliInput(argv) {
  const args = [];
  let command;
  let apiOriginOverride;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value) {
      continue;
    }
    if (value === "--dev") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error(
          "Missing value for --dev. Pass a full URL, e.g. --dev http://localhost:3000."
        );
      }
      apiOriginOverride = normalizeApiOrigin(nextValue);
      index += 1;
      continue;
    }
    if (value.startsWith("--dev=")) {
      const rawOrigin = value.slice("--dev=".length);
      if (!rawOrigin) {
        throw new Error(
          "Missing value for --dev. Pass a full URL, e.g. --dev http://localhost:3000."
        );
      }
      apiOriginOverride = normalizeApiOrigin(rawOrigin);
      continue;
    }
    if (!command) {
      command = value;
      continue;
    }
    args.push(value);
  }
  return {
    command,
    args,
    ...apiOriginOverride ? { apiOriginOverride } : {}
  };
}
function resolveApiOrigin(options) {
  return options.apiOriginOverride ?? process.env.WALLET_API_ORIGIN ?? options.storedApiOrigin ?? DEFAULT_API_ORIGIN;
}
function normalizeApiOrigin(rawOrigin) {
  try {
    const normalized = new URL(rawOrigin.trim());
    normalized.hash = "";
    normalized.search = "";
    return normalized.toString().replace(/\/$/, "");
  } catch {
    throw new Error(
      `Invalid --dev URL: ${rawOrigin}. Pass a full URL, e.g. http://localhost:3000.`
    );
  }
}

// src/lib/output.ts
function printTable(headers, rows) {
  const widths = headers.map(
    (h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join("  "));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) {
    console.log(row.map((c, i) => c.padEnd(widths[i])).join("  "));
  }
}
function formatCurrency(amount, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
}
function formatDate(dateStr) {
  const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

// src/commands/setup.ts
async function setupCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const existing = loadCredentials();
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: existing?.apiOrigin
  });
  if (existing) {
    try {
      const ctx = normalizeAgentContext(
        await apiGet(
          origin,
          "/api/agent/context",
          existing.agentToken,
          {
            allowForbidden: true,
            allowUnauthorized: true
          }
        ),
        existing
      );
      if (jsonOutput) {
        printJson({
          status: "already_connected",
          agent: ctx.agent,
          scopes: ctx.scopes,
          sourceConnectionCount: ctx.sourceConnections.length,
          apiOrigin: origin
        });
        return;
      }
      console.log(`Already connected as ${ctx.agent.name}`);
      console.log(`Scopes: ${ctx.scopes.join(", ")}`);
      console.log(`Source connections: ${ctx.sourceConnections.length}`);
      console.log("\nSetup complete! Try: wallet balances");
      return;
    } catch (error) {
      if (error instanceof ApiError && ![401, 403].includes(error.status)) {
        throw error;
      }
      console.log("Session expired. Re-authenticating...");
    }
  }
  console.log("Starting Wallet setup...\n");
  const machineName = hostname();
  const startResponse = await apiPost(origin, "/v1/cli/setup-sessions", {
    machineName
  });
  const { setupSessionId, browserUrl, pollToken, pollIntervalMs } = startResponse;
  console.log("Opening browser for Google sign-in...");
  openBrowser(browserUrl);
  console.log(
    "If the browser didn't open, visit:\n  " + browserUrl + "\n"
  );
  console.log("Waiting for authentication...");
  const interval = pollIntervalMs || 1500;
  const maxAttempts = Math.ceil(15 * 60 * 1e3 / interval);
  let result = null;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(interval);
    const poll = await apiGet(
      origin,
      `/v1/cli/setup-sessions/${setupSessionId}/poll?pollToken=${encodeURIComponent(pollToken)}`
    );
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
  saveCredentials({
    apiOrigin: origin,
    agentToken: result.accessToken,
    agentId: result.agent.id,
    agentName: result.agent.name,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (jsonOutput) {
    printJson({
      status: "completed",
      agent: result.agent,
      apiOrigin: origin
    });
    return;
  }
  console.log(`Agent: ${result.agent.name}`);
  console.log(`Scopes: ${result.agent.scopes.join(", ")}`);
  console.log("\nWallet is ready in Claude Code.");
  console.log("Try: wallet balances");
}
function sleep(ms) {
  return new Promise((resolve3) => setTimeout(resolve3, ms));
}

// src/commands/status.ts
async function statusCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const ctx = normalizeAgentContext(
    await apiGet(origin, "/api/agent/context", creds.agentToken),
    creds
  );
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
    const accountCount = connection.accounts.length;
    const hasIdentity = Boolean(connection.metadata && typeof connection.metadata === "object" && "identity" in connection.metadata);
    const hasCards = connection.accounts.some((account) => account.type === "credit_card");
    const hasInvestments = connection.accounts.some((account) => account.type === "investment");
    const flags = [
      `${accountCount} account${accountCount === 1 ? "" : "s"}`,
      hasIdentity ? "identity" : null,
      hasCards ? "cards" : null,
      hasInvestments ? "investments" : null
    ].filter(Boolean).join(", ");
    console.log(`  - ${connection.label} (${connection.provider})${flags ? ` \xB7 ${flags}` : ""}`);
  }
}

// src/commands/balances.ts
async function balancesCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const data = await apiGet(origin, "/api/agent/balances", creds.agentToken);
  if (jsonOutput) {
    printJson(data);
    return;
  }
  if (!data.balances || data.balances.length === 0) {
    console.log("No balances found.");
    return;
  }
  const rows = data.balances.map((b) => [
    b.accountName,
    b.accountType || "-",
    b.lastFourDigits || "-",
    b.institutionName || "-",
    b.connectionLabel,
    formatCurrency(b.balance, b.currencyCode)
  ]);
  printTable(
    ["Account", "Type", "Last4", "Institution", "Connection", "Balance"],
    rows
  );
  const total = data.balances.reduce((sum, b) => sum + b.balance, 0);
  console.log(`
Total: ${formatCurrency(total, data.balances[0]?.currencyCode)}`);
}

// src/commands/accounts.ts
async function accountsCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const data = await apiGet(origin, "/api/agent/accounts", creds.agentToken);
  if (jsonOutput) {
    printJson(data);
    return;
  }
  if (!data.accounts || data.accounts.length === 0) {
    console.log("No accounts found.");
    return;
  }
  const rows = data.accounts.map((a) => [
    a.name,
    a.type,
    a.lastFourDigits || "-",
    a.institutionName || "-",
    a.connectionLabel,
    a.currencyCode
  ]);
  printTable(
    ["Name", "Type", "Last4", "Institution", "Connection", "Currency"],
    rows
  );
}

// src/commands/transactions.ts
function readFlagValue(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : void 0;
}
async function transactionsCommand(args, apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  let limit = 20;
  const rawLimit = readFlagValue(args, "--limit");
  if (rawLimit) {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = parsed;
    }
  }
  const since = readFlagValue(args, "--since");
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const path = since ? `/api/agent/transactions?since=${encodeURIComponent(since)}` : `/api/agent/transactions?limit=${limit}`;
  const data = await apiGet(
    origin,
    path,
    creds.agentToken
  );
  if (jsonOutput) {
    printJson(data);
    return;
  }
  if (!data.transactions || data.transactions.length === 0) {
    console.log("No transactions found.");
    return;
  }
  const rows = data.transactions.map((t) => [
    formatDate(t.effectiveOn || t.effectiveAt || t.bookedOn || t.bookedAt),
    formatDate(t.bookedOn || t.bookedAt),
    t.purchaseAt || t.purchaseOn ? formatDate(t.purchaseOn || t.purchaseAt) : "-",
    t.accountName,
    t.cardLastFourDigits || "-",
    t.connectionLabel,
    t.description.slice(0, 40),
    formatCurrency(t.amount, t.currencyCode),
    t.originalAmount != null && t.originalCurrencyCode ? formatCurrency(t.originalAmount, t.originalCurrencyCode) : "-",
    t.effectiveCategory || t.category || "-",
    t.providerCategory || "-",
    t.categorySource || "-"
  ]);
  printTable(
    ["Date", "Posted", "Purchase", "Account", "Card", "Connection", "Description", "Amount", "Original", "Category", "Provider", "Source"],
    rows
  );
  console.log(
    since ? `
Showing ${data.transactions.length} transactions since ${since}` : `
Showing ${data.transactions.length} transactions`
  );
}

// src/commands/spending.ts
async function spendingCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const data = await apiGet(
    origin,
    "/api/agent/spending-summary",
    creds.agentToken
  );
  if (jsonOutput) {
    printJson(data);
    return;
  }
  console.log(`Spending Summary - ${data.window}`);
  console.log("=".repeat(50));
  console.log(`Total spent: ${formatCurrency(data.total)}`);
  if (data.categories && data.categories.length > 0) {
    console.log("\nSpend by category:");
    const rows = data.categories.map((c) => [
      c.category,
      formatCurrency(c.total)
    ]);
    printTable(
      ["Category", "Amount"],
      rows
    );
  }
}

// src/commands/subscriptions.ts
async function subscriptionsCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const data = await apiGet(
    origin,
    "/api/agent/subscriptions",
    creds.agentToken
  );
  if (jsonOutput) {
    printJson(data);
    return;
  }
  console.log(`Detected subscriptions: ${data.totalDetected}`);
  console.log(`Active monthly estimate: ${formatCurrency(data.activeMonthlyEstimate)}`);
  if (data.active.length > 0) {
    console.log("\nActive:");
    printTable(
      ["Merchant", "Category", "Freq", "Monthly", "Charges", "Last", "Confidence"],
      data.active.map((subscription) => [
        subscription.merchant,
        subscription.category ?? "-",
        subscription.frequency,
        formatCurrency(subscription.estimatedMonthlyAmount),
        String(subscription.chargeCount),
        subscription.lastChargeDate,
        subscription.confidence
      ])
    );
  }
  if (data.inactive.length > 0) {
    console.log("\nInactive:");
    printTable(
      ["Merchant", "Category", "Freq", "Monthly", "Charges", "Last", "Confidence"],
      data.inactive.map((subscription) => [
        subscription.merchant,
        subscription.category ?? "-",
        subscription.frequency,
        formatCurrency(subscription.estimatedMonthlyAmount),
        String(subscription.chargeCount),
        subscription.lastChargeDate,
        subscription.confidence
      ])
    );
  }
  if (data.active.length === 0 && data.inactive.length === 0) {
    console.log("No subscriptions detected.");
  }
}

// src/commands/dashboard.ts
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync3 } from "fs";
import { dirname, resolve as resolve2 } from "path";

// src/lib/dashboard.ts
function createDashboardSnapshot(input) {
  return {
    generatedAt: input.generatedAt,
    fetchedSince: input.fetchedSince,
    context: {
      agentName: input.context.agent.name,
      sourceConnectionCount: input.context.sourceConnections.length,
      sourceConnectionLabels: input.context.sourceConnections.map((connection) => connection.label)
    },
    transactions: input.transactions.map((transaction) => ({
      id: transaction.id,
      effectiveDate: transaction.effectiveOn ?? transaction.purchaseOn ?? transaction.bookedOn ?? transaction.effectiveAt?.slice(0, 10) ?? transaction.bookedAt.slice(0, 10),
      bookedDate: transaction.bookedOn ?? transaction.bookedAt.slice(0, 10),
      description: transaction.description,
      merchantName: transaction.merchantName ?? null,
      accountName: transaction.accountName,
      accountType: transaction.accountType ?? null,
      connectionLabel: transaction.connectionLabel,
      category: transaction.effectiveCategory ?? transaction.category ?? "Other",
      providerCategory: transaction.providerCategory ?? null,
      categorySource: transaction.categorySource ?? null,
      amount: transaction.amount,
      currencyCode: transaction.currencyCode
    })),
    subscriptions: input.subscriptions
  };
}
function serializeForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/<\/script/gi, "<\\/script");
}
function generateDashboardHtml(snapshot) {
  const payload = serializeForHtml(snapshot);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Wallet Personal Finance Dashboard</title>
    <style>
      :root {
        --bg: #f4efe7;
        --bg-soft: rgba(255, 250, 243, 0.88);
        --panel: rgba(255, 252, 247, 0.78);
        --panel-strong: rgba(255, 255, 255, 0.92);
        --line: rgba(46, 41, 35, 0.1);
        --ink: #1c1a17;
        --ink-soft: #5f584e;
        --green: #0f8b6d;
        --green-soft: rgba(15, 139, 109, 0.16);
        --red: #d04f39;
        --red-soft: rgba(208, 79, 57, 0.14);
        --gold: #c78d2b;
        --blue: #2d6cdf;
        --violet: #7a5bc4;
        --teal: #00869b;
        --shadow: 0 28px 80px rgba(63, 46, 23, 0.12);
        --radius-xl: 28px;
        --radius-lg: 22px;
        --radius-md: 16px;
        --radius-sm: 12px;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(199, 141, 43, 0.14), transparent 28%),
          radial-gradient(circle at top right, rgba(45, 108, 223, 0.12), transparent 24%),
          linear-gradient(180deg, #fbf7f0 0%, #efe7da 100%);
        color: var(--ink);
        font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.18;
        background-image:
          linear-gradient(rgba(28, 26, 23, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(28, 26, 23, 0.03) 1px, transparent 1px);
        background-size: 32px 32px;
        mask-image: linear-gradient(180deg, black 35%, transparent 100%);
      }

      .shell {
        width: min(1380px, calc(100% - 32px));
        margin: 24px auto 48px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,248,237,0.75));
        border: 1px solid rgba(28, 26, 23, 0.08);
        border-radius: 34px;
        padding: 30px 30px 26px;
        box-shadow: var(--shadow);
      }

      .hero::after {
        content: "";
        position: absolute;
        width: 420px;
        height: 420px;
        top: -210px;
        right: -90px;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(15, 139, 109, 0.2), transparent 68%);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(28, 26, 23, 0.05);
        color: var(--ink-soft);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 16px 0 8px;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        font-size: clamp(38px, 5vw, 64px);
        line-height: 0.95;
        letter-spacing: -0.04em;
        max-width: 9ch;
      }

      .hero-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr);
        gap: 24px;
        margin-top: 22px;
      }

      .hero-copy {
        color: var(--ink-soft);
        font-size: 16px;
        line-height: 1.65;
        max-width: 62ch;
      }

      .meta-card {
        background: rgba(255,255,255,0.55);
        border: 1px solid rgba(28, 26, 23, 0.06);
        border-radius: 24px;
        padding: 18px 18px 16px;
        backdrop-filter: blur(14px);
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .meta-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        border-radius: 18px;
        background: rgba(255, 252, 247, 0.8);
      }

      .meta-label {
        font-size: 11px;
        color: var(--ink-soft);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .meta-value {
        font-size: 16px;
        font-weight: 600;
      }

      .toolbar {
        display: grid;
        grid-template-columns: 1.4fr repeat(4, minmax(0, 0.75fr)) auto;
        gap: 12px;
        margin-top: 18px;
        padding: 16px;
        border-radius: 24px;
        background: rgba(255,255,255,0.72);
        border: 1px solid rgba(28, 26, 23, 0.06);
        box-shadow: 0 12px 40px rgba(73, 57, 31, 0.08);
      }

      .toolbar-field {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .toolbar-field label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }

      .toolbar-field input,
      .toolbar-field select,
      .tab-chip {
        width: 100%;
        border: 1px solid rgba(28, 26, 23, 0.12);
        background: rgba(255,255,255,0.9);
        color: var(--ink);
        border-radius: 14px;
        min-height: 44px;
        padding: 0 14px;
        font: inherit;
      }

      .reset-button {
        align-self: end;
        min-height: 44px;
        padding: 0 18px;
        border: none;
        border-radius: 14px;
        background: linear-gradient(135deg, #1f3129, #0f8b6d);
        color: white;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 10px 28px rgba(15, 139, 109, 0.24);
      }

      .range-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }

      .range-chip,
      .tab-chip,
      .subtab-chip,
      .legend-chip,
      .category-pill {
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease, color 160ms ease, border-color 160ms ease;
      }

      .range-chip,
      .subtab-chip,
      .legend-chip,
      .category-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid rgba(28, 26, 23, 0.1);
        border-radius: 999px;
        background: rgba(255,255,255,0.66);
        color: var(--ink-soft);
      }

      .range-chip.active,
      .tab-chip.active,
      .subtab-chip.active,
      .legend-chip.active,
      .category-pill.active {
        background: var(--ink);
        color: #fbf7f0;
        border-color: var(--ink);
      }

      .tabs {
        display: flex;
        gap: 10px;
        margin-top: 22px;
      }

      .tab-chip {
        width: auto;
        padding: 0 18px;
      }

      .tab-panel {
        display: none;
        margin-top: 22px;
      }

      .tab-panel.active {
        display: block;
      }

      .stats-grid,
      .overview-grid,
      .category-grid,
      .subscriptions-grid {
        display: grid;
        gap: 16px;
      }

      .stats-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .overview-grid {
        grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.9fr);
        margin-top: 16px;
      }

      .category-grid {
        grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.4fr);
        margin-top: 16px;
      }

      .subscriptions-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin-top: 16px;
      }

      .card {
        background: var(--panel);
        border: 1px solid rgba(28, 26, 23, 0.08);
        border-radius: var(--radius-xl);
        padding: 20px;
        box-shadow: 0 18px 50px rgba(73, 57, 31, 0.08);
        backdrop-filter: blur(16px);
      }

      .card h2,
      .card h3 {
        margin: 0;
        font-size: 18px;
      }

      .card-top {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }

      .card-subtitle {
        margin-top: 6px;
        color: var(--ink-soft);
        font-size: 13px;
        line-height: 1.5;
      }

      .kpi {
        position: relative;
        overflow: hidden;
        min-height: 152px;
      }

      .kpi::after {
        content: "";
        position: absolute;
        inset: auto -40px -50px auto;
        width: 180px;
        height: 180px;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(15, 139, 109, 0.16), transparent 70%);
      }

      .kpi-label {
        display: block;
        margin-bottom: 10px;
        color: var(--ink-soft);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.09em;
      }

      .kpi-value {
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        font-size: clamp(30px, 4vw, 48px);
        line-height: 1;
        letter-spacing: -0.05em;
      }

      .kpi-note {
        margin-top: 12px;
        color: var(--ink-soft);
        font-size: 14px;
      }

      .kpi-positive .kpi-value {
        color: var(--green);
      }

      .kpi-negative .kpi-value {
        color: var(--red);
      }

      .panel-stack {
        display: grid;
        gap: 16px;
      }

      .chart-shell {
        position: relative;
        min-height: 260px;
        padding-top: 12px;
      }

      .chart-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 240px;
        color: var(--ink-soft);
        background: rgba(255,255,255,0.46);
        border: 1px dashed rgba(28, 26, 23, 0.14);
        border-radius: 18px;
      }

      .chart-svg {
        width: 100%;
        height: auto;
        display: block;
      }

      .chart-legend,
      .category-pills,
      .subtabs {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .metric-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(28, 26, 23, 0.05);
        color: var(--ink-soft);
        font-size: 12px;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        flex: 0 0 auto;
      }

      .breakdown-layout {
        display: grid;
        grid-template-columns: 228px minmax(0, 1fr);
        gap: 18px;
        align-items: center;
      }

      .donut-wrap {
        display: grid;
        place-items: center;
      }

      .donut {
        position: relative;
        width: 220px;
        height: 220px;
        border-radius: 999px;
        background: conic-gradient(#dad6cf 0turn, #dad6cf 1turn);
        box-shadow: inset 0 0 0 1px rgba(28,26,23,0.05);
      }

      .donut::after {
        content: "";
        position: absolute;
        inset: 26px;
        border-radius: 999px;
        background: rgba(250, 246, 239, 0.94);
        box-shadow: inset 0 0 0 1px rgba(28, 26, 23, 0.04);
      }

      .donut-center {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: grid;
        place-items: center;
        text-align: center;
        padding: 0 54px;
      }

      .donut-center strong {
        display: block;
        font-size: 24px;
        letter-spacing: -0.04em;
      }

      .donut-center span {
        color: var(--ink-soft);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .leaderboard {
        display: grid;
        gap: 10px;
      }

      .leaderboard-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(255,255,255,0.6);
        border: 1px solid rgba(28, 26, 23, 0.06);
        cursor: pointer;
      }

      .leaderboard-row.active {
        border-color: rgba(28, 26, 23, 0.28);
        background: rgba(28, 26, 23, 0.06);
      }

      .leaderboard-name {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
      }

      .leaderboard-name strong {
        font-size: 15px;
      }

      .leaderboard-bar {
        height: 7px;
        border-radius: 999px;
        background: rgba(28, 26, 23, 0.08);
        overflow: hidden;
      }

      .leaderboard-bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
      }

      .table-wrap {
        overflow: auto;
        border-radius: 18px;
        border: 1px solid rgba(28, 26, 23, 0.08);
        background: rgba(255,255,255,0.72);
      }

      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 760px;
      }

      th,
      td {
        padding: 14px 16px;
        text-align: left;
        border-bottom: 1px solid rgba(28, 26, 23, 0.07);
        vertical-align: top;
      }

      th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: rgba(252, 248, 242, 0.96);
        font-size: 11px;
        color: var(--ink-soft);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      td strong {
        display: block;
        font-size: 14px;
      }

      td span {
        display: block;
        margin-top: 3px;
        color: var(--ink-soft);
        font-size: 12px;
      }

      .amount-positive {
        color: var(--green);
        font-weight: 700;
      }

      .amount-negative {
        color: var(--red);
        font-weight: 700;
      }

      .source-tag {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(28, 26, 23, 0.06);
        color: var(--ink-soft);
        font-size: 12px;
      }

      .footer-note {
        margin-top: 18px;
        color: var(--ink-soft);
        font-size: 13px;
        text-align: right;
      }

      @media (max-width: 1120px) {
        .hero-grid,
        .overview-grid,
        .category-grid {
          grid-template-columns: 1fr;
        }

        .stats-grid,
        .subscriptions-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .toolbar {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px) {
        .shell {
          width: min(100%, calc(100% - 20px));
          margin-top: 10px;
        }

        .hero {
          padding: 22px 18px 18px;
          border-radius: 28px;
        }

        .toolbar,
        .stats-grid,
        .subscriptions-grid,
        .breakdown-layout {
          grid-template-columns: 1fr;
        }

        .tabs,
        .range-group,
        .chart-legend,
        .subtabs {
          overflow: auto;
          padding-bottom: 2px;
        }

        .donut {
          width: 200px;
          height: 200px;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell" id="app"></div>
    <script id="wallet-dashboard-data" type="application/json">${payload}</script>
    <script>
      const snapshot = JSON.parse(document.getElementById("wallet-dashboard-data").textContent);
      const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
      const compactNumberFormatter = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
      const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
      const shortDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const COLORS = ["#0f8b6d", "#d04f39", "#2d6cdf", "#c78d2b", "#7a5bc4", "#00869b", "#99582a", "#4b5563"];

      const state = {
        tab: "overview",
        subscriptionTab: "active",
        range: "12m",
        startDate: "",
        endDate: "",
        account: "all",
        search: "",
        selectedCategory: null,
      };

      const app = document.getElementById("app");

      const normalizeText = (value) => String(value || "").trim().toLowerCase();
      const normalizeCategory = (transaction) =>
        normalizeText(transaction.providerCategory || transaction.category);
      const isTransferCategory = (transaction) => {
        const category = normalizeCategory(transaction);
        return category === "transfer" || category === "transfers";
      };
      const isInvestmentAccount = (transaction) => normalizeText(transaction.accountType) === "investment";
      const isExpenseTransaction = (transaction) =>
        transaction.amount < 0 && !isInvestmentAccount(transaction) && !isTransferCategory(transaction);
      const isIncomeTransaction = (transaction) =>
        transaction.amount > 0 && !isInvestmentAccount(transaction) && !isTransferCategory(transaction);

      const formatCurrency = (amount) => currencyFormatter.format(amount || 0);
      const formatCompact = (amount) => compactNumberFormatter.format(amount || 0);
      const formatDate = (value) => {
        if (!value) return "\u2014";
        const date = new Date(value.length === 10 ? value + "T12:00:00" : value);
        return Number.isNaN(date.getTime()) ? value : shortDateFormatter.format(date);
      };

      const addMonths = (date, months) => {
        const next = new Date(date);
        next.setMonth(next.getMonth() + months);
        return next;
      };

      const startOfDay = (value) => {
        const date = new Date(value);
        date.setHours(0, 0, 0, 0);
        return date;
      };

      const endOfDay = (value) => {
        const date = new Date(value);
        date.setHours(23, 59, 59, 999);
        return date;
      };

      const getAccountFilterKey = (transaction) =>
        [transaction.connectionLabel || "", transaction.accountName || ""].join("::");

      const getRangeStart = () => {
        const latestDate = snapshot.transactions.reduce((latest, transaction) => {
          const transactionDate = new Date(transaction.effectiveDate + "T12:00:00");
          return transactionDate > latest ? transactionDate : latest;
        }, new Date(snapshot.generatedAt));

        if (state.startDate) {
          return startOfDay(state.startDate + "T00:00:00");
        }

        if (state.range === "all") {
          return new Date("1970-01-01T00:00:00");
        }

        const months = state.range === "3m" ? 2 : state.range === "6m" ? 5 : 11;
        const start = new Date(latestDate.getFullYear(), latestDate.getMonth() - months, 1);
        start.setHours(0, 0, 0, 0);
        return start;
      };

      const getRangeEnd = () => {
        if (state.endDate) {
          return endOfDay(state.endDate + "T00:00:00");
        }

        const latest = snapshot.transactions.reduce((latestDate, transaction) => {
          const transactionDate = new Date(transaction.effectiveDate + "T12:00:00");
          return transactionDate > latestDate ? transactionDate : latestDate;
        }, new Date(snapshot.generatedAt));
        latest.setHours(23, 59, 59, 999);
        return latest;
      };

      const getFilteredTransactions = () => {
        const search = normalizeText(state.search);
        const rangeStart = getRangeStart();
        const rangeEnd = getRangeEnd();

        return snapshot.transactions
          .filter((transaction) => {
            const date = new Date(transaction.effectiveDate + "T12:00:00");
            return date >= rangeStart && date <= rangeEnd;
          })
          .filter((transaction) => state.account === "all" || getAccountFilterKey(transaction) === state.account)
          .filter((transaction) => {
            if (!search) return true;
            const haystack = [
              transaction.description,
              transaction.merchantName,
              transaction.accountName,
              transaction.connectionLabel,
              transaction.category,
              transaction.providerCategory,
            ].map(normalizeText).join(" ");
            return haystack.includes(search);
          })
          .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
      };

      const getExpenseTransactions = (transactions) => transactions.filter(isExpenseTransaction);
      const getIncomeTransactions = (transactions) => transactions.filter(isIncomeTransaction);

      const getCategoryTotals = (transactions) => {
        const totals = new Map();

        for (const transaction of getExpenseTransactions(transactions)) {
          const category = transaction.category || "Other";
          const nextTotal = (totals.get(category)?.total || 0) + Math.abs(transaction.amount);
          const nextCount = (totals.get(category)?.count || 0) + 1;
          totals.set(category, { category, total: nextTotal, count: nextCount });
        }

        return [...totals.values()].sort((a, b) => b.total - a.total);
      };

      const getMonthKey = (value) => {
        const date = new Date(value + "T12:00:00");
        return date.toISOString().slice(0, 7);
      };

      const getMonthLabel = (key) => {
        const date = new Date(key + "-01T12:00:00");
        return monthFormatter.format(date);
      };

      const getMonthSeries = (transactions) => {
        const monthMap = new Map();

        for (const transaction of transactions) {
          const monthKey = getMonthKey(transaction.effectiveDate);
          const month = monthMap.get(monthKey) || {
            key: monthKey,
            label: getMonthLabel(monthKey),
            income: 0,
            expense: 0,
          };

          if (isIncomeTransaction(transaction)) {
            month.income += transaction.amount;
          } else if (isExpenseTransaction(transaction)) {
            month.expense += Math.abs(transaction.amount);
          }

          monthMap.set(monthKey, month);
        }

        return [...monthMap.values()]
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((month) => ({
            ...month,
            net: month.income - month.expense,
          }));
      };

      const getCategoryTrendSeries = (transactions, categories) => {
        const months = getMonthSeries(transactions).map((month) => month.key);

        if (months.length === 0) {
          return [];
        }

        return categories.map((category, index) => ({
          category,
          color: COLORS[index % COLORS.length],
          values: months.map((monthKey) => {
            let total = 0;

            for (const transaction of getExpenseTransactions(transactions)) {
              if (transaction.category === category && getMonthKey(transaction.effectiveDate) === monthKey) {
                total += Math.abs(transaction.amount);
              }
            }

            return { key: monthKey, label: getMonthLabel(monthKey), total };
          }),
        }));
      };

      const getDashboardMetrics = (transactions) => {
        const income = getIncomeTransactions(transactions).reduce((sum, transaction) => sum + transaction.amount, 0);
        const expense = getExpenseTransactions(transactions).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
        const net = income - expense;
        const savingsRate = income > 0 ? (net / income) * 100 : 0;
        const activeSubscriptions = snapshot.subscriptions.active.length;

        return {
          income,
          expense,
          net,
          savingsRate,
          activeSubscriptions,
        };
      };

      const createLineChart = (options) => {
        const { series, height = 280, emptyLabel = "No chart data in the current filter." } = options;
        const preparedSeries = series.filter((item) => item.values.some((value) => value.total > 0));

        if (preparedSeries.length === 0) {
          return '<div class="chart-empty">' + emptyLabel + '</div>';
        }

        const points = preparedSeries[0].values;
        const width = 860;
        const padding = { top: 18, right: 24, bottom: 42, left: 56 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const maxValue = Math.max(1, ...preparedSeries.flatMap((item) => item.values.map((value) => value.total)));
        const xStep = points.length === 1 ? 0 : chartWidth / (points.length - 1);

        const grid = Array.from({ length: 4 }, (_, index) => {
          const ratio = index / 3;
          const y = padding.top + chartHeight * ratio;
          const value = maxValue - maxValue * ratio;
          return { y, value };
        });

        const paths = preparedSeries.map((item) => {
          const d = item.values
            .map((value, index) => {
              const x = padding.left + xStep * index;
              const y = padding.top + chartHeight - (value.total / maxValue) * chartHeight;
              return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
            })
            .join(" ");

          const markers = item.values.map((value, index) => {
            const x = padding.left + xStep * index;
            const y = padding.top + chartHeight - (value.total / maxValue) * chartHeight;
            return '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="3.2" fill="' + item.color + '" />';
          }).join("");

          return '<path d="' + d + '" fill="none" stroke="' + item.color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />' + markers;
        }).join("");

        const xLabels = points.map((point, index) => {
          const x = padding.left + xStep * index;
          return '<text x="' + x.toFixed(2) + '" y="' + (height - 10) + '" fill="rgba(95,88,78,0.86)" font-size="12" text-anchor="middle">' + point.label + '</text>';
        }).join("");

        const yLabels = grid.map((entry) => {
          return [
            '<line x1="' + padding.left + '" x2="' + (width - padding.right) + '" y1="' + entry.y.toFixed(2) + '" y2="' + entry.y.toFixed(2) + '" stroke="rgba(28,26,23,0.08)" stroke-dasharray="4 6" />',
            '<text x="' + (padding.left - 10) + '" y="' + (entry.y + 4).toFixed(2) + '" fill="rgba(95,88,78,0.74)" font-size="12" text-anchor="end">' + formatCompact(entry.value) + '</text>',
          ].join("");
        }).join("");

        return '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img">' +
          yLabels +
          paths +
          xLabels +
          '</svg>';
      };

      const createDonut = (categories, selectedCategory) => {
        if (categories.length === 0) {
          return '<div class="chart-empty">No category data in the current filter.</div>';
        }

        const total = categories.reduce((sum, category) => sum + category.total, 0);
        let offset = 0;
        const stops = categories.map((category, index) => {
          const size = category.total / total;
          const color = COLORS[index % COLORS.length];
          const start = offset;
          offset += size;
          return { ...category, color, start, end: offset };
        });

        const gradient = stops.map((stop) => stop.color + " " + (stop.start * 100).toFixed(2) + "% " + (stop.end * 100).toFixed(2) + "%").join(", ");
        const activeCategory = selectedCategory || stops[0].category;
        const active = stops.find((stop) => stop.category === activeCategory) || stops[0];

        return '<div class="breakdown-layout">' +
          '<div class="donut-wrap">' +
            '<div class="donut" style="background: conic-gradient(' + gradient + ')">' +
              '<div class="donut-center">' +
                '<div><span>Focused Category</span><strong>' + active.category + '</strong><span>' + formatCurrency(active.total) + '</span></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="leaderboard">' +
            stops.map((stop) => {
              const percentage = total > 0 ? (stop.total / total) * 100 : 0;
              return '<button class="leaderboard-row ' + (selectedCategory === stop.category ? 'active' : '') + '" data-category="' + encodeURIComponent(stop.category) + '">' +
                '<div class="leaderboard-name">' +
                  '<strong>' + stop.category + '</strong>' +
                  '<div class="leaderboard-bar"><span style="width:' + percentage.toFixed(2) + '%;background:' + stop.color + ';"></span></div>' +
                '</div>' +
                '<div><strong>' + formatCurrency(stop.total) + '</strong><span>' + percentage.toFixed(1) + '% of spend</span></div>' +
              '</button>';
            }).join("") +
          '</div>' +
        '</div>';
      };

      const createTransactionsTable = (transactions, title, selectedCategory) => {
        const rows = transactions.slice(0, 120);

        if (rows.length === 0) {
          return '<div class="chart-empty">No transactions match the current filters.</div>';
        }

        return '<div class="card">' +
          '<div class="card-top">' +
            '<div>' +
              '<h3>' + title + '</h3>' +
              '<div class="card-subtitle">' + (selectedCategory ? 'Filtered to ' + selectedCategory + ' and current dashboard filters.' : 'Filtered by the current date range, search, and account view.') + '</div>' +
            '</div>' +
            '<div class="metric-pill"><span>' + rows.length + ' shown</span></div>' +
          '</div>' +
          '<div class="table-wrap">' +
            '<table>' +
              '<thead><tr><th>Date</th><th>Transaction</th><th>Category</th><th>Account</th><th>Amount</th></tr></thead>' +
              '<tbody>' +
                rows.map((transaction) => {
                  const amountClass = transaction.amount > 0 ? 'amount-positive' : 'amount-negative';
                  return '<tr>' +
                    '<td><strong>' + formatDate(transaction.effectiveDate) + '</strong><span>Posted ' + formatDate(transaction.bookedDate) + '</span></td>' +
                    '<td><strong>' + escapeHtml(transaction.merchantName || transaction.description) + '</strong><span>' + escapeHtml(transaction.description) + '</span></td>' +
                    '<td><strong>' + escapeHtml(transaction.category) + '</strong><span>' + escapeHtml(transaction.providerCategory || 'provider uncategorized') + ' \xB7 ' + escapeHtml(transaction.categorySource || 'provider') + '</span></td>' +
                    '<td><strong>' + escapeHtml(transaction.accountName) + '</strong><span>' + escapeHtml(transaction.connectionLabel) + '</span></td>' +
                    '<td class="' + amountClass + '">' + formatCurrency(transaction.amount) + '</td>' +
                  '</tr>';
                }).join("") +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
      };

      const createSubscriptionsTable = (subscriptions) => {
        if (subscriptions.length === 0) {
          return '<div class="chart-empty">No subscriptions match this view.</div>';
        }

        return '<div class="table-wrap">' +
          '<table>' +
            '<thead><tr><th>Merchant</th><th>Category</th><th>Frequency</th><th>Monthly</th><th>Last Charge</th><th>Confidence</th></tr></thead>' +
            '<tbody>' +
              subscriptions.map((subscription) => {
                return '<tr>' +
                  '<td><strong>' + escapeHtml(subscription.merchant) + '</strong><span>' + subscription.chargeCount + ' charges \xB7 first ' + formatDate(subscription.firstChargeDate) + '</span></td>' +
                  '<td><strong>' + escapeHtml(subscription.category || 'Other') + '</strong><span>' + (subscription.amountChanged ? 'Amount changed' : 'Amount stable') + '</span></td>' +
                  '<td><strong>' + escapeHtml(subscription.frequency) + '</strong><span>' + (subscription.active ? 'Active' : 'Inactive') + '</span></td>' +
                  '<td class="amount-negative">' + formatCurrency(subscription.estimatedMonthlyAmount) + '</td>' +
                  '<td><strong>' + formatDate(subscription.lastChargeDate) + '</strong><span>Average ' + formatCurrency(subscription.averageAmount) + '</span></td>' +
                  '<td><span class="source-tag"><span class="dot" style="background:' + confidenceColor(subscription.confidence) + '"></span>' + escapeHtml(subscription.confidence) + '</span></td>' +
                '</tr>';
              }).join("") +
            '</tbody>' +
          '</table>' +
        '</div>';
      };

      const confidenceColor = (confidence) => {
        if (confidence === "high") return "#0f8b6d";
        if (confidence === "medium") return "#c78d2b";
        return "#d04f39";
      };

      const escapeHtml = (value) => String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      const render = () => {
        const filteredTransactions = getFilteredTransactions();
        const expenseTransactions = getExpenseTransactions(filteredTransactions);
        const metrics = getDashboardMetrics(filteredTransactions);
        const categoryTotals = getCategoryTotals(filteredTransactions);
        const topCategories = categoryTotals.slice(0, 6);
        const selectedCategory = state.selectedCategory && categoryTotals.some((category) => category.category === state.selectedCategory)
          ? state.selectedCategory
          : null;
        const focusCategory = selectedCategory || topCategories[0]?.category || null;
        const focusCategoryTransactions = focusCategory
          ? expenseTransactions.filter((transaction) => transaction.category === focusCategory)
          : filteredTransactions;
        const categoryTrends = getCategoryTrendSeries(filteredTransactions, topCategories.slice(0, 4).map((category) => category.category));
        const focusTrend = focusCategory ? getCategoryTrendSeries(filteredTransactions, [focusCategory]) : [];
        const monthlySeries = getMonthSeries(filteredTransactions);
        const availableAccounts = [...new Map(
          snapshot.transactions.map((transaction) => [
            getAccountFilterKey(transaction),
            {
              key: getAccountFilterKey(transaction),
              label: transaction.connectionLabel === transaction.accountName
                ? transaction.accountName
                : transaction.accountName + " \xB7 " + transaction.connectionLabel,
            },
          ]),
        ).values()].sort((a, b) => a.label.localeCompare(b.label));
        const subscriptions = state.subscriptionTab === "active" ? snapshot.subscriptions.active : snapshot.subscriptions.inactive;
        const filteredSubscriptions = subscriptions.filter((subscription) => {
          const search = normalizeText(state.search);
          if (!search) return true;
          return [subscription.merchant, subscription.category, subscription.frequency].map(normalizeText).join(" ").includes(search);
        });

        app.innerHTML = \`
          <section class="hero">
            <span class="eyebrow">Wallet local snapshot</span>
            <div class="hero-grid">
              <div>
                <h1>Personal finance, rendered as a living ledger.</h1>
                <p class="hero-copy">
                  A local read-only dashboard built from your Wallet transaction history. The dashboard is interactive in the browser, but the source of truth remains Wallet itself for categories, rules, and subscription detection.
                </p>
              </div>
              <div class="meta-card">
                <div class="meta-grid">
                  <div class="meta-row">
                    <span class="meta-label">Agent</span>
                    <strong class="meta-value">\${escapeHtml(snapshot.context.agentName)}</strong>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Connections</span>
                    <strong class="meta-value">\${snapshot.context.sourceConnectionCount}</strong>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Generated</span>
                    <strong class="meta-value">\${formatDate(snapshot.generatedAt.slice(0, 10))}</strong>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">History fetched from</span>
                    <strong class="meta-value">\${escapeHtml(snapshot.fetchedSince)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="toolbar">
            <div class="toolbar-field">
              <label for="search">Search</label>
              <input id="search" type="search" placeholder="Search merchants, descriptions, or categories" value="\${escapeHtml(state.search)}" />
            </div>
            <div class="toolbar-field">
              <label for="account">Account</label>
              <select id="account">
                <option value="all">All accounts</option>
                \${availableAccounts.map((account) => \`<option value="\${escapeHtml(account.key)}" \${state.account === account.key ? "selected" : ""}>\${escapeHtml(account.label)}</option>\`).join("")}
              </select>
            </div>
            <div class="toolbar-field">
              <label for="startDate">Start date</label>
              <input id="startDate" type="date" value="\${state.startDate}" />
            </div>
            <div class="toolbar-field">
              <label for="endDate">End date</label>
              <input id="endDate" type="date" value="\${state.endDate}" />
            </div>
            <div class="toolbar-field">
              <label for="categoryFocus">Focused category</label>
              <select id="categoryFocus">
                <option value="">All categories</option>
                \${categoryTotals.map((category) => \`<option value="\${escapeHtml(category.category)}" \${selectedCategory === category.category ? "selected" : ""}>\${escapeHtml(category.category)}</option>\`).join("")}
              </select>
            </div>
            <button class="reset-button" id="resetFilters">Reset filters</button>
          </section>

          <div class="range-group">
            \${[
              ["3m", "Last 3 months"],
              ["6m", "Last 6 months"],
              ["12m", "Last 12 months"],
              ["all", "All fetched history"],
            ].map(([value, label]) => \`<button class="range-chip \${state.range === value ? "active" : ""}" data-range="\${value}">\${label}</button>\`).join("")}
          </div>

          <div class="tabs">
            \${[
              ["overview", "Overview"],
              ["categories", "Categories"],
              ["subscriptions", "Subscriptions"],
            ].map(([value, label]) => \`<button class="tab-chip \${state.tab === value ? "active" : ""}" data-tab="\${value}">\${label}</button>\`).join("")}
          </div>

          <section class="tab-panel \${state.tab === "overview" ? "active" : ""}" data-panel="overview">
            <div class="stats-grid">
              <div class="card kpi kpi-positive">
                <span class="kpi-label">Revenue</span>
                <div class="kpi-value">\${formatCurrency(metrics.income)}</div>
                <div class="kpi-note">\${getIncomeTransactions(filteredTransactions).length} income transactions in the current filter.</div>
              </div>
              <div class="card kpi kpi-negative">
                <span class="kpi-label">Costs</span>
                <div class="kpi-value">\${formatCurrency(metrics.expense)}</div>
                <div class="kpi-note">\${expenseTransactions.length} expense transactions across the filtered period.</div>
              </div>
              <div class="card kpi \${metrics.net >= 0 ? "kpi-positive" : "kpi-negative"}">
                <span class="kpi-label">Net flow</span>
                <div class="kpi-value">\${formatCurrency(metrics.net)}</div>
                <div class="kpi-note">\${metrics.net >= 0 ? "Positive cash movement in the current slice." : "Costs outran revenue in the current slice."}</div>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Savings rate</span>
                <div class="kpi-value">\${Number.isFinite(metrics.savingsRate) ? metrics.savingsRate.toFixed(1) + "%" : "\u2014"}</div>
                <div class="kpi-note">\${snapshot.subscriptions.active.length} active subscriptions, \${formatCurrency(snapshot.subscriptions.activeMonthlyEstimate)} monthly estimate.</div>
              </div>
            </div>

            <div class="overview-grid">
              <div class="panel-stack">
                <div class="card">
                  <div class="card-top">
                    <div>
                      <h2>Revenue vs costs</h2>
                      <div class="card-subtitle">Monthly lines for income and spending inside the current filter.</div>
                    </div>
                    <div class="metric-pill">Net \${formatCurrency(metrics.net)}</div>
                  </div>
                  <div class="chart-shell">\${createLineChart({
                    series: [
                      { label: "Revenue", color: "#0f8b6d", values: monthlySeries.map((month) => ({ label: month.label, total: month.income })) },
                      { label: "Costs", color: "#d04f39", values: monthlySeries.map((month) => ({ label: month.label, total: month.expense })) },
                    ],
                    height: 300,
                    emptyLabel: "No monthly revenue/cost history in the current filter.",
                  })}</div>
                  <div class="chart-legend">
                    <span class="legend-chip active"><span class="dot" style="background:#0f8b6d"></span>Revenue</span>
                    <span class="legend-chip active"><span class="dot" style="background:#d04f39"></span>Costs</span>
                  </div>
                </div>

                <div class="card">
                  <div class="card-top">
                    <div>
                      <h2>Category evolution</h2>
                      <div class="card-subtitle">Top categories over time. Click a category in the legend or donut to focus the lower tables.</div>
                    </div>
                    <div class="metric-pill">\${topCategories.length} tracked categories</div>
                  </div>
                  <div class="chart-shell">\${createLineChart({
                    series: categoryTrends.map((series) => ({
                      label: series.category,
                      color: series.color,
                      values: series.values.map((value) => ({ label: value.label, total: value.total })),
                    })),
                    height: 300,
                    emptyLabel: "No category trend data in the current filter.",
                  })}</div>
                  <div class="chart-legend">
                    \${categoryTrends.map((series) => \`<button class="legend-chip \${selectedCategory === series.category ? "active" : ""}" data-category="\${encodeURIComponent(series.category)}"><span class="dot" style="background:\${series.color}"></span>\${escapeHtml(series.category)}</button>\`).join("")}
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-top">
                  <div>
                    <h2>Cost category breakdown</h2>
                    <div class="card-subtitle">Share of total spending in the current filter. Click a row to focus one category.</div>
                  </div>
                  <div class="metric-pill">\${formatCurrency(metrics.expense)} total cost</div>
                </div>
                \${createDonut(topCategories, selectedCategory)}
              </div>
            </div>

            \${createTransactionsTable(focusCategoryTransactions, selectedCategory ? "Transactions in " + selectedCategory : "Filtered transactions", selectedCategory)}
          </section>

          <section class="tab-panel \${state.tab === "categories" ? "active" : ""}" data-panel="categories">
            <div class="category-grid">
              <div class="card">
                <div class="card-top">
                  <div>
                    <h2>Category leaderboard</h2>
                    <div class="card-subtitle">Your highest-cost categories in the active filter. Select one to inspect its trend and transactions.</div>
                  </div>
                  <div class="metric-pill">\${categoryTotals.length} categories</div>
                </div>
                <div class="leaderboard">
                  \${categoryTotals.map((category, index) => {
                    const max = categoryTotals[0]?.total || 1;
                    return \`<button class="leaderboard-row \${selectedCategory === category.category ? "active" : ""}" data-category="\${encodeURIComponent(category.category)}">
                      <div class="leaderboard-name">
                        <strong>\${escapeHtml(category.category)}</strong>
                        <div class="leaderboard-bar"><span style="width:\${(category.total / max) * 100}%;background:\${COLORS[index % COLORS.length]}"></span></div>
                      </div>
                      <div><strong>\${formatCurrency(category.total)}</strong><span>\${category.count} transactions</span></div>
                    </button>\`;
                  }).join("")}
                </div>
              </div>

              <div class="panel-stack">
                <div class="card">
                  <div class="card-top">
                    <div>
                      <h2>\${focusCategory ? escapeHtml(focusCategory) + " trend" : "Category trend"}</h2>
                      <div class="card-subtitle">\${focusCategory ? "Monthly movement for the focused category." : "Pick a category to see its trend."}</div>
                    </div>
                    <div class="metric-pill">\${focusCategory ? formatCurrency((categoryTotals.find((category) => category.category === focusCategory)?.total) || 0) : "No category selected"}</div>
                  </div>
                  <div class="chart-shell">\${createLineChart({
                    series: focusTrend.map((series) => ({
                      label: series.category,
                      color: "#0f8b6d",
                      values: series.values.map((value) => ({ label: value.label, total: value.total })),
                    })),
                    height: 320,
                    emptyLabel: "Select a category to see its evolution over time.",
                  })}</div>
                </div>
                \${createTransactionsTable(focusCategoryTransactions, focusCategory ? "Transactions in " + focusCategory : "Transactions", focusCategory)}
              </div>
            </div>
          </section>

          <section class="tab-panel \${state.tab === "subscriptions" ? "active" : ""}" data-panel="subscriptions">
            <div class="subscriptions-grid">
              <div class="card kpi">
                <span class="kpi-label">Active subscriptions</span>
                <div class="kpi-value">\${snapshot.subscriptions.active.length}</div>
                <div class="kpi-note">Recurring charges that still look current.</div>
              </div>
              <div class="card kpi kpi-negative">
                <span class="kpi-label">Active monthly burn</span>
                <div class="kpi-value">\${formatCurrency(snapshot.subscriptions.activeMonthlyEstimate)}</div>
                <div class="kpi-note">Estimated monthly load from active recurring charges.</div>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Inactive candidates</span>
                <div class="kpi-value">\${snapshot.subscriptions.inactive.length}</div>
                <div class="kpi-note">Charges that look recurring historically but may have stopped.</div>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Total detected</span>
                <div class="kpi-value">\${snapshot.subscriptions.totalDetected}</div>
                <div class="kpi-note">Across active and inactive recurring charges.</div>
              </div>
            </div>

            <div class="card" style="margin-top:16px;">
              <div class="card-top">
                <div>
                  <h2>Subscriptions</h2>
                  <div class="card-subtitle">Detection is heuristic. Use this view to review the recurring merchants and their estimated monthly footprint.</div>
                </div>
                <div class="subtabs">
                  <button class="subtab-chip \${state.subscriptionTab === "active" ? "active" : ""}" data-subscriptions="active">Active</button>
                  <button class="subtab-chip \${state.subscriptionTab === "inactive" ? "active" : ""}" data-subscriptions="inactive">Inactive</button>
                </div>
              </div>
              \${createSubscriptionsTable(filteredSubscriptions)}
            </div>
          </section>

          <div class="footer-note">
            Generated locally from Wallet on \${formatDate(snapshot.generatedAt.slice(0, 10))}. Category edits and rules still live in Wallet, not in this file.
          </div>
        \`;

        bindEvents();
      };

      function bindEvents() {
        document.querySelectorAll("[data-tab]").forEach((button) => {
          button.addEventListener("click", () => {
            state.tab = button.getAttribute("data-tab");
            render();
          });
        });

        document.querySelectorAll("[data-range]").forEach((button) => {
          button.addEventListener("click", () => {
            state.range = button.getAttribute("data-range");
            state.startDate = "";
            state.endDate = "";
            render();
          });
        });

        document.querySelectorAll("[data-category]").forEach((button) => {
          button.addEventListener("click", () => {
            const category = decodeURIComponent(button.getAttribute("data-category"));
            state.selectedCategory = state.selectedCategory === category ? null : category;
            render();
          });
        });

        document.querySelectorAll("[data-subscriptions]").forEach((button) => {
          button.addEventListener("click", () => {
            state.subscriptionTab = button.getAttribute("data-subscriptions");
            render();
          });
        });

        const search = document.getElementById("search");
        if (search) {
          search.addEventListener("input", (event) => {
            state.search = event.target.value;
            render();
          });
        }

        const account = document.getElementById("account");
        if (account) {
          account.addEventListener("change", (event) => {
            state.account = event.target.value;
            render();
          });
        }

        const categoryFocus = document.getElementById("categoryFocus");
        if (categoryFocus) {
          categoryFocus.addEventListener("change", (event) => {
            state.selectedCategory = event.target.value || null;
            render();
          });
        }

        const startDate = document.getElementById("startDate");
        if (startDate) {
          startDate.addEventListener("change", (event) => {
            state.startDate = event.target.value;
            render();
          });
        }

        const endDate = document.getElementById("endDate");
        if (endDate) {
          endDate.addEventListener("change", (event) => {
            state.endDate = event.target.value;
            render();
          });
        }

        const reset = document.getElementById("resetFilters");
        if (reset) {
          reset.addEventListener("click", () => {
            state.range = "12m";
            state.startDate = "";
            state.endDate = "";
            state.account = "all";
            state.search = "";
            state.selectedCategory = null;
            state.subscriptionTab = "active";
            state.tab = "overview";
            render();
          });
        }
      }

      render();
    </script>
  </body>
</html>`;
}

// src/commands/dashboard.ts
function readFlagValue2(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : void 0;
}
function formatIsoDate(value) {
  return value.toISOString().slice(0, 10);
}
function getDefaultSince() {
  const now = /* @__PURE__ */ new Date();
  return formatIsoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)));
}
function resolveDashboardSince(args) {
  const rawSince = readFlagValue2(args, "--since");
  const all = args.includes("--all");
  if (rawSince && all) {
    throw new Error("Use either --since or --all, not both.");
  }
  if (all) {
    return "1970-01-01";
  }
  if (!rawSince) {
    return getDefaultSince();
  }
  const parsed = new Date(rawSince);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid --since value. Use YYYY-MM-DD or an ISO timestamp.");
  }
  return rawSince;
}
async function dashboardCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const openDashboard = args.includes("--open");
  const outputPath = resolve2(readFlagValue2(args, "--output") ?? "wallet-dashboard.html");
  const fetchedSince = resolveDashboardSince(args);
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const [rawContext, rawTransactions, rawSubscriptions] = await Promise.all([
    apiGet(origin, "/api/agent/context", creds.agentToken),
    apiGet(
      origin,
      `/api/agent/transactions?since=${encodeURIComponent(fetchedSince)}`,
      creds.agentToken
    ),
    apiGet(origin, "/api/agent/subscriptions", creds.agentToken)
  ]);
  const context = normalizeAgentContext(rawContext, creds);
  const snapshot = createDashboardSnapshot({
    context,
    transactions: rawTransactions.transactions ?? [],
    subscriptions: rawSubscriptions,
    generatedAt,
    fetchedSince
  });
  const html = generateDashboardHtml(snapshot);
  mkdirSync3(dirname(outputPath), { recursive: true });
  writeFileSync3(outputPath, html, "utf8");
  if (openDashboard) {
    openFile(outputPath);
  }
  if (jsonOutput) {
    printJson({
      outputPath,
      fetchedSince,
      generatedAt,
      transactionCount: snapshot.transactions.length,
      activeSubscriptionCount: snapshot.subscriptions.active.length,
      totalDetectedSubscriptions: snapshot.subscriptions.totalDetected,
      opened: openDashboard
    });
    return;
  }
  console.log(`Dashboard snapshot written to ${outputPath}`);
  console.log(
    `Included ${snapshot.transactions.length} transactions since ${fetchedSince} and ${snapshot.subscriptions.totalDetected} subscription candidates.`
  );
  if (openDashboard) {
    console.log("Opened in your default browser.");
  } else {
    console.log("Open the HTML file locally to explore it.");
  }
}

// src/commands/categorize.ts
async function categorizeCommand(args, apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const transactionId = args.find((value) => !value.startsWith("--"));
  if (!transactionId) {
    throw new Error("Usage: wallet categorize <transactionId> [--category NAME | --clear] [--json]");
  }
  const categoryIndex = args.indexOf("--category");
  const clearOverride = args.includes("--clear");
  const category = categoryIndex !== -1 ? args[categoryIndex + 1] ?? null : null;
  if (!clearOverride && !category) {
    throw new Error("Pass --category <name> or --clear.");
  }
  if (clearOverride && category) {
    throw new Error("Use either --category or --clear, not both.");
  }
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const data = await apiPost(
    origin,
    `/api/agent/transactions/${encodeURIComponent(transactionId)}/category`,
    { category: clearOverride ? null : category },
    creds.agentToken
  );
  if (jsonOutput) {
    printJson(data);
    return;
  }
  console.log(`${data.cleared ? "Cleared" : "Updated"} category for ${data.transactionId}`);
  console.log(`  Effective: ${data.effectiveCategory}`);
  console.log(`  Source: ${data.categorySource}`);
  console.log(`  Provider: ${data.providerCategory ?? "-"}`);
}

// src/commands/category-rules.ts
async function categoryRulesCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const data = await apiGet(
    origin,
    "/api/agent/category-rules",
    creds.agentToken
  );
  if (jsonOutput) {
    printJson(data);
    return;
  }
  if (data.rules.length === 0) {
    console.log("No category rules found.");
    return;
  }
  printTable(
    ["ID", "Field", "Match", "Pattern", "Category", "Priority"],
    data.rules.map((rule) => [
      rule.id,
      rule.field,
      rule.matchType,
      rule.pattern,
      rule.category,
      String(rule.priority)
    ])
  );
}

// src/commands/add-category-rule.ts
function readFlag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? void 0 : args[index + 1];
}
async function addCategoryRuleCommand(args, apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const field = readFlag(args, "--field");
  const matchType = readFlag(args, "--match-type") ?? "contains";
  const pattern = readFlag(args, "--pattern");
  const category = readFlag(args, "--category");
  const priorityRaw = readFlag(args, "--priority");
  const priority = priorityRaw ? Number(priorityRaw) : 100;
  if (!field || !pattern || !category) {
    throw new Error(
      "Usage: wallet add-category-rule --field <description|merchantName|providerCategory> --pattern <text> --category <name> [--match-type contains|exact|prefix] [--priority N] [--json]"
    );
  }
  if (!["description", "merchantName", "providerCategory"].includes(field)) {
    throw new Error("Invalid --field. Use description, merchantName, or providerCategory.");
  }
  if (!["contains", "exact", "prefix"].includes(matchType)) {
    throw new Error("Invalid --match-type. Use contains, exact, or prefix.");
  }
  if (!Number.isInteger(priority) || priority < 0) {
    throw new Error("Invalid --priority. Use a non-negative integer.");
  }
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const data = await apiPost(
    origin,
    "/api/agent/category-rules",
    {
      field,
      matchType,
      pattern,
      category,
      priority
    },
    creds.agentToken
  );
  if (jsonOutput) {
    printJson(data);
    return;
  }
  console.log(`Created category rule ${data.rule.id}`);
  console.log(`  ${data.rule.field} ${data.rule.matchType} "${data.rule.pattern}" -> ${data.rule.category}`);
}

// src/commands/delete-category-rule.ts
async function deleteCategoryRuleCommand(args, apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const ruleId = args.find((value) => !value.startsWith("--"));
  if (!ruleId) {
    throw new Error("Usage: wallet delete-category-rule <ruleId> [--json]");
  }
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const data = await apiDelete(
    origin,
    `/api/agent/category-rules/${encodeURIComponent(ruleId)}`,
    creds.agentToken
  );
  if (jsonOutput) {
    printJson(data);
    return;
  }
  console.log(`Deleted category rule ${data.deletedRuleId}`);
}

// src/commands/update.ts
import { execSync } from "child_process";
import { homedir as homedir3 } from "os";
import { join as join3 } from "path";
var PRODUCTION_ORIGIN = "https://getwalletai.com";
function getInstalledVersion() {
  try {
    const walletBin = join3(homedir3(), ".wallet", "bin", "wallet");
    const output = execSync(`node ${walletBin} --version`, {
      encoding: "utf-8",
      timeout: 5e3
    }).trim();
    return output || "unknown";
  } catch {
    return "unknown";
  }
}
async function updateCommand(_args = [], apiOriginOverride) {
  const creds = loadCredentials();
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds?.apiOrigin
  });
  const installUrl = `${origin}/install.sh`;
  console.log(`Current version: ${CLI_VERSION}`);
  console.log(`Updating from ${origin}...`);
  try {
    execSync(`curl -fsSL ${installUrl} | bash`, {
      stdio: "inherit"
    });
    const newVersion = getInstalledVersion();
    if (newVersion === CLI_VERSION) {
      console.log(`Already up to date (${CLI_VERSION}).`);
    } else {
      console.log(`Updated: ${CLI_VERSION} \u2192 ${newVersion}`);
    }
  } catch {
    if (origin !== PRODUCTION_ORIGIN) {
      console.error(`Failed to update from ${origin}, trying ${PRODUCTION_ORIGIN}...`);
      try {
        execSync(`curl -fsSL ${PRODUCTION_ORIGIN}/install.sh | bash`, {
          stdio: "inherit"
        });
        const newVersion = getInstalledVersion();
        console.log(`Updated: ${CLI_VERSION} \u2192 ${newVersion}`);
        return;
      } catch {
      }
    }
    console.error("Update failed. Try manually:");
    console.error(`  curl -fsSL ${PRODUCTION_ORIGIN}/install.sh | bash`);
    process.exit(1);
  }
}

// src/commands/logout.ts
async function logoutCommand() {
  const creds = loadCredentials();
  if (!creds) {
    console.log("Not logged in.");
    return;
  }
  deleteCredentials();
  console.log("Logged out successfully.");
  console.log("Run 'wallet setup' to reconnect.");
}

// src/index.ts
var USAGE = `
Wallet CLI - local adapter for Claude Code and other agent runtimes

Usage:
  wallet [--dev URL] <command> [options]

Commands:
  setup          Set up authentication and connect your bank account
  status         Show connection status, scopes, and granted connections
  balances       List balances [--json]
  accounts       List connected accounts [--json]
  transactions   List recent transactions [--limit N|--since DATE] [--json]
  spending       Show spending summary [--json]
  subscriptions  Detect recurring subscriptions [--json]
  dashboard      Generate a local read-only finance dashboard [--since DATE|--all] [--output PATH] [--open] [--json]
  categorize     Override one transaction category [--category NAME|--clear] [--json]
  category-rules List category rules [--json]
  add-category-rule    Create a category rule [--field F --pattern P --category C] [--match-type T] [--priority N] [--json]
  delete-category-rule Delete a category rule by id [--json]
  update         Update CLI and skill to latest version
  logout         Remove stored credentials

Examples:
  wallet setup
  wallet --dev http://localhost:3000 setup
  wallet status --json
  wallet balances --json
  wallet transactions --limit 50 --json
  wallet subscriptions --json
  wallet dashboard --open
  wallet categorize txn_123 --category Food

Environment:
  WALLET_API_ORIGIN    API endpoint (default: ${DEFAULT_API_ORIGIN})
`;
async function main() {
  const { command, args, apiOriginOverride } = parseCliInput(process.argv.slice(2));
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(CLI_VERSION);
    process.exit(0);
  }
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }
  try {
    switch (command) {
      case "setup":
        await setupCommand(args, apiOriginOverride);
        break;
      case "status":
        await statusCommand(args, apiOriginOverride);
        break;
      case "balances":
        await balancesCommand(args, apiOriginOverride);
        break;
      case "accounts":
        await accountsCommand(args, apiOriginOverride);
        break;
      case "transactions":
        await transactionsCommand(args, apiOriginOverride);
        break;
      case "spending":
        await spendingCommand(args, apiOriginOverride);
        break;
      case "subscriptions":
        await subscriptionsCommand(args, apiOriginOverride);
        break;
      case "dashboard":
        await dashboardCommand(args, apiOriginOverride);
        break;
      case "categorize":
        await categorizeCommand(args, apiOriginOverride);
        break;
      case "category-rules":
        await categoryRulesCommand(args, apiOriginOverride);
        break;
      case "add-category-rule":
        await addCategoryRuleCommand(args, apiOriginOverride);
        break;
      case "delete-category-rule":
        await deleteCategoryRuleCommand(args, apiOriginOverride);
        break;
      case "update":
        await updateCommand(args, apiOriginOverride);
        break;
      case "logout":
        await logoutCommand();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("fetch")) {
      process.exit(1);
    }
    if (error instanceof Error) {
      console.error(error.message);
      process.exit(1);
    }
    console.error("Unexpected error:", error);
    process.exit(1);
  }
}
main();
