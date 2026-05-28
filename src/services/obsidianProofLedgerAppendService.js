const fs = require("node:fs");
const path = require("node:path");

const {
    DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR,
    buildObsidianProofTargetKey,
    loadObsidianProofLedger,
    parseObsidianProofLedgerEvent,
} = require("../datasets/obsidianProofLedger");
const {
    buildObsidianProofReconciliationReport,
} = require("./obsidianProofReconciliationService");
const {
    buildEntryTargetKeys,
    getReviewSetRelativePath,
} = require("./obsidianProofCompatibilityViewService");
const {
    ensureDir,
    isPathInside,
} = require("../utils/fs");

function toPosixPath(value) {
    return String(value).replace(/\\/g, "/");
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function readJsonArray(filePath, label) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in ${label}: ${filePath}`);
    }
    return parsed;
}

function parseJsonLine(line, { filePath, lineNumber }) {
    try {
        return JSON.parse(line);
    } catch (error) {
        throw new Error(`${filePath}:${lineNumber} is not valid JSON: ${error.message}`);
    }
}

function parseDraftEventsText(text, { filePath }) {
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error(`Draft Obsidian proof event file is empty: ${filePath}`);
    }

    if (trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            throw new Error(`Draft Obsidian proof event JSON must be an array: ${filePath}`);
        }
        return parsed;
    }

    if (trimmed.startsWith("{")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed.events)) {
                return parsed.events;
            }
            return [parsed];
        } catch {
            // Fall through to JSONL parsing; multi-line JSONL also starts with "{".
        }
    }

    return text
        .split(/\r?\n/)
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => line.trim())
        .map(({ line, lineNumber }) => parseJsonLine(line, { filePath, lineNumber }));
}

function assertSafeDraftEventInputPath({ cwd, eventPath, ledgerDir }) {
    const resolved = path.resolve(cwd, eventPath);
    if (!isPathInside(resolved, cwd)) {
        throw new Error(`Refusing to read Obsidian proof draft outside workspace: ${resolved}`);
    }
    const resolvedLedgerDir = path.resolve(cwd, ledgerDir);
    if (isPathInside(resolved, resolvedLedgerDir)) {
        throw new Error(`Draft Obsidian proof input must not live inside the canonical ledger directory: ${resolved}`);
    }
    if (!fs.existsSync(resolved)) {
        throw new Error(`Missing Obsidian proof draft input: ${resolved}`);
    }
    return resolved;
}

function readDraftProofEvents({ cwd, eventsPath, ledgerDir }) {
    const inputPath = assertSafeDraftEventInputPath({ cwd, eventPath: eventsPath, ledgerDir });
    const draftValues = parseDraftEventsText(fs.readFileSync(inputPath, "utf8"), { filePath: inputPath });
    if (draftValues.length === 0) {
        throw new Error(`Draft Obsidian proof input contained no events: ${inputPath}`);
    }
    return {
        inputPath,
        events: draftValues.map((value, index) => parseObsidianProofLedgerEvent(value, {
            filePath: inputPath,
            lineNumber: index + 1,
        })),
    };
}

function assertSingleAppendScope(events = []) {
    const scopeKeys = new Set(events.map((event) => `${event.target.deckKind}:n${event.target.level}`));
    if (scopeKeys.size !== 1) {
        throw new Error(`Obsidian proof append accepts one deck kind and level per run: ${[...scopeKeys].sort().join(", ")}`);
    }
    const [scopeKey] = scopeKeys;
    const [deckKind, levelText] = scopeKey.split(":n");
    return {
        deckKind,
        level: Number(levelText),
    };
}

function expectedLedgerRelativePath({ deckKind, level, ledgerDir }) {
    return toPosixPath(path.join(ledgerDir, `${deckKind}_n${level}.jsonl`));
}

function assertSafeLedgerOutputPath({ cwd, ledgerDir, ledgerRelativePath }) {
    const resolvedLedgerDir = path.resolve(cwd, ledgerDir);
    const resolvedOutputPath = path.resolve(cwd, ledgerRelativePath);
    if (!toPosixPath(path.relative(cwd, resolvedLedgerDir)).endsWith("templates/obsidian_proof_ledger")) {
        throw new Error(`Obsidian proof ledger output must stay in templates/obsidian_proof_ledger: ${ledgerDir}`);
    }
    if (!isPathInside(resolvedOutputPath, resolvedLedgerDir)) {
        throw new Error(`Refusing to write Obsidian proof ledger output outside ${resolvedLedgerDir}: ${resolvedOutputPath}`);
    }
    return resolvedOutputPath;
}

function buildReviewSetTargetIndex({ cwd, deckKind, level }) {
    const sourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
    const resolvedSourceReviewSetPath = path.resolve(cwd, sourceReviewSetPath);
    if (!fs.existsSync(resolvedSourceReviewSetPath)) {
        throw new Error(`Missing tracked review set for Obsidian proof append: ${resolvedSourceReviewSetPath}`);
    }
    const entries = readJsonArray(resolvedSourceReviewSetPath, "tracked review set");
    const targetKeys = new Set();
    for (const entry of entries) {
        for (const targetKey of buildEntryTargetKeys(entry, { deckKind, level })) {
            targetKeys.add(targetKey);
        }
    }
    return {
        sourceReviewSetPath,
        resolvedSourceReviewSetPath,
        targetKeys,
        entries: entries.length,
    };
}

function assertEventsBindToReviewSet({ events, reviewSet, deckKind, level }) {
    for (const event of events) {
        const expectedSourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
        if (toPosixPath(event.ledger.sourceReviewSetPath) !== expectedSourceReviewSetPath) {
            throw new Error([
                `Obsidian proof event ${event.proofId} has ledger.sourceReviewSetPath ${event.ledger.sourceReviewSetPath}.`,
                `Expected ${expectedSourceReviewSetPath}.`,
            ].join(" "));
        }
        const targetKey = buildObsidianProofTargetKey(event);
        if (!reviewSet.targetKeys.has(targetKey)) {
            throw new Error(`Obsidian proof event ${event.proofId} target ${targetKey} does not bind to ${reviewSet.sourceReviewSetPath}.`);
        }
    }
}

function assertNoDuplicateDraftEvents(events = []) {
    const proofIds = new Map();
    const targetKeys = new Map();
    for (const event of events) {
        const priorProofId = proofIds.get(event.proofId);
        if (priorProofId) {
            throw new Error(`Duplicate draft Obsidian proof id ${event.proofId}; first seen for ${priorProofId}.`);
        }
        proofIds.set(event.proofId, event.target.cardReviewed);

        const targetKey = buildObsidianProofTargetKey(event);
        const priorTarget = targetKeys.get(targetKey);
        if (priorTarget) {
            throw new Error(`Duplicate draft Obsidian proof target ${targetKey}; first seen in ${priorTarget}.`);
        }
        targetKeys.set(targetKey, event.proofId);
    }
}

function assertNoDuplicateExistingEvents({ cwd, ledgerDir, events }) {
    const ledger = loadObsidianProofLedger({ cwd, ledgerDir });
    const existingProofIds = new Map(ledger.events.map((event) => [event.proofId, event]));
    const existingTargetKeys = new Map(ledger.events.map((event) => [buildObsidianProofTargetKey(event), event]));

    for (const event of events) {
        const priorProof = existingProofIds.get(event.proofId);
        if (priorProof) {
            throw new Error(`Obsidian proof id ${event.proofId} already exists for ${priorProof.target.cardReviewed}.`);
        }
        const targetKey = buildObsidianProofTargetKey(event);
        const priorTarget = existingTargetKeys.get(targetKey);
        if (priorTarget) {
            throw new Error(`Obsidian proof target ${targetKey} already exists as ${priorTarget.proofId}.`);
        }
    }

    return ledger;
}

function appendJsonlEvents(filePath, events = []) {
    ensureDir(path.dirname(filePath));
    const serialized = events.map((event) => JSON.stringify(event)).join("\n");
    const prefix = fs.existsSync(filePath) && fs.statSync(filePath).size > 0
        && !fs.readFileSync(filePath, "utf8").endsWith("\n")
        ? "\n"
        : "";
    fs.appendFileSync(filePath, `${prefix}${serialized}\n`, "utf8");
}

function summarizeBatches(events = []) {
    return events.reduce((acc, event) => {
        acc[event.batch.id] = (acc[event.batch.id] || 0) + 1;
        return acc;
    }, {});
}

function buildObsidianProofLedgerAppendReport(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const ledgerDir = options.ledgerDir || DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR;
    const eventsPath = normalizeText(options.eventsPath);
    if (!eventsPath) {
        throw new Error("--events is required and must point to a JSON or JSONL proof-event draft file.");
    }

    const draft = readDraftProofEvents({ cwd, eventsPath, ledgerDir });
    const scope = assertSingleAppendScope(draft.events);
    assertNoDuplicateDraftEvents(draft.events);

    const ledgerRelativePath = expectedLedgerRelativePath({
        deckKind: scope.deckKind,
        level: scope.level,
        ledgerDir,
    });
    const ledgerOutputPath = assertSafeLedgerOutputPath({
        cwd,
        ledgerDir,
        ledgerRelativePath,
    });
    const reviewSet = buildReviewSetTargetIndex({
        cwd,
        deckKind: scope.deckKind,
        level: scope.level,
    });
    assertEventsBindToReviewSet({
        events: draft.events,
        reviewSet,
        deckKind: scope.deckKind,
        level: scope.level,
    });
    const existingLedger = assertNoDuplicateExistingEvents({
        cwd,
        ledgerDir,
        events: draft.events,
    });

    return {
        passed: true,
        write: options.write === true,
        cwd,
        ledgerDir,
        eventsPath: toPosixPath(path.relative(cwd, draft.inputPath)),
        deckKind: scope.deckKind,
        level: scope.level,
        sourceReviewSetPath: reviewSet.sourceReviewSetPath,
        sourceReviewSetEntries: reviewSet.entries,
        ledgerOutputPath: toPosixPath(path.relative(cwd, ledgerOutputPath)),
        existingLedgerEvents: existingLedger.events.length,
        appendEvents: draft.events.length,
        postAppendLedgerEvents: existingLedger.events.length + draft.events.length,
        proofIds: draft.events.map((event) => event.proofId),
        targets: draft.events.map(buildObsidianProofTargetKey),
        batches: summarizeBatches(draft.events),
        events: draft.events,
        failures: [],
    };
}

function writeObsidianProofLedgerAppend(report = {}) {
    const ledgerOutputPath = path.resolve(report.cwd, report.ledgerOutputPath);
    appendJsonlEvents(ledgerOutputPath, report.events || []);
}

function runObsidianProofLedgerAppend(options = {}) {
    const report = buildObsidianProofLedgerAppendReport(options);
    if (options.write) {
        writeObsidianProofLedgerAppend(report);
        const reconciliation = buildObsidianProofReconciliationReport({
            cwd: report.cwd,
            ledgerDir: report.ledgerDir,
            deckKinds: [report.deckKind],
            levels: [report.level],
        });
        report.reconciliation = {
            passed: reconciliation.passed,
            totals: reconciliation.totals,
            failures: reconciliation.failures || [],
        };
        if (!reconciliation.passed) {
            report.passed = false;
            report.failures.push("Post-write Obsidian proof reconciliation did not pass.");
        }
    }
    return report;
}

function formatObsidianProofLedgerAppendReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Obsidian Proof Ledger Append",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Mode: ${report.write ? "write" : "dry-run"}`,
        `Input events: ${report.eventsPath}`,
        `Scope: ${report.deckKind}:N${report.level}`,
        `Tracked review set: ${report.sourceReviewSetPath}`,
        `Tracked review entries: ${report.sourceReviewSetEntries}`,
        `Canonical ledger output: ${report.ledgerOutputPath}`,
        `Existing ledger events: ${report.existingLedgerEvents}`,
        `Events to append: ${report.appendEvents}`,
        `Post-append ledger events: ${report.postAppendLedgerEvents}`,
        "",
        "Batches:",
        ...Object.entries(report.batches || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([batchId, count]) => `- ${batchId}: ${count}`),
        "",
        "Targets:",
        ...((report.targets || []).map((target) => `- ${target}`)),
        "",
        "Authority boundary:",
        "- This command appends complete human-reviewed proof events to canonical JSONL only.",
        "- Dry-run is the default. Use --write only after reviewing the draft and dry-run report.",
        "- It does not create inline rereviewProvenance, Japanese-source evidence, generated TSV authority, APKG authority, NLP certification, or release readiness.",
    ];

    if (report.reconciliation) {
        lines.push(
            "",
            "Post-write reconciliation:",
            `- Result: ${report.reconciliation.passed ? "passing" : "failing"}`,
            `- Ledger proofs: ${report.reconciliation.totals?.ledgerProofs || 0}`,
            `- Canonical proofs bound: ${report.reconciliation.totals?.canonicalLedgerProofs || 0}`,
            `- Mismatches: ${report.reconciliation.totals?.proofMismatches || 0}`
        );
    } else {
        lines.push("", "No files were changed. Rerun with --write to append after review.");
    }

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    appendJsonlEvents,
    buildObsidianProofLedgerAppendReport,
    formatObsidianProofLedgerAppendReport,
    parseDraftEventsText,
    readDraftProofEvents,
    runObsidianProofLedgerAppend,
    writeObsidianProofLedgerAppend,
};
