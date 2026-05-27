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
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    ensureDir,
    isPathInside,
} = require("../src/utils/fs");

const DEFAULT_RECORDED_BY = "codex-inline-proof-migration";
const DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR = path.join("templates", "obsidian_proof_ledger");
const SENTENCE_QUALITY_PREFIX = "actual example sentence quality review:";

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

function deriveSentenceQualityReview(provenance = {}, { cardReviewed, level }) {
    if (provenance.sentenceQualityReview) {
        return sanitizeSentenceQualityReview(provenance.sentenceQualityReview, { cardReviewed, level });
    }

    const evidenceLine = (provenance.evidenceChecked || []).find((entry) => (
        String(entry).startsWith(SENTENCE_QUALITY_PREFIX)
    ));
    if (!evidenceLine) {
        throw new Error(`Missing sentenceQualityReview and parseable sentence quality evidence for ${cardReviewed}.`);
    }

    const match = /^actual example sentence quality review: (.+?) \/ (.+?) \/ (.+?); (.+)$/.exec(evidenceLine);
    if (!match) {
        throw new Error(`Could not parse sentence quality evidence for ${cardReviewed}: ${evidenceLine}`);
    }

    return {
        example: match[1],
        reading: match[2],
        translation: match[3],
        naturalJapanese: true,
        learnerUseful: true,
        levelAppropriate: true,
        supportOnly: true,
        reviewerJudgment: match[4],
    };
}

function sanitizeSentenceQualityReview(review = {}, { cardReviewed }) {
    const sanitized = {
        example: review.example,
        reading: review.reading,
        translation: review.translation,
        naturalJapanese: review.naturalJapanese,
        learnerUseful: review.learnerUseful,
        levelAppropriate: review.levelAppropriate,
        supportOnly: review.supportOnly,
        reviewerJudgment: review.reviewerJudgment,
    };
    for (const [key, value] of Object.entries(sanitized)) {
        if (value === undefined) {
            throw new Error(`sentenceQualityReview.${key} is missing for ${cardReviewed}.`);
        }
    }
    return sanitized;
}

function hasStrictSentenceQualityReviewShape(review = {}) {
    const expectedKeys = [
        "example",
        "learnerUseful",
        "levelAppropriate",
        "naturalJapanese",
        "reading",
        "reviewerJudgment",
        "supportOnly",
        "translation",
    ];
    const actualKeys = Object.keys(review || {}).sort();
    return expectedKeys.length === actualKeys.length
        && expectedKeys.every((key, index) => actualKeys[index] === key);
}

function normalizeInlineProvenance(provenance = {}, context = {}) {
    const normalized = {
        ...provenance,
        sentenceQualityReview: deriveSentenceQualityReview(provenance, context),
    };
    if (!normalized.batchId) {
        throw new Error(`Missing rereviewProvenance.batchId for ${context.cardReviewed}.`);
    }
    return normalized;
}

function buildProofFromProvenance(provenance = {}) {
    const proof = { ...provenance };
    delete proof.batchId;
    return proof;
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
}) {
    const sourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
    const resolvedSourceReviewSetPath = path.resolve(cwd, sourceReviewSetPath);
    const entries = readJsonArray(resolvedSourceReviewSetPath);
    const sourceEntries = [];
    const draftEvents = [];
    let normalizedSentenceQualityReviews = 0;
    let sanitizedSentenceQualityReviews = 0;

    for (const entry of entries) {
        if (!entry.rereviewProvenance) {
            sourceEntries.push(entry);
            continue;
        }

        const target = {
            deckKind,
            level,
            ...parseCardReviewed(entry.rereviewProvenance.cardReviewed),
        };
        if (deckKind === "kanji" && entry.kanji !== target.written) {
            throw new Error(`Kanji entry ${entry.kanji} does not match proof target ${target.written}.`);
        }

        const hadSentenceQualityReview = Boolean(entry.rereviewProvenance.sentenceQualityReview);
        const hadStrictSentenceQualityReview = hasStrictSentenceQualityReviewShape(
            entry.rereviewProvenance.sentenceQualityReview
        );
        const provenance = normalizeInlineProvenance(entry.rereviewProvenance, {
            cardReviewed: target.cardReviewed,
            level,
        });
        if (!hadSentenceQualityReview) {
            normalizedSentenceQualityReviews += 1;
        } else if (!hadStrictSentenceQualityReview) {
            sanitizedSentenceQualityReviews += 1;
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
        normalizedSentenceQualityReviews,
        sanitizedSentenceQualityReviews,
        batches: events.reduce((acc, event) => {
            acc[event.batch.id] = (acc[event.batch.id] || 0) + 1;
            return acc;
        }, {}),
    };
}

function buildInlineObsidianProofLedgerMigration(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const deckKind = options.deckKind || "kanji";
    const levels = Array.isArray(options.levels) && options.levels.length > 0 ? options.levels : [3];
    const ledgerDir = options.ledgerDir || DEFAULT_OBSIDIAN_PROOF_LEDGER_DIR;
    const recordedAt = normalizeRecordDate(options.recordedAt || new Date().toISOString().slice(0, 10));
    const recordedBy = String(options.recordedBy || DEFAULT_RECORDED_BY).trim();
    const sourceCommit = normalizeSourceCommit(options.sourceCommit || "0000000");
    if (deckKind !== "kanji") {
        throw new Error(`Inline Obsidian proof migration currently supports kanji review sets only: ${deckKind}`);
    }
    if (!recordedBy) {
        throw new Error("--recorded-by must be non-empty.");
    }

    const migrations = levels.map((level) => buildMigrationForReviewSet({
        cwd,
        deckKind,
        level,
        ledgerDir,
        recordedAt,
        recordedBy,
        sourceCommit,
    }));

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

function runInlineObsidianProofLedgerMigration(options = {}) {
    const report = buildInlineObsidianProofLedgerMigration(options);
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

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:obsidian:proof:migrate-inline", options.unknownArgs);
    if (options.write && !options.sourceCommit) {
        throw new Error("--source-commit is required when --write is set.");
    }
    const report = runInlineObsidianProofLedgerMigration(options);

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
