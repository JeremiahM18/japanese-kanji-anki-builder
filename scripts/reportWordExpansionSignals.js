const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { loadConfig } = require("../src/config");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const { buildWordDeckCompletionReport } = require("../src/services/wordDeckCompletionService");
const { buildCoverageLevels } = require("../src/services/wordDeckCoverageScopeService");
const { auditWordLevelAnchors } = require("../src/services/wordLevelAnchorAuditService");
const {
    buildWordInventoryExpansionCandidateReport,
    parseCandidateSourceText,
} = require("../src/services/wordInventoryExpansionCandidateService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");
const { loadTriageDecisions } = require("./reportWordInventoryExpansionCandidates");

const DEFAULT_SIGNAL_SOURCE_CONFIG = "templates/word_expansion_signal_sources.json";

function parseArgs(argv) {
    const options = {
        json: false,
        levels: [5, 4, 3, 2, 1],
        signalSources: DEFAULT_SIGNAL_SOURCE_CONFIG,
        strict: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = [parseNumericOption(arg, "level")];
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels")
                .map((entry) => Number(entry))
                .filter((entry) => Number.isInteger(entry));
        } else if (arg.startsWith("--signal-sources=")) {
            options.signalSources = String(arg.slice("--signal-sources=".length) || "").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    options.levels = [...new Set(options.levels)];
    return options;
}

function assertValidLevels(levels) {
    if (!Array.isArray(levels) || levels.length === 0) {
        throw new Error("At least one word deck level is required.");
    }
    for (const level of levels) {
        if (!Number.isInteger(level) || level < 1 || level > 5) {
            throw new Error("Word expansion signal levels must be integers from 1 to 5.");
        }
    }
}

function resolveWordTsvPath(level) {
    return path.join(process.cwd(), "out", "word-build", "exports", `jlpt-n${level}-words.tsv`);
}

function resolveKanjiTsvPath(config, level) {
    return path.join(config.buildOutDir, "exports", `jlpt-n${level}.tsv`);
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadExpansionSignalSources(configPath = DEFAULT_SIGNAL_SOURCE_CONFIG) {
    const resolvedPath = path.resolve(process.cwd(), configPath || DEFAULT_SIGNAL_SOURCE_CONFIG);
    if (!fs.existsSync(resolvedPath)) {
        return {
            path: resolvedPath,
            levels: {},
        };
    }

    const parsed = readJsonFile(resolvedPath);
    return {
        path: resolvedPath,
        levels: parsed?.levels || {},
    };
}

function normalizeSha256(value) {
    return String(value || "").trim().toLowerCase();
}

function buildSourceFileIntegrity({ sourceBuffer, sourceRows } = {}) {
    const buffer = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(String(sourceBuffer || ""), "utf8");
    return {
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        byteSize: buffer.length,
        rowCount: Array.isArray(sourceRows) ? sourceRows.length : null,
    };
}

function validateExpansionSourceIntegrity(sourceConfig = {}, integrity = {}) {
    const blockers = [];
    const expectedSha256 = normalizeSha256(sourceConfig.sha256);
    const actualSha256 = normalizeSha256(integrity.sha256);

    if (expectedSha256 && actualSha256 !== expectedSha256) {
        blockers.push(`source sha256 mismatch: expected ${expectedSha256}, got ${actualSha256 || "missing"}`);
    }

    if (Number.isInteger(sourceConfig.byteSize) && integrity.byteSize !== sourceConfig.byteSize) {
        blockers.push(`source byte size mismatch: expected ${sourceConfig.byteSize}, got ${integrity.byteSize}`);
    }

    if (Number.isInteger(sourceConfig.rowCount) && integrity.rowCount !== sourceConfig.rowCount) {
        blockers.push(`source row count mismatch: expected ${sourceConfig.rowCount}, got ${integrity.rowCount}`);
    }

    return blockers;
}

function buildCoverageWordTsvByLevel(level) {
    const wordTsvByLevel = {};
    const missingPaths = [];

    for (const coverageLevel of buildCoverageLevels(level)) {
        const wordTsvPath = resolveWordTsvPath(coverageLevel);
        if (!fs.existsSync(wordTsvPath)) {
            missingPaths.push(wordTsvPath);
            continue;
        }
        wordTsvByLevel[coverageLevel] = fs.readFileSync(wordTsvPath, "utf8");
    }

    return {
        missingPaths,
        wordTsvByLevel,
    };
}

function buildReadingSignalFromCompletionReport(report) {
    const triage = report?.triage || {};
    const readingCoverage = report?.readingCoverage || {};
    const editorialReviewItems = triage.editorialReviewItems || 0;
    const promoteCuratedExampleItems = triage.promoteCuratedExampleItems || 0;
    const activeItems = editorialReviewItems + promoteCuratedExampleItems;
    const status = activeItems === 0 ? "exhausted" : "active";

    return {
        status,
        activeItems,
        editorialReviewItems,
        promoteCuratedExampleItems,
        deferVariantItems: triage.deferVariantItems || 0,
        totalItems: triage.totalItems || 0,
        coverage: {
            coveredReadings: readingCoverage.coveredReadings || 0,
            totalReadings: readingCoverage.totalReadings || 0,
            coveragePercent: report?.readiness?.readingCoveragePercent || 0,
            coverageLabel: report?.coverageScope?.label || `N${report?.level || ""}`,
        },
        reason: activeItems === 0
            ? "No active reading-gap triage items remain; remaining open readings are deferred variants or lower learner value."
            : "Active reading-gap triage remains before this level can be called reading-expanded.",
        blockers: [],
    };
}

function buildReadingSignal({ level, shared }) {
    const kanjiTsvPath = resolveKanjiTsvPath(shared.config, level);
    const wordTsvPath = resolveWordTsvPath(level);
    const missingPaths = new Map();

    function addMissingPath(filePath, message) {
        if (!missingPaths.has(filePath)) {
            missingPaths.set(filePath, message);
        }
    }

    if (!fs.existsSync(kanjiTsvPath)) {
        addMissingPath(kanjiTsvPath, `missing kanji TSV: ${kanjiTsvPath}`);
    }
    if (!fs.existsSync(wordTsvPath)) {
        addMissingPath(wordTsvPath, `missing word TSV: ${wordTsvPath}`);
    }

    const coverageWordTsv = buildCoverageWordTsvByLevel(level);
    for (const missingPath of coverageWordTsv.missingPaths) {
        addMissingPath(missingPath, `missing cumulative coverage word TSV: ${missingPath}`);
    }

    const blockers = [...missingPaths.values()];
    if (blockers.length > 0) {
        return {
            status: "not_evaluated",
            activeItems: null,
            editorialReviewItems: null,
            promoteCuratedExampleItems: null,
            deferVariantItems: null,
            totalItems: null,
            coverage: {
                coveredReadings: null,
                totalReadings: null,
                coveragePercent: null,
                coverageLabel: buildCoverageLevels(level).map((coverageLevel) => `N${coverageLevel}`).join(" + "),
            },
            reason: "Reading expansion cannot be evaluated until the required generated TSV exports exist.",
            blockers,
        };
    }

    try {
        const report = buildWordDeckCompletionReport({
            level,
            starterEntries: shared.starterEntries,
            jlptWordLevelContract: shared.jlptWordLevelContract,
            jlptLevelContract: shared.jlptLevelContract,
            wordPitchAccentData: shared.wordPitchAccentData,
            kanjiTsv: fs.readFileSync(kanjiTsvPath, "utf8"),
            wordTsv: fs.readFileSync(wordTsvPath, "utf8"),
            coverageWordTsvByLevel: coverageWordTsv.wordTsvByLevel,
        });

        return buildReadingSignalFromCompletionReport(report);
    } catch (error) {
        return {
            status: "blocked",
            activeItems: null,
            editorialReviewItems: null,
            promoteCuratedExampleItems: null,
            deferVariantItems: null,
            totalItems: null,
            coverage: {
                coveredReadings: null,
                totalReadings: null,
                coveragePercent: null,
                coverageLabel: buildCoverageLevels(level).map((coverageLevel) => `N${coverageLevel}`).join(" + "),
            },
            reason: "Reading expansion report failed.",
            blockers: [error.message],
        };
    }
}

function formatRowCount(count) {
    return `${count} row${count === 1 ? "" : "s"}`;
}

function buildPlacementSignalFromAnchorAuditReport(report = {}) {
    const checkedRows = report.checked || 0;
    const violationCount = report.violationCount || 0;
    const byPlacementStatus = report.byPlacementStatus || {};
    const tooEasyForKanji = byPlacementStatus.too_easy_for_kanji || 0;
    const laterMissingLearnerFitReason = byPlacementStatus.later_missing_learner_fit_reason || 0;
    const noKnownJlptKanji = byPlacementStatus.no_known_jlpt_kanji || 0;
    const invalidDeckLevel = byPlacementStatus.invalid_deck_level || 0;
    const blockers = [];

    if (tooEasyForKanji > 0) {
        blockers.push(`${formatRowCount(tooEasyForKanji)} without a current-level kanji anchor`);
    }
    if (laterMissingLearnerFitReason > 0) {
        blockers.push(`${formatRowCount(laterMissingLearnerFitReason)} placed later without levelPlacement.reason`);
    }
    if (noKnownJlptKanji > 0) {
        blockers.push(`${formatRowCount(noKnownJlptKanji)} without a known JLPT kanji anchor`);
    }
    if (invalidDeckLevel > 0) {
        blockers.push(`${formatRowCount(invalidDeckLevel)} with an invalid deck level`);
    }

    return {
        status: violationCount === 0 ? "resolved" : "blocked",
        checkedRows,
        violationCount,
        tooEasyForKanji,
        laterMissingLearnerFitReason,
        noKnownJlptKanji,
        invalidDeckLevel,
        reason: violationCount === 0
            ? "Word-level placement has no current blockers."
            : "Word-level placement blockers remain before this level can be called fully expanded.",
        blockers,
    };
}

function buildPlacementSignal({ level, shared }) {
    try {
        const report = auditWordLevelAnchors({
            wordLevels: shared.jlptWordLevelContract.wordLevels,
            wordStudyData: shared.starterEntries,
            kanjiLevelData: shared.jlptLevelContract,
            level,
        });
        return buildPlacementSignalFromAnchorAuditReport(report);
    } catch (error) {
        return {
            status: "blocked",
            checkedRows: null,
            violationCount: null,
            tooEasyForKanji: null,
            laterMissingLearnerFitReason: null,
            noKnownJlptKanji: null,
            invalidDeckLevel: null,
            reason: "Word-level placement signal failed.",
            blockers: [error.message],
        };
    }
}

function countDecision(summary, decision) {
    return summary?.triageDecisions?.[decision] || 0;
}

function countCrossLevelRoutingDecision(summary, decision) {
    return summary?.crossLevelRoutingTriageDecisions?.[decision] || 0;
}

function buildEnhancementSignalFromCandidateReport(report) {
    const summary = report?.summary || {};
    const keepCandidates = countDecision(summary, "keep_candidate");
    const moveCandidates = countDecision(summary, "move_candidate");
    const untriagedCandidates = summary.untriagedCandidateRows || 0;
    const crossLevelRoutingRows = summary.crossLevelRoutingRows || 0;
    const untriagedCrossLevelRoutingRows = summary.untriagedCrossLevelRoutingRows || 0;
    const crossLevelMoveCandidates = countCrossLevelRoutingDecision(summary, "move_candidate");

    let status = "exhausted";
    let reason = "Configured source-list enhancement review has no keep candidates and no untriaged candidates.";
    if (moveCandidates > 0) {
        reason = "Configured source-list enhancement review has no current-level keep candidates and no untriaged candidates; move candidates are tracked for target-level placement.";
    }
    if (crossLevelRoutingRows > 0) {
        reason += " Cross-level routing rows are tracked separately and do not count as current-level promotion work.";
    }
    if (crossLevelMoveCandidates > 0 && moveCandidates === 0) {
        reason = "Configured source-list enhancement review has no current-level keep candidates and no untriaged candidates; cross-level move candidates are tracked for target-level placement.";
    }
    if (untriagedCrossLevelRoutingRows > 0 && untriagedCandidates === 0 && keepCandidates === 0) {
        reason += " Untriaged cross-level routing rows remain advisory backlog.";
    }
    if (untriagedCandidates > 0) {
        status = "needs_triage";
        reason = "Configured source-list enhancement review still has untriaged candidates.";
    } else if (keepCandidates > 0) {
        status = "active";
        reason = "Configured source-list enhancement review still has keep candidates to promote or reconsider.";
    }

    return {
        status,
        sourceLabel: report?.sourceLabel || "",
        sourcePath: "",
        sourceExists: true,
        reviewCandidateRows: summary.reviewCandidateRows || 0,
        triagedCandidateRows: summary.triagedCandidateRows || 0,
        untriagedCandidateRows: untriagedCandidates,
        crossLevelRoutingRows,
        triagedCrossLevelRoutingRows: summary.triagedCrossLevelRoutingRows || 0,
        untriagedCrossLevelRoutingRows,
        keepCandidates,
        moveCandidates,
        crossLevelMoveCandidates,
        crossLevelKeepCandidates: countCrossLevelRoutingDecision(summary, "keep_candidate"),
        crossLevelDeferCandidates: countCrossLevelRoutingDecision(summary, "defer_candidate"),
        crossLevelRejectCandidates: countCrossLevelRoutingDecision(summary, "reject_candidate"),
        deferCandidates: countDecision(summary, "defer_candidate"),
        rejectCandidates: countDecision(summary, "reject_candidate"),
        kanjiScope: summary.kanjiScope || "",
        requireSourceLevel: Boolean(summary.requireSourceLevel),
        reason,
        blockers: [],
    };
}

function buildEnhancementSignal({ level, sourceConfig, shared }) {
    if (!sourceConfig) {
        return {
            status: "source_missing",
            sourceLabel: "",
            sourcePath: "",
            sourceExists: false,
            sourceIntegrity: null,
            reviewCandidateRows: null,
            triagedCandidateRows: null,
            untriagedCandidateRows: null,
            crossLevelRoutingRows: null,
            triagedCrossLevelRoutingRows: null,
            untriagedCrossLevelRoutingRows: null,
            keepCandidates: null,
            moveCandidates: null,
            crossLevelMoveCandidates: null,
            deferCandidates: null,
            rejectCandidates: null,
            kanjiScope: "",
            requireSourceLevel: false,
            reason: `No enhancement source is configured for N${level}.`,
            blockers: [`missing source config for N${level}`],
        };
    }

    const sourcePath = path.resolve(process.cwd(), sourceConfig.sourcePath || "");
    const sourceLabel = sourceConfig.sourceLabel || path.basename(sourcePath);
    if (!sourceConfig.sourcePath || !fs.existsSync(sourcePath)) {
        return {
            status: "source_missing",
            sourceLabel,
            sourcePath,
            sourceExists: false,
            sourceIntegrity: null,
            reviewCandidateRows: null,
            triagedCandidateRows: null,
            untriagedCandidateRows: null,
            crossLevelRoutingRows: null,
            triagedCrossLevelRoutingRows: null,
            untriagedCrossLevelRoutingRows: null,
            keepCandidates: null,
            moveCandidates: null,
            crossLevelMoveCandidates: null,
            deferCandidates: null,
            rejectCandidates: null,
            kanjiScope: sourceConfig.kanjiScope || "",
            requireSourceLevel: Boolean(sourceConfig.requireSourceLevel),
            reason: "Enhancement source-list inventory cannot be evaluated until the configured source file exists.",
            blockers: [`missing source file: ${sourcePath}`],
        };
    }

    try {
        const sourceBuffer = fs.readFileSync(sourcePath);
        const sourceRows = parseCandidateSourceText(sourceBuffer.toString("utf8"), {
            format: sourceConfig.format || "auto",
        });
        const sourceIntegrity = buildSourceFileIntegrity({ sourceBuffer, sourceRows });
        const sourceIntegrityBlockers = validateExpansionSourceIntegrity(sourceConfig, sourceIntegrity);

        if (sourceIntegrityBlockers.length > 0) {
            return {
                status: "source_mismatch",
                sourceLabel,
                sourcePath,
                sourceExists: true,
                sourceIntegrity,
                reviewCandidateRows: null,
                triagedCandidateRows: null,
                untriagedCandidateRows: null,
                crossLevelRoutingRows: null,
                triagedCrossLevelRoutingRows: null,
                untriagedCrossLevelRoutingRows: null,
                keepCandidates: null,
                moveCandidates: null,
                crossLevelMoveCandidates: null,
                deferCandidates: null,
                rejectCandidates: null,
                kanjiScope: sourceConfig.kanjiScope || "",
                requireSourceLevel: Boolean(sourceConfig.requireSourceLevel),
                reason: "Enhancement source-list inventory cannot be evaluated because the ignored local source file no longer matches the tracked integrity manifest.",
                blockers: sourceIntegrityBlockers,
            };
        }

        const report = buildWordInventoryExpansionCandidateReport({
            sourceRows,
            targetLevel: level,
            kanjiScope: sourceConfig.kanjiScope || "at-or-below",
            limit: Number.MAX_SAFE_INTEGER,
            requireSourceLevel: Boolean(sourceConfig.requireSourceLevel),
            sourceLabel,
            triageDecisions: loadTriageDecisions({
                triagePath: sourceConfig.triagePath || "",
                level,
                sourceLabel,
            }),
            jlptLevelContract: shared.jlptLevelContract,
            jlptWordLevelContract: shared.jlptWordLevelContract,
        });
        const signal = buildEnhancementSignalFromCandidateReport(report);

        return {
            ...signal,
            sourcePath,
            sourceExists: true,
            sourceIntegrity,
        };
    } catch (error) {
        return {
            status: "blocked",
            sourceLabel,
            sourcePath,
            sourceExists: true,
            sourceIntegrity: null,
            reviewCandidateRows: null,
            triagedCandidateRows: null,
            untriagedCandidateRows: null,
            crossLevelRoutingRows: null,
            triagedCrossLevelRoutingRows: null,
            untriagedCrossLevelRoutingRows: null,
            keepCandidates: null,
            moveCandidates: null,
            crossLevelMoveCandidates: null,
            deferCandidates: null,
            rejectCandidates: null,
            kanjiScope: sourceConfig.kanjiScope || "",
            requireSourceLevel: Boolean(sourceConfig.requireSourceLevel),
            reason: "Enhancement source-list report failed.",
            blockers: [error.message],
        };
    }
}

function buildSharedInputs() {
    return {
        config: loadConfig(),
        starterEntries: loadWordStudyData({
            starterPath: path.join(process.cwd(), "templates", "starter_word_study_data.json"),
            localPath: null,
        }),
        jlptWordLevelContract: loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json")),
        jlptLevelContract: loadJlptLevelContract(path.join(process.cwd(), "templates", "jlpt_level_contract.json")),
        wordPitchAccentData: loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json")),
    };
}

function buildLevelExpansionSignal({ level, shared, sourceConfigs }) {
    const reading = buildReadingSignal({ level, shared });
    const enhancement = buildEnhancementSignal({
        level,
        sourceConfig: sourceConfigs?.[`N${level}`] || null,
        shared,
    });
    const placement = buildPlacementSignal({ level, shared });
    const fullyExpanded = reading.status === "exhausted"
        && enhancement.status === "exhausted"
        && placement.status === "resolved";

    return {
        level,
        levelLabel: `N${level}`,
        fullyExpanded,
        reading,
        enhancement,
        placement,
    };
}

function buildWordExpansionSignalReport({ levels, signalSources = DEFAULT_SIGNAL_SOURCE_CONFIG } = {}) {
    assertValidLevels(levels);
    const shared = buildSharedInputs();
    const sourceConfig = loadExpansionSignalSources(signalSources);
    const signals = levels.map((level) => buildLevelExpansionSignal({
        level,
        shared,
        sourceConfigs: sourceConfig.levels,
    }));

    return {
        signalSourceConfigPath: sourceConfig.path,
        levels,
        summary: {
            fullyExpandedLevels: signals
                .filter((signal) => signal.fullyExpanded)
                .map((signal) => signal.levelLabel),
            notFullyExpandedLevels: signals
                .filter((signal) => !signal.fullyExpanded)
                .map((signal) => signal.levelLabel),
        },
        signals,
    };
}

function formatStatusWithCounts(signal, type) {
    if (type === "reading") {
        if (signal.status === "exhausted" || signal.status === "active") {
            return `${signal.status} (active ${signal.activeItems}; deferred ${signal.deferVariantItems}; coverage ${signal.coverage.coveredReadings}/${signal.coverage.totalReadings})`;
        }
        return `${signal.status} (${signal.blockers.length} blocker${signal.blockers.length === 1 ? "" : "s"})`;
    }

    if (signal.status === "exhausted" || signal.status === "active" || signal.status === "needs_triage") {
        const source = signal.sourceLabel ? `; source ${signal.sourceLabel}` : "";
        const routing = Number.isInteger(signal.crossLevelRoutingRows)
            ? `; cross-level route ${signal.crossLevelRoutingRows}`
            : "";
        return `${signal.status} (keep ${signal.keepCandidates}; move ${signal.moveCandidates}; untriaged ${signal.untriagedCandidateRows}; defer ${signal.deferCandidates}; reject ${signal.rejectCandidates}${routing}${source})`;
    }
    if (type === "placement") {
        if (signal.status === "resolved" || signal.status === "blocked") {
            return `${signal.status} (${signal.violationCount}/${signal.checkedRows} violations; no anchor ${signal.tooEasyForKanji}; later missing rationale ${signal.laterMissingLearnerFitReason})`;
        }
    }
    return `${signal.status} (${signal.blockers.length} blocker${signal.blockers.length === 1 ? "" : "s"})`;
}

function formatWordExpansionSignalReport(report) {
    const lines = [
        "Japanese Kanji Builder Word Expansion Signals",
        "",
        "Signal meaning:",
        "- Reading exhausted means active reading-gap triage is cleared; coverage percent remains informational.",
        "- Enhancement exhausted means the configured source list has no current-level keep candidates and no untriaged candidates; move candidates remain target-level routing work, not current-level promotion work.",
        "- Placement resolved means each word has a current-level kanji anchor, or has a tracked learner-fit reason for later all-easier-kanji placement.",
        "- This is not golden review, platinum review, APKG QA, or release readiness.",
        "",
        "Level signals:",
        "| Level | Fully expanded | Reading | Enhancement | Placement |",
        "| --- | --- | --- | --- | --- |",
    ];

    for (const signal of report.signals) {
        lines.push([
            `| ${signal.levelLabel}`,
            signal.fullyExpanded ? "yes" : "no",
            formatStatusWithCounts(signal.reading, "reading"),
            formatStatusWithCounts(signal.enhancement, "enhancement"),
            formatStatusWithCounts(signal.placement, "placement"),
        ].join(" | ") + " |");
    }

    const blockers = report.signals.flatMap((signal) => [
        ...signal.reading.blockers.map((blocker) => `${signal.levelLabel} reading: ${blocker}`),
        ...signal.enhancement.blockers.map((blocker) => `${signal.levelLabel} enhancement: ${blocker}`),
        ...signal.placement.blockers.map((blocker) => `${signal.levelLabel} placement: ${blocker}`),
    ]);
    if (blockers.length > 0) {
        lines.push("", "Signal blockers:");
        for (const blocker of blockers) {
            lines.push(`- ${blocker}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:expansion-signals", options.unknownArgs);
    assertValidLevels(options.levels);

    const report = buildWordExpansionSignalReport({
        levels: options.levels,
        signalSources: options.signalSources,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatWordExpansionSignalReport(report));
    }

    if (options.strict && report.signals.some((signal) => !signal.fullyExpanded)) {
        throw new Error("One or more selected word deck levels are not fully expanded.");
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_SIGNAL_SOURCE_CONFIG,
    assertValidLevels,
    buildEnhancementSignalFromCandidateReport,
    buildPlacementSignalFromAnchorAuditReport,
    buildSourceFileIntegrity,
    buildLevelExpansionSignal,
    buildReadingSignalFromCompletionReport,
    buildWordExpansionSignalReport,
    countDecision,
    formatStatusWithCounts,
    formatWordExpansionSignalReport,
    loadExpansionSignalSources,
    parseArgs,
    resolveKanjiTsvPath,
    resolveWordTsvPath,
    validateExpansionSourceIntegrity,
};
