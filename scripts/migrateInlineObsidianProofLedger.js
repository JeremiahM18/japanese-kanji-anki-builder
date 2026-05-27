const fs = require("node:fs");
const path = require("node:path");

const {
    OBSIDIAN_PROOF_EVENT_RECORD_TYPE,
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
    OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION,
    parseObsidianProofLedgerEvent,
} = require("../src/datasets/obsidianProofLedger");
const {
    buildObsidianProofReconciliationReport,
} = require("../src/services/obsidianProofReconciliationService");
const {
    getReviewSetRelativePath,
} = require("../src/services/obsidianProofCompatibilityViewService");
const {
    deriveSentenceQualityReview,
    getInlineProvenanceNormalizationStats,
    hasStrictSentenceQualityReviewShape,
    normalizeInlineProvenance,
} = require("../src/services/obsidianProofInlineProvenanceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    ensureDir,
    isPathInside,
} = require("../src/utils/fs");
const {
    loadConfig,
} = require("../src/config");
const {
    buildWordRowsForLevel,
} = require("./reviewPlatinumWordLevel");

const DEFAULT_RECORDED_BY = "codex-inline-proof-migration";
const DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR = path.join("templates", "obsidian_proof_ledger");

function parseArgs(argv) {
    const options = {
        write: false,
        updateSourceReviewSet: false,
        deckKind: "kanji",
        levels: [3],
        ledgerDir: DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR,
        sourceCommit: undefined,
        recordedAt: undefined,
        recordedBy: DEFAULT_RECORDED_BY,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--update-source-review-set") {
            options.updateSourceReviewSet = true;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--deck-kind=")) {
            options.deckKind = parseStringOption(arg, "deck-kind").trim();
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseStringOption(arg, "levels")
                .split(",")
                .map((value) => Number(value.trim()))
                .filter((value) => Number.isInteger(value));
        } else if (arg.startsWith("--ledger-dir=")) {
            options.ledgerDir = parseStringOption(arg, "ledger-dir").trim();
        } else if (arg.startsWith("--source-commit=")) {
            options.sourceCommit = parseStringOption(arg, "source-commit").trim();
        } else if (arg.startsWith("--recorded-at=")) {
            options.recordedAt = parseStringOption(arg, "recorded-at").trim();
        } else if (arg.startsWith("--recorded-by=")) {
            options.recordedBy = parseStringOption(arg, "recorded-by").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readJsonArray(filePath) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in review set: ${filePath}`);
    }
    return parsed;
}

function writeJsonFile(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonlFile(filePath, events) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
}

function normalizeRecordDate(value) {
    const normalized = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw new Error(`--recorded-at must be YYYY-MM-DD: ${value}`);
    }
    return normalized;
}

function normalizeSourceCommit(value) {
    const normalized = String(value || "").trim();
    if (!/^[a-f0-9]{7,40}$/i.test(normalized)) {
        throw new Error(`--source-commit must be a 7-40 character git commit hash: ${value}`);
    }
    return normalized;
}

function parseCardReviewed(value) {
    const normalized = String(value || "").trim();
    const separator = normalized.indexOf("|");
    if (separator <= 0 || separator === normalized.length - 1) {
        throw new Error(`rereviewProvenance.cardReviewed must use written|reading identity: ${value}`);
    }
    return {
        written: normalized.slice(0, separator),
        reading: normalized.slice(separator + 1),
        cardReviewed: normalized,
    };
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function deriveWordCardReviewed(entry = {}) {
    const word = normalizeText(entry.word || entry.written || entry.displayWord);
    const readings = normalizeStringArray(entry.readingIncludes);
    if (!word || readings.length !== 1) {
        throw new Error(`Cannot derive exact word proof target for ${word || "(missing word)"}.`);
    }
    return `${word}|${readings[0]}`;
}

function normalizeWordProvenanceCardReviewed(provenance = {}) {
    const value = provenance.cardReviewed;
    if (typeof value === "string") {
        return normalizeText(value);
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const word = normalizeText(value.word || value.written);
        const reading = normalizeText(value.reading);
        return word && reading ? `${word}|${reading}` : "";
    }
    return "";
}

function buildWordRowMap(rows = []) {
    return new Map((Array.isArray(rows) ? rows : [])
        .filter((row) => normalizeText(row.word) && normalizeText(row.reading))
        .map((row) => [`${normalizeText(row.word)}|${normalizeText(row.reading)}`, row]));
}

function buildProofFromProvenance(provenance = {}) {
    return {
        type: provenance.type,
        reviewStandard: provenance.reviewStandard,
        reviewedAt: provenance.reviewedAt,
        reviewer: provenance.reviewer,
        reviewedAfterStandard: provenance.reviewedAfterStandard,
        mechanicalMigration: provenance.mechanicalMigration,
        result: provenance.result,
        scope: provenance.scope,
        cardReviewed: provenance.cardReviewed,
        evidenceChecked: provenance.evidenceChecked,
        limitationDecision: provenance.limitationDecision,
        sentenceQualityReview: provenance.sentenceQualityReview,
    };
}

function batchSequenceFromId(batchId) {
    const match = /batch-(\d{3})$/.exec(batchId);
    return match ? Number(match[1]) : undefined;
}

function proofIdPrefix({ deckKind, level, batchId }) {
    const batchMatch = /obsidian-rereview-batch-(\d{3})$/.exec(batchId);
    if (batchMatch) {
        return `${deckKind}-n${level}-obsidian-${batchMatch[1]}`;
    }
    const slug = batchId
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${deckKind}-n${level}-${slug}`;
}

function assignProofIds(records = []) {
    const positionsByPrefix = new Map();
    return records.map((record) => {
        const prefix = proofIdPrefix({
            deckKind: record.target.deckKind,
            level: record.target.level,
            batchId: record.batch.id,
        });
        const nextPosition = (positionsByPrefix.get(prefix) || 0) + 1;
        positionsByPrefix.set(prefix, nextPosition);
        return {
            ...record,
            proofId: `${prefix}-${String(nextPosition).padStart(2, "0")}`,
        };
    });
}

function assertSafeLedgerOutputPath({ cwd, ledgerDir, outputPath }) {
    const resolvedLedgerDir = path.resolve(cwd, ledgerDir);
    const resolvedOutputPath = path.resolve(cwd, outputPath);
    if (!resolvedLedgerDir.endsWith(path.join("templates", "obsidian_proof_ledger"))) {
        throw new Error(`Ledger migration output must stay in templates/obsidian_proof_ledger: ${ledgerDir}`);
    }
    if (!isPathInside(resolvedOutputPath, resolvedLedgerDir)) {
        throw new Error(`Refusing to write ledger output outside ${resolvedLedgerDir}: ${resolvedOutputPath}`);
    }
    return resolvedOutputPath;
}

function buildMigrationForReviewSet({
    cwd,
    deckKind,
    level,
    ledgerDir,
    recordedAt,
    recordedBy,
    sourceCommit,
    rows = [],
}) {
    const sourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
    const resolvedSourceReviewSetPath = path.resolve(cwd, sourceReviewSetPath);
    const entries = readJsonArray(resolvedSourceReviewSetPath);
    const sourceEntries = [];
    const draftEvents = [];
    let normalizedSentenceQualityReviews = 0;
    let sanitizedSentenceQualityReviews = 0;
    let normalizedCardReviewed = 0;
    let normalizedLimitationDecisions = 0;
    let normalizedResults = 0;
    const targetKeys = new Set();
    const duplicateTargets = new Set();
    const rowMap = deckKind === "word" ? buildWordRowMap(rows) : new Map();

    for (const entry of entries) {
        if (!entry.rereviewProvenance) {
            sourceEntries.push(entry);
            continue;
        }

        const cardReviewed = (deckKind === "word"
            ? normalizeWordProvenanceCardReviewed(entry.rereviewProvenance)
            : normalizeText(entry.rereviewProvenance.cardReviewed))
            || (deckKind === "word" ? deriveWordCardReviewed(entry) : "");
        const target = {
            deckKind,
            level,
            ...parseCardReviewed(cardReviewed),
        };
        if (deckKind === "kanji" && entry.kanji !== target.written) {
            throw new Error(`Kanji entry ${entry.kanji} does not match proof target ${target.written}.`);
        }
        if (deckKind === "word") {
            if (entry.word !== target.written) {
                throw new Error(`Word entry ${entry.word} does not match proof target ${target.written}.`);
            }
            if (!normalizeStringArray(entry.readingIncludes).includes(target.reading)) {
                throw new Error(`Word entry ${entry.word}|${normalizeStringArray(entry.readingIncludes).join(" / ")} does not match proof target ${target.cardReviewed}.`);
            }
        }

        const targetKey = `${target.deckKind}:n${target.level}:${target.cardReviewed}`;
        if (targetKeys.has(targetKey)) {
            duplicateTargets.add(targetKey);
        }
        targetKeys.add(targetKey);

        const row = rowMap.get(target.cardReviewed);
        if (deckKind === "word" && !row && !entry.rereviewProvenance.sentenceQualityReview) {
            throw new Error(`Missing live generated row needed to derive word sentence-quality proof for ${target.cardReviewed}.`);
        }
        const context = {
            cardReviewed: target.cardReviewed,
            deckKind,
            entry,
            level,
            row,
        };
        const normalizationStats = getInlineProvenanceNormalizationStats(entry.rereviewProvenance, context);
        const provenance = normalizeInlineProvenance(entry.rereviewProvenance, {
            ...context,
        });
        target.cardReviewed = provenance.cardReviewed;
        if (normalizationStats.normalizedSentenceQualityReview) {
            normalizedSentenceQualityReviews += 1;
        } else if (normalizationStats.sanitizedSentenceQualityReview) {
            sanitizedSentenceQualityReviews += 1;
        }
        if (normalizationStats.normalizedCardReviewed) {
            normalizedCardReviewed += 1;
        }
        if (normalizationStats.normalizedLimitationDecision) {
            normalizedLimitationDecisions += 1;
        }
        if (normalizationStats.normalizedResult) {
            normalizedResults += 1;
        }

        const draftEvent = {
            schemaVersion: OBSIDIAN_PROOF_LEDGER_SCHEMA_VERSION,
            recordType: OBSIDIAN_PROOF_EVENT_RECORD_TYPE,
            proofId: "pending",
            target,
            batch: {
                id: provenance.batchId,
                ...(batchSequenceFromId(provenance.batchId)
                    ? { sequence: batchSequenceFromId(provenance.batchId) }
                    : {}),
            },
            proof: buildProofFromProvenance(provenance),
            authority: OBSIDIAN_PROOF_LEDGER_AUTHORITY,
            ledger: {
                recordedAt,
                recordedBy,
                sourceReviewSetPath,
                sourceCommit,
                representationMigration: true,
            },
        };
        draftEvents.push(draftEvent);
        sourceEntries.push({
            ...entry,
            rereviewProvenance: provenance,
        });
    }
    if (duplicateTargets.size > 0) {
        throw new Error(`Duplicate Obsidian proof migration targets for ${deckKind}:N${level}: ${[...duplicateTargets].sort().join(", ")}`);
    }

    const events = assignProofIds(draftEvents).map((event) => parseObsidianProofLedgerEvent(event));
    const outputRelativePath = path.join(ledgerDir, `${deckKind}_n${level}.jsonl`);
    const outputPath = assertSafeLedgerOutputPath({
        cwd,
        ledgerDir,
        outputPath: outputRelativePath,
    });

    return {
        deckKind,
        level,
        sourceReviewSetPath,
        resolvedSourceReviewSetPath,
        outputRelativePath: outputRelativePath.replace(/\\/g, "/"),
        outputPath,
        sourceEntries,
        events,
        inlineProofs: events.length,
        missingCardIdentityBindings: 0,
        missingReleaseQualitySentenceReviews: 0,
        duplicateTargets: [],
        normalizedSentenceQualityReviews,
        sanitizedSentenceQualityReviews,
        normalizedCardReviewed,
        normalizedLimitationDecisions,
        normalizedResults,
        batches: events.reduce((acc, event) => {
            acc[event.batch.id] = (acc[event.batch.id] || 0) + 1;
            return acc;
        }, {}),
    };
}

async function buildRowsForMigration({
    deckKind,
    level,
    config,
    wordRowsByLevel = {},
} = {}) {
    if (deckKind !== "word") {
        return [];
    }
    if (wordRowsByLevel instanceof Map && wordRowsByLevel.has(level)) {
        return wordRowsByLevel.get(level);
    }
    if (Object.prototype.hasOwnProperty.call(wordRowsByLevel, level)) {
        return wordRowsByLevel[level];
    }
    return buildWordRowsForLevel({ level, config });
}

async function buildInlineObsidianProofLedgerMigration(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const deckKind = options.deckKind || "kanji";
    const levels = Array.isArray(options.levels) && options.levels.length > 0 ? options.levels : [3];
    const ledgerDir = options.ledgerDir || DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR;
    const recordedAt = normalizeRecordDate(options.recordedAt || new Date().toISOString().slice(0, 10));
    const recordedBy = String(options.recordedBy || DEFAULT_RECORDED_BY).trim();
    const sourceCommit = normalizeSourceCommit(options.sourceCommit || "0000000");
    if (!["kanji", "word"].includes(deckKind)) {
        throw new Error(`Unsupported inline Obsidian proof migration deck kind: ${deckKind}`);
    }
    if (!recordedBy) {
        throw new Error("--recorded-by must be non-empty.");
    }

    const config = options.config || loadConfig();
    const migrations = [];
    for (const level of levels) {
        const rows = await buildRowsForMigration({
            deckKind,
            level,
            config,
            wordRowsByLevel: options.wordRowsByLevel,
        });
        migrations.push(buildMigrationForReviewSet({
            cwd,
            deckKind,
            level,
            ledgerDir,
            recordedAt,
            recordedBy,
            sourceCommit,
            rows,
        }));
    }

    return {
        passed: true,
        write: options.write === true,
        updateSourceReviewSet: options.updateSourceReviewSet === true,
        ledgerDir,
        recordedAt,
        recordedBy,
        sourceCommit,
        levels,
        reviewSets: migrations.map((migration) => ({
            deckKind: migration.deckKind,
            level: migration.level,
            sourceReviewSetPath: migration.sourceReviewSetPath,
            ledgerOutputPath: migration.outputRelativePath,
            inlineProofs: migration.inlineProofs,
            missingCardIdentityBindings: migration.missingCardIdentityBindings,
            missingReleaseQualitySentenceReviews: migration.missingReleaseQualitySentenceReviews,
            duplicateTargets: migration.duplicateTargets.length,
            normalizedCardReviewed: migration.normalizedCardReviewed,
            normalizedLimitationDecisions: migration.normalizedLimitationDecisions,
            normalizedResults: migration.normalizedResults,
            normalizedSentenceQualityReviews: migration.normalizedSentenceQualityReviews,
            sanitizedSentenceQualityReviews: migration.sanitizedSentenceQualityReviews,
            batches: migration.batches,
        })),
        events: migrations.flatMap((migration) => migration.events),
        migrations,
        failures: [],
    };
}

function writeInlineObsidianProofLedgerMigration(report = {}) {
    for (const migration of report.migrations || []) {
        writeJsonlFile(migration.outputPath, migration.events);
        if (report.updateSourceReviewSet) {
            writeJsonFile(migration.resolvedSourceReviewSetPath, migration.sourceEntries);
        }
    }
}

async function runInlineObsidianProofLedgerMigration(options = {}) {
    const report = await buildInlineObsidianProofLedgerMigration(options);
    if (options.write) {
        writeInlineObsidianProofLedgerMigration(report);
        const reconciliation = buildObsidianProofReconciliationReport({
            cwd: options.cwd,
            ledgerDir: options.ledgerDir,
            deckKinds: [options.deckKind || "kanji"],
            levels: report.levels,
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

function formatMigrationReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Inline Obsidian Proof Ledger Migration",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Mode: ${report.write ? "write" : "dry-run"}`,
        `Update source review set: ${report.updateSourceReviewSet ? "yes" : "no"}`,
        `Ledger directory: ${report.ledgerDir}`,
        `Source commit: ${report.sourceCommit}`,
        `Recorded at: ${report.recordedAt}`,
        `Recorded by: ${report.recordedBy}`,
        "",
        "Authority boundary:",
        "- This is a representation migration from tracked inline rereviewProvenance into canonical JSONL ledger events.",
        "- It does not create new Obsidian certification, Japanese-source evidence, NLP certification, generated TSV authority, APKG authority, or release readiness.",
    ];

    for (const reviewSet of report.reviewSets || []) {
        lines.push(
            "",
            `${reviewSet.deckKind}:N${reviewSet.level}`,
            `- Source review set: ${reviewSet.sourceReviewSetPath}`,
            `- Ledger output: ${reviewSet.ledgerOutputPath}`,
            `- Inline proofs migrated: ${reviewSet.inlineProofs}`,
            `- Missing card identity bindings: ${reviewSet.missingCardIdentityBindings}`,
            `- Missing release-quality sentence reviews: ${reviewSet.missingReleaseQualitySentenceReviews}`,
            `- Duplicate targets: ${reviewSet.duplicateTargets}`,
            `- Card identity objects normalized from tracked word identity: ${reviewSet.normalizedCardReviewed}`,
            `- Limitation decisions normalized from tracked evidence: ${reviewSet.normalizedLimitationDecisions}`,
            `- Result fields normalized from active Platinum status: ${reviewSet.normalizedResults}`,
            `- Sentence-quality objects normalized from existing evidence lines: ${reviewSet.normalizedSentenceQualityReviews}`,
            `- Sentence-quality objects sanitized to canonical schema: ${reviewSet.sanitizedSentenceQualityReviews}`,
            "- Batches:",
            ...Object.entries(reviewSet.batches || {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([batchId, count]) => `  - ${batchId}: ${count}`)
        );
    }

    if (report.reconciliation) {
        lines.push(
            "",
            "Post-write reconciliation:",
            `- Result: ${report.reconciliation.passed ? "passing" : "failing"}`,
            `- Inline proofs: ${report.reconciliation.totals?.inlineProofs || 0}`,
            `- Ledger proofs: ${report.reconciliation.totals?.ledgerProofs || 0}`,
            `- Mismatches: ${report.reconciliation.totals?.proofMismatches || 0}`
        );
    }

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:obsidian:proof:migrate-inline", options.unknownArgs);
    if (options.write && !options.sourceCommit) {
        throw new Error("--source-commit is required when --write is set.");
    }
    const report = await runInlineObsidianProofLedgerMigration(options);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatMigrationReport(report));
    }
    if (!report.passed) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR,
    buildInlineObsidianProofLedgerMigration,
    deriveSentenceQualityReview,
    formatMigrationReport,
    hasStrictSentenceQualityReviewShape,
    normalizeInlineProvenance,
    parseArgs,
    runInlineObsidianProofLedgerMigration,
    writeInlineObsidianProofLedgerMigration,
};
