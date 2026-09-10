const {
    CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION,
    buildObsidianProofTargetKey,
    loadObsidianProofLedger,
} = require("../datasets/obsidianProofLedger");
const {
    verifyHistoricalSourceCommit,
    verifyV2LedgerSourceBinding,
} = require("./obsidianProofGitBindingService");

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

function verifyLedgerGitBindings({ cwd, records = [] }) {
    const verifiedCommits = new Set();
    let v2SourceBindingsVerified = 0;
    for (const record of records) {
        if (record.schemaVersion === CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION) {
            verifyV2LedgerSourceBinding({ cwd, event: record });
            v2SourceBindingsVerified += 1;
        } else {
            const key = String(record.ledger.sourceCommit).toLowerCase();
            if (!verifiedCommits.has(key)) {
                verifyHistoricalSourceCommit({ cwd, event: record });
                verifiedCommits.add(key);
            }
        }
    }
    return {
        historicalSourceCommitsVerified: verifiedCommits.size,
        v2SourceBindingsVerified,
    };
}

function buildObsidianProofLedgerReport(options = {}) {
    try {
        const ledger = loadObsidianProofLedger(options);
        const targetKeys = ledger.activeEvents.map(buildObsidianProofTargetKey);
        const gitBindings = options.verifyGitBindings === true
            ? verifyLedgerGitBindings({ cwd: options.cwd || process.cwd(), records: ledger.records })
            : null;
        const schemaV2Records = ledger.records.filter((record) => (
            record.schemaVersion === CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION
        ));
        return {
            passed: true,
            ledgerDir: ledger.ledgerDir,
            files: ledger.files,
            counts: summarizeEvents(ledger.events),
            assurance: {
                totalRecords: ledger.records.length,
                schemaV1CertificationEvents: ledger.events.length - schemaV2Records.filter((record) => record.recordType === "obsidian-proof-event").length,
                schemaV2Records: schemaV2Records.length,
                snapshotBoundActiveProofs: ledger.activeEvents.filter((event) => event.schemaVersion === CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION).length,
                activeProofs: ledger.activeEvents.length,
                revocations: ledger.revocationEvents.length,
                supersededRecords: ledger.lifecycle.supersededRecords,
                gitBindings,
            },
            targetKeys,
            failures: [],
        };
    } catch (error) {
        return {
            passed: false,
            ledgerDir: options.ledgerDir || null,
            files: [],
            counts: summarizeEvents([]),
            assurance: {
                totalRecords: 0,
                schemaV1CertificationEvents: 0,
                schemaV2Records: 0,
                snapshotBoundActiveProofs: 0,
                activeProofs: 0,
                revocations: 0,
                supersededRecords: 0,
                gitBindings: null,
            },
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
        `Ledger records: ${report.assurance.totalRecords}`,
        `Active versioned proof records: ${report.assurance.activeProofs}`,
        `Snapshot-bound schema-v2 active proofs: ${report.assurance.snapshotBoundActiveProofs}`,
        `Historical schema-v1 proof events: ${report.assurance.schemaV1CertificationEvents}`,
        `Revocations: ${report.assurance.revocations}`,
        `Superseded/revoked records: ${report.assurance.supersededRecords}`,
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

    if (report.assurance.gitBindings) {
        lines.push(
            "",
            "Git provenance verification:",
            `- Distinct historical source commits resolved: ${report.assurance.gitBindings.historicalSourceCommitsVerified}`,
            `- Schema-v2 source commit and review-set blob bindings verified: ${report.assurance.gitBindings.v2SourceBindingsVerified}`
        );
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
    verifyLedgerGitBindings,
};
