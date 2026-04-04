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
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (since) params.set("since", since);
  const path = `/api/agent/transactions?${params.toString()}`;
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
  console.log(`Current monthly estimate: ${formatCurrency(data.currentMonthlyEstimate)}`);
  const subscriptionRows = (subs) => subs.map((s) => [
    s.merchant,
    s.category ?? "-",
    s.frequency,
    formatCurrency(s.estimatedMonthlyAmount),
    String(s.chargeCount),
    s.lastChargeDate,
    `${s.daysSinceLastCharge}d ago`,
    s.confidence
  ]);
  const columns = ["Merchant", "Category", "Freq", "Monthly", "Charges", "Last", "Since", "Confidence"];
  if (data.current.length > 0) {
    console.log("\nCurrent (charged within expected window):");
    printTable(columns, subscriptionRows(data.current));
  }
  if (data.overdue?.length > 0) {
    console.log("\nOverdue (missed expected charge \u2014 possibly cancelled):");
    printTable(columns, subscriptionRows(data.overdue));
  }
  if (data.lapsed.length > 0) {
    console.log("\nLapsed (no charge in 2+ cycles \u2014 likely cancelled):");
    printTable(columns, subscriptionRows(data.lapsed));
  }
  if (data.current.length === 0 && !data.overdue?.length && data.lapsed.length === 0) {
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
  const cssString = `
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0a0b;
  --surface:#111113;
  --surface-alt:#18181b;
  --ink:#ededef;
  --ink-mid:#8b8b8e;
  --ink-faint:#5c5c5f;
  --line:rgba(255,255,255,0.06);
  --line-strong:rgba(255,255,255,0.12);
  --accent:#3b82f6;
  --accent-soft:rgba(59,130,246,0.1);
  --green:#22c55e;
  --green-soft:rgba(34,197,94,0.1);
  --danger:#ef4444;
  --danger-soft:rgba(239,68,68,0.1);
  --sans:"Instrument Sans",system-ui,sans-serif;
  --mono:"JetBrains Mono",monospace;
}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
html{font-size:15px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{
  background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.5;
  position:relative;min-height:100vh;
}
body::before{
  content:"";position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:1;
  background:radial-gradient(circle at 50% 0,rgba(59,130,246,0.08),transparent 50%);
}
body::after{
  content:"";position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:2;
  background-image:url('data:image/svg+xml,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)" opacity="0.03"/></svg>');
  background-repeat:repeat;
}
.container{max-width:1280px;margin:0 auto;padding:32px 24px 80px;position:relative;z-index:3}

nav{
  display:flex;justify-content:space-between;align-items:center;
  padding:16px 0 24px;margin-bottom:24px;
  border-bottom:1px solid var(--line);
}
.nav-left{display:flex;align-items:center;gap:12px}
.logo-mark{
  width:28px;height:28px;border-radius:8px;
  background:linear-gradient(135deg,#3888ff,#5a6fff);
  display:flex;align-items:center;justify-content:center;
  font-weight:600;font-size:14px;color:#fff;
}
.logo-text{font-weight:600;font-size:18px;color:var(--ink)}
.nav-right{
  font-family:var(--mono);font-size:12px;color:var(--ink-mid);
  display:flex;gap:12px;align-items:center;
}

.toolbar{
  display:flex;gap:12px;flex-wrap:wrap;align-items:end;
  padding:16px 20px;background:var(--surface);border:1px solid var(--line);border-radius:12px;
  animation:fadeUp 0.4s ease;
}
.toolbar .field{display:flex;flex-direction:column;gap:6px}
.toolbar label{
  font-size:11px;text-transform:uppercase;letter-spacing:0.06em;
  color:var(--ink-faint);font-weight:500;
}
.toolbar input,.toolbar select{
  font:inherit;font-size:14px;font-family:var(--sans);
  padding:8px 12px;border:1px solid var(--line);border-radius:8px;
  background:var(--bg);color:var(--ink);min-width:160px;
  transition:border-color 0.2s ease,background 0.2s ease;
}
.toolbar input:focus,.toolbar select:focus{
  outline:none;border-color:var(--accent);background:var(--surface-alt);
}
.toolbar input::placeholder{color:var(--ink-faint)}
.toolbar button{
  font:inherit;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;font-weight:500;
  padding:9px 16px;border:1px solid var(--line);border-radius:8px;
  background:transparent;color:var(--ink-mid);cursor:pointer;
  transition:all 0.2s ease;
}
.toolbar button:hover{background:var(--surface-alt);border-color:var(--line-strong);color:var(--ink)}

.range-bar{
  display:flex;gap:6px;margin-top:16px;animation:fadeUp 0.5s ease;
}
.range-bar button{
  font:inherit;font-size:12px;letter-spacing:0.03em;font-weight:500;
  padding:6px 16px;border:1px solid var(--line);border-radius:20px;
  background:transparent;color:var(--ink-mid);cursor:pointer;
  transition:all 0.2s ease;
}
.range-bar button:hover{background:var(--surface);color:var(--ink)}
.range-bar button.active{
  background:var(--accent);color:#fff;border-color:var(--accent);
}

.tabs{
  display:flex;gap:0;margin-top:24px;border-bottom:1px solid var(--line);
  animation:fadeUp 0.6s ease;
}
.tabs button{
  font:inherit;font-size:13px;letter-spacing:0.03em;text-transform:uppercase;font-weight:500;
  padding:12px 20px;border:none;background:transparent;color:var(--ink-mid);cursor:pointer;
  border-bottom:2px solid transparent;margin-bottom:-1px;
  transition:all 0.2s ease;position:relative;
}
.tabs button:hover{color:var(--ink)}
.tabs button.active{color:var(--accent);border-bottom-color:var(--accent)}

.kpis{
  display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0;
  animation:fadeUp 0.7s ease;
}
.kpi{
  background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:20px;transition:border-color 0.2s ease,background 0.2s ease;
}
.kpi:hover{border-color:var(--line-strong);background:var(--surface-alt)}
.kpi-label{
  font-size:10px;text-transform:uppercase;letter-spacing:0.08em;
  color:var(--ink-faint);margin-bottom:8px;font-weight:600;
}
.kpi-value{
  font-family:var(--mono);font-size:28px;font-weight:600;
  line-height:1.1;margin-bottom:8px;
}
.kpi-note{
  font-size:12px;color:var(--ink-mid);font-family:var(--mono);
}
.positive{color:var(--green)}
.negative{color:var(--danger)}

section.panel{margin:24px 0 0;display:none;animation:fadeUp 0.5s ease}
section.panel.active{display:block}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}

.card{
  background:var(--surface);border:1px solid var(--line);border-radius:20px;
  padding:24px;transition:border-color 0.2s ease;
}
.card:hover{border-color:var(--line-strong)}
.card h2{
  font-weight:600;font-size:16px;margin-bottom:4px;color:var(--ink);
}
.card .subtitle{
  font-size:12px;color:var(--ink-mid);margin-bottom:20px;
}

.chart-svg{width:100%;height:auto;display:block}

.category-list{display:flex;flex-direction:column;gap:0}
.cat-row{
  display:flex;justify-content:space-between;align-items:center;
  padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer;
  transition:background 0.2s ease;
}
.cat-row:last-child{border-bottom:none}
.cat-row:hover{background:var(--surface-alt)}
.cat-row.active{background:var(--accent-soft)}
.cat-name{font-size:14px;min-width:140px;color:var(--ink);font-weight:500}
.cat-bar{
  flex:1;margin:0 20px;height:4px;background:var(--line);
  position:relative;border-radius:2px;overflow:hidden;
}
.cat-bar span{
  display:block;height:100%;background:var(--accent);
  border-radius:2px;transition:width 0.3s ease;
}
.cat-amount{
  font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap;
  font-family:var(--mono);color:var(--ink);font-weight:500;
}
.cat-pct{
  font-size:12px;color:var(--ink-mid);width:44px;text-align:right;
  font-family:var(--mono);
}

table{width:100%;border-collapse:collapse;font-size:13px}
thead{background:var(--surface-alt)}
th{
  text-align:left;font-size:11px;text-transform:uppercase;
  letter-spacing:0.06em;color:var(--ink-faint);font-weight:600;
  padding:10px 12px;border-bottom:1px solid var(--line-strong);
}
tr{transition:background 0.2s ease}
tbody tr:hover{background:var(--surface-alt)}
td{
  padding:12px 12px;border-bottom:1px solid var(--line);vertical-align:top;
}
td strong{font-weight:500;display:block;color:var(--ink)}
td .sub{color:var(--ink-mid);font-size:11px;margin-top:3px}
.amt{
  font-variant-numeric:tabular-nums;white-space:nowrap;
  text-align:right;font-family:var(--mono);font-weight:500;
}

.sub-tabs{display:flex;gap:6px;margin:0 0 16px}
.sub-tabs button{
  font:inherit;font-size:12px;letter-spacing:0.03em;font-weight:500;
  padding:6px 14px;border:1px solid var(--line);border-radius:20px;
  background:transparent;color:var(--ink-mid);cursor:pointer;
  transition:all 0.2s ease;
}
.sub-tabs button:hover{background:var(--surface);color:var(--ink)}
.sub-tabs button.active{
  background:var(--accent);color:#fff;border-color:var(--accent);
}

.confidence{
  display:inline-block;width:6px;height:6px;border-radius:50%;
  margin-right:6px;
}
.conf-high{background:var(--green)}
.conf-medium{background:#eab308}
.conf-low{background:var(--danger)}

.footer{
  margin-top:60px;padding-top:20px;border-top:1px solid var(--line);
  font-size:12px;color:var(--ink-faint);text-align:center;
  font-family:var(--mono);
}

.clear-filter{
  font:inherit;border:none;background:none;text-decoration:underline;
  cursor:pointer;color:var(--accent);padding:0;font-size:12px;
  transition:color 0.2s ease;
}
.clear-filter:hover{color:var(--ink)}

.load-more{
  display:block;width:100%;margin-top:16px;padding:12px;
  font:inherit;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;
  font-weight:500;border:1px solid var(--line);border-radius:8px;
  background:transparent;color:var(--ink-mid);cursor:pointer;
  transition:all 0.2s ease;
}
.load-more:hover{
  background:var(--surface-alt);border-color:var(--line-strong);color:var(--ink);
}

@media(max-width:768px){
  .kpis{grid-template-columns:repeat(2,1fr)}
  .grid-2{grid-template-columns:1fr}
  .toolbar{flex-direction:column;align-items:stretch}
  .toolbar .field{width:100%}
  .toolbar input,.toolbar select{width:100%;min-width:0}
  table{font-size:11px;min-width:700px}
  .card{overflow-x:auto}
  nav{flex-direction:column;align-items:flex-start;gap:12px}
  .nav-right{font-size:10px}
}
`;
  const jsString = `
var snapshot = JSON.parse(document.getElementById("wallet-dashboard-data").textContent);
var app = document.getElementById("app");

var fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
var fmtCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
var fmtDate = function(d) { var p = d.split("-"); return p[2] + "/" + p[1]; };
var fmtMonth = function(k) { var d = new Date(k + "-15"); return d.toLocaleString("en", { month: "short", year: "2-digit" }); };
var esc = function(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
var norm = function(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); };

var PAGE_SIZE = 30;
var state = { range: "12m", tab: "overview", search: "", account: "all", startDate: "", endDate: "", selectedCategory: null, subTab: "current", txPage: 0 };

var isExp = function(t) { return t.amount < 0 && !["Transfer", "Interbank transfer"].includes(t.category); };
var isInc = function(t) { return t.amount > 0 && !["Transfer", "Interbank transfer"].includes(t.category); };
var accKey = function(t) { return [t.connectionLabel || "", t.accountName || ""].join("::"); };

var rangeStart = function() {
  if (state.startDate) return new Date(state.startDate + "T00:00:00");
  if (state.range === "all") return new Date("1970-01-01");
  var latest = snapshot.transactions.reduce(function(m, t) { var d = new Date(t.effectiveDate + "T12:00:00"); return d > m ? d : m; }, new Date(snapshot.generatedAt));
  var mo = state.range === "3m" ? 2 : state.range === "6m" ? 5 : 11;
  return new Date(latest.getFullYear(), latest.getMonth() - mo, 1);
};

var rangeEnd = function() {
  if (state.endDate) return new Date(state.endDate + "T23:59:59");
  var latest = snapshot.transactions.reduce(function(m, t) { var d = new Date(t.effectiveDate + "T12:00:00"); return d > m ? d : m; }, new Date(snapshot.generatedAt));
  latest.setHours(23, 59, 59, 999);
  return latest;
};

var filtered = function() {
  var s = norm(state.search), rs = rangeStart(), re = rangeEnd();
  return snapshot.transactions.filter(function(t) {
    var d = new Date(t.effectiveDate + "T12:00:00");
    if (d < rs || d > re) return false;
    if (state.account !== "all" && accKey(t) !== state.account) return false;
    if (s) { var h = [t.description, t.merchantName, t.accountName, t.connectionLabel, t.category].map(norm).join(" "); if (!h.includes(s)) return false; }
    return true;
  }).sort(function(a, b) { return b.effectiveDate.localeCompare(a.effectiveDate); });
};

var catTotals = function(txs) {
  var m = new Map();
  txs.filter(isExp).forEach(function(t) {
    var c = t.category || "Other";
    var e = m.get(c) || { category: c, total: 0, count: 0 };
    e.total += Math.abs(t.amount); e.count++; m.set(c, e);
  });
  return Array.from(m.values()).sort(function(a, b) { return b.total - a.total; });
};

var monthSeries = function(txs) {
  var m = new Map();
  txs.forEach(function(t) {
    var k = t.effectiveDate.slice(0, 7);
    var e = m.get(k) || { key: k, income: 0, expense: 0 };
    if (isInc(t)) e.income += t.amount;
    else if (isExp(t)) e.expense += Math.abs(t.amount);
    m.set(k, e);
  });
  return Array.from(m.values()).sort(function(a, b) { return a.key.localeCompare(b.key); }).map(function(e) { return { key: e.key, income: e.income, expense: e.expense, net: e.income - e.expense }; });
};

var lineChart = function(series, h) {
  if (!h) h = 240;
  var ps = series.filter(function(s) { return s.values.some(function(v) { return v.y > 0; }); });
  if (!ps.length) return '<div style="padding:60px 0;color:var(--ink-mid);font-size:14px;text-align:center">No data in this range</div>';
  var W = 800, pad = { t: 16, r: 20, b: 32, l: 60 }, cw = W - pad.l - pad.r, ch = h - pad.t - pad.b;
  var mx = Math.max(1, Math.max.apply(Math, ps.map(function(s) { return Math.max.apply(Math, s.values.map(function(v) { return v.y; })); })));
  var n = ps[0].values.length, step = n === 1 ? 0 : cw / (n - 1);
  var svg = '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + h + '">';
  for (var i = 0; i < 5; i++) {
    var y = pad.t + ch * (i / 4); var v = mx - mx * (i / 4);
    svg += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>';
    svg += '<text x="' + (pad.l - 10) + '" y="' + (y + 4) + '" fill="var(--ink-mid)" font-size="11" font-family="var(--mono)" text-anchor="end">' + fmtCompact.format(v) + '</text>';
  }
  ps.forEach(function(s) {
    var pts = s.values.map(function(v, i) { return { x: pad.l + step * i, y: pad.t + ch - (v.y / mx) * ch }; });
    var d = pts.map(function(p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
    svg += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    pts.forEach(function(p) { svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="' + s.color + '"/>'; });
  });
  ps[0].values.forEach(function(v, i) {
    var x = pad.l + step * i;
    svg += '<text x="' + x + '" y="' + (h - 10) + '" fill="var(--ink-mid)" font-size="10" font-family="var(--mono)" text-anchor="middle">' + v.label + '</text>';
  });
  svg += '</svg>';
  return svg;
};

var render = function() {
  var txs = filtered();
  var exps = txs.filter(isExp);
  var incs = txs.filter(isInc);
  var income = incs.reduce(function(s, t) { return s + t.amount; }, 0);
  var expense = exps.reduce(function(s, t) { return s + Math.abs(t.amount); }, 0);
  var net = income - expense;
  var rate = income > 0 ? ((net / income) * 100).toFixed(1) + "%" : "\\u2014";
  var cats = catTotals(txs);
  var months = monthSeries(txs);
  var accts = Array.from(new Map(snapshot.transactions.map(function(t) { return [accKey(t), { key: accKey(t), label: t.accountName + (t.connectionLabel !== t.accountName ? " \\u00b7 " + t.connectionLabel : "") }]; })).values()).sort(function(a, b) { return a.label.localeCompare(b.label); });

  var focusCat = state.selectedCategory && cats.some(function(c) { return c.category === state.selectedCategory; }) ? state.selectedCategory : null;
  var displayTxs = focusCat ? exps.filter(function(t) { return t.category === focusCat; }) : txs;

  var subs = state.subTab === "current" ? snapshot.subscriptions.current : state.subTab === "overdue" ? (snapshot.subscriptions.overdue || []) : snapshot.subscriptions.lapsed;
  var filtSubs = subs.filter(function(s) { if (!state.search) return true; return [s.merchant, s.category].map(norm).join(" ").includes(norm(state.search)); });

  var html = "";

  html += '<nav>';
  html += '<div class="nav-left">';
  html += '<div class="logo-mark">W</div>';
  html += '<div class="logo-text">Wallet</div>';
  html += '</div>';
  html += '<div class="nav-right">';
  html += '<span>' + esc(snapshot.context.sourceConnectionLabels.join(", ")) + '</span>';
  html += '<span>\\u00b7</span>';
  html += '<span>' + fmtDate(snapshot.generatedAt.slice(0, 10)) + '</span>';
  html += '</div>';
  html += '</nav>';

  html += '<div class="toolbar">';
  html += '<div class="field"><label>Search</label><input id="search" type="search" placeholder="merchant, category..." value="' + esc(state.search) + '"/></div>';
  html += '<div class="field"><label>Account</label><select id="account"><option value="all">All accounts</option>';
  accts.forEach(function(a) { html += '<option value="' + esc(a.key) + '"' + (state.account === a.key ? " selected" : "") + '>' + esc(a.label) + '</option>'; });
  html += '</select></div>';
  html += '<div class="field"><label>From</label><input id="startDate" type="date" value="' + state.startDate + '"/></div>';
  html += '<div class="field"><label>To</label><input id="endDate" type="date" value="' + state.endDate + '"/></div>';
  html += '<button id="reset">Reset filters</button>';
  html += '</div>';

  html += '<div class="range-bar">';
  [["3m", "3M"], ["6m", "6M"], ["12m", "12M"], ["all", "All"]].forEach(function(pair) {
    var v = pair[0], l = pair[1];
    html += '<button data-range="' + v + '" class="' + (state.range === v ? "active" : "") + '">' + l + '</button>';
  });
  html += '</div>';

  html += '<div class="tabs">';
  [["overview", "Overview"], ["categories", "Categories"], ["transactions", "Transactions"], ["subscriptions", "Subscriptions"]].forEach(function(pair) {
    var v = pair[0], l = pair[1];
    html += '<button data-tab="' + v + '" class="' + (state.tab === v ? "active" : "") + '">' + l + '</button>';
  });
  html += '</div>';

  html += '<div class="kpis">';
  html += '<div class="kpi"><div class="kpi-label">Income</div><div class="kpi-value positive">' + fmt.format(income) + '</div><div class="kpi-note">' + incs.length + ' transactions</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Expenses</div><div class="kpi-value negative">' + fmt.format(expense) + '</div><div class="kpi-note">' + exps.length + ' transactions</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Net</div><div class="kpi-value ' + (net >= 0 ? "positive" : "negative") + '">' + fmt.format(net) + '</div><div class="kpi-note">' + (net >= 0 ? "surplus" : "deficit") + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Savings rate</div><div class="kpi-value">' + rate + '</div><div class="kpi-note">' + snapshot.subscriptions.current.length + ' active subs</div></div>';
  html += '</div>';

  html += '<section class="panel ' + (state.tab === "overview" ? "active" : "") + '">';
  html += '<div class="grid-2">';

  html += '<div class="card"><h2>Income vs Expenses</h2><div class="subtitle">Monthly comparison</div>';
  html += lineChart([
    { color: "var(--green)", values: months.map(function(m) { return { label: fmtMonth(m.key), y: m.income }; }) },
    { color: "var(--danger)", values: months.map(function(m) { return { label: fmtMonth(m.key), y: m.expense }; }) },
  ], 220);
  html += '<div style="display:flex;gap:20px;margin-top:12px;font-size:12px;color:var(--ink-mid)">';
  html += '<span><span style="display:inline-block;width:16px;height:2px;background:var(--green);margin-right:6px;vertical-align:middle"></span>Income</span>';
  html += '<span><span style="display:inline-block;width:16px;height:2px;background:var(--danger);margin-right:6px;vertical-align:middle"></span>Expenses</span>';
  html += '</div></div>';

  html += '<div class="card"><h2>Top Categories</h2><div class="subtitle">Share of spending</div><div class="category-list">';
  cats.slice(0, 8).forEach(function(c) {
    var pct = expense > 0 ? (c.total / expense * 100) : 0;
    html += '<div class="cat-row" data-category="' + esc(c.category) + '">';
    html += '<span class="cat-name">' + esc(c.category) + '</span>';
    html += '<div class="cat-bar"><span style="width:' + pct.toFixed(1) + '%"></span></div>';
    html += '<span class="cat-amount">' + fmt.format(c.total) + '</span>';
    html += '<span class="cat-pct">' + pct.toFixed(0) + '%</span>';
    html += '</div>';
  });
  html += '</div></div>';
  html += '</div></section>';

  html += '<section class="panel ' + (state.tab === "categories" ? "active" : "") + '">';
  html += '<div class="card"><h2>All Categories</h2>';
  html += '<div class="subtitle">' + cats.length + ' categories \\u00b7 click to filter transactions</div>';
  html += '<div class="category-list">';
  cats.forEach(function(c) {
    var pct = expense > 0 ? (c.total / expense * 100) : 0;
    var active = focusCat === c.category;
    html += '<div class="cat-row' + (active ? " active" : "") + '" data-category="' + esc(c.category) + '">';
    html += '<span class="cat-name">' + esc(c.category) + '</span>';
    html += '<div class="cat-bar"><span style="width:' + pct.toFixed(1) + '%"></span></div>';
    html += '<span class="cat-amount">' + fmt.format(c.total) + '</span>';
    html += '<span class="cat-pct">' + pct.toFixed(0) + '%</span>';
    html += '</div>';
  });
  html += '</div></div></section>';

  html += '<section class="panel ' + (state.tab === "transactions" ? "active" : "") + '">';
  html += '<div class="card">';
  html += '<h2>' + (focusCat ? esc(focusCat) : "All Transactions") + '</h2>';
  html += '<div class="subtitle">' + displayTxs.length + ' transactions';
  if (focusCat) html += ' \\u00b7 <button class="clear-filter" data-clear-cat>clear filter</button>';
  html += '</div>';
  var txVisible = (state.txPage + 1) * PAGE_SIZE;
  var txShown = displayTxs.slice(0, txVisible);
  var txHasMore = displayTxs.length > txVisible;
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th style="text-align:right">Amount</th></tr></thead><tbody>';
  txShown.forEach(function(t) {
    html += '<tr>';
    html += '<td style="font-family:var(--mono)">' + fmtDate(t.effectiveDate) + '</td>';
    html += '<td><strong>' + esc(t.merchantName || t.description) + '</strong><div class="sub">' + esc(t.description) + '</div></td>';
    html += '<td>' + esc(t.category) + '</td>';
    html += '<td>' + esc(t.accountName) + '<div class="sub">' + esc(t.connectionLabel) + '</div></td>';
    html += '<td class="amt ' + (t.amount > 0 ? "positive" : "negative") + '">' + fmt.format(t.amount) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  if (txHasMore) html += '<button class="load-more" id="loadMore">Show more (' + txShown.length + ' of ' + displayTxs.length + ')</button>';
  html += '</div></section>';

  html += '<section class="panel ' + (state.tab === "subscriptions" ? "active" : "") + '">';
  html += '<div class="sub-tabs">';
  html += '<button data-subtab="current" class="' + (state.subTab === "current" ? "active" : "") + '">Current (' + snapshot.subscriptions.current.length + ')</button>';
  html += '<button data-subtab="overdue" class="' + (state.subTab === "overdue" ? "active" : "") + '">Overdue (' + (snapshot.subscriptions.overdue || []).length + ')</button>';
  html += '<button data-subtab="lapsed" class="' + (state.subTab === "lapsed" ? "active" : "") + '">Lapsed (' + snapshot.subscriptions.lapsed.length + ')</button>';
  html += '</div>';
  html += '<div class="card">';
  html += '<h2>Subscriptions</h2>';
  html += '<div class="subtitle">' + fmt.format(snapshot.subscriptions.currentMonthlyEstimate) + '/mo estimated burn</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Merchant</th><th>Category</th><th>Frequency</th><th style="text-align:right">Monthly</th><th>Last charge</th><th>Confidence</th></tr></thead><tbody>';
  filtSubs.forEach(function(s) {
    html += '<tr>';
    html += '<td><strong>' + esc(s.merchant) + '</strong><div class="sub">' + s.chargeCount + ' charges detected</div></td>';
    html += '<td>' + esc(s.category || "Other") + '</td>';
    html += '<td>' + esc(s.frequency) + '</td>';
    html += '<td class="amt negative">' + fmt.format(s.estimatedMonthlyAmount) + '</td>';
    html += '<td style="font-family:var(--mono)">' + fmtDate(s.lastChargeDate) + '</td>';
    html += '<td><span class="confidence conf-' + s.confidence + '"></span>' + esc(s.confidence) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div></section>';

  html += '<div class="footer">Wallet \\u00b7 read-only snapshot \\u00b7 ' + snapshot.transactions.length + ' transactions</div>';

  app.innerHTML = html;

  document.querySelectorAll("[data-range]").forEach(function(b) { b.onclick = function() { state.range = b.dataset.range; state.txPage = 0; render(); }; });
  document.querySelectorAll("[data-tab]").forEach(function(b) { b.onclick = function() { state.tab = b.dataset.tab; render(); }; });
  document.querySelectorAll("[data-subtab]").forEach(function(b) { b.onclick = function() { state.subTab = b.dataset.subtab; render(); }; });
  document.querySelectorAll("[data-category]").forEach(function(b) { b.onclick = function() { state.selectedCategory = state.selectedCategory === b.dataset.category ? null : b.dataset.category; state.tab = "transactions"; state.txPage = 0; render(); }; });
  var loadMore = document.getElementById("loadMore");
  if (loadMore) loadMore.onclick = function() { state.txPage++; render(); };
  var clearBtn = document.querySelector("[data-clear-cat]");
  if (clearBtn) clearBtn.addEventListener("click", function() { state.selectedCategory = null; state.txPage = 0; render(); });
  var si = document.getElementById("search"); if (si) si.oninput = function() { state.search = si.value; state.txPage = 0; render(); };
  var ai = document.getElementById("account"); if (ai) ai.onchange = function() { state.account = ai.value; state.txPage = 0; render(); };
  var sd = document.getElementById("startDate"); if (sd) sd.onchange = function() { state.startDate = sd.value; render(); };
  var ed = document.getElementById("endDate"); if (ed) ed.onchange = function() { state.endDate = ed.value; render(); };
  var rb = document.getElementById("reset"); if (rb) rb.onclick = function() { state.range = "12m"; state.tab = "overview"; state.search = ""; state.account = "all"; state.startDate = ""; state.endDate = ""; state.selectedCategory = null; state.subTab = "current"; state.txPage = 0; render(); };
};

render();
`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Wallet Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>${cssString}</style>
</head>
<body>
<div class="container" id="app"></div>
<script id="wallet-dashboard-data" type="application/json">${payload}</script>
<script>${jsString}</script>
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
  const snapshotOnly = args.includes("--snapshot");
  const openDashboard = args.includes("--open");
  const outputPath = resolve2(readFlagValue2(args, "--output") ?? (snapshotOnly ? "wallet-snapshot.json" : "wallet-dashboard.html"));
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
  if (snapshotOnly) {
    mkdirSync3(dirname(outputPath), { recursive: true });
    writeFileSync3(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
    if (jsonOutput) {
      printJson({ outputPath, fetchedSince, generatedAt, transactionCount: snapshot.transactions.length });
      return;
    }
    console.log(`Snapshot written to ${outputPath}`);
    console.log(
      `Included ${snapshot.transactions.length} transactions since ${fetchedSince} and ${snapshot.subscriptions.totalDetected} subscription candidates.`
    );
    console.log("Use this JSON to build a custom dashboard \u2014 or let your agent do it.");
    return;
  }
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
      currentSubscriptionCount: snapshot.subscriptions.current.length,
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

// src/commands/feedback.ts
var CATEGORIES = ["bug", "feature", "question", "other"];
async function feedbackCommand(args = [], apiOriginOverride) {
  const jsonOutput = args.includes("--json");
  const creds = loadCredentials();
  if (!creds) {
    console.error("Not authenticated. Run: wallet setup");
    process.exit(1);
  }
  const catIdx = args.indexOf("--category");
  const category = catIdx !== -1 ? args[catIdx + 1] : void 0;
  if (category && !CATEGORIES.includes(category)) {
    console.error(`Invalid category: ${category}`);
    console.error(`Valid categories: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }
  const message = args.filter((a, i) => {
    if (a === "--json") return false;
    if (a === "--category") return false;
    if (i > 0 && args[i - 1] === "--category") return false;
    return true;
  }).join(" ").trim();
  if (!message) {
    console.error("Usage: wallet feedback <message> [--category bug|feature|question|other] [--json]");
    console.error("\nExamples:");
    console.error('  wallet feedback "transactions are missing from Nubank"');
    console.error('  wallet feedback --category bug "dashboard crashes on empty accounts"');
    console.error('  wallet feedback --category feature "add investment tracking"');
    process.exit(1);
  }
  if (message.length > 2e3) {
    console.error(`Message too long (${message.length} chars). Max: 2000.`);
    process.exit(1);
  }
  const origin = resolveApiOrigin({
    apiOriginOverride,
    storedApiOrigin: creds.apiOrigin
  });
  const body = { message };
  if (category) body.category = category;
  const data = await apiPost(origin, "/api/agent/feedback", body, creds.agentToken);
  if (jsonOutput) {
    printJson(data);
    return;
  }
  console.log("Feedback submitted. Thanks!");
  if (category) console.log(`Category: ${category}`);
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
  feedback       Submit feedback or bug report [--category bug|feature|question|other] [--json]
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
  wallet feedback "add investment tracking" --category feature

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
      case "feedback":
        await feedbackCommand(args, apiOriginOverride);
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
