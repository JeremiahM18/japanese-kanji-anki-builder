const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const { loadConfig } = require("../config");
const { loadJlptOnlyJson } = require("../datasets/jlptOnlyJson");
const { loadJlptLevelContract } = require("../datasets/jlptLevelContract");
const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../datasets/jlptKanjiSourceEvidence");
const { loadJlptWordSourceEvidence } = require("../datasets/jlptWordSourceEvidence");
const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
    buildObsidianProofTargetKey,
    loadObsidianProofLedger,
} = require("../datasets/obsidianProofLedger");
const { auditJlptKanjiSourceEvidence } = require("./jlptKanjiSourceEvidenceService");
const {
    auditJlptWordSourceEvidence,
    buildSourceAdequacyByLevel,
} = require("./jlptWordSourceEvidenceService");
const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_KANJI_PLATINUM_STATUSES,
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    entryUsesCurrentKanjiPlatinumStandard,
} = require("./platinumKanjiReviewService");
const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_WORD_PLATINUM_STATUSES,
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    entryUsesCurrentWordPlatinumStandard,
} = require("./platinumReviewService");
const {
    ACTIVE_SAPPHIRE_STATUSES,
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
    entryUsesCurrentKanjiSapphireStandard,
} = require("./sapphireKanjiReviewService");
const {
    ACTIVE_WORD_SAPPHIRE_STATUSES,
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    entryUsesCurrentWordSapphireStandard,
} = require("./sapphireWordReviewService");
const { buildDeckCloseoutStatus, DEFAULT_LEVELS } = require("./deckCloseoutStatusService");
const { assertSafeGeneratedPath, ensureDir, isPathInside, writeFileAtomicSync } = require("../utils/fs");
const { readJsonFile } = require("../utils/jsonFile");

const SCHEMA_VERSION = 1;
const SNAPSHOT_SCHEMA_NAME = "databricks-snapshot-v1";
const AUTHORITY_BOUNDARY_STATEMENT = [
    "Databricks snapshots are analytics/reporting artifacts only.",
    "The repo remains source of truth for generated surfaces, lane decisions, and canonical Obsidian proof ledgers.",
    "This export does not certify cards, shrink denominators, rename lanes, write proof, or automate human language/card approval.",
].join(" ");
const OBSIDIAN_BOUNDARY_STATEMENT = [
    OBSIDIAN_PROOF_LEDGER_AUTHORITY.boundary,
    "A snapshot row is Obsidian only when the canonical proof ledger event binds to an active current-standard Platinum review decision.",
].join(" ");
const REQUIRED_OUTPUT_FILES = Object.freeze([
    "card_surfaces.ndjson",
    "lane_coverage.ndjson",
    "review_decisions.ndjson",
    "obsidian_proof_events.ndjson",
    "source_evidence_summary.ndjson",
    "media_assets.ndjson",
    "expected_backlog.ndjson",
    "data_quality_findings.ndjson",
]);
const DEFAULT_COMMAND_EVIDENCE = Object.freeze([
    {
        id: "docs_status_audit",
        label: "Documentation status audit",
        command: "node",
        args: ["scripts/auditDocumentationStatus.js"],
        displayCommand: "node scripts/auditDocumentationStatus.js",
    },
    {
        id: "deck_closeout_all_levels",
        label: "Deck closeout all levels",
        command: "node",
        args: ["scripts/reportDeckCloseoutStatus.js", "--levels=5,4,3,2,1"],
        displayCommand: "node scripts/reportDeckCloseoutStatus.js --levels=5,4,3,2,1",
    },
    {
        id: "obsidian_proof_validate",
        label: "Obsidian proof validation",
        command: "node",
        args: ["scripts/validateObsidianProofLedger.js", "--json"],
        displayCommand: "node scripts/validateObsidianProofLedger.js --json",
    },
]);

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();
const deckKindSchema = z.enum(["kanji", "word"]);
const laneSchema = z.enum(["silver", "gold", "sapphire", "platinum", "obsidian"]);
const cardSurfaceRowSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    recordType: z.literal("card_surface"),
    cardKey: z.string().min(1),
    deckKind: deckKindSchema,
    level: z.number().int().min(1).max(5),
    levelLabel: z.string().regex(/^N[1-5]$/),
    written: z.string().min(1),
    reading: z.string().min(1),
    identity: z.string().min(1),
    generatedSource: z.enum(["kanji_tsv", "word_tsv"]),
    sourcePath: z.string().min(1),
    sourceRowNumber: z.number().int().positive(),
    tsvFields: z.record(z.string(), z.string()),
    binaryMediaExported: z.literal(false),
}).strict();
const laneCoverageRowSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    recordType: z.literal("lane_coverage"),
    coverageKey: z.string().min(1),
    deckKind: deckKindSchema,
    level: z.number().int().min(1).max(5),
    levelLabel: z.string().regex(/^N[1-5]$/),
    lane: laneSchema,
    denominator: z.number().int().nonnegative(),
    count: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    ratio: z.string().min(1),
    denominatorSource: z.string().min(1),
    countSource: z.string().min(1),
    complete: z.boolean(),
    certificationLane: z.literal(true),
    databricksTablePrefix: z.enum(["raw_", "clean_", "mart_"]),
}).strict();
const reviewDecisionRowSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    recordType: z.literal("review_decision"),
    decisionKey: z.string().min(1),
    cardKey: z.string().min(1),
    deckKind: deckKindSchema,
    level: z.number().int().min(1).max(5),
    levelLabel: z.string().regex(/^N[1-5]$/),
    lane: z.enum(["gold", "sapphire", "platinum"]),
    status: z.string().min(1),
    activeStatus: z.boolean(),
    currentStandard: z.boolean(),
    countsForLane: z.boolean(),
    reviewStandard: nullableString,
    sourcePath: z.string().min(1),
    sourceRowNumber: z.number().int().positive(),
    requiredPriorLane: z.enum(["silver", "gold", "sapphire"]),
    priorLaneBindingFound: z.boolean(),
    humanReviewRequired: z.literal(true),
    automatedApproval: z.literal(false),
}).strict();
const proofEventRowSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    recordType: z.literal("obsidian_proof_event"),
    proofId: z.string().min(1),
    proofTargetKey: z.string().min(1),
    cardKey: z.string().min(1),
    deckKind: deckKindSchema,
    level: z.number().int().min(1).max(5),
    levelLabel: z.string().regex(/^N[1-5]$/),
    written: z.string().min(1),
    reading: z.string().min(1),
    sourceReviewSetPath: z.string().min(1),
    sourceCommit: z.string().min(1),
    reviewedAt: z.string().min(1),
    reviewer: z.string().min(1),
    reviewStandard: z.string().min(1),
    result: z.string().min(1),
    evidenceCheckedCount: z.number().int().nonnegative(),
    platinumBindingFound: z.literal(true),
    authoritySourceOfTruth: z.literal(OBSIDIAN_PROOF_LEDGER_AUTHORITY.sourceOfTruth),
    authorityBoundary: z.literal(OBSIDIAN_BOUNDARY_STATEMENT),
    binaryMediaExported: z.literal(false),
}).strict();
const sourceEvidenceSummaryRowSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    recordType: z.literal("source_evidence_summary"),
    summaryKey: z.string().min(1),
    deckKind: deckKindSchema,
    scope: z.string().min(1),
    level: nullableNumber,
    sourceId: nullableString,
    metric: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    status: z.string().min(1),
    authorityBoundary: z.string().min(1),
}).strict();
const mediaAssetRowSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    recordType: z.literal("media_asset"),
    assetKey: z.string().min(1),
    cardKey: z.string().min(1),
    deckKind: deckKindSchema,
    level: z.number().int().min(1).max(5),
    levelLabel: z.string().regex(/^N[1-5]$/),
    sourceField: z.string().min(1),
    referenceKind: z.enum(["audio", "image"]),
    reference: z.string().min(1),
    referencedPath: nullableString,
    exists: z.boolean(),
    sha256: nullableString,
    bytes: nullableNumber,
    generatedStatus: z.string().min(1),
    binaryMediaExported: z.literal(false),
}).strict();
const expectedBacklogRowSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    recordType: z.literal("expected_backlog"),
    backlogKey: z.string().min(1),
    deckKind: z.enum(["kanji", "word", "cross_deck"]),
    level: nullableNumber,
    levelLabel: nullableString,
    lane: z.enum(["gold", "sapphire", "platinum", "obsidian", "pre_silver", "release", "source_evidence"]),
    missing: z.number().int().nonnegative(),
    denominator: z.number().int().nonnegative(),
    ratio: z.string().min(1),
    classification: z.string().min(1),
    certificationLane: z.boolean(),
    command: nullableString,
    authorityBoundary: z.string().min(1),
}).strict();
const dataQualityFindingRowSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    recordType: z.literal("data_quality_finding"),
    findingKey: z.string().min(1),
    severity: z.enum(["info", "warning", "error"]),
    status: z.enum(["passed", "failed"]),
    invariant: z.string().min(1),
    observed: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    expected: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    authorityBoundary: z.string().min(1),
}).strict();
const manifestSchema = z.object({
    schemaVersion: z.literal(SNAPSHOT_SCHEMA_NAME),
    snapshotId: z.string().min(1),
    createdAt: z.string().datetime(),
    repo: z.object({
        branch: z.string().min(1),
        head: z.string().min(1),
        status: z.string(),
        clean: z.boolean(),
        remoteHeadCheck: z.object({
            status: z.string().min(1),
            remoteHeadsOnlyMain: z.boolean(),
            localHeadEqualsOriginMain: z.boolean(),
            originMainHead: nullableString,
            remoteHeadCount: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    commandEvidence: z.array(z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        command: z.string().min(1),
        exitCode: nullableNumber,
        status: z.string().min(1),
        passed: z.boolean(),
        stdoutSha256: z.string().min(1),
        stderrSha256: z.string().min(1),
        stdoutLineCount: z.number().int().nonnegative(),
        stderrLineCount: z.number().int().nonnegative(),
    }).strict()),
    inputs: z.object({
        files: z.array(z.object({
            path: z.string().min(1),
            exists: z.boolean(),
            sha256: nullableString,
            bytes: nullableNumber,
            rowCount: nullableNumber,
        }).strict()),
    }).strict(),
    outputs: z.object({
        directory: z.string().min(1),
        files: z.array(z.object({
            path: z.string().min(1),
            sha256: z.string().min(1),
            bytes: z.number().int().nonnegative(),
            rowCount: z.number().int().nonnegative(),
        }).strict()),
    }).strict(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    authorityBoundary: z.literal(AUTHORITY_BOUNDARY_STATEMENT),
    knownExpectedBacklogClassification: z.string().min(1),
    snapshotCompletenessStatus: z.enum(["complete", "partial", "blocked"]),
}).strict();

const rowSchemas = Object.freeze({
    "card_surfaces.ndjson": cardSurfaceRowSchema,
    "lane_coverage.ndjson": laneCoverageRowSchema,
    "review_decisions.ndjson": reviewDecisionRowSchema,
    "obsidian_proof_events.ndjson": proofEventRowSchema,
    "source_evidence_summary.ndjson": sourceEvidenceSummaryRowSchema,
    "media_assets.ndjson": mediaAssetRowSchema,
    "expected_backlog.ndjson": expectedBacklogRowSchema,
    "data_quality_findings.ndjson": dataQualityFindingRowSchema,
});

function normalizeText(value = "") {
    return String(value ?? "").normalize("NFC").trim();
}

function compareStableStrings(left, right) {
    return String(left).normalize("NFC") < String(right).normalize("NFC") ? -1
        : String(left).normalize("NFC") > String(right).normalize("NFC") ? 1
            : 0;
}

function toRepoRelative(rootDir, filePath) {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedPath = path.resolve(filePath);
    return path.relative(resolvedRoot, resolvedPath).replace(/\\/g, "/");
}

function formatLevelLabel(level) {
    return `N${Number(level)}`;
}

function buildCardKey({ deckKind, level, written, reading }) {
    return `${deckKind}:n${Number(level)}:${normalizeText(written)}|${normalizeText(reading)}`;
}

function buildIdentity(written, reading) {
    return `${normalizeText(written)}|${normalizeText(reading)}`;
}

function sha256Buffer(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(text = "") {
    return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function hashFile(filePath) {
    return sha256Buffer(fs.readFileSync(filePath));
}

function parseSnapshotId(value) {
    const snapshotId = normalizeText(value);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/u.test(snapshotId)) {
        throw new Error(`Invalid snapshot id "${value}". Use letters, numbers, dots, underscores, or hyphens only.`);
    }
    if (snapshotId.includes("..") || snapshotId.includes("/") || snapshotId.includes("\\")) {
        throw new Error(`Snapshot id must not contain path traversal or separators: ${value}`);
    }
    return snapshotId;
}

function resolveSnapshotDir(rootDir, snapshotId) {
    const safeSnapshotId = parseSnapshotId(snapshotId);
    const snapshotRoot = path.resolve(rootDir, "out", "databricks", "snapshots");
    const target = path.join(snapshotRoot, safeSnapshotId);
    const resolvedTarget = assertSafeGeneratedPath(target, {
        allowedRoots: [snapshotRoot],
        label: "Databricks snapshot output directory",
    });
    if (!isPathInside(resolvedTarget, snapshotRoot)) {
        throw new Error(`Snapshot output must stay under ${snapshotRoot}: ${resolvedTarget}`);
    }
    return resolvedTarget;
}

function parseTsvRows(text = "") {
    const lines = String(text || "").replace(/^\uFEFF/u, "").split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) {
        return [];
    }
    const headers = lines[0].split("\t");
    return lines.slice(1).map((line, index) => {
        const columns = line.split("\t");
        return {
            rowNumber: index + 2,
            fields: Object.fromEntries(headers.map((header, columnIndex) => [header, columns[columnIndex] || ""])),
        };
    });
}

function readJsonArray(filePath) {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const value = readJsonFile(filePath, { label: toRepoRelative(process.cwd(), filePath) });
    if (!Array.isArray(value)) {
        throw new Error(`${filePath} must contain a JSON array.`);
    }
    return value;
}

function addUnique(map, key, label) {
    if (map.has(key)) {
        throw new Error(`Duplicate ${label}: ${key}`);
    }
    map.set(key, true);
}

function buildCardSurfaceRows({ rootDir, levels }) {
    const rows = [];
    const seen = new Map();
    for (const level of levels) {
        const kanjiPath = path.join(rootDir, "out", "build", "exports", `jlpt-n${level}.tsv`);
        if (fs.existsSync(kanjiPath)) {
            const tsvRows = parseTsvRows(fs.readFileSync(kanjiPath, "utf8"));
            for (const row of tsvRows) {
                const written = normalizeText(row.fields.Kanji);
                const reading = normalizeText(row.fields.PrimaryReading);
                const cardKey = buildCardKey({ deckKind: "kanji", level, written, reading });
                addUnique(seen, cardKey, "generated card identity");
                rows.push({
                    schemaVersion: SCHEMA_VERSION,
                    recordType: "card_surface",
                    cardKey,
                    deckKind: "kanji",
                    level,
                    levelLabel: formatLevelLabel(level),
                    written,
                    reading,
                    identity: buildIdentity(written, reading),
                    generatedSource: "kanji_tsv",
                    sourcePath: toRepoRelative(rootDir, kanjiPath),
                    sourceRowNumber: row.rowNumber,
                    tsvFields: row.fields,
                    binaryMediaExported: false,
                });
            }
        }

        const wordPath = path.join(rootDir, "out", "word-build", "exports", `jlpt-n${level}-words.tsv`);
        if (fs.existsSync(wordPath)) {
            const tsvRows = parseTsvRows(fs.readFileSync(wordPath, "utf8"));
            for (const row of tsvRows) {
                const written = normalizeText(row.fields.Word);
                const reading = normalizeText(row.fields.Reading);
                const cardKey = buildCardKey({ deckKind: "word", level, written, reading });
                addUnique(seen, cardKey, "generated card identity");
                rows.push({
                    schemaVersion: SCHEMA_VERSION,
                    recordType: "card_surface",
                    cardKey,
                    deckKind: "word",
                    level,
                    levelLabel: formatLevelLabel(level),
                    written,
                    reading,
                    identity: buildIdentity(written, reading),
                    generatedSource: "word_tsv",
                    sourcePath: toRepoRelative(rootDir, wordPath),
                    sourceRowNumber: row.rowNumber,
                    tsvFields: row.fields,
                    binaryMediaExported: false,
                });
            }
        }
    }
    return rows.sort((left, right) => compareStableStrings(left.cardKey, right.cardKey));
}

function buildSurfaceIndexes(cardSurfaceRows) {
    const byCardKey = new Map();
    const byKanjiWritten = new Map();
    const byWordIdentity = new Map();
    for (const row of cardSurfaceRows) {
        byCardKey.set(row.cardKey, row);
        if (row.deckKind === "kanji") {
            if (!byKanjiWritten.has(row.written)) {
                byKanjiWritten.set(row.written, []);
            }
            byKanjiWritten.get(row.written).push(row);
        } else {
            byWordIdentity.set(row.identity, row);
        }
    }
    return { byCardKey, byKanjiWritten, byWordIdentity };
}

function getGeneratedKanjiSurface(indexes, kanji, sourcePath, sourceRowNumber) {
    const matches = indexes.byKanjiWritten.get(normalizeText(kanji)) || [];
    if (matches.length !== 1) {
        throw new Error(`${sourcePath}:${sourceRowNumber} must bind to exactly one generated kanji surface for ${kanji}; found ${matches.length}.`);
    }
    return matches[0];
}

function findGeneratedKanjiSurface(indexes, kanji, sourcePath, sourceRowNumber) {
    const matches = indexes.byKanjiWritten.get(normalizeText(kanji)) || [];
    if (matches.length > 1) {
        throw new Error(`${sourcePath}:${sourceRowNumber} must bind to at most one generated kanji surface for ${kanji}; found ${matches.length}.`);
    }
    return matches[0] || null;
}

function buildReviewOnlySurface({ deckKind, level, written, reading }) {
    const normalizedWritten = normalizeText(written);
    const normalizedReading = normalizeText(reading) || "not-generated";
    return {
        cardKey: buildCardKey({
            deckKind,
            level,
            written: normalizedWritten,
            reading: normalizedReading,
        }),
        deckKind,
        level,
        levelLabel: formatLevelLabel(level),
        written: normalizedWritten,
        reading: normalizedReading,
        identity: buildIdentity(normalizedWritten, normalizedReading),
    };
}

function getSingleReadingIncludes(entry, sourcePath, sourceRowNumber) {
    if (!Array.isArray(entry?.readingIncludes) || entry.readingIncludes.length !== 1) {
        throw new Error(`${sourcePath}:${sourceRowNumber} must have exactly one readingIncludes value for stable snapshot identity.`);
    }
    return normalizeText(entry.readingIncludes[0]);
}

function buildReviewDecisionRows({ rootDir, levels, cardSurfaceRows }) {
    const rows = [];
    const seenActive = new Map();
    const indexes = buildSurfaceIndexes(cardSurfaceRows);
    const countsForLane = {
        silver: new Set(cardSurfaceRows.map((row) => row.cardKey)),
        gold: new Set(),
        sapphire: new Set(),
        platinum: new Set(),
    };

    function pushDecision(row) {
        const key = `${row.lane}:${row.cardKey}`;
        if (row.countsForLane) {
            addUnique(seenActive, key, "active review decision identity");
            countsForLane[row.lane].add(row.cardKey);
        }
        rows.push(row);
    }

    for (const level of levels) {
        const kanjiGoldPath = path.join(rootDir, "templates", `golden_n${level}_review_set.json`);
        for (const [index, entry] of readJsonArray(kanjiGoldPath).entries()) {
            const sourceRowNumber = index + 1;
            const surface = getGeneratedKanjiSurface(indexes, entry?.kanji, toRepoRelative(rootDir, kanjiGoldPath), sourceRowNumber);
            pushDecision({
                schemaVersion: SCHEMA_VERSION,
                recordType: "review_decision",
                decisionKey: `gold:${surface.cardKey}`,
                cardKey: surface.cardKey,
                deckKind: "kanji",
                level,
                levelLabel: formatLevelLabel(level),
                lane: "gold",
                status: "gold",
                activeStatus: true,
                currentStandard: true,
                countsForLane: true,
                reviewStandard: null,
                sourcePath: toRepoRelative(rootDir, kanjiGoldPath),
                sourceRowNumber,
                requiredPriorLane: "silver",
                priorLaneBindingFound: countsForLane.silver.has(surface.cardKey),
                humanReviewRequired: true,
                automatedApproval: false,
            });
        }

        const wordGoldPath = path.join(rootDir, "templates", `golden_n${level}_word_review_set.json`);
        for (const [index, entry] of readJsonArray(wordGoldPath).entries()) {
            const sourceRowNumber = index + 1;
            const identity = buildIdentity(entry?.word, getSingleReadingIncludes(entry, toRepoRelative(rootDir, wordGoldPath), sourceRowNumber));
            const surface = indexes.byWordIdentity.get(identity);
            if (!surface) {
                throw new Error(`${toRepoRelative(rootDir, wordGoldPath)}:${sourceRowNumber} missing generated word surface for ${identity}.`);
            }
            pushDecision({
                schemaVersion: SCHEMA_VERSION,
                recordType: "review_decision",
                decisionKey: `gold:${surface.cardKey}`,
                cardKey: surface.cardKey,
                deckKind: "word",
                level,
                levelLabel: formatLevelLabel(level),
                lane: "gold",
                status: "gold",
                activeStatus: true,
                currentStandard: true,
                countsForLane: true,
                reviewStandard: null,
                sourcePath: toRepoRelative(rootDir, wordGoldPath),
                sourceRowNumber,
                requiredPriorLane: "silver",
                priorLaneBindingFound: countsForLane.silver.has(surface.cardKey),
                humanReviewRequired: true,
                automatedApproval: false,
            });
        }

        const kanjiSapphirePath = path.join(rootDir, "templates", `sapphire_n${level}_review_set.json`);
        for (const [index, entry] of readJsonArray(kanjiSapphirePath).entries()) {
            const sourceRowNumber = index + 1;
            const sourcePath = toRepoRelative(rootDir, kanjiSapphirePath);
            const activeStatus = ACTIVE_SAPPHIRE_STATUSES.includes(normalizeText(entry?.status));
            const currentStandard = entryUsesCurrentKanjiSapphireStandard(entry);
            const decisionCountsForLane = activeStatus && currentStandard;
            const generatedSurface = findGeneratedKanjiSurface(indexes, entry?.kanji, sourcePath, sourceRowNumber);
            if (decisionCountsForLane && !generatedSurface) {
                throw new Error(`${sourcePath}:${sourceRowNumber} missing generated kanji surface for counted Sapphire row ${entry?.kanji}.`);
            }
            const surface = generatedSurface || buildReviewOnlySurface({
                deckKind: "kanji",
                level,
                written: entry?.kanji,
                reading: entry?.reading || entry?.primaryReading,
            });
            pushDecision({
                schemaVersion: SCHEMA_VERSION,
                recordType: "review_decision",
                decisionKey: `sapphire:${surface.cardKey}`,
                cardKey: surface.cardKey,
                deckKind: "kanji",
                level,
                levelLabel: formatLevelLabel(level),
                lane: "sapphire",
                status: normalizeText(entry?.status) || "unknown",
                activeStatus,
                currentStandard,
                countsForLane: decisionCountsForLane,
                reviewStandard: normalizeText(entry?.reviewStandard) || null,
                sourcePath,
                sourceRowNumber,
                requiredPriorLane: "gold",
                priorLaneBindingFound: countsForLane.gold.has(surface.cardKey),
                humanReviewRequired: true,
                automatedApproval: false,
            });
        }

        const wordSapphirePath = path.join(rootDir, "templates", `sapphire_n${level}_word_review_set.json`);
        for (const [index, entry] of readJsonArray(wordSapphirePath).entries()) {
            const sourceRowNumber = index + 1;
            const sourcePath = toRepoRelative(rootDir, wordSapphirePath);
            const reading = getSingleReadingIncludes(entry, sourcePath, sourceRowNumber);
            const identity = buildIdentity(entry?.word, reading);
            const activeStatus = ACTIVE_WORD_SAPPHIRE_STATUSES.includes(normalizeText(entry?.status));
            const currentStandard = entryUsesCurrentWordSapphireStandard(entry);
            const decisionCountsForLane = activeStatus && currentStandard;
            const generatedSurface = indexes.byWordIdentity.get(identity) || null;
            if (decisionCountsForLane && !generatedSurface) {
                throw new Error(`${sourcePath}:${sourceRowNumber} missing generated word surface for counted Sapphire row ${identity}.`);
            }
            const surface = generatedSurface || buildReviewOnlySurface({
                deckKind: "word",
                level,
                written: entry?.word,
                reading,
            });
            pushDecision({
                schemaVersion: SCHEMA_VERSION,
                recordType: "review_decision",
                decisionKey: `sapphire:${surface.cardKey}`,
                cardKey: surface.cardKey,
                deckKind: "word",
                level,
                levelLabel: formatLevelLabel(level),
                lane: "sapphire",
                status: normalizeText(entry?.status) || "unknown",
                activeStatus,
                currentStandard,
                countsForLane: decisionCountsForLane,
                reviewStandard: normalizeText(entry?.reviewStandard) || null,
                sourcePath,
                sourceRowNumber,
                requiredPriorLane: "gold",
                priorLaneBindingFound: countsForLane.gold.has(surface.cardKey),
                humanReviewRequired: true,
                automatedApproval: false,
            });
        }

        const kanjiPlatinumPath = path.join(rootDir, "templates", `platinum_n${level}_review_set.json`);
        for (const [index, entry] of readJsonArray(kanjiPlatinumPath).entries()) {
            const sourceRowNumber = index + 1;
            const sourcePath = toRepoRelative(rootDir, kanjiPlatinumPath);
            const activeStatus = ACTIVE_KANJI_PLATINUM_STATUSES.includes(normalizeText(entry?.status));
            const currentStandard = entryUsesCurrentKanjiPlatinumStandard(entry);
            const decisionCountsForLane = activeStatus && currentStandard;
            const generatedSurface = findGeneratedKanjiSurface(indexes, entry?.kanji, sourcePath, sourceRowNumber);
            if (decisionCountsForLane && !generatedSurface) {
                throw new Error(`${sourcePath}:${sourceRowNumber} missing generated kanji surface for counted Platinum row ${entry?.kanji}.`);
            }
            const surface = generatedSurface || buildReviewOnlySurface({
                deckKind: "kanji",
                level,
                written: entry?.kanji,
                reading: entry?.reading || entry?.primaryReading,
            });
            pushDecision({
                schemaVersion: SCHEMA_VERSION,
                recordType: "review_decision",
                decisionKey: `platinum:${surface.cardKey}`,
                cardKey: surface.cardKey,
                deckKind: "kanji",
                level,
                levelLabel: formatLevelLabel(level),
                lane: "platinum",
                status: normalizeText(entry?.status) || "unknown",
                activeStatus,
                currentStandard,
                countsForLane: decisionCountsForLane,
                reviewStandard: normalizeText(entry?.reviewStandard) || null,
                sourcePath,
                sourceRowNumber,
                requiredPriorLane: "sapphire",
                priorLaneBindingFound: countsForLane.sapphire.has(surface.cardKey),
                humanReviewRequired: true,
                automatedApproval: false,
            });
        }

        const wordPlatinumPath = path.join(rootDir, "templates", `platinum_n${level}_word_review_set.json`);
        for (const [index, entry] of readJsonArray(wordPlatinumPath).entries()) {
            const sourceRowNumber = index + 1;
            const sourcePath = toRepoRelative(rootDir, wordPlatinumPath);
            const reading = getSingleReadingIncludes(entry, sourcePath, sourceRowNumber);
            const identity = buildIdentity(entry?.word, reading);
            const activeStatus = ACTIVE_WORD_PLATINUM_STATUSES.includes(normalizeText(entry?.status));
            const currentStandard = entryUsesCurrentWordPlatinumStandard(entry);
            const decisionCountsForLane = activeStatus && currentStandard;
            const generatedSurface = indexes.byWordIdentity.get(identity) || null;
            if (decisionCountsForLane && !generatedSurface) {
                throw new Error(`${sourcePath}:${sourceRowNumber} missing generated word surface for counted Platinum row ${identity}.`);
            }
            const surface = generatedSurface || buildReviewOnlySurface({
                deckKind: "word",
                level,
                written: entry?.word,
                reading,
            });
            pushDecision({
                schemaVersion: SCHEMA_VERSION,
                recordType: "review_decision",
                decisionKey: `platinum:${surface.cardKey}`,
                cardKey: surface.cardKey,
                deckKind: "word",
                level,
                levelLabel: formatLevelLabel(level),
                lane: "platinum",
                status: normalizeText(entry?.status) || "unknown",
                activeStatus,
                currentStandard,
                countsForLane: decisionCountsForLane,
                reviewStandard: normalizeText(entry?.reviewStandard) || null,
                sourcePath,
                sourceRowNumber,
                requiredPriorLane: "sapphire",
                priorLaneBindingFound: countsForLane.sapphire.has(surface.cardKey),
                humanReviewRequired: true,
                automatedApproval: false,
            });
        }
    }

    return {
        rows: rows.sort((left, right) => compareStableStrings(left.decisionKey, right.decisionKey)),
        countsForLane,
    };
}

function buildObsidianProofEventRows({ rootDir, loadProofLedgerFn = loadObsidianProofLedger, platinumCardKeys }) {
    const ledger = loadProofLedgerFn({ cwd: rootDir });
    const rows = [];
    const seenProofTargets = new Map();
    for (const event of ledger.events || []) {
        const proofTargetKey = buildObsidianProofTargetKey(event);
        addUnique(seenProofTargets, proofTargetKey, "Obsidian proof target");
        const cardKey = buildCardKey({
            deckKind: event.target.deckKind,
            level: event.target.level,
            written: event.target.written,
            reading: event.target.reading,
        });
        if (!platinumCardKeys.has(cardKey)) {
            throw new Error(`Obsidian proof target ${proofTargetKey} is not bound to active current-standard Platinum (${cardKey}).`);
        }
        rows.push({
            schemaVersion: SCHEMA_VERSION,
            recordType: "obsidian_proof_event",
            proofId: event.proofId,
            proofTargetKey,
            cardKey,
            deckKind: event.target.deckKind,
            level: event.target.level,
            levelLabel: formatLevelLabel(event.target.level),
            written: event.target.written,
            reading: event.target.reading,
            sourceReviewSetPath: event.ledger.sourceReviewSetPath,
            sourceCommit: event.ledger.sourceCommit,
            reviewedAt: event.proof.reviewedAt,
            reviewer: event.proof.reviewer,
            reviewStandard: event.proof.reviewStandard,
            result: event.proof.result,
            evidenceCheckedCount: Array.isArray(event.proof.evidenceChecked) ? event.proof.evidenceChecked.length : 0,
            platinumBindingFound: true,
            authoritySourceOfTruth: OBSIDIAN_PROOF_LEDGER_AUTHORITY.sourceOfTruth,
            authorityBoundary: OBSIDIAN_BOUNDARY_STATEMENT,
            binaryMediaExported: false,
        });
    }
    return {
        rows: rows.sort((left, right) => compareStableStrings(left.proofTargetKey, right.proofTargetKey)),
        files: ledger.files || [],
    };
}

function indexProofRowsByDeckLevel(rows) {
    const counts = new Map();
    for (const row of rows) {
        const key = `${row.deckKind}:${row.level}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function buildLaneCoverageRows({ closeoutReport, proofRows }) {
    const proofCounts = indexProofRowsByDeckLevel(proofRows);
    const rows = [];
    for (const laneRow of closeoutReport.laneRows || []) {
        for (const laneName of ["silver", "gold", "sapphire", "platinum"]) {
            const lane = laneRow.lanes[laneName];
            rows.push({
                schemaVersion: SCHEMA_VERSION,
                recordType: "lane_coverage",
                coverageKey: `${laneRow.deckKind}:n${laneRow.level}:${laneName}`,
                deckKind: laneRow.deckKind,
                level: laneRow.level,
                levelLabel: laneRow.levelLabel,
                lane: laneName,
                denominator: laneRow.denominator,
                count: lane.count,
                missing: lane.missing,
                ratio: lane.ratio,
                denominatorSource: laneRow.denominatorSource,
                countSource: laneName === "silver" ? laneRow.generated.path.replace(/\\/g, "/") : "tracked_review_set",
                complete: lane.complete,
                certificationLane: true,
                databricksTablePrefix: laneName === "silver" ? "clean_" : "mart_",
            });
        }
        const obsidianCount = proofCounts.get(`${laneRow.deckKind}:${laneRow.level}`) || 0;
        const obsidianMissing = Math.max(0, Number(laneRow.denominator || 0) - obsidianCount);
        rows.push({
            schemaVersion: SCHEMA_VERSION,
            recordType: "lane_coverage",
            coverageKey: `${laneRow.deckKind}:n${laneRow.level}:obsidian`,
            deckKind: laneRow.deckKind,
            level: laneRow.level,
            levelLabel: laneRow.levelLabel,
            lane: "obsidian",
            denominator: laneRow.denominator,
            count: obsidianCount,
            missing: obsidianMissing,
            ratio: `${obsidianCount}/${laneRow.denominator}`,
            denominatorSource: laneRow.denominatorSource,
            countSource: "templates/obsidian_proof_ledger/*.jsonl",
            complete: laneRow.denominator > 0 && obsidianMissing === 0,
            certificationLane: true,
            databricksTablePrefix: "mart_",
        });
    }
    return rows.sort((left, right) => compareStableStrings(left.coverageKey, right.coverageKey));
}

function buildExpectedBacklogRows({ closeoutReport, laneCoverageRows, sourceEvidenceRows }) {
    const rows = [];
    for (const gate of closeoutReport.expectedGates || []) {
        rows.push({
            schemaVersion: SCHEMA_VERSION,
            recordType: "expected_backlog",
            backlogKey: `${gate.deckKind}:n${gate.level}:${gate.lane}`,
            deckKind: gate.deckKind,
            level: gate.level,
            levelLabel: gate.levelLabel,
            lane: gate.lane,
            missing: gate.missing,
            denominator: Number(String(gate.ratio || "0/0").split("/")[1] || 0),
            ratio: gate.ratio,
            classification: gate.classification,
            certificationLane: true,
            command: gate.command,
            authorityBoundary: AUTHORITY_BOUNDARY_STATEMENT,
        });
    }
    for (const row of laneCoverageRows.filter((entry) => entry.lane === "obsidian")) {
        rows.push({
            schemaVersion: SCHEMA_VERSION,
            recordType: "expected_backlog",
            backlogKey: `${row.deckKind}:n${row.level}:obsidian`,
            deckKind: row.deckKind,
            level: row.level,
            levelLabel: row.levelLabel,
            lane: "obsidian",
            missing: row.missing,
            denominator: row.denominator,
            ratio: row.ratio,
            classification: row.missing > 0 ? "expected-fail-coverage" : "count-complete-proof-ledger-authority",
            certificationLane: true,
            command: row.deckKind === "kanji"
                ? "npm run deck:kanji:obsidian:certify-status"
                : "npm run deck:words:obsidian:certify-status",
            authorityBoundary: OBSIDIAN_BOUNDARY_STATEMENT,
        });
    }
    const sourceEvidenceFailing = sourceEvidenceRows.some((row) => row.scope === "audit_overall" && row.metric === "evidenceDepthValid" && row.value === false);
    rows.push({
        schemaVersion: SCHEMA_VERSION,
        recordType: "expected_backlog",
        backlogKey: "cross_deck:source_evidence:depth",
        deckKind: "cross_deck",
        level: null,
        levelLabel: null,
        lane: "source_evidence",
        missing: sourceEvidenceFailing ? 1 : 0,
        denominator: 1,
        ratio: sourceEvidenceFailing ? "0/1" : "1/1",
        classification: sourceEvidenceFailing ? "expected-source-depth-backlog" : "source-depth-audit-passing",
        certificationLane: false,
        command: "npm run data:audit:jlpt:sources && npm run data:audit:jlpt:word-sources",
        authorityBoundary: "Source evidence posture supports review governance but does not certify card lanes.",
    });
    rows.push({
        schemaVersion: SCHEMA_VERSION,
        recordType: "expected_backlog",
        backlogKey: "word:pre_silver:common_pool",
        deckKind: "word",
        level: null,
        levelLabel: null,
        lane: "pre_silver",
        missing: 0,
        denominator: 0,
        ratio: "0/0",
        classification: "discovery-pre-silver-is-not-certification",
        certificationLane: false,
        command: "npm run deck:words:pre-silver-status",
        authorityBoundary: "Discovery/pre-Silver/common-pool inventory is analytics only and is not a certification lane.",
    });
    return rows.sort((left, right) => compareStableStrings(left.backlogKey, right.backlogKey));
}

function buildSourceEvidenceSummaryRows({ rootDir }) {
    const rows = [];
    const boundary = "Source evidence summaries are governance posture only; they do not certify Silver, Gold, Sapphire, Platinum, or Obsidian lanes.";
    const kanjiContractPath = path.join(rootDir, "templates", "jlpt_level_contract.json");
    const kanjiEvidencePath = path.join(rootDir, "templates", "jlpt_kanji_source_evidence.json");
    if (fs.existsSync(kanjiContractPath) && fs.existsSync(kanjiEvidencePath)) {
        const report = auditJlptKanjiSourceEvidence({
            contract: loadJlptLevelContract(kanjiContractPath),
            evidence: loadJlptKanjiSourceEvidence(kanjiEvidencePath),
            limit: 25,
        });
        for (const metric of ["valid", "governanceValid", "evidenceDepthValid", "checked"]) {
            rows.push({
                schemaVersion: SCHEMA_VERSION,
                recordType: "source_evidence_summary",
                summaryKey: `kanji:audit_overall:${metric}`,
                deckKind: "kanji",
                scope: "audit_overall",
                level: null,
                sourceId: null,
                metric,
                value: report[metric],
                status: report[metric] === true || (metric === "checked" && report[metric] > 0) ? "passing" : "failing",
                authorityBoundary: boundary,
            });
        }
        for (const [level, summary] of Object.entries(report.byContractLevel || {})) {
            for (const [metric, value] of Object.entries(summary || {})) {
                rows.push({
                    schemaVersion: SCHEMA_VERSION,
                    recordType: "source_evidence_summary",
                    summaryKey: `kanji:by_contract_level:n${level}:${metric}`,
                    deckKind: "kanji",
                    scope: "by_contract_level",
                    level: Number(level),
                    sourceId: null,
                    metric,
                    value: Number(value || 0),
                    status: "reported",
                    authorityBoundary: boundary,
                });
            }
        }
        for (const [issue, count] of Object.entries(report.issueCounts || {})) {
            rows.push({
                schemaVersion: SCHEMA_VERSION,
                recordType: "source_evidence_summary",
                summaryKey: `kanji:issue_count:${issue}`,
                deckKind: "kanji",
                scope: "issue_count",
                level: null,
                sourceId: null,
                metric: issue,
                value: Number(count || 0),
                status: Number(count || 0) === 0 ? "clear" : "reported",
                authorityBoundary: boundary,
            });
        }
        for (const [sourceId, source] of Object.entries(report.sourceCoverage || {})) {
            rows.push({
                schemaVersion: SCHEMA_VERSION,
                recordType: "source_evidence_summary",
                summaryKey: `kanji:source_coverage:${sourceId}:assignmentCount`,
                deckKind: "kanji",
                scope: "source_coverage",
                level: null,
                sourceId,
                metric: "assignmentCount",
                value: Number(source.assignmentCount || 0),
                status: source.status || "reported",
                authorityBoundary: boundary,
            });
        }
    }

    const wordContractPath = path.join(rootDir, "templates", "jlpt_word_level_contract.json");
    const wordEvidencePath = path.join(rootDir, "templates", "jlpt_word_source_evidence.json");
    if (fs.existsSync(wordContractPath) && fs.existsSync(wordEvidencePath)) {
        const report = auditJlptWordSourceEvidence({
            contract: loadJlptWordLevelContract(wordContractPath),
            evidence: loadJlptWordSourceEvidence(wordEvidencePath),
            limit: 25,
        });
        const sourceAdequacyByLevel = buildSourceAdequacyByLevel(report);
        for (const metric of ["valid", "governanceValid", "evidenceDepthValid", "checked"]) {
            rows.push({
                schemaVersion: SCHEMA_VERSION,
                recordType: "source_evidence_summary",
                summaryKey: `word:audit_overall:${metric}`,
                deckKind: "word",
                scope: "audit_overall",
                level: null,
                sourceId: null,
                metric,
                value: report[metric],
                status: report[metric] === true || (metric === "checked" && report[metric] > 0) ? "passing" : "failing",
                authorityBoundary: boundary,
            });
        }
        for (const [level, summary] of Object.entries(sourceAdequacyByLevel || {})) {
            for (const [metric, value] of Object.entries(summary || {})) {
                rows.push({
                    schemaVersion: SCHEMA_VERSION,
                    recordType: "source_evidence_summary",
                    summaryKey: `word:by_level:n${level}:${metric}`,
                    deckKind: "word",
                    scope: "by_level",
                    level: Number(level),
                    sourceId: null,
                    metric,
                    value: typeof value === "boolean" ? value : Number(value || 0),
                    status: "reported",
                    authorityBoundary: boundary,
                });
            }
        }
        for (const [issue, count] of Object.entries(report.issueCounts || {})) {
            rows.push({
                schemaVersion: SCHEMA_VERSION,
                recordType: "source_evidence_summary",
                summaryKey: `word:issue_count:${issue}`,
                deckKind: "word",
                scope: "issue_count",
                level: null,
                sourceId: null,
                metric: issue,
                value: Number(count || 0),
                status: Number(count || 0) === 0 ? "clear" : "reported",
                authorityBoundary: boundary,
            });
        }
        for (const [sourceId, source] of Object.entries(report.sourceCoverage || {})) {
            rows.push({
                schemaVersion: SCHEMA_VERSION,
                recordType: "source_evidence_summary",
                summaryKey: `word:source_coverage:${sourceId}:assignmentCount`,
                deckKind: "word",
                scope: "source_coverage",
                level: null,
                sourceId,
                metric: "assignmentCount",
                value: Number(source.assignmentCount || 0),
                status: source.status || "reported",
                authorityBoundary: boundary,
            });
        }
    }
    return rows.sort((left, right) => compareStableStrings(left.summaryKey, right.summaryKey));
}

function extractMediaReferences(text = "") {
    const refs = [];
    const soundPattern = /\[sound:([^\]\r\n]+)\]/giu;
    const imgPattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu;
    let match = soundPattern.exec(text);
    while (match) {
        refs.push({ kind: "audio", reference: match[1] });
        match = soundPattern.exec(text);
    }
    match = imgPattern.exec(text);
    while (match) {
        refs.push({ kind: "image", reference: match[1] });
        match = imgPattern.exec(text);
    }
    return refs;
}

function walkFiles(rootDir) {
    if (!fs.existsSync(rootDir)) {
        return [];
    }
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(entryPath));
        } else if (entry.isFile()) {
            files.push(entryPath);
        }
    }
    return files;
}

function buildMediaFileIndex(rootDir) {
    const roots = [
        path.join(rootDir, "data", "media"),
        path.join(rootDir, "out", "build", "package", "media"),
        path.join(rootDir, "out", "word-build", "package", "media"),
    ];
    const index = new Map();
    for (const mediaRoot of roots) {
        for (const filePath of walkFiles(mediaRoot)) {
            const baseName = path.basename(filePath);
            if (!index.has(baseName)) {
                index.set(baseName, []);
            }
            index.get(baseName).push(filePath);
        }
    }
    return index;
}

function buildMediaAssetRows({ rootDir, cardSurfaceRows }) {
    const index = buildMediaFileIndex(rootDir);
    const rows = [];
    const seen = new Set();
    for (const surface of cardSurfaceRows) {
        for (const [fieldName, fieldValue] of Object.entries(surface.tsvFields || {})) {
            for (const ref of extractMediaReferences(fieldValue)) {
                const matches = index.get(path.basename(ref.reference)) || [];
                const resolved = matches.length === 1 ? matches[0] : null;
                const assetKey = `${surface.cardKey}:${fieldName}:${ref.kind}:${ref.reference}`;
                if (seen.has(assetKey)) {
                    continue;
                }
                seen.add(assetKey);
                rows.push({
                    schemaVersion: SCHEMA_VERSION,
                    recordType: "media_asset",
                    assetKey,
                    cardKey: surface.cardKey,
                    deckKind: surface.deckKind,
                    level: surface.level,
                    levelLabel: surface.levelLabel,
                    sourceField: fieldName,
                    referenceKind: ref.kind,
                    reference: ref.reference,
                    referencedPath: resolved ? toRepoRelative(rootDir, resolved) : null,
                    exists: Boolean(resolved),
                    sha256: resolved ? hashFile(resolved) : null,
                    bytes: resolved ? fs.statSync(resolved).size : null,
                    generatedStatus: "referenced_by_generated_card_surface",
                    binaryMediaExported: false,
                });
            }
        }
    }
    return rows.sort((left, right) => compareStableStrings(left.assetKey, right.assetKey));
}

function runGitCommand(rootDir, args, execFileSync = childProcess.execFileSync) {
    try {
        return normalizeText(execFileSync("git", args, {
            cwd: rootDir,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }));
    } catch (error) {
        return normalizeText(error.stdout || error.stderr || error.message);
    }
}

function buildRepoState(rootDir, execFileSync = childProcess.execFileSync) {
    const status = runGitCommand(rootDir, ["status", "--short", "--branch"], execFileSync);
    const head = runGitCommand(rootDir, ["rev-parse", "HEAD"], execFileSync);
    const branch = runGitCommand(rootDir, ["branch", "--show-current"], execFileSync) || "detached";
    const remoteHeadsText = runGitCommand(rootDir, ["ls-remote", "--heads", "origin"], execFileSync);
    const remoteLines = remoteHeadsText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    const originMainLine = remoteLines.find((line) => line.endsWith("refs/heads/main")) || "";
    const originMainHead = originMainLine ? originMainLine.split(/\s+/u)[0] : null;
    const remoteHeadsOnlyMain = remoteLines.length === 1 && Boolean(originMainHead);
    const localHeadEqualsOriginMain = Boolean(originMainHead && head === originMainHead);
    const clean = status.split(/\r?\n/u).slice(1).filter(Boolean).length === 0;
    let remoteStatus = "remote-head-check-failed";
    if (remoteHeadsOnlyMain && localHeadEqualsOriginMain) {
        remoteStatus = "remote-heads-only-main-and-local-head-matches-origin-main";
    } else if (remoteHeadsOnlyMain) {
        remoteStatus = "remote-heads-only-main";
    } else if (remoteLines.length > 0) {
        remoteStatus = "remote-heads-not-only-main";
    }
    return {
        branch,
        head,
        status,
        clean,
        remoteHeadCheck: {
            status: remoteStatus,
            remoteHeadsOnlyMain,
            localHeadEqualsOriginMain,
            originMainHead,
            remoteHeadCount: remoteLines.length,
        },
    };
}

function npmExecutable() {
    return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommandEvidence({ rootDir, commands = DEFAULT_COMMAND_EVIDENCE, spawnSync = childProcess.spawnSync } = {}) {
    return commands.map((command) => {
        const executable = command.command === "npm" ? npmExecutable()
            : command.command === "node" ? process.execPath
                : command.command;
        const result = spawnSync(executable, command.args, {
            cwd: rootDir,
            encoding: "utf8",
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout = result.stdout || "";
        const stderr = result.stderr || "";
        const exitCode = Number.isInteger(result.status) ? result.status : null;
        const passed = exitCode === 0 && !result.error;
        return {
            id: command.id,
            label: command.label,
            command: command.displayCommand,
            exitCode,
            status: result.error ? `error:${result.error.code || "unknown"}` : (passed ? "passed" : "failed"),
            passed,
            stdoutSha256: sha256Text(stdout),
            stderrSha256: sha256Text(stderr),
            stdoutLineCount: stdout.trim() ? stdout.trim().split(/\r?\n/u).length : 0,
            stderrLineCount: stderr.trim() ? stderr.trim().split(/\r?\n/u).length : 0,
        };
    });
}

function countRowsByDeckKind(cardSurfaceRows, deckKind) {
    return cardSurfaceRows.filter((row) => row.deckKind === deckKind).length;
}

function countRowsByDeckKindLevel(rows, deckKind, level) {
    return rows.filter((row) => row.deckKind === deckKind && Number(row.level) === Number(level)).length;
}

function addFinding(findings, key, passed, invariant, observed, expected, severity = "error") {
    findings.push({
        schemaVersion: SCHEMA_VERSION,
        recordType: "data_quality_finding",
        findingKey: key,
        severity,
        status: passed ? "passed" : "failed",
        invariant,
        observed,
        expected,
        authorityBoundary: AUTHORITY_BOUNDARY_STATEMENT,
    });
}

function validateCountPreservation({ closeoutReport, cardSurfaceRows, reviewDecisionRows, proofRows, laneCoverageRows, commandEvidence }) {
    const findings = [];
    addFinding(
        findings,
        "commands:required-evidence-passed",
        commandEvidence.every((command) => command.passed),
        "Required orientation commands must pass for a complete snapshot.",
        commandEvidence.filter((command) => !command.passed).length,
        0,
        "warning"
    );
    for (const laneRow of closeoutReport.laneRows || []) {
        const generatedCount = countRowsByDeckKindLevel(cardSurfaceRows, laneRow.deckKind, laneRow.level);
        addFinding(
            findings,
            `${laneRow.deckKind}:n${laneRow.level}:generated-count-preserved`,
            generatedCount === laneRow.generated.count,
            "Generated TSV rows must match closeout generated counts.",
            generatedCount,
            laneRow.generated.count
        );
        for (const laneName of ["gold", "sapphire", "platinum"]) {
            const reviewedCount = reviewDecisionRows.filter((row) => (
                row.deckKind === laneRow.deckKind
                && row.level === laneRow.level
                && row.lane === laneName
                && row.countsForLane
            )).length;
            addFinding(
                findings,
                `${laneRow.deckKind}:n${laneRow.level}:${laneName}-count-preserved`,
                reviewedCount === laneRow.lanes[laneName].count,
                "Review decision rows must match closeout lane counts.",
                reviewedCount,
                laneRow.lanes[laneName].count
            );
        }
        const obsidianCoverage = laneCoverageRows.find((row) => (
            row.deckKind === laneRow.deckKind
            && row.level === laneRow.level
            && row.lane === "obsidian"
        ));
        const proofCount = countRowsByDeckKindLevel(proofRows, laneRow.deckKind, laneRow.level);
        addFinding(
            findings,
            `${laneRow.deckKind}:n${laneRow.level}:obsidian-proof-count-preserved`,
            proofCount === obsidianCoverage.count,
            "Obsidian coverage must be counted only from canonical proof events.",
            proofCount,
            obsidianCoverage.count
        );
        for (const laneName of ["silver", "gold", "sapphire", "platinum", "obsidian"]) {
            const coverage = laneCoverageRows.find((row) => (
                row.deckKind === laneRow.deckKind
                && row.level === laneRow.level
                && row.lane === laneName
            ));
            addFinding(
                findings,
                `${laneRow.deckKind}:n${laneRow.level}:${laneName}-denominator-not-reduced`,
                coverage.denominator === laneRow.denominator && coverage.count <= coverage.denominator,
                "Snapshot lane denominators must preserve closeout denominators and counts must not exceed denominators.",
                coverage.denominator,
                laneRow.denominator
            );
        }
    }
    const missingPriorBindings = reviewDecisionRows.filter((row) => row.countsForLane && !row.priorLaneBindingFound);
    addFinding(
        findings,
        "review-decisions:prior-lane-bindings",
        missingPriorBindings.length === 0,
        "Active counted review decisions must bind to the prior certification lane.",
        missingPriorBindings.length,
        0
    );
    addFinding(
        findings,
        "proof-events:platinum-plus-proof-boundary",
        proofRows.every((row) => row.platinumBindingFound === true),
        "A card cannot be Obsidian unless it is Platinum plus explicit proof.",
        proofRows.filter((row) => row.platinumBindingFound !== true).length,
        0
    );
    return findings;
}

function rowCountForJson(value) {
    if (Array.isArray(value)) {
        return value.length;
    }
    if (value && typeof value === "object") {
        return Object.keys(value).length;
    }
    return 1;
}

function countInputRows(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    const ext = path.extname(filePath);
    if (ext === ".jsonl" || ext === ".ndjson") {
        return fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter((line) => line.trim()).length;
    }
    if (ext === ".tsv") {
        return Math.max(0, fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean).length - 1);
    }
    if (ext === ".json") {
        return rowCountForJson(readJsonFile(filePath, { label: filePath }));
    }
    return null;
}

function buildInputFileInventory(rootDir, files) {
    const unique = [...new Set(files.map((file) => path.resolve(file)))].sort(compareStableStrings);
    return unique.map((file) => {
        const exists = fs.existsSync(file);
        return {
            path: toRepoRelative(rootDir, file),
            exists,
            sha256: exists ? hashFile(file) : null,
            bytes: exists ? fs.statSync(file).size : null,
            rowCount: exists ? countInputRows(file) : null,
        };
    });
}

function collectInputFiles({ rootDir, levels, proofLedgerFiles }) {
    const files = [
        path.join(rootDir, "templates", "jlpt_level_contract.json"),
        path.join(rootDir, "templates", "jlpt_word_level_contract.json"),
        path.join(rootDir, "templates", "jlpt_kanji_source_evidence.json"),
        path.join(rootDir, "templates", "jlpt_word_source_evidence.json"),
        path.join(rootDir, "data", "kanji_jlpt_only.json"),
        ...proofLedgerFiles,
    ];
    for (const level of levels) {
        files.push(
            path.join(rootDir, "out", "build", "exports", `jlpt-n${level}.tsv`),
            path.join(rootDir, "out", "word-build", "exports", `jlpt-n${level}-words.tsv`),
            path.join(rootDir, "templates", `golden_n${level}_review_set.json`),
            path.join(rootDir, "templates", `golden_n${level}_word_review_set.json`),
            path.join(rootDir, "templates", `sapphire_n${level}_review_set.json`),
            path.join(rootDir, "templates", `sapphire_n${level}_word_review_set.json`),
            path.join(rootDir, "templates", `platinum_n${level}_review_set.json`),
            path.join(rootDir, "templates", `platinum_n${level}_word_review_set.json`)
        );
    }
    return files.filter((file) => fs.existsSync(file));
}

function validateRows(fileName, rows) {
    const schema = rowSchemas[fileName];
    for (const [index, row] of rows.entries()) {
        try {
            schema.parse(row);
        } catch (error) {
            throw new Error(`${fileName}:${index + 1} schema validation failed: ${error.message}`);
        }
    }
}

function writeNdjson(filePath, rows) {
    const text = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
    writeFileAtomicSync(filePath, text, "utf8");
}

function buildOutputInventory(rootDir, outputDir, fileRows) {
    return REQUIRED_OUTPUT_FILES.map((fileName) => {
        const filePath = path.join(outputDir, fileName);
        return {
            path: toRepoRelative(rootDir, filePath),
            sha256: hashFile(filePath),
            bytes: fs.statSync(filePath).size,
            rowCount: fileRows[fileName].length,
        };
    });
}

function summarizeCounts({ cardSurfaceRows, reviewDecisionRows, proofRows, laneCoverageRows }) {
    return {
        kanjiGenerated: countRowsByDeckKind(cardSurfaceRows, "kanji"),
        wordGenerated: countRowsByDeckKind(cardSurfaceRows, "word"),
        totalGenerated: cardSurfaceRows.length,
        kanjiProofEvents: countRowsByDeckKind(proofRows, "kanji"),
        wordProofEvents: countRowsByDeckKind(proofRows, "word"),
        totalProofEvents: proofRows.length,
        reviewDecisions: reviewDecisionRows.length,
        laneCoverageRows: laneCoverageRows.length,
    };
}

function classifyCompleteness({ commandEvidence, dataQualityFindings }) {
    if (dataQualityFindings.some((finding) => finding.severity === "error" && finding.status === "failed")) {
        return "blocked";
    }
    if (commandEvidence.some((command) => !command.passed)) {
        return "partial";
    }
    return "complete";
}

function defaultCloseoutReport({ rootDir, levels, execFileSync }) {
    return buildDeckCloseoutStatus({
        rootDir,
        levels,
        execFileSync,
    });
}

function loadMediaDatasetIfAvailable(rootDir) {
    const config = loadConfig({ cwd: rootDir });
    if (!fs.existsSync(config.jlptJsonPath)) {
        return {};
    }
    return loadJlptOnlyJson(config.jlptJsonPath, {
        contractPath: path.join(rootDir, "templates", "jlpt_level_contract.json"),
    });
}

function buildDatabricksSnapshot({
    rootDir = process.cwd(),
    snapshotId,
    levels = DEFAULT_LEVELS,
    now = () => new Date(),
    execFileSync = childProcess.execFileSync,
    runCommandEvidenceFn = runCommandEvidence,
    buildCloseoutReportFn = defaultCloseoutReport,
    loadProofLedgerFn = loadObsidianProofLedger,
    buildSourceEvidenceSummaryRowsFn = buildSourceEvidenceSummaryRows,
    buildMediaAssetRowsFn = buildMediaAssetRows,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const safeSnapshotId = parseSnapshotId(snapshotId);
    const outputDir = resolveSnapshotDir(resolvedRoot, safeSnapshotId);
    if (fs.existsSync(outputDir)) {
        throw new Error(`Refusing to overwrite existing Databricks snapshot directory: ${outputDir}`);
    }

    // Validate configured kanji runtime data when available; the returned object is not exported directly.
    loadMediaDatasetIfAvailable(resolvedRoot);

    const normalizedLevels = [...levels].map(Number).sort((left, right) => right - left);
    const closeoutReport = buildCloseoutReportFn({ rootDir: resolvedRoot, levels: normalizedLevels, execFileSync });
    const commandEvidence = runCommandEvidenceFn({ rootDir: resolvedRoot });
    const cardSurfaceRows = buildCardSurfaceRows({ rootDir: resolvedRoot, levels: normalizedLevels });
    const reviewDecisionResult = buildReviewDecisionRows({ rootDir: resolvedRoot, levels: normalizedLevels, cardSurfaceRows });
    const proofResult = buildObsidianProofEventRows({
        rootDir: resolvedRoot,
        loadProofLedgerFn,
        platinumCardKeys: reviewDecisionResult.countsForLane.platinum,
    });
    const laneCoverageRows = buildLaneCoverageRows({
        closeoutReport,
        proofRows: proofResult.rows,
    });
    const sourceEvidenceRows = buildSourceEvidenceSummaryRowsFn({ rootDir: resolvedRoot });
    const mediaAssetRows = buildMediaAssetRowsFn({
        rootDir: resolvedRoot,
        cardSurfaceRows,
    });
    const expectedBacklogRows = buildExpectedBacklogRows({
        closeoutReport,
        laneCoverageRows,
        sourceEvidenceRows,
    });
    const dataQualityFindings = validateCountPreservation({
        closeoutReport,
        cardSurfaceRows,
        reviewDecisionRows: reviewDecisionResult.rows,
        proofRows: proofResult.rows,
        laneCoverageRows,
        commandEvidence,
    });
    addFinding(
        dataQualityFindings,
        "media-assets:no-binary-export",
        mediaAssetRows.every((row) => row.binaryMediaExported === false && !Object.prototype.hasOwnProperty.call(row, "content")),
        "Snapshot must export media metadata only, never binary payloads.",
        mediaAssetRows.filter((row) => row.binaryMediaExported !== false || Object.prototype.hasOwnProperty.call(row, "content")).length,
        0
    );
    const failedErrors = dataQualityFindings.filter((finding) => finding.severity === "error" && finding.status === "failed");
    if (failedErrors.length > 0) {
        const first = failedErrors[0];
        throw new Error(`Databricks snapshot invariant failed: ${first.findingKey} (${first.observed} !== ${first.expected}).`);
    }

    const fileRows = {
        "card_surfaces.ndjson": cardSurfaceRows,
        "lane_coverage.ndjson": laneCoverageRows,
        "review_decisions.ndjson": reviewDecisionResult.rows,
        "obsidian_proof_events.ndjson": proofResult.rows,
        "source_evidence_summary.ndjson": sourceEvidenceRows,
        "media_assets.ndjson": mediaAssetRows,
        "expected_backlog.ndjson": expectedBacklogRows,
        "data_quality_findings.ndjson": dataQualityFindings.sort((left, right) => compareStableStrings(left.findingKey, right.findingKey)),
    };

    for (const [fileName, rows] of Object.entries(fileRows)) {
        validateRows(fileName, rows);
    }

    ensureDir(outputDir);
    for (const fileName of REQUIRED_OUTPUT_FILES) {
        writeNdjson(path.join(outputDir, fileName), fileRows[fileName]);
    }
    const outputFiles = buildOutputInventory(resolvedRoot, outputDir, fileRows);
    const inputFiles = buildInputFileInventory(resolvedRoot, collectInputFiles({
        rootDir: resolvedRoot,
        levels: normalizedLevels,
        proofLedgerFiles: proofResult.files,
    }));
    const repo = buildRepoState(resolvedRoot, execFileSync);
    const completeness = classifyCompleteness({
        commandEvidence,
        dataQualityFindings: fileRows["data_quality_findings.ndjson"],
    });
    const manifest = {
        schemaVersion: SNAPSHOT_SCHEMA_NAME,
        snapshotId: safeSnapshotId,
        createdAt: new Date(now()).toISOString(),
        repo,
        commandEvidence,
        inputs: {
            files: inputFiles,
        },
        outputs: {
            directory: toRepoRelative(resolvedRoot, outputDir),
            files: outputFiles,
        },
        counts: summarizeCounts({
            cardSurfaceRows,
            reviewDecisionRows: reviewDecisionResult.rows,
            proofRows: proofResult.rows,
            laneCoverageRows,
        }),
        authorityBoundary: AUTHORITY_BOUNDARY_STATEMENT,
        knownExpectedBacklogClassification: "expected_backlog.ndjson separates certification gaps, source-depth posture, and pre-Silver discovery without changing denominators.",
        snapshotCompletenessStatus: completeness,
    };
    manifestSchema.parse(manifest);
    writeFileAtomicSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return {
        snapshotId: safeSnapshotId,
        outputDir,
        manifest,
        files: ["manifest.json", ...REQUIRED_OUTPUT_FILES],
    };
}

module.exports = {
    AUTHORITY_BOUNDARY_STATEMENT,
    OBSIDIAN_BOUNDARY_STATEMENT,
    REQUIRED_OUTPUT_FILES,
    SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_NAME,
    buildCardKey,
    buildDatabricksSnapshot,
    buildMediaAssetRows,
    buildReviewDecisionRows,
    parseSnapshotId,
    parseTsvRows,
    resolveSnapshotDir,
    runCommandEvidence,
};
