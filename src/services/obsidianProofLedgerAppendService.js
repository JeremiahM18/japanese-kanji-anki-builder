const fs = require("node:fs");
const path = require("node:path");

const {
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
    DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR,
    buildObsidianProofTargetKey,
    buildObsidianProofVersionedTargetKey,
    loadObsidianProofLedger,
    parseObsidianProofLedgerEvent,
    resolveObsidianProofStandardVersion,
} = require("../datasets/obsidianProofLedger");
const {
    buildObsidianProofReconciliationReport,
} = require("./obsidianProofReconciliationService");
const {
    buildCompatibilityEntries,
    buildEntryTargetKeys,
    getReviewSetRelativePath,
} = require("./obsidianProofCompatibilityViewService");
const {
    entryHasSubstantiveCurrentStandardRereviewProof: kanjiEntryHasSubstantiveCurrentStandardRereviewProof,
} = require("./platinumKanjiRereviewStatusService");
const {
    entryHasSubstantiveCurrentStandardRereviewProof: wordEntryHasSubstantiveCurrentStandardRereviewProof,
} = require("./platinumWordObsidianProofService");
const {
    isPathInside,
} = require("../utils/fs");
const {
    runGovernedFileTransactionSync,
} = require("../utils/governedFileTransaction");

const GOVERNED_OBSIDIAN_PROOF_DRAFT_DIR = path.join("out", "obsidian-proof", "drafts");
const DISALLOWED_NEW_PROOF_AUTHOR_PATTERN = /\b(?:codex|assistant|automation|automated|generator|generated|script|migration|bulk|lane-batch)\b/i;

function toPosixPath(value) {
    return String(value).replace(/\\/g, "/");
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function readJsonArray(filePath, label) {
    let text;
    try {
        text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        if (error?.code === "ENOENT") {
            throw new Error(`Missing ${label}: ${filePath}`);
        }
        throw error;
    }
    const parsed = JSON.parse(text);
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
    const governedDraftDir = path.resolve(cwd, GOVERNED_OBSIDIAN_PROOF_DRAFT_DIR);
    if (!isPathInside(resolved, governedDraftDir)) {
        const governedDraftDirLabel = toPosixPath(GOVERNED_OBSIDIAN_PROOF_DRAFT_DIR);
        throw new Error([
            `Obsidian proof draft input must stay under ${governedDraftDirLabel}/: ${toPosixPath(path.relative(cwd, resolved))}.`,
            "Do not append proof from ad hoc lane-batch helpers, batch reports, generated TSVs, NLP output, or prior-lane promotion artifacts.",
        ].join(" "));
    }
    const resolvedLedgerDir = path.resolve(cwd, ledgerDir);
    if (isPathInside(resolved, resolvedLedgerDir)) {
        throw new Error(`Draft Obsidian proof input must not live inside the canonical ledger directory: ${resolved}`);
    }
    return resolved;
}

function readDraftProofEvents({ cwd, eventsPath, ledgerDir }) {
    const inputPath = assertSafeDraftEventInputPath({ cwd, eventPath: eventsPath, ledgerDir });
    let draftText;
    try {
        draftText = fs.readFileSync(inputPath, "utf8");
    } catch (error) {
        if (error?.code === "ENOENT") {
            throw new Error(`Missing Obsidian proof draft input: ${inputPath}`);
        }
        throw error;
    }
    const draftValues = parseDraftEventsText(draftText, { filePath: inputPath });
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
        reviewEntries: entries,
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

function getSubstantiveProofPredicate(deckKind) {
    if (deckKind === "kanji") {
        return kanjiEntryHasSubstantiveCurrentStandardRereviewProof;
    }
    if (deckKind === "word") {
        return wordEntryHasSubstantiveCurrentStandardRereviewProof;
    }
    throw new Error(`Unsupported Obsidian proof deck kind for semantic validation: ${deckKind}.`);
}

function assertEventsCountAsSubstantiveProof({ events, reviewSet, deckKind, level }) {
    const { entries } = buildCompatibilityEntries({
        entries: reviewSet.reviewEntries,
        events,
        deckKind,
        level,
    });
    const predicate = getSubstantiveProofPredicate(deckKind);
    const entriesByTargetKey = new Map();
    for (const entry of entries) {
        for (const targetKey of buildEntryTargetKeys(entry, { deckKind, level })) {
            entriesByTargetKey.set(targetKey, entry);
        }
    }

    const failures = [];
    for (const event of events) {
        const targetKey = buildObsidianProofTargetKey(event);
        const entry = entriesByTargetKey.get(targetKey);
        if (!entry || !predicate(entry)) {
            failures.push(event.target.cardReviewed);
        }
    }

    if (failures.length > 0) {
        throw new Error([
            "Obsidian proof draft events would not count as substantive current-standard proof in the status consumer.",
            `Failing targets: ${failures.join(", ")}.`,
            "Fix the draft proof so it satisfies the same structured rereviewProvenance, card identity, evidence checklist, and sentence-quality proof contract used by Obsidian status before appending.",
        ].join(" "));
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

function assertNoGeneratedProofAuthorIdentity(event) {
    const identities = [
        ["proof.reviewer", event.proof.reviewer],
        ["ledger.recordedBy", event.ledger.recordedBy],
    ];

    for (const [label, value] of identities) {
        if (DISALLOWED_NEW_PROOF_AUTHOR_PATTERN.test(normalizeText(value))) {
            throw new Error([
                `Obsidian proof event ${event.proofId} ${label} must identify the accountable Obsidian review session, not generated or automated tooling: ${value}.`,
                "Obsidian proof cannot be recorded by helper scripts, generated batch output, migration identities, or assistant automation.",
            ].join(" "));
        }
    }
}

function assertAppendableProofReviewSession(events = []) {
    for (const event of events) {
        if (event.ledger.representationMigration) {
            throw new Error(`Obsidian proof append does not accept representationMigration=true events: ${event.proofId}. Use the dedicated migration command for representation migrations.`);
        }
        if (
            event.target.deckKind === "word"
            && resolveObsidianProofStandardVersion(event) !== CURRENT_WORD_OBSIDIAN_STANDARD_VERSION
        ) {
            throw new Error([
                `New word Obsidian proof event ${event.proofId} must use ${CURRENT_WORD_OBSIDIAN_STANDARD_VERSION}.`,
                "Legacy word Obsidian proof remains history, but new word appends must carry v2.5 sentence-audio proof.",
            ].join(" "));
        }
        if (
            event.target.deckKind === "word"
            && !event.proof.sentenceAudioReview
        ) {
            throw new Error(`New word Obsidian v2.5 proof event ${event.proofId} is missing proof.sentenceAudioReview.`);
        }
        if (!event.proof.reviewSession) {
            throw new Error([
                `Obsidian proof event ${event.proofId} is missing proof.reviewSession.`,
                "New proof appends must explicitly assert card-by-card-observable-rereview from the live generated card and tracked evidence.",
                "A clean Platinum gate, batch report, NLP packet, or generated draft is not enough.",
            ].join(" "));
        }
        assertNoGeneratedProofAuthorIdentity(event);
    }
}

function assertNoDuplicateExistingEvents({ cwd, ledgerDir, events }) {
    const ledger = loadObsidianProofLedger({ cwd, ledgerDir });
    const existingProofIds = new Map(ledger.events.map((event) => [event.proofId, event]));
    const existingTargetKeys = new Map(ledger.events.map((event) => [buildObsidianProofVersionedTargetKey(event), event]));

    for (const event of events) {
        const priorProof = existingProofIds.get(event.proofId);
        if (priorProof) {
            throw new Error(`Obsidian proof id ${event.proofId} already exists for ${priorProof.target.cardReviewed}.`);
        }
        const targetKey = buildObsidianProofVersionedTargetKey(event);
        const priorTarget = existingTargetKeys.get(targetKey);
        if (priorTarget) {
            throw new Error(`Obsidian proof target ${targetKey} already exists as ${priorTarget.proofId}.`);
        }
    }

    return ledger;
}

function buildAppendedJsonlText(existingText = "", events = []) {
    const serialized = events.map((event) => JSON.stringify(event)).join("\n");
    if (!existingText) {
        return `${serialized}\n`;
    }
    const separator = existingText.endsWith("\n") ? "" : "\n";
    return `${existingText}${separator}${serialized}\n`;
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
    assertAppendableProofReviewSession(draft.events);

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
    assertEventsCountAsSubstantiveProof({
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

function runObsidianProofLedgerAppend(options = {}) {
    const preflight = buildObsidianProofLedgerAppendReport(options);
    if (!options.write) {
        return preflight;
    }
    const runFileTransaction = options.runFileTransaction || runGovernedFileTransactionSync;
    const buildReconciliationReport = options.buildReconciliationReport
        || buildObsidianProofReconciliationReport;
    const transactionRoot = path.join(preflight.cwd, "out", "file-transactions");
    const lockPath = path.join(
        transactionRoot,
        `obsidian-${preflight.deckKind}-n${preflight.level}.lock`
    );
    const transaction = runFileTransaction({
        workspaceRoot: preflight.cwd,
        transactionRoot,
        transactionName: `obsidian-${preflight.deckKind}-n${preflight.level}`,
        lockPath,
        prepareChanges() {
            const report = buildObsidianProofLedgerAppendReport({
                ...options,
                write: true,
            });
            if (report.ledgerOutputPath !== preflight.ledgerOutputPath) {
                throw new Error(
                    "Obsidian proof draft scope changed between preflight and locked append; rerun the dry-run."
                );
            }
            const ledgerOutputPath = path.resolve(report.cwd, report.ledgerOutputPath);
            let existingText = "";
            try {
                existingText = fs.readFileSync(ledgerOutputPath, "utf8");
            } catch (error) {
                if (error?.code !== "ENOENT") {
                    throw error;
                }
            }
            return {
                changes: [{
                    filePath: ledgerOutputPath,
                    data: buildAppendedJsonlText(existingText, report.events || []),
                }],
                metadata: report,
            };
        },
        validateAfterWrite({ metadata: report }) {
            const reconciliation = buildReconciliationReport({
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
                throw new Error("Post-write Obsidian proof reconciliation did not pass.");
            }
        },
    });
    return transaction.metadata;
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
        "- This command appends complete governed card-by-card Obsidian proof events to canonical JSONL only.",
        "- Dry-run is the default. Use --write only after reviewing the draft and dry-run report.",
        "- It rejects ad hoc lane-batch proof inputs and proof authored by generated, automated, migration, or assistant tooling identities.",
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
    buildAppendedJsonlText,
    buildObsidianProofLedgerAppendReport,
    formatObsidianProofLedgerAppendReport,
    GOVERNED_OBSIDIAN_PROOF_DRAFT_DIR,
    parseDraftEventsText,
    readDraftProofEvents,
    runObsidianProofLedgerAppend,
};
