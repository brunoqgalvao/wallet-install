export class ApiError extends Error {
    status;
    statusText;
    body;
    constructor(status, statusText, body) {
        super(`HTTP ${status}: ${statusText}`);
        this.status = status;
        this.statusText = statusText;
        this.body = body;
        this.name = "ApiError";
    }
}
async function handleResponse(res) {
    if (res.status === 401) {
        console.error("Not authenticated. Run: wallet setup");
        process.exit(1);
    }
    if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
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
        }
        else {
            console.error("Error:", message);
        }
        throw new ApiError(res.status, res.statusText, body);
    }
    return res.json();
}
export async function apiGet(origin, path, token) {
    try {
        const res = await fetch(`${origin}${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        return handleResponse(res);
    }
    catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        console.error(`Could not reach Wallet API at ${origin}. Is it running?`);
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
export async function apiPost(origin, path, body, token) {
    try {
        const headers = {
            "Content-Type": "application/json",
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        const fetchOptions = {
            method: "POST",
            headers,
        };
        if (body !== undefined) {
            fetchOptions.body = JSON.stringify(body);
        }
        const res = await fetch(`${origin}${path}`, fetchOptions);
        return handleResponse(res);
    }
    catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        console.error(`Could not reach Wallet API at ${origin}. Is it running?`);
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
export async function apiDelete(origin, path, token) {
    try {
        const res = await fetch(`${origin}${path}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        return handleResponse(res);
    }
    catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        console.error(`Could not reach Wallet API at ${origin}. Is it running?`);
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
