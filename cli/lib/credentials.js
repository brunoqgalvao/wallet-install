import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CREDENTIALS_DIR = join(homedir(), ".wallet");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");
export function loadCredentials() {
    try {
        if (!existsSync(CREDENTIALS_FILE)) {
            return null;
        }
        const data = readFileSync(CREDENTIALS_FILE, "utf-8");
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export function saveCredentials(creds) {
    if (!existsSync(CREDENTIALS_DIR)) {
        mkdirSync(CREDENTIALS_DIR, { recursive: true });
    }
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), "utf-8");
}
export function deleteCredentials() {
    if (existsSync(CREDENTIALS_FILE)) {
        unlinkSync(CREDENTIALS_FILE);
    }
}
