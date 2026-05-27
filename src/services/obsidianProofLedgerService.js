const {
    buildObsidianProofTargetKey,
    loadObsidianProofLedger,
} = require("../datasets/obsidianProofLedger");

function incrementCount(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
}

function summarizeEvents(events = []) {
    const byDeckKind = new Map();
    const byLevel = new Map();
    const byBatch = new Map();
    for (const event of events) {
        incrementCount(byDeckKind, event.target.deckKind);
        incrementCount(byLevel, `${event.target.deckKind}:N${event.target.level}`);
        incrementCount(byBatch, event.batch.id);
    }

    return {
        totalEvents: events.length,
        deckKinds: Object.fromEntries([...byDeckKind.entries()].sort()),
        levels: Object.fromEntries([...byLevel.entries()].sort()),
        batches: Object.fromEntries([...byBatch.entries()].sort()),
    };
}

function buildObsidianProofLedgerReport(options = {}) {
    try {
        const ledger = loadObsidianProofLedger(options);
        const targetKeys = ledger.events.map(buildObsidianProofTargetKey);
        return {
            passed: true,
            ledgerDir: ledger.ledgerDir,
            files: ledger.files,
            counts: summarizeEvents(ledger.events),
            targetKeys,
            failures: [],
        };
    } catch (error) {
        return {
            passed: false,
            ledgerDir: options.ledgerDir || null,
            files: [],
            counts: summarizeEvents([]),
            targetKeys: [],
            failures: [error.message],
        };
    }
}

function formatObsidianProofLedgerReport(report) {
    const lines = [
        "Japanese Kanji Builder Obsidian Proof Ledger",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Ledger directory: ${report.ledgerDir || "(not resolved)"}`,
        `Ledger files: ${report.files.length}`,
        `Proof events: ${report.counts.totalEvents}`,
    ];

    const levels = Object.entries(report.counts.levels || {});
    if (levels.length > 0) {
        lines.push("", "Proof events by level:");
        for (const [level, count] of levels) {
            lines.push(`- ${level}: ${count}`);
        }
    }

    const batches = Object.entries(report.counts.batches || {});
    if (batches.length > 0) {
        lines.push("", "Proof events by batch:");
        for (const [batch, count] of batches) {
            lines.push(`- ${batch}: ${count}`);
        }
    }

    lines.push(
        "",
        "Security boundary:",
        "- Ledger files must stay under templates/obsidian_proof_ledger.",
        "- Ledger records are Obsidian proof only; they are not JLPT source truth, generated TSV authority, APKG authority, NLP certification, or release readiness.",
        "- Compatibility views and SQLite mirrors are generated artifacts, not canonical source truth."
    );

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildObsidianProofLedgerReport,
    formatObsidianProofLedgerReport,
    summarizeEvents,
};
