const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const { buildWordCoverageContractSummary } = require("../src/datasets/wordStudyData");
const { buildStarterWordGovernanceSummary } = require("../src/datasets/jlptWordLevelContract");
const { buildWordDeckCompletionReport, formatCardBackFieldCoverage } = require("../src/services/wordDeckCompletionService");
const { buildCoverageLevels } = require("../src/services/wordDeckCoverageScopeService");
const { buildWordAudioReviewReport } = require("../src/services/wordAudioReviewService");
const { buildSelectedKanjiByLevel, parseLevelsArgument } = require("../src/services/buildPipeline");
const { buildDeckPackage } = require("../src/services/deckPackageService");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { selectKanjiForSync, syncMediaForKanjiList } = require("../src/services/mediaSync");
const { createWordExportService } = require("../src/services/wordExportService");
const { buildDoctorReport, formatDoctorReport } = require("../src/services/doctorService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");
const { ensureDir } = require("../src/utils/fs");

function buildOutputPaths(outDir) {
    const root = path.resolve(outDir);
    return {
        root,
        exportsDir: path.join(root, "exports"),
        reportsDir: path.join(root, "reports"),
    };
}

function writeJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeText(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, value, "utf-8");
}

function resolveKanjiTsvPath(buildOutDir, level) {
    return path.join(buildOutDir, "exports", `jlpt-n${level}.tsv`);
}

function resolveWordTsvPath(outDir, level) {
    return path.join(outDir, "exports", `jlpt-n${level}-words.tsv`);
}

function loadCoverageWordTsvByLevel({ level, outDir, currentWordTsvByLevel, coverageLevels = null }) {
    const wordTsvByLevel = {};
    for (const coverageLevel of buildCoverageLevels(level, { availableLevels: coverageLevels })) {
        if (typeof currentWordTsvByLevel[coverageLevel] === "string") {
            wordTsvByLevel[coverageLevel] = currentWordTsvByLevel[coverageLevel];
            continue;
        }

        const wordTsvPath = resolveWordTsvPath(outDir, coverageLevel);
        if (!fs.existsSync(wordTsvPath)) {
            throw new Error(`Missing cumulative coverage word TSV at ${wordTsvPath}. Run npm run deck:words:ready -- --levels=${coverageLevel} first.`);
        }
        wordTsvByLevel[coverageLevel] = fs.readFileSync(wordTsvPath, "utf8");
    }
    return wordTsvByLevel;
}

function parseArgs(argv) {
    const options = {
        levels: null,
        limit: null,
        concurrency: null,
        outDir: null,
        maxWordsPerKanji: null,
        minimumCandidateScore: null,
        includeInferred: false,
        json: false,
        unknownArgs: [],
        requireNoActiveTriage: false,
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--include-inferred") {
            options.includeInferred = true;
        } else if (arg === "--require-no-active-triage") {
            options.requireNoActiveTriage = true;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = parseNumericOption(arg, "concurrency");
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else if (arg.startsWith("--max-words-per-kanji=")) {
            options.maxWordsPerKanji = parseNumericOption(arg, "max-words-per-kanji");
        } else if (arg.startsWith("--minimum-candidate-score=")) {
            options.minimumCandidateScore = parseNumericOption(arg, "minimum-candidate-score");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatWordDeckReadyReport(summary, doctorReport) {
    const trueAnimationCovered = summary.completion?.trueAnimationCoverage?.coveredKanji || 0;
    const trueAnimationTotal = summary.completion?.trueAnimationCoverage?.totalKanji || 0;
    const trueAnimationPercent = trueAnimationTotal > 0
        ? Number(((trueAnimationCovered / trueAnimationTotal) * 100).toFixed(1))
        : 0;
    const readingCoverageLines = summary.completion.readingCoverageAuditByLevel
        ? summary.levels.flatMap((level) => {
            const audit = summary.completion.readingCoverageAuditByLevel[`N${level}`];
            const triage = summary.completion.readingGapTriageByLevel?.[`N${level}`];
            const wordAudio = summary.completion.wordAudioReviewByLevel?.[`N${level}`];
            const pitchAccent = summary.completion.pitchAccentReviewByLevel?.[`N${level}`];
            const cardBackAudit = audit.cardBackAudit;
            if (!audit) {
                return [];
            }

            const coveredPercent = audit.totalReadings > 0
                ? Number(((audit.coveredReadings / audit.totalReadings) * 100).toFixed(1))
                : 0;

            return [
                `- N${level} readiness status: ${audit.readiness?.status || "incomplete"}`,
                `- N${level} reading coverage: ${coveredPercent}% (${audit.coveredReadings}/${audit.totalReadings})`,
                ...(audit.coverageLabel ? [`  coverage counted from decks: ${audit.coverageLabel}`] : []),
                ...(typeof audit.priorLevelCoveredReadings === "number"
                    ? [`  covered by earlier decks: ${audit.priorLevelCoveredReadings}, covered by this deck level: ${audit.currentLevelCoveredReadings || 0}${audit.laterLevelCoveredReadings > 0 ? `, covered by harder decks: ${audit.laterLevelCoveredReadings}` : ""}`]
                    : []),
                `  distinct missing targets: ${audit.distinctGapReadings}, variant-style gaps: ${audit.variantGapReadings}`,
                ...(audit.policyAudit
                    ? [`  deck policy: ${audit.policyAudit.levelPlacementViolationCount || 0} word level placement violations, ${audit.policyAudit.standaloneViolationCount} standalone wrong-level cards, ${audit.policyAudit.badgeViolationCount} missing labels, ${audit.policyAudit.focusViolationCount || 0} focus mismatches`]
                    : []),
                ...(audit.sentenceOrthographyAudit
                    ? [`  sentence orthography review: ${audit.sentenceOrthographyAudit.suspiciousKanaOnlyCount} suspicious kana-only examples`]
                    : []),
                ...(audit.exampleReadingAlignmentAudit
                    ? [`  example reading alignment: ${audit.exampleReadingAlignmentAudit.mismatchedExampleReadingCount} mismatches`]
                    : []),
                ...(audit.readingBreakdownAudit
                    ? [`  reading breakdown review: ${audit.readingBreakdownAudit.missingBreakdownCount || 0} blanks, ${audit.readingBreakdownAudit.nonRubyBreakdownCount} non-ruby kanji breakdowns, ${audit.kanjiBreakdownContextAudit?.mismatchCount || 0} kanji-context mismatches`]
                    : []),
                ...(cardBackAudit
                    ? [
                        `  card back review: ${cardBackAudit.requiredCoveragePercent}% (${cardBackAudit.requiredReadyCount}/${cardBackAudit.requiredTotalCount}) required fields ready, ${cardBackAudit.requiredMissingCount} missing`,
                        `  card back fields: ${formatCardBackFieldCoverage(cardBackAudit)}`,
                    ]
                    : []),
                ...(wordAudio
                    ? [`  word audio review: ${wordAudio.coveragePercent}% (${wordAudio.readyToReview}/${wordAudio.totalWords}) ready, ${wordAudio.missingAudio} missing, ${wordAudio.readingMismatch + wordAudio.policyMismatch + wordAudio.missingGeneratedReading + wordAudio.missingExpectedReading} flagged`]
                    : []),
                ...(pitchAccent
                    ? [
                        `  pitch accent review: ${pitchAccent.coveragePercent}% (${pitchAccent.annotatedWords}/${pitchAccent.totalWords}) annotated, ${pitchAccent.missingPitchAccent} missing, ${pitchAccent.ungovernedPitchAccent || 0} ungoverned, ${pitchAccent.sourceMismatchPitchAccent || 0} source/render mismatches, ${pitchAccent.invalidSourcePattern || 0} invalid source patterns, ${pitchAccent.sourceIdentityIssues || 0} source identity issues, ${pitchAccent.generatedUnlabeledPitchAccent || 0} generated labels missing, field ${pitchAccent.fieldPresent ? "present" : "missing"}`,
                        ...((pitchAccent.sourceCounts && Object.keys(pitchAccent.sourceCounts).length > 0)
                            ? [`  pitch accent sources: ${Object.entries(pitchAccent.sourceCounts).sort((a, b) => a[0].localeCompare(b[0])).map(([sourceId, count]) => `${sourceId}=${count}`).join(", ")}`]
                            : []),
                    ]
                    : []),
                ...(triage
                    ? [`  triage backlog: ${triage.editorialReviewItems} review-needed before card work, ${triage.promoteCuratedExampleItems} actionable curated candidates, ${triage.deferVariantItems} deferred variants or low learner value`]
                    : []),
            ];
        })
        : [];
    const levelArgument = summary.levels.join(",");
    const apkgPath = summary.package.ankiPackage?.filePath || null;

    return [
        "Japanese Kanji Builder Word Deck Ready",
        "",
        `Output directory: ${summary.outDir}`,
        `Package directory: ${summary.package.rootDir}`,
        ...(apkgPath ? [`APKG ready: ${apkgPath}`] : []),
        ...(summary.package.ankiPackage?.skipped ? [`Anki package status: skipped (${summary.package.ankiPackage.skipReason})`] : []),
        `Levels: ${summary.levels.map((level) => `N${level}`).join(", ")}`,
        `Package staging: rebuilt for --levels=${levelArgument}`,
        `Word mode: ${summary.settings.includeInferred ? "curated + inferred" : "curated only"}`,
        `Exports generated: ${summary.exports.length}`,
        `Word notes generated: ${summary.exports.reduce((total, item) => total + item.rows, 0)}`,
        `Canonical word rows: ${summary.governance.canonicalRows}`,
        `Curated-only word rows: ${summary.governance.curatedOnlyRows}`,
        `Inferred-only word rows: ${summary.governance.inferredOnlyRows}`,
        "",
        "Word contract completion:",
        `- N5 starter governance: ${summary.completion.starterGovernance.coverageByLevel[5]}% (${summary.completion.starterGovernance.canonicalStarterCounts[5]}/${summary.completion.starterGovernance.defaultDeckStarterCounts[5]})`,
        `- N5 explicit reading-coverage contracts: ${summary.completion.readingCoverageContract.explicitCoveragePercentByLevel[5]}% (${summary.completion.readingCoverageContract.explicitCoverageEntriesByLevel[5]}/${summary.completion.readingCoverageContract.starterEntriesByLevel[5]})`,
        `- Canonical inventory counts: N5=${summary.completion.contractInventoryCounts["5"] || 0}, N4=${summary.completion.contractInventoryCounts["4"] || 0}, N3=${summary.completion.contractInventoryCounts["3"] || 0}, N2=${summary.completion.contractInventoryCounts["2"] || 0}, N1=${summary.completion.contractInventoryCounts["1"] || 0}`,
        `- Tracked source-only exclusions: N5=${summary.completion.excludedContractCounts["5"] || 0}, N4=${summary.completion.excludedContractCounts["4"] || 0}, N3=${summary.completion.excludedContractCounts["3"] || 0}, N2=${summary.completion.excludedContractCounts["2"] || 0}, N1=${summary.completion.excludedContractCounts["1"] || 0}`,
        ...readingCoverageLines,
        `- True looping animation coverage: ${trueAnimationPercent}% (${trueAnimationCovered}/${trueAnimationTotal})`,
        `Unique referenced kanji: ${summary.referencedKanjiCount}`,
        `Unique packaged media files: ${summary.package.mediaAssetCount}`,
        "",
        "Packaged media by field:",
        `- Stroke-order field references: ${summary.package.mediaCounts.strokeOrder}`,
        `- Stroke-order images: ${summary.package.mediaCounts.strokeOrderImage}`,
        `- Stroke-order animation fields: ${summary.package.mediaCounts.strokeOrderAnimation}`,
        `- True looping animation assets: ${summary.package.mediaCounts.trueStrokeOrderAnimation}`,
        `- SVG animation fallbacks: ${summary.package.mediaCounts.svgStrokeOrderAnimationFallback}`,
        ...(doctorReport.enableAudio ? [`- Audio fields: ${summary.package.mediaCounts.audio}`] : []),
        "",
        apkgPath
            ? `Next step: import ${apkgPath} into Anki and review the word cards. If you switch levels, rerun \`npm run deck:words:ready -- --levels=${levelArgument}\` before rerunning \`npm run deck:words:apkg -- --levels=${levelArgument}\`.`
            : "Next step: import the TSV from the package exports folder, copy the packaged media into Anki's collection.media directory, and review the new word cards alongside the kanji deck.",
        "",
    ].join("\n");
}

function buildWordDeckExitCondition(summary = {}, options = {}) {
    const trueAnimationCoverage = summary.completion?.trueAnimationCoverage || {};
    const hasFullTrueAnimationCoverage = (trueAnimationCoverage.totalKanji || 0) === 0
        || (trueAnimationCoverage.coveredKanji || 0) >= trueAnimationCoverage.totalKanji;
    const readingCoverageAudits = Object.values(summary.completion?.readingCoverageAuditByLevel || {});
    const hasActiveTriageBacklog = Object.values(summary.completion?.readingGapTriageByLevel || {})
        .some((triage) => ((triage?.editorialReviewItems || 0) + (triage?.promoteCuratedExampleItems || 0)) > 0);
    const hasPolicyViolations = readingCoverageAudits
        .some((audit) => !audit?.policyAudit?.valid);
    const hasReadingBreakdownViolations = readingCoverageAudits
        .some((audit) => !audit?.readingBreakdownAudit?.valid);
    const hasKanjiBreakdownContextViolations = readingCoverageAudits
        .some((audit) => audit?.kanjiBreakdownContextAudit && !audit.kanjiBreakdownContextAudit.valid);
    const hasCardBackViolations = readingCoverageAudits
        .some((audit) => audit?.cardBackAudit && !audit.cardBackAudit.valid);
    const hasExampleReadingAlignmentViolations = readingCoverageAudits
        .some((audit) => audit?.exampleReadingAlignmentAudit && !audit.exampleReadingAlignmentAudit.valid);
    const blocksOnActiveTriage = options.requireNoActiveTriage && hasActiveTriageBacklog;
    const valid = hasFullTrueAnimationCoverage
        && !hasPolicyViolations
        && !hasReadingBreakdownViolations
        && !hasKanjiBreakdownContextViolations
        && !hasCardBackViolations
        && !hasExampleReadingAlignmentViolations
        && !blocksOnActiveTriage;

    return {
        valid,
        hasFullTrueAnimationCoverage,
        hasActiveTriageBacklog,
        blocksOnActiveTriage,
        hasPolicyViolations,
        hasReadingBreakdownViolations,
        hasKanjiBreakdownContextViolations,
        hasCardBackViolations,
        hasExampleReadingAlignmentViolations,
    };
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("prepareWordDeck", options.unknownArgs);
    const audioSourcePolicy = loadAudioSourcePolicy();

    const doctorReport = await buildDoctorReport({ config });
    if (!doctorReport.ready) {
        process.stdout.write(formatDoctorReport(doctorReport));
        process.exitCode = 1;
        return;
    }

    const outDir = options.outDir || path.join(path.dirname(config.buildOutDir), "word-build");
    const buildPaths = buildOutputPaths(outDir);
    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const jlptWordLevelContract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));
    const jlptLevelContract = loadJlptLevelContract(path.join(process.cwd(), "templates", "jlpt_level_contract.json"));
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const wordStudyData = loadWordStudyData({
        localPath: config.wordStudyDataPath,
    });
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const trackedStarterWordStudyData = loadWordStudyData({
        starterPath: path.join(process.cwd(), "templates", "starter_word_study_data.json"),
        localPath: null,
    });
    const starterGovernance = buildStarterWordGovernanceSummary(trackedStarterWordStudyData, jlptWordLevelContract);
    const readingCoverageContract = buildWordCoverageContractSummary(trackedStarterWordStudyData);
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServices(config);
    const wordExportService = createWordExportService({ sentenceCorpus, curatedStudyData, wordStudyData, wordPitchAccentData });
    const levels = options.levels || [5];
    const concurrency = Number.isFinite(options.concurrency) ? options.concurrency : config.exportConcurrency;
    const selectedKanjiByLevel = buildSelectedKanjiByLevel({
        jlptOnlyJson,
        levels,
        limit: Number.isFinite(options.limit) ? options.limit : null,
        selectKanjiForSyncFn: selectKanjiForSync,
    });
    const syncKanjiList = [...new Set(Object.values(selectedKanjiByLevel).flatMap((list) => list))];

    await syncMediaForKanjiList({
        kanjiList: syncKanjiList,
        strokeOrderService,
        audioService,
        concurrency,
        audioMetadata: {},
        mediaRootDir: config.mediaRootDir,
    });

    const exports = [];
    const currentWordTsvByLevel = {};
    const readingCoverageAuditByLevel = {};
    const readingGapTriageByLevel = {};
    const wordAudioReviewByLevel = {};
    const pitchAccentReviewByLevel = {};
    for (const level of levels) {
        const result = await wordExportService.buildWordTsvForJlptLevel({
            levelNumber: level,
            jlptOnlyJson,
            jlptWordLevelContract,
            kanjiApiClient,
            strokeOrderService,
            audioService,
            mediaRootDir: config.mediaRootDir,
            limit: Number.isFinite(options.limit) ? options.limit : null,
            concurrency,
            maxWordsPerKanji: Number.isFinite(options.maxWordsPerKanji) ? options.maxWordsPerKanji : null,
            minimumCandidateScore: Number.isFinite(options.minimumCandidateScore) ? options.minimumCandidateScore : 20,
            includeInferred: options.includeInferred,
        });
        const filePath = path.join(buildPaths.exportsDir, `jlpt-n${level}-words.tsv`);
        writeText(filePath, `${result.tsv}\n`);
        currentWordTsvByLevel[level] = result.tsv;

        exports.push({
            level,
            filePath,
            rows: result.rowCount,
            mediaKanji: result.mediaKanji,
            mediaRefs: result.mediaRefs,
            governance: result.governance,
        });
    }

    for (const level of levels) {
        const resultTsv = currentWordTsvByLevel[level];
        const kanjiTsvPath = resolveKanjiTsvPath(config.buildOutDir, level);
        if (fs.existsSync(kanjiTsvPath)) {
            const completionReport = buildWordDeckCompletionReport({
                level,
                starterEntries: trackedStarterWordStudyData,
                jlptWordLevelContract,
                jlptLevelContract,
                kanjiTsv: fs.readFileSync(kanjiTsvPath, "utf8"),
                wordTsv: resultTsv,
                wordPitchAccentData,
                coverageWordTsvByLevel: loadCoverageWordTsvByLevel({
                    level,
                    outDir: buildPaths.root,
                    currentWordTsvByLevel,
                    coverageLevels: levels,
                }),
                coverageLevels: levels,
            });
            readingCoverageAuditByLevel[`N${level}`] = completionReport.readingCoverage;
            readingGapTriageByLevel[`N${level}`] = completionReport.triage;
            readingCoverageAuditByLevel[`N${level}`].readiness = completionReport.readiness;
            readingCoverageAuditByLevel[`N${level}`].policyAudit = completionReport.policyAudit;
            readingCoverageAuditByLevel[`N${level}`].sentenceOrthographyAudit = completionReport.sentenceOrthographyAudit;
            readingCoverageAuditByLevel[`N${level}`].exampleReadingAlignmentAudit = completionReport.exampleReadingAlignmentAudit;
            readingCoverageAuditByLevel[`N${level}`].readingBreakdownAudit = completionReport.readingBreakdownAudit;
            readingCoverageAuditByLevel[`N${level}`].kanjiBreakdownContextAudit = completionReport.kanjiBreakdownContextAudit;
            readingCoverageAuditByLevel[`N${level}`].cardBackAudit = completionReport.cardBackAudit;
            pitchAccentReviewByLevel[`N${level}`] = completionReport.pitchAccentAudit;
        }
        if (audioSourcePolicy.releaseAudio.wordDeckAudioEnabled) {
            const wordAudioReport = await buildWordAudioReviewReport({
                wordTsv: resultTsv,
                audioSourcePolicy,
                audioService,
                mediaRootDir: config.mediaRootDir,
            });
            wordAudioReviewByLevel[`N${level}`] = {
                ...wordAudioReport.summary,
                coveragePercent: wordAudioReport.summary.totalWords > 0
                    ? Number(((wordAudioReport.summary.readyToReview / wordAudioReport.summary.totalWords) * 100).toFixed(1))
                    : 0,
            };
        }
    }

    const deckPackage = await buildDeckPackage({
        outDir: buildPaths.root,
        exports,
        kanjiByLevel: selectedKanjiByLevel,
        mediaRootDir: config.mediaRootDir,
        packageConcurrency: concurrency,
        deckKind: "word",
        referencedMedia: exports.flatMap((artifact) => artifact.mediaRefs || []),
    });

    const summary = {
        generatedAt: new Date().toISOString(),
        outDir: buildPaths.root,
        levels,
        exports,
        governance: {
            canonicalRows: exports.reduce((total, artifact) => total + (artifact.governance?.canonicalRows || 0), 0),
            curatedOnlyRows: exports.reduce((total, artifact) => total + (artifact.governance?.curatedOnlyRows || 0), 0),
            inferredOnlyRows: exports.reduce((total, artifact) => total + (artifact.governance?.inferredOnlyRows || 0), 0),
            byLevel: Object.fromEntries(exports.map((artifact) => [
                `N${artifact.level}`,
                artifact.governance || { canonicalRows: 0, curatedOnlyRows: 0, inferredOnlyRows: 0, rowCount: artifact.rows },
            ])),
        },
        completion: {
            contractInventoryCounts: jlptWordLevelContract.inventoryCounts,
            excludedContractCounts: jlptWordLevelContract.excludedCounts,
            starterGovernance,
            readingCoverageContract,
            readingCoverageAuditByLevel,
            readingGapTriageByLevel,
            wordAudioReviewByLevel,
            pitchAccentReviewByLevel,
            trueAnimationCoverage: {
                coveredKanji: deckPackage.mediaCounts.trueStrokeOrderAnimation,
                totalKanji: [...new Set(exports.flatMap((artifact) => artifact.mediaKanji || []))].length,
                svgFallbackKanji: deckPackage.mediaCounts.svgStrokeOrderAnimationFallback,
            },
        },
        referencedKanjiCount: [...new Set(exports.flatMap((artifact) => artifact.mediaKanji || []))].length,
        package: deckPackage,
        settings: {
            limit: Number.isFinite(options.limit) ? options.limit : null,
            concurrency,
            maxWordsPerKanji: Number.isFinite(options.maxWordsPerKanji) ? options.maxWordsPerKanji : null,
            minimumCandidateScore: Number.isFinite(options.minimumCandidateScore) ? options.minimumCandidateScore : 20,
            includeInferred: options.includeInferred,
            requireNoActiveTriage: options.requireNoActiveTriage,
        },
    };

    writeJson(path.join(buildPaths.root, "build-summary.json"), summary);
    writeJson(path.join(buildPaths.reportsDir, "word-deck-summary.json"), summary);

    const exitCondition = buildWordDeckExitCondition(summary, {
        requireNoActiveTriage: options.requireNoActiveTriage,
    });

    if (options.json) {
        console.log(JSON.stringify({ doctor: doctorReport, build: summary }, null, 2));
        if (!exitCondition.valid) {
            process.exitCode = 1;
        }
        return;
    }

    process.stdout.write(formatWordDeckReadyReport(summary, doctorReport));
    if (!exitCondition.valid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    buildWordDeckExitCondition,
    formatWordDeckReadyReport,
    main,
    parseArgs,
    resolveKanjiTsvPath,
    resolveWordTsvPath,
    loadCoverageWordTsvByLevel,
};
