const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
} = require("../services/platinumKanjiReviewService");
const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
} = require("../services/platinumReviewService");
const { isPathInside } = require("../utils/fs");

const OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION = 1;
const OBSIDIAN_PROOF_EVENT_RECORD_TYPE = "obsidian-proof-event";
const OBSIDIAN_PROOF_LEDGER_AUTHORITY = Object.freeze({
    sourceOfTruth: "tracked-jsonl-obsidian-proof-ledger",
    generatedCompatibilityView: true,
    generatedSqliteMirror: true,
    boundary: "Obsidian proof only; not source evidence, generated TSV authority, APKG authority, NLP certification, or release readiness.",
});
const DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR = path.join("templates", "obsidian_proof_ledger");
const CURRENT_WORD_OBSIDIAN_STANDARD_VERSION = "word-obsidian-v2.5-sentence-audio";
const LEGACY_WORD_OBSIDIAN_STANDARD_VERSION = "legacy-word-obsidian-v2.0";
const WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY = "word-example-sentence";

const proofIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/);
const deckKindSchema = z.enum(["kanji", "word"]);

const targetSchema = z.object({
    deckKind: deckKindSchema,
    level: z.number().int().min(1).max(5),
    written: z.string().min(1),
    reading: z.string().min(1),
    cardReviewed: z.string().min(1),
}).strict();

const batchSchema = z.object({
    id: z.string().min(1),
    sequence: z.number().int().positive().optional(),
}).strict();

const sentenceQualityReviewSchema = z.object({
    example: z.string().min(1),
    reading: z.string().min(1),
    translation: z.string().min(1),
    naturalJapanese: z.literal(true),
    learnerUseful: z.literal(true),
    levelAppropriate: z.literal(true),
    supportOnly: z.literal(true).optional(),
    releaseQuality: z.literal(true).optional(),
    reviewerJudgment: z.string().min(1),
}).strict();

const proofReviewSessionSchema = z.object({
    mode: z.literal("card-by-card-observable-rereview"),
    source: z.literal("live-generated-card-and-tracked-evidence"),
    generatedFromPriorLaneOnly: z.literal(false),
    batchReportOnly: z.literal(false),
}).strict();

const sentenceAudioReviewSchema = z.object({
    category: z.literal(WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY),
    source: z.string().min(1),
    voice: z.string().min(1),
    locale: z.string().min(1),
    assetPath: z.string().min(1),
    identityHash: z.string().regex(/^[a-f0-9]{16}$/i),
    example: z.string().min(1),
    reading: z.string().min(1),
    translation: z.string().min(1),
    exactExampleText: z.literal(true),
    exactExampleReading: z.literal(true),
    policyCompliant: z.literal(true),
    readyToReview: z.literal(true),
    reviewerJudgment: z.string().min(1),
}).strict();

const proofSchema = z.object({
    type: z.literal("substantive current standard rereview"),
    reviewStandard: z.string().min(1),
    obsidianStandardVersion: z.string().min(1).optional(),
    reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reviewer: z.string().min(1),
    reviewedAfterStandard: z.literal(true),
    mechanicalMigration: z.literal(false),
    result: z.string().min(1),
    scope: z.string().min(1),
    cardReviewed: z.string().min(1),
    evidenceChecked: z.array(z.string().min(1)).min(8),
    limitationDecision: z.string().min(1),
    sentenceQualityReview: sentenceQualityReviewSchema,
    sentenceAudioReview: sentenceAudioReviewSchema.optional(),
    reviewSession: proofReviewSessionSchema.optional(),
}).strict();

const authoritySchema = z.object({
    sourceOfTruth: z.literal(OBSIDIAN_PROOF_LEDGER_AUTHORITY.sourceOfTruth),
    generatedCompatibilityView: z.literal(true),
    generatedSqliteMirror: z.literal(true),
    boundary: z.literal(OBSIDIAN_PROOF_LEDGER_AUTHORITY.boundary),
}).strict();

const ledgerSchema = z.object({
    recordedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    recordedBy: z.string().min(1),
    sourceReviewSetPath: z.string().min(1),
    sourceCommit: z.string().regex(/^[a-f0-9]{7,40}$/i),
    representationMigration: z.boolean(),
}).strict();

const obsidianProofLedgerEventSchema = z.object({
    schemaVersion: z.literal(OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION),
    recordType: z.literal(OBSIDIAN_PROOF_EVENT_RECORD_TYPE),
    proofId: proofIdSchema,
    target: targetSchema,
    batch: batchSchema,
    proof: proofSchema,
    authority: authoritySchema,
    ledger: ledgerSchema,
}).strict();

function expectedReviewStandardForDeckKind(deckKind) {
    if (deckKind === "kanji") {
        return CURRENT_KANJI_PLATINUM_REVIEW_STANDARD;
    }
    if (deckKind === "word") {
        return CURRENT_WORD_PLATINUM_REVIEW_STANDARD;
    }
    throw new Error(`Unsupported Obsidian proof deck kind: ${deckKind}.`);
}

function buildObsidianProofTargetKey(event) {
    return [
        event.target.deckKind,
        `n${event.target.level}`,
        event.target.cardReviewed,
    ].join(":");
}

function resolveObsidianProofStandardVersion(event) {
    const explicitVersion = String(event?.proof?.obsidianStandardVersion || "").trim();
    if (explicitVersion) {
        return explicitVersion;
    }
    if (event?.target?.deckKind === "word") {
        return LEGACY_WORD_OBSIDIAN_STANDARD_VERSION;
    }
    return "legacy-kanji-obsidian-standard";
}

function buildObsidianProofVersionedTargetKey(event) {
    return [
        buildObsidianProofTargetKey(event),
        resolveObsidianProofStandardVersion(event),
    ].join(":");
}

function assertRelativeTemplatePath(value, label) {
    const normalized = String(value || "").replace(/\\/g, "/");
    if (path.isAbsolute(normalized) || normalized.includes("../") || normalized === "..") {
        throw new Error(`${label} must be a relative tracked repo path: ${value}.`);
    }
    if (!normalized.startsWith("templates/")) {
        throw new Error(`${label} must stay under templates/: ${value}.`);
    }
}

function parseObsidianProofLedgerEvent(value, { filePath = "<memory>", lineNumber = 0 } = {}) {
    const event = obsidianProofLedgerEventSchema.parse(value);
    const expectedCardReviewed = `${event.target.written}|${event.target.reading}`;
    if (event.target.cardReviewed !== expectedCardReviewed) {
        throw new Error(`${filePath}:${lineNumber} target.cardReviewed must equal written|reading (${expectedCardReviewed}).`);
    }
    if (event.proof.cardReviewed !== event.target.cardReviewed) {
        throw new Error(`${filePath}:${lineNumber} proof.cardReviewed must match target.cardReviewed.`);
    }
    const expectedReviewStandard = expectedReviewStandardForDeckKind(event.target.deckKind);
    if (event.proof.reviewStandard !== expectedReviewStandard) {
        throw new Error(`${filePath}:${lineNumber} proof.reviewStandard must be ${expectedReviewStandard}.`);
    }
    if (event.target.deckKind === "kanji" && event.proof.sentenceQualityReview.supportOnly !== true) {
        throw new Error(`${filePath}:${lineNumber} kanji proof must include sentenceQualityReview.supportOnly=true.`);
    }
    if (event.target.deckKind === "word" && event.proof.sentenceQualityReview.releaseQuality !== true) {
        throw new Error(`${filePath}:${lineNumber} word proof must include sentenceQualityReview.releaseQuality=true.`);
    }
    if (
        event.target.deckKind === "word"
        && resolveObsidianProofStandardVersion(event) === CURRENT_WORD_OBSIDIAN_STANDARD_VERSION
        && !event.proof.sentenceAudioReview
    ) {
        throw new Error(`${filePath}:${lineNumber} word Obsidian v2.5 proof must include proof.sentenceAudioReview.`);
    }
    assertRelativeTemplatePath(event.ledger.sourceReviewSetPath, `${filePath}:${lineNumber} ledger.sourceReviewSetPath`);
    return event;
}

function parseJsonLine(line, { filePath, lineNumber }) {
    try {
        return JSON.parse(line);
    } catch (error) {
        throw new Error(`${filePath}:${lineNumber} is not valid JSON: ${error.message}`);
    }
}

function loadObsidianProofLedgerFile(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    const records = [];
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;
        if (!line.trim()) {
            continue;
        }
        const parsed = parseJsonLine(line, { filePath, lineNumber });
        records.push(parseObsidianProofLedgerEvent(parsed, { filePath, lineNumber }));
    }
    return records;
}

function walkJsonlFiles(rootDir) {
    if (!fs.existsSync(rootDir)) {
        return [];
    }

    const files = [];
    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkJsonlFiles(entryPath));
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            files.push(path.resolve(entryPath));
        }
    }
    return files.sort();
}

function resolveObsidianProofLedgerFiles({
    ledgerDir = DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR,
    files = undefined,
    cwd = process.cwd(),
} = {}) {
    const resolvedLedgerDir = path.resolve(cwd, ledgerDir);
    const resolvedFiles = Array.isArray(files) && files.length > 0
        ? files.map((file) => path.resolve(cwd, file))
        : walkJsonlFiles(resolvedLedgerDir);

    for (const file of resolvedFiles) {
        if (!isPathInside(file, resolvedLedgerDir)) {
            throw new Error(`Refusing Obsidian proof ledger file outside ${resolvedLedgerDir}: ${file}`);
        }
    }

    return {
        ledgerDir: resolvedLedgerDir,
        files: resolvedFiles,
    };
}

function loadObsidianProofLedger(options = {}) {
    const { ledgerDir, files } = resolveObsidianProofLedgerFiles(options);
    const events = [];
    const proofIds = new Map();
    const versionedTargetKeys = new Map();

    for (const file of files) {
        const fileEvents = loadObsidianProofLedgerFile(file);
        for (const event of fileEvents) {
            const priorProofFile = proofIds.get(event.proofId);
            if (priorProofFile) {
                throw new Error(`Duplicate Obsidian proof id ${event.proofId} in ${file}; first seen in ${priorProofFile}.`);
            }
            proofIds.set(event.proofId, file);

            const versionedTargetKey = buildObsidianProofVersionedTargetKey(event);
            const priorTargetFile = versionedTargetKeys.get(versionedTargetKey);
            if (priorTargetFile) {
                throw new Error(`Duplicate Obsidian proof target ${versionedTargetKey} in ${file}; first seen in ${priorTargetFile}.`);
            }
            versionedTargetKeys.set(versionedTargetKey, file);

            events.push(event);
        }
    }

    return {
        ledgerDir,
        files,
        events,
    };
}

function buildRereviewProvenanceFromLedgerEvent(event) {
    return {
        type: event.proof.type,
        reviewStandard: event.proof.reviewStandard,
        batchId: event.batch.id,
        reviewedAt: event.proof.reviewedAt,
        reviewer: event.proof.reviewer,
        reviewedAfterStandard: event.proof.reviewedAfterStandard,
        mechanicalMigration: event.proof.mechanicalMigration,
        result: event.proof.result,
        scope: event.proof.scope,
        cardReviewed: event.proof.cardReviewed,
        evidenceChecked: event.proof.evidenceChecked,
        limitationDecision: event.proof.limitationDecision,
        sentenceQualityReview: event.proof.sentenceQualityReview,
        ...(event.proof.obsidianStandardVersion ? { obsidianStandardVersion: event.proof.obsidianStandardVersion } : {}),
        ...(event.proof.sentenceAudioReview ? { sentenceAudioReview: event.proof.sentenceAudioReview } : {}),
        ...(event.proof.reviewSession ? { reviewSession: event.proof.reviewSession } : {}),
    };
}

module.exports = {
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
    DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR,
    LEGACY_WORD_OBSIDIAN_STANDARD_VERSION,
    OBSIDIAN_PROOF_EVENT_RECORD_TYPE,
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
    OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION,
    buildObsidianProofTargetKey,
    buildObsidianProofVersionedTargetKey,
    buildRereviewProvenanceFromLedgerEvent,
    expectedReviewStandardForDeckKind,
    loadObsidianProofLedger,
    obsidianProofLedgerEventSchema,
    parseObsidianProofLedgerEvent,
    resolveObsidianProofLedgerFiles,
    resolveObsidianProofStandardVersion,
};
