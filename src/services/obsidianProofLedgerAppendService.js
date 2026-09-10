const fs = require("node:fs");
const path = require("node:path");

const {
    CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION,
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
    DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR,
    buildObsidianProofTargetKey,
    loadObsidianProofLedger,
    parseObsidianProofLedgerEvent,
    expectedObsidianProofGeneratedSourcePath,
    isObsidianProofCertificationEvent,
    isObsidianProofRevocationEvent,
    resolveObsidianProofLifecycle,
    resolveObsidianProofStandardVersion,
} = require("../datasets/obsidianProofLedger");
const {
    hashCanonicalJson,
    hashObsidianProofIntegrityPayload,
    sha256Buffer,
    verifyObsidianProofIntegrityEnvelope,
} = require("./obsidianProofIntegrityService");
const {
    readFileAtCommit,
    runGit,
    verifyCurrentV2SourceBinding,
} = require("./obsidianProofGitBindingService");
const { parseKanjiTsvForPlatinum } = require("./kanjiGeneratedRowsService");
const { parseWordTsvForPlatinum } = require("./wordGeneratedRowsService");
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

function readTsvRows(filePath, label) {
    let bytes;
    try {
        bytes = fs.readFileSync(filePath);
    } catch (error) {
        if (error?.code === "ENOENT") {
            throw new Error(`Missing ${label}: ${filePath}`);
        }
        throw error;
    }
    const text = bytes.toString("utf8");
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const headers = lines[0]?.split("\t") || [];
    if (headers.length === 0) {
        throw new Error(`Missing TSV header in ${label}: ${filePath}`);
    }
    return {
        text,
        bytes,
    };
}

function buildGeneratedCardRowIndex({ cwd, deckKind, level }) {
    const sourcePath = expectedObsidianProofGeneratedSourcePath({ deckKind, level });
    const absolutePath = path.resolve(cwd, sourcePath);
    const parsed = readTsvRows(absolutePath, "live generated card TSV");
    const normalizedRows = deckKind === "kanji"
        ? parseKanjiTsvForPlatinum(parsed.text, { level })
        : parseWordTsvForPlatinum(parsed.text);
    const rowsByTarget = new Map();
    for (const row of normalizedRows) {
        const written = normalizeText(deckKind === "kanji" ? row.kanji : row.word);
        const reading = normalizeText(deckKind === "kanji" ? row.primaryReading : row.reading);
        if (!written || !reading) {
            continue;
        }
        const key = `${deckKind}:n${level}:${written}|${reading}`;
        if (rowsByTarget.has(key)) {
            throw new Error(`Duplicate generated card target ${key} in ${sourcePath}.`);
        }
        rowsByTarget.set(key, row);
    }
    return {
        sourcePath,
        sourceSha256: sha256Buffer(parsed.bytes),
        rowsByTarget,
    };
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
        events: draftValues.map((value, index) => parseObsidianProofLedgerEvent(
            materializeV2DraftIntegrity({ cwd, value }), {
            filePath: inputPath,
            lineNumber: index + 1,
        })),
    };
}

function materializeV2DraftIntegrity({ cwd, value }) {
    if (value?.schemaVersion !== CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION) {
        return value;
    }
    const event = JSON.parse(JSON.stringify(value));
    const deckKind = event.target?.deckKind;
    const level = Number(event.target?.level);
    if (!deckKind || !Number.isInteger(level)) {
        return event;
    }
    const expectedSourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
    const suppliedSourceReviewSetPath = normalizeText(event.ledger?.sourceReviewSetPath);
    if (suppliedSourceReviewSetPath && toPosixPath(suppliedSourceReviewSetPath) !== expectedSourceReviewSetPath) {
        throw new Error([
            `Obsidian proof draft has ledger.sourceReviewSetPath ${suppliedSourceReviewSetPath}.`,
            `Expected ${expectedSourceReviewSetPath}; calculated integrity was not materialized.`,
        ].join(" "));
    }
    event.ledger = {
        ...event.ledger,
        sourceReviewSetPath: expectedSourceReviewSetPath,
    };
    const reviewSet = buildReviewSetTargetIndex({ cwd, deckKind, level });
    const suppliedSourceCommit = normalizeText(event.ledger?.sourceCommit);
    if (suppliedSourceCommit && !/^[a-f0-9]{40}$/.test(suppliedSourceCommit)) {
        throw new Error("Obsidian proof draft sourceCommit must be a full lowercase 40-character commit before integrity materialization.");
    }
    const sourceCommit = suppliedSourceCommit
        || String(runGit({ cwd, args: ["rev-parse", "HEAD"] })).trim().toLowerCase();
    event.ledger = {
        ...event.ledger,
        sourceCommit,
        sourceReviewSetSha256: normalizeText(event.ledger?.sourceReviewSetSha256)
            || sha256Buffer(readFileAtCommit({
                cwd,
                sourceCommit,
                sourcePath: expectedSourceReviewSetPath,
            })),
    };

    if (!event.integrity) {
        if (isObsidianProofRevocationEvent(event)) {
            event.integrity = {
                canonicalization: "jkb-json-c14n-v1",
                digestAlgorithm: "sha256",
                payloadSha256: "0".repeat(64),
            };
        } else {
            const generatedCards = buildGeneratedCardRowIndex({ cwd, deckKind, level });
            const targetKey = buildObsidianProofTargetKey(event);
            const generatedRow = generatedCards.rowsByTarget.get(targetKey);
            const reviewEntry = reviewSet.entriesByTargetKey.get(targetKey);
            if (!generatedRow || !reviewEntry) {
                return event;
            }
            event.integrity = {
                canonicalization: "jkb-json-c14n-v1",
                digestAlgorithm: "sha256",
                generatedCard: {
                    sourcePath: generatedCards.sourcePath,
                    sourceSha256: generatedCards.sourceSha256,
                    row: generatedRow,
                    rowSha256: hashCanonicalJson(generatedRow),
                },
                trackedReviewEntry: {
                    entry: reviewEntry,
                    entrySha256: hashCanonicalJson(reviewEntry),
                },
                payloadSha256: "0".repeat(64),
            };
        }
        event.integrity.payloadSha256 = hashObsidianProofIntegrityPayload(event);
    }
    return event;
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
    const entriesByTargetKey = new Map();
    for (const entry of entries) {
        for (const targetKey of buildEntryTargetKeys(entry, { deckKind, level })) {
            if (entriesByTargetKey.has(targetKey)) {
                throw new Error(`Duplicate tracked review-set target ${targetKey} in ${sourceReviewSetPath}.`);
            }
            targetKeys.add(targetKey);
            entriesByTargetKey.set(targetKey, entry);
        }
    }
    return {
        cwd,
        sourceReviewSetPath,
        resolvedSourceReviewSetPath,
        targetKeys,
        entriesByTargetKey,
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

function verifySourceCommitBinding({ cwd, event }) {
    verifyCurrentV2SourceBinding({ cwd, event });
}

function assertV2IntegrityBindings({ events, reviewSet, generatedCards, verifySourceCommit }) {
    for (const event of events) {
        if (event.schemaVersion !== CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION) {
            throw new Error([
                `New Obsidian ledger records must use schemaVersion ${CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION}: ${event.proofId}.`,
                "Schema v1 remains readable audit history but is closed to new appends.",
            ].join(" "));
        }
        verifySourceCommit({ cwd: reviewSet.cwd, event, reviewSet });
        if (isObsidianProofRevocationEvent(event)) {
            continue;
        }

        const targetKey = buildObsidianProofTargetKey(event);
        const generatedRow = generatedCards.rowsByTarget.get(targetKey);
        if (!generatedRow) {
            throw new Error(`Obsidian proof event ${event.proofId} has no exact generated card row in ${generatedCards.sourcePath}.`);
        }
        const reviewEntry = reviewSet.entriesByTargetKey.get(targetKey);
        if (!reviewEntry) {
            throw new Error(`Obsidian proof event ${event.proofId} has no exact tracked review entry in ${reviewSet.sourceReviewSetPath}.`);
        }
        if (toPosixPath(event.integrity.generatedCard.sourcePath) !== generatedCards.sourcePath) {
            throw new Error(`Obsidian proof event ${event.proofId} generatedCard.sourcePath must be ${generatedCards.sourcePath}.`);
        }
        if (event.integrity.generatedCard.sourceSha256 !== generatedCards.sourceSha256) {
            throw new Error(`Obsidian proof event ${event.proofId} generatedCard.sourceSha256 does not match the live generated TSV.`);
        }
        if (hashCanonicalJson(generatedRow) !== event.integrity.generatedCard.rowSha256) {
            throw new Error(`Obsidian proof event ${event.proofId} generated card row digest does not match the live generated row.`);
        }
        if (hashCanonicalJson(reviewEntry) !== event.integrity.trackedReviewEntry.entrySha256) {
            throw new Error(`Obsidian proof event ${event.proofId} tracked review entry digest does not match the live tracked entry.`);
        }
        const integrity = verifyObsidianProofIntegrityEnvelope(event);
        if (!integrity.passed) {
            throw new Error(`Obsidian proof event ${event.proofId} integrity envelope failed: ${integrity.failures.join("; ")}.`);
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
    const certificationEvents = events.filter(isObsidianProofCertificationEvent);
    if (certificationEvents.length === 0) {
        return;
    }
    const { entries } = buildCompatibilityEntries({
        entries: reviewSet.reviewEntries,
        events: certificationEvents,
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
    for (const event of certificationEvents) {
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
        ...(isObsidianProofCertificationEvent(event) ? [
            ["proof.reviewer", event.proof.reviewer],
            ["proof.reviewerIdentity.id", event.proof.reviewerIdentity?.id],
            ["proof.reviewerIdentity.displayName", event.proof.reviewerIdentity?.displayName],
        ] : [
            ["lifecycle.reviewerIdentity.id", event.lifecycle.reviewerIdentity?.id],
            ["lifecycle.reviewerIdentity.displayName", event.lifecycle.reviewerIdentity?.displayName],
        ]),
        ["ledger.recordedBy", event.ledger.recordedBy],
        ["ledger.recordedByIdentity.id", event.ledger.recordedByIdentity?.id],
        ["ledger.recordedByIdentity.displayName", event.ledger.recordedByIdentity?.displayName],
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
        if (event.schemaVersion !== CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION) {
            throw new Error(`New Obsidian proof append requires schemaVersion ${CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION}: ${event.proofId}.`);
        }
        if (event.ledger.representationMigration) {
            throw new Error(`Obsidian proof append does not accept representationMigration=true events: ${event.proofId}. Use the dedicated migration command for representation migrations.`);
        }
        if (isObsidianProofRevocationEvent(event)) {
            assertNoGeneratedProofAuthorIdentity(event);
            continue;
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
        assertNoGeneratedProofAuthorIdentity(event);
    }
}

function assertNoDuplicateExistingEvents({ cwd, ledgerDir, events }) {
    const ledger = loadObsidianProofLedger({ cwd, ledgerDir });
    const existingProofIds = new Map(ledger.records.map((event) => [event.proofId, event]));

    for (const event of events) {
        const priorProof = existingProofIds.get(event.proofId);
        if (priorProof) {
            throw new Error(`Obsidian proof id ${event.proofId} already exists for ${priorProof.target.cardReviewed}.`);
        }
    }
    resolveObsidianProofLifecycle([...ledger.records, ...events]);

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
        const key = event.batch?.id || `lifecycle:${event.lifecycle?.action || "unknown"}`;
        acc[key] = (acc[key] || 0) + 1;
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
    const generatedCards = draft.events.some(isObsidianProofCertificationEvent)
        ? buildGeneratedCardRowIndex({
            cwd,
            deckKind: scope.deckKind,
            level: scope.level,
        })
        : null;
    assertV2IntegrityBindings({
        events: draft.events,
        reviewSet,
        generatedCards,
        verifySourceCommit: options.verifySourceCommitBinding || verifySourceCommitBinding,
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
        existingLedgerRecords: existingLedger.records.length,
        existingLedgerEvents: existingLedger.events.length,
        appendEvents: draft.events.length,
        postAppendLedgerRecords: existingLedger.records.length + draft.events.length,
        postAppendLedgerEvents: existingLedger.events.length
            + draft.events.filter(isObsidianProofCertificationEvent).length,
        generatedCardSourcePath: generatedCards?.sourcePath || null,
        generatedCardSourceSha256: generatedCards?.sourceSha256 || null,
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
        `Generated card source: ${report.generatedCardSourcePath || "(revocation only)"}`,
        `Generated card source SHA-256: ${report.generatedCardSourceSha256 || "(not applicable)"}`,
        `Existing ledger records: ${report.existingLedgerRecords}`,
        `Existing ledger events: ${report.existingLedgerEvents}`,
        `Events to append: ${report.appendEvents}`,
        `Post-append ledger events: ${report.postAppendLedgerEvents}`,
        `Post-append ledger records: ${report.postAppendLedgerRecords}`,
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
        "- This command appends schema-v2 governed card-by-card proof or lifecycle records to canonical JSONL only.",
        "- New certifications are bound to the full source commit, committed tracked review-set bytes, exact tracked entry, exact generated TSV bytes, exact generated row, typed review checks, and a canonical SHA-256 payload chain.",
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
