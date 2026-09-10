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
const {
    OBSIDIAN_PROOF_CANONICALIZATION,
    OBSIDIAN_PROOF_DIGEST_ALGORITHM,
    hashObsidianProofIntegrityPayload,
    verifyObsidianProofIntegrityEnvelope,
} = require("../services/obsidianProofIntegrityService");

const OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION = 1;
const CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION = 2;
const OBSIDIAN_PROOF_EVENT_RECORD_TYPE = "obsidian-proof-event";
const OBSIDIAN_PROOF_REVOCATION_RECORD_TYPE = "obsidian-proof-revocation-event";
const OBSIDIAN_PROOF_LEDGER_AUTHORITY = Object.freeze({
    sourceOfTruth: "tracked-jsonl-obsidian-proof-ledger",
    generatedCompatibilityView: true,
    generatedSqliteMirror: true,
    boundary: "Obsidian proof only; not source evidence, generated TSV authority, APKG authority, NLP certification, or release readiness.",
});
const DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR = path.join("templates", "obsidian_proof_ledger");
const CURRENT_KANJI_OBSIDIAN_STANDARD_VERSION = "kanji-obsidian-v2-snapshot-bound";
const CURRENT_WORD_OBSIDIAN_STANDARD_VERSION = "word-obsidian-v2.5-sentence-audio";
const LEGACY_WORD_OBSIDIAN_STANDARD_VERSION = "legacy-word-obsidian-v2.0";
const WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY = "word-example-sentence";

const proofIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/);
const deckKindSchema = z.enum(["kanji", "word"]);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const reviewerIdentitySchema = z.object({
    type: z.literal("accountable-review-owner"),
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    displayName: z.string().trim().min(1),
}).strict();
const jsonValueSchema = z.lazy(() => z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
]));
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

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

const commonTypedChecks = {
    liveGeneratedCard: z.literal(true),
    trackedReviewEntry: z.literal(true),
    japaneseSourceEvidence: z.literal(true),
    learnerFacingMeaning: z.literal(true),
    exampleSentence: z.literal(true),
    notesAndSupport: z.literal(true),
    readingStructure: z.literal(true),
    levelAndCoverage: z.literal(true),
    primaryAudioIdentity: z.literal(true),
    managedMediaProvenance: z.literal(true),
    laneSeparation: z.literal(true),
    limitationsReviewed: z.literal(true),
};
const kanjiTypedChecksSchema = z.object({
    ...commonTypedChecks,
    strokeOrderIdentity: z.literal(true),
}).strict();
const wordTypedChecksSchema = z.object({
    ...commonTypedChecks,
    exampleAudioIdentity: z.literal(true),
    pitchAccent: z.literal(true),
    wordDeckProductFit: z.literal(true),
}).strict();

const proofV2Schema = proofSchema.extend({
    reviewSession: proofReviewSessionSchema,
    reviewerIdentity: reviewerIdentitySchema,
    typedChecks: z.union([kanjiTypedChecksSchema, wordTypedChecksSchema]),
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

const ledgerV2Schema = ledgerSchema.extend({
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/i),
    sourceReviewSetSha256: sha256Schema,
    recordedByIdentity: reviewerIdentitySchema,
}).strict();

const certificationLifecycleSchema = z.union([
    z.object({
        action: z.literal("certify"),
    }).strict(),
    z.object({
        action: z.literal("supersede"),
        previousProofId: proofIdSchema,
        reason: z.string().trim().min(1),
    }).strict(),
]);

const proofIntegritySchema = z.object({
    canonicalization: z.literal(OBSIDIAN_PROOF_CANONICALIZATION),
    digestAlgorithm: z.literal(OBSIDIAN_PROOF_DIGEST_ALGORITHM),
    generatedCard: z.object({
        sourcePath: z.string().min(1),
        sourceSha256: sha256Schema,
        row: jsonObjectSchema,
        rowSha256: sha256Schema,
    }).strict(),
    trackedReviewEntry: z.object({
        entry: jsonObjectSchema,
        entrySha256: sha256Schema,
    }).strict(),
    payloadSha256: sha256Schema,
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

const obsidianProofLedgerEventV2Schema = z.object({
    schemaVersion: z.literal(CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION),
    recordType: z.literal(OBSIDIAN_PROOF_EVENT_RECORD_TYPE),
    proofId: proofIdSchema,
    target: targetSchema,
    batch: batchSchema,
    proof: proofV2Schema,
    authority: authoritySchema,
    ledger: ledgerV2Schema,
    lifecycle: certificationLifecycleSchema,
    integrity: proofIntegritySchema,
}).strict();

const obsidianProofRevocationEventSchema = z.object({
    schemaVersion: z.literal(CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION),
    recordType: z.literal(OBSIDIAN_PROOF_REVOCATION_RECORD_TYPE),
    proofId: proofIdSchema,
    target: targetSchema,
    authority: authoritySchema,
    ledger: ledgerV2Schema,
    lifecycle: z.object({
        action: z.literal("revoke"),
        previousProofId: proofIdSchema,
        obsidianStandardVersion: z.string().trim().min(1),
        reason: z.string().trim().min(1),
        reviewerIdentity: reviewerIdentitySchema,
    }).strict(),
    integrity: z.object({
        canonicalization: z.literal(OBSIDIAN_PROOF_CANONICALIZATION),
        digestAlgorithm: z.literal(OBSIDIAN_PROOF_DIGEST_ALGORITHM),
        payloadSha256: sha256Schema,
    }).strict(),
}).strict();

const obsidianProofLedgerRecordSchema = z.union([
    obsidianProofLedgerEventSchema,
    obsidianProofLedgerEventV2Schema,
    obsidianProofRevocationEventSchema,
]);

function expectedReviewStandardForDeckKind(deckKind) {
    if (deckKind === "kanji") {
        return CURRENT_KANJI_PLATINUM_REVIEW_STANDARD;
    }
    if (deckKind === "word") {
        return CURRENT_WORD_PLATINUM_REVIEW_STANDARD;
    }
    throw new Error(`Unsupported Obsidian proof deck kind: ${deckKind}.`);
}

function expectedObsidianProofGeneratedSourcePath({ deckKind, level }) {
    if (deckKind === "kanji") {
        return `out/build/exports/jlpt-n${level}.tsv`;
    }
    if (deckKind === "word") {
        return `out/word-build/exports/jlpt-n${level}-words.tsv`;
    }
    throw new Error(`Unsupported Obsidian proof deck kind for generated card binding: ${deckKind}.`);
}

function expectedObsidianProofReviewSetPath({ deckKind, level }) {
    if (deckKind === "kanji") {
        return `templates/platinum_n${level}_review_set.json`;
    }
    if (deckKind === "word") {
        return `templates/platinum_n${level}_word_review_set.json`;
    }
    throw new Error(`Unsupported Obsidian proof deck kind for tracked review-set binding: ${deckKind}.`);
}

function buildObsidianProofTargetKey(event) {
    return [
        event.target.deckKind,
        `n${event.target.level}`,
        event.target.cardReviewed,
    ].join(":");
}

function resolveObsidianProofStandardVersion(event) {
    if (event?.recordType === OBSIDIAN_PROOF_REVOCATION_RECORD_TYPE) {
        return String(event.lifecycle.obsidianStandardVersion).trim();
    }
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

function assertRelativeGeneratedPath(value, label) {
    const normalized = String(value || "").replace(/\\/g, "/");
    if (path.isAbsolute(normalized) || normalized.includes("../") || normalized === "..") {
        throw new Error(`${label} must be a relative generated repo path: ${value}.`);
    }
    if (!normalized.startsWith("out/")) {
        throw new Error(`${label} must stay under out/: ${value}.`);
    }
}

function parseObsidianProofLedgerEvent(value, { filePath = "<memory>", lineNumber = 0 } = {}) {
    const event = obsidianProofLedgerRecordSchema.parse(value);
    const expectedCardReviewed = `${event.target.written}|${event.target.reading}`;
    if (event.target.cardReviewed !== expectedCardReviewed) {
        throw new Error(`${filePath}:${lineNumber} target.cardReviewed must equal written|reading (${expectedCardReviewed}).`);
    }
    if (event.recordType === OBSIDIAN_PROOF_REVOCATION_RECORD_TYPE) {
        assertRelativeTemplatePath(event.ledger.sourceReviewSetPath, `${filePath}:${lineNumber} ledger.sourceReviewSetPath`);
        const expectedSourceReviewSetPath = expectedObsidianProofReviewSetPath(event.target);
        if (event.ledger.sourceReviewSetPath !== expectedSourceReviewSetPath) {
            throw new Error(`${filePath}:${lineNumber} ledger.sourceReviewSetPath must be ${expectedSourceReviewSetPath}.`);
        }
        if (event.ledger.sourceCommit !== event.ledger.sourceCommit.toLowerCase()) {
            throw new Error(`${filePath}:${lineNumber} schema-v2 sourceCommit must use canonical lowercase hexadecimal.`);
        }
        if (event.ledger.recordedBy !== event.ledger.recordedByIdentity.displayName) {
            throw new Error(`${filePath}:${lineNumber} ledger.recordedBy must match ledger.recordedByIdentity.displayName.`);
        }
        const expectedPayloadSha256 = hashObsidianProofIntegrityPayload(event);
        if (event.integrity.payloadSha256 !== expectedPayloadSha256) {
            throw new Error(`${filePath}:${lineNumber} revocation integrity.payloadSha256 does not match its canonical payload.`);
        }
        return event;
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
    if (event.schemaVersion === CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION) {
        const expectedObsidianStandard = event.target.deckKind === "kanji"
            ? CURRENT_KANJI_OBSIDIAN_STANDARD_VERSION
            : CURRENT_WORD_OBSIDIAN_STANDARD_VERSION;
        if (event.proof.obsidianStandardVersion !== expectedObsidianStandard) {
            throw new Error(`${filePath}:${lineNumber} schema-v2 proof.obsidianStandardVersion must be ${expectedObsidianStandard}.`);
        }
        if (event.ledger.sourceCommit !== event.ledger.sourceCommit.toLowerCase()) {
            throw new Error(`${filePath}:${lineNumber} schema-v2 sourceCommit must use canonical lowercase hexadecimal.`);
        }
        if (event.proof.reviewer !== event.proof.reviewerIdentity.displayName) {
            throw new Error(`${filePath}:${lineNumber} proof.reviewer must match proof.reviewerIdentity.displayName.`);
        }
        if (event.ledger.recordedBy !== event.ledger.recordedByIdentity.displayName) {
            throw new Error(`${filePath}:${lineNumber} ledger.recordedBy must match ledger.recordedByIdentity.displayName.`);
        }
        if (event.ledger.recordedAt < event.proof.reviewedAt) {
            throw new Error(`${filePath}:${lineNumber} ledger.recordedAt cannot precede proof.reviewedAt.`);
        }
        const expectedSourceReviewSetPath = expectedObsidianProofReviewSetPath(event.target);
        if (event.ledger.sourceReviewSetPath !== expectedSourceReviewSetPath) {
            throw new Error(`${filePath}:${lineNumber} ledger.sourceReviewSetPath must be ${expectedSourceReviewSetPath}.`);
        }
        assertRelativeGeneratedPath(
            event.integrity.generatedCard.sourcePath,
            `${filePath}:${lineNumber} integrity.generatedCard.sourcePath`
        );
        const expectedGeneratedSourcePath = expectedObsidianProofGeneratedSourcePath(event.target);
        if (event.integrity.generatedCard.sourcePath !== expectedGeneratedSourcePath) {
            throw new Error(`${filePath}:${lineNumber} integrity.generatedCard.sourcePath must be ${expectedGeneratedSourcePath}.`);
        }
        const typedChecks = event.proof.typedChecks || {};
        const deckSpecificCheck = event.target.deckKind === "kanji" ? "strokeOrderIdentity" : "exampleAudioIdentity";
        if (typedChecks[deckSpecificCheck] !== true) {
            throw new Error(`${filePath}:${lineNumber} schema-v2 ${event.target.deckKind} proof is missing typed check ${deckSpecificCheck}=true.`);
        }
        const integrity = verifyObsidianProofIntegrityEnvelope(event);
        if (!integrity.passed) {
            throw new Error(`${filePath}:${lineNumber} schema-v2 integrity failed: ${integrity.failures.join("; ")}.`);
        }
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
    const records = [];
    const proofIds = new Map();

    for (const file of files) {
        const fileEvents = loadObsidianProofLedgerFile(file);
        for (const event of fileEvents) {
            const priorProofFile = proofIds.get(event.proofId);
            if (priorProofFile) {
                throw new Error(`Duplicate Obsidian proof id ${event.proofId} in ${file}; first seen in ${priorProofFile}.`);
            }
            proofIds.set(event.proofId, file);
            records.push(event);
        }
    }

    const lifecycle = resolveObsidianProofLifecycle(records);

    return {
        ledgerDir,
        files,
        records,
        events: lifecycle.certificationEvents,
        activeEvents: lifecycle.activeCertificationEvents,
        revocationEvents: lifecycle.revocationEvents,
        lifecycle,
    };
}

function isObsidianProofCertificationEvent(record) {
    return record?.recordType === OBSIDIAN_PROOF_EVENT_RECORD_TYPE;
}

function isObsidianProofRevocationEvent(record) {
    return record?.recordType === OBSIDIAN_PROOF_REVOCATION_RECORD_TYPE;
}

function resolveObsidianProofLifecycle(records = []) {
    const byId = new Map(records.map((record) => [record.proofId, record]));
    const positions = new Map(records.map((record, index) => [record.proofId, index]));
    const groups = new Map();
    const successors = new Map();

    for (const record of records) {
        const key = buildObsidianProofVersionedTargetKey(record);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(record);

        const previousProofId = record.schemaVersion === CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION
            ? record.lifecycle?.previousProofId
            : undefined;
        if (!previousProofId) {
            continue;
        }
        const previous = byId.get(previousProofId);
        if (!previous) {
            throw new Error(`Obsidian proof lifecycle event ${record.proofId} references missing previous proof ${previousProofId}.`);
        }
        if (positions.get(previousProofId) >= positions.get(record.proofId)) {
            throw new Error(`Obsidian proof lifecycle event ${record.proofId} must appear after previous proof ${previousProofId}.`);
        }
        if (record.ledger.recordedAt < previous.ledger.recordedAt) {
            throw new Error(`Obsidian proof lifecycle event ${record.proofId} cannot predate previous proof ${previousProofId}.`);
        }
        const previousKey = buildObsidianProofVersionedTargetKey(previous);
        if (previousKey !== key) {
            throw new Error(`Obsidian proof lifecycle event ${record.proofId} must reference the same versioned target as ${previousProofId}.`);
        }
        if (successors.has(previousProofId)) {
            throw new Error(`Obsidian proof lifecycle branches from ${previousProofId}: ${successors.get(previousProofId).proofId} and ${record.proofId}.`);
        }
        successors.set(previousProofId, record);
    }

    const activeCertificationEvents = [];
    for (const [key, group] of groups.entries()) {
        const roots = group.filter((record) => (
            record.schemaVersion === OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION
            || record.lifecycle?.action === "certify"
        ));
        if (roots.length !== 1) {
            throw new Error(`Duplicate Obsidian proof target ${key}: expected one lifecycle root but found ${roots.length}.`);
        }

        let current = roots[0];
        const visited = new Set();
        while (current) {
            if (visited.has(current.proofId)) {
                throw new Error(`Obsidian proof lifecycle cycle detected at ${current.proofId}.`);
            }
            visited.add(current.proofId);
            current = successors.get(current.proofId);
        }
        if (visited.size !== group.length) {
            const disconnected = group.filter((record) => !visited.has(record.proofId)).map((record) => record.proofId);
            throw new Error(`Obsidian proof lifecycle for ${key} is disconnected: ${disconnected.join(", ")}.`);
        }
        const terminalId = [...visited].at(-1);
        const terminal = byId.get(terminalId);
        if (isObsidianProofCertificationEvent(terminal)) {
            activeCertificationEvents.push(terminal);
        }
    }

    return {
        certificationEvents: records.filter(isObsidianProofCertificationEvent),
        activeCertificationEvents,
        revocationEvents: records.filter(isObsidianProofRevocationEvent),
        supersededRecords: records.length - activeCertificationEvents.length,
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
        ...(event.schemaVersion === CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION ? {
            schemaVersion: event.schemaVersion,
            proofId: event.proofId,
            reviewerIdentity: event.proof.reviewerIdentity,
            typedChecks: event.proof.typedChecks,
            lifecycle: event.lifecycle,
            integrity: event.integrity,
        } : {}),
    };
}

module.exports = {
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
    CURRENT_KANJI_OBSIDIAN_STANDARD_VERSION,
    CURRENT_OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION,
    DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR,
    LEGACY_WORD_OBSIDIAN_STANDARD_VERSION,
    OBSIDIAN_PROOF_EVENT_RECORD_TYPE,
    OBSIDIAN_PROOF_REVOCATION_RECORD_TYPE,
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
    OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION,
    buildObsidianProofTargetKey,
    buildObsidianProofVersionedTargetKey,
    buildRereviewProvenanceFromLedgerEvent,
    expectedReviewStandardForDeckKind,
    expectedObsidianProofGeneratedSourcePath,
    expectedObsidianProofReviewSetPath,
    loadObsidianProofLedger,
    isObsidianProofCertificationEvent,
    isObsidianProofRevocationEvent,
    obsidianProofLedgerEventV2Schema,
    obsidianProofLedgerEventSchema,
    obsidianProofLedgerRecordSchema,
    obsidianProofRevocationEventSchema,
    parseObsidianProofLedgerEvent,
    resolveObsidianProofLedgerFiles,
    resolveObsidianProofLifecycle,
    resolveObsidianProofStandardVersion,
};
