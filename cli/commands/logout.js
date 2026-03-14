import { deleteCredentials, loadCredentials } from "../lib/credentials.js";
export async function logoutCommand() {
    const creds = loadCredentials();
    if (!creds) {
        console.log("Not logged in.");
        return;
    }
    deleteCredentials();
    console.log("Logged out successfully.");
    console.log("Run 'wallet setup' to reconnect.");
}
