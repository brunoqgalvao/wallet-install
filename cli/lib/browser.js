import { exec } from "node:child_process";
export function openBrowser(url) {
    // Validate URL to prevent command injection
    try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
            throw new Error("Invalid URL protocol");
        }
    }
    catch {
        console.error("Invalid URL:", url);
        return;
    }
    const platform = process.platform;
    let cmd;
    if (platform === "darwin") {
        cmd = `open "${url.replace(/"/g, '\\"')}"`;
    }
    else if (platform === "win32") {
        cmd = `start "" "${url.replace(/"/g, '\\"')}"`;
    }
    else {
        cmd = `xdg-open "${url.replace(/"/g, '\\"')}"`;
    }
    exec(cmd, (error) => {
        if (error) {
            console.error("Could not open browser. Please visit:", url);
        }
    });
}
