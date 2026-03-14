export function printTable(headers, rows) {
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] ?? "").length)));
    console.log(headers.map((h, i) => h.padEnd(widths[i])).join("  "));
    console.log(widths.map(w => "-".repeat(w)).join("  "));
    for (const row of rows) {
        console.log(row.map((c, i) => c.padEnd(widths[i])).join("  "));
    }
}
export function formatCurrency(amount, currency = "BRL") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
}
export function formatDate(dateStr) {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("pt-BR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}
export function printJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
