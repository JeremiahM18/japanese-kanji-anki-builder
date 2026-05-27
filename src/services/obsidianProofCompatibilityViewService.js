const fs = require("node:fs");
const path = require("node:path");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
    buildObsidianProofTargetKey,
    buildRereviewProvenanceFromLedgerEvent,
    loadObsidianProofLedger,
} = require("../datasets/obsidianProofLedger");
const {
    assertSafeGeneratedPath,
    ensureDir,
    getDefaultGeneratedPathRoots,
} = require("../utils/fs");
const { hashFileSync } = require("../utils/fileHash");

const DEFAULT_OBSIDIAN_PROOF_COMPATIBILITY_DIR = path.join(
    "out",
    "obsidian-proof",
    "compatibility"
);

function toPosixPath(value) {
    return String(value).replace(/\\/g, "/");
}

function buildFileHashRecord({ cwd, filePath }) {
    const hash = hashFileSync(filePath);
    return {
        path: toPosixPath(path.relative(cwd, filePath)),
        bytes: hash.bytes,
        sha256: hash.sha256,
    };
}

function getReviewSetRelativePath({ deckKind, level }) {
    if (deckKind === "kanji") {
        return `templates/platinum_n${level}_review_set.json`;
    }
    if (deckKind === "word") {
        return `templates/platinum_n${level}_word_review_set.json`;
    }
    throw new Error(`Unsupported Obsidian proof deck kind for compatibility view: ${deckKind}.`);
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

function normalizeText(value) {
    return String(value ?? "").trim();
}

function getEntryWrittenSurface(entry = {}, deckKind) {
    if (deckKind === "kanji") {
        return normalizeText(entry.kanji);
    }
    return normalizeText(entry.word || entry.written || entry.displayWord);
}

function getEntryReadings(entry = {}) {
    if (Array.isArray(entry.readingIncludes)) {
        return entry.readingIncludes.map(normalizeText).filter(Boolean);
    }
    return [entry.reading, entry.primaryReading, entry.kana]
        .map(normalizeText)
        .filter(Boolean);
}

function buildEntryTargetKeys(entry = {}, { deckKind, level }) {
    const written = getEntryWrittenSurface(entry, deckKind);
    if (!written) {
        return [];
    }
    return getEntryReadings(entry).map((reading) => [
        deckKind,
        `n${level}`,
        `${written}|${reading}`,
    ].join(":"));
}

function buildLedgerEventGroups(events = []) {
    const groups = new Map();
    for (const event of events) {
        const groupKey = `${event.target.deckKind}:n${event.target.level}`;
        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }
        groups.get(groupKey).push(event);
    }
    return groups;
}

function stripInlineRereviewProvenance(entry = {}) {
    const copy = { ...entry };
    delete copy.rereviewProvenance;
    return copy;
}

function buildCompatibilityEntries({
    entries = [],
    events = [],
    deckKind,
    level,
}) {
    const eventsByTargetKey = new Map(events.map((event) => [
        buildObsidianProofTargetKey(event),
        event,
    ]));
    const appliedTargetKeys = new Set();
    let inlineProofsOmitted = 0;
    let ledgerProofsApplied = 0;

    const compatibilityEntries = entries.map((entry) => {
        const targetKeys = buildEntryTargetKeys(entry, { deckKind, level });
        const matchingEvents = targetKeys
            .map((targetKey) => eventsByTargetKey.get(targetKey))
            .filter(Boolean);

        if (matchingEvents.length > 1) {
            throw new Error([
                `Review entry matches multiple Obsidian proof ledger events for ${deckKind}:N${level}`,
                getEntryWrittenSurface(entry, deckKind),
                targetKeys.join(", "),
            ].filter(Boolean).join(": "));
        }

        const compatibilityEntry = stripInlineRereviewProvenance(entry);
        const [event] = matchingEvents;
        if (event) {
            compatibilityEntry.rereviewProvenance = buildRereviewProvenanceFromLedgerEvent(event);
            appliedTargetKeys.add(buildObsidianProofTargetKey(event));
            ledgerProofsApplied += 1;
        } else if (entry.rereviewProvenance) {
            inlineProofsOmitted += 1;
        }

        return compatibilityEntry;
    });

    const unappliedEvents = events.filter((event) => !appliedTargetKeys.has(buildObsidianProofTargetKey(event)));
    if (unappliedEvents.length > 0) {
        const targets = unappliedEvents.map((event) => event.target.cardReviewed).join(", ");
        throw new Error(`Obsidian proof ledger events did not match review-set entries for ${deckKind}:N${level}: ${targets}`);
    }

    return {
        entries: compatibilityEntries,
        summary: {
            deckKind,
            level,
            sourceEntries: entries.length,
            ledgerProofEvents: events.length,
            ledgerProofsApplied,
            inlineProofsOmitted,
            entriesWithoutLedgerProof: entries.length - ledgerProofsApplied,
        },
    };
}

function buildCompatibilityViewForGroup({
    cwd,
    outputDir,
    deckKind,
    level,
    events,
}) {
    const sourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
    for (const event of events) {
        const eventSourcePath = toPosixPath(event.ledger.sourceReviewSetPath);
        if (eventSourcePath !== sourceReviewSetPath) {
            throw new Error([
                `Ledger sourceReviewSetPath mismatch for ${event.proofId}`,
                `expected ${sourceReviewSetPath}`,
                `actual ${event.ledger.sourceReviewSetPath}`,
            ].join("; "));
        }
    }

    const sourcePath = path.join(cwd, sourceReviewSetPath);
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing source review set for compatibility view: ${sourcePath}`);
    }

    const outputRelativePath = path.join("templates", path.basename(sourceReviewSetPath));
    const outputPath = path.join(outputDir, outputRelativePath);
    const sourceEntries = readJsonArray(sourcePath);
    const { entries, summary } = buildCompatibilityEntries({
        entries: sourceEntries,
        events,
        deckKind,
        level,
    });

    writeJsonFile(outputPath, entries);

    return {
        ...summary,
        sourceReviewSetPath,
        outputReviewSetPath: toPosixPath(path.relative(cwd, outputPath)),
        inputHash: buildFileHashRecord({ cwd, filePath: sourcePath }),
        outputHash: buildFileHashRecord({ cwd, filePath: outputPath }),
        proofIdsApplied: events.map((event) => event.proofId).sort(),
    };
}

function buildObsidianProofCompatibilityViews({
    cwd = process.cwd(),
    ledgerDir,
    outputDir = DEFAULT_OBSIDIAN_PROOF_COMPATIBILITY_DIR,
} = {}) {
    const resolvedCwd = path.resolve(cwd);
    const ledger = loadObsidianProofLedger({ cwd: resolvedCwd, ledgerDir });
    const resolvedOutputDir = path.resolve(resolvedCwd, outputDir);
    assertSafeGeneratedPath(resolvedOutputDir, {
        allowedRoots: getDefaultGeneratedPathRoots({ cwd: resolvedCwd }),
        label: "Obsidian proof compatibility output directory",
    });

    ensureDir(resolvedOutputDir);
    const eventGroups = buildLedgerEventGroups(ledger.events);
    const reviewSets = [];

    for (const [groupKey, events] of [...eventGroups.entries()].sort()) {
        const [deckKind, levelKey] = groupKey.split(":");
        const level = Number(levelKey.slice(1));
        reviewSets.push(buildCompatibilityViewForGroup({
            cwd: resolvedCwd,
            outputDir: resolvedOutputDir,
            deckKind,
            level,
            events,
        }));
    }

    const manifest = {
        authority: OBSIDIAN_PROOF_LEDGER_AUTHORITY,
        sourceOfTruth: "templates/obsidian_proof_ledger/*.jsonl",
        generatedArtifact: true,
        proofPolicy: "Only ledger events generate rereviewProvenance in compatibility views; legacy inline rereviewProvenance is omitted when no ledger event exists.",
        ledgerDir: toPosixPath(path.relative(resolvedCwd, ledger.ledgerDir)),
        outputDir: toPosixPath(path.relative(resolvedCwd, resolvedOutputDir)),
        ledgerFiles: ledger.files.map((file) => toPosixPath(path.relative(resolvedCwd, file))),
        inputHashes: {
            ledgerFiles: ledger.files.map((file) => buildFileHashRecord({ cwd: resolvedCwd, filePath: file })),
        },
        ledgerProofEvents: ledger.events.length,
        reviewSets,
    };

    const manifestPath = path.join(resolvedOutputDir, "manifest.json");
    writeJsonFile(manifestPath, manifest);

    return {
        passed: true,
        manifestPath: toPosixPath(path.relative(resolvedCwd, manifestPath)),
        manifest: {
            ...manifest,
            manifestHash: buildFileHashRecord({ cwd: resolvedCwd, filePath: manifestPath }),
        },
    };
}

function buildObsidianProofCompatibilityViewReport(options = {}) {
    try {
        return buildObsidianProofCompatibilityViews(options);
    } catch (error) {
        return {
            passed: false,
            manifestPath: null,
            manifest: {
                reviewSets: [],
                ledgerProofEvents: 0,
            },
            failures: [error.message],
        };
    }
}

function formatObsidianProofCompatibilityViewReport(report = {}) {
    const manifest = report.manifest || {};
    const lines = [
        "Japanese Kanji Builder Obsidian Proof Compatibility Views",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Manifest: ${report.manifestPath || "(not written)"}`,
        `Ledger proof events: ${manifest.ledgerProofEvents || 0}`,
    ];

    if (manifest.outputDir) {
        lines.push(`Output directory: ${manifest.outputDir}`);
    }

    const reviewSets = Array.isArray(manifest.reviewSets) ? manifest.reviewSets : [];
    if (reviewSets.length > 0) {
        lines.push("", "Generated review-set views:");
        for (const reviewSet of reviewSets) {
            lines.push([
                `- ${reviewSet.deckKind}:N${reviewSet.level}`,
                `source entries=${reviewSet.sourceEntries}`,
                `ledger proofs applied=${reviewSet.ledgerProofsApplied}`,
                `inline proofs omitted=${reviewSet.inlineProofsOmitted}`,
                `output sha256=${reviewSet.outputHash?.sha256 || "(missing)"}`,
                `output=${reviewSet.outputReviewSetPath}`,
            ].join("; "));
        }
    }

    lines.push(
        "",
        "Authority boundary:",
        "- JSONL ledger records are canonical Obsidian proof.",
        "- Generated compatibility JSON is for current rereviewProvenance consumers only.",
        "- Generated compatibility JSON is not Japanese-source evidence, generated TSV authority, APKG authority, NLP certification, or release readiness."
    );

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    DEFAULT_OBSIDIAN_PROOF_COMPATIBILITY_DIR,
    buildCompatibilityEntries,
    buildEntryTargetKeys,
    buildObsidianProofCompatibilityViewReport,
    buildObsidianProofCompatibilityViews,
    formatObsidianProofCompatibilityViewReport,
    getReviewSetRelativePath,
};
