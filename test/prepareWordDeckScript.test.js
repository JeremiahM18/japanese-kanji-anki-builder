const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    buildWordDeckExitCondition,
    formatWordDeckReadyReport,
    resolveKanjiTsvPath,
} = require("../scripts/prepareWordDeck");

function buildReadyExitSummary(overrides = {}) {
    return {
        completion: {
            trueAnimationCoverage: {
                coveredKanji: 2,
                totalKanji: 2,
            },
            readingGapTriageByLevel: {},
            readingCoverageAuditByLevel: {
                N5: {
                    policyAudit: { valid: true },
                    readingBreakdownAudit: { valid: true },
                    kanjiBreakdownContextAudit: { valid: true },
                    cardBackAudit: { valid: true },
                    exampleReadingAlignmentAudit: { valid: true },
                },
            },
            ...(overrides.completion || {}),
        },
        ...overrides,
    };
}

test("formatWordDeckReadyReport surfaces reading coverage health alongside vocabulary completion", () => {
    const text = formatWordDeckReadyReport({
        outDir: "C:/repo/out/word-build",
        levels: [5],
        exports: [{ level: 5, rows: 258 }],
        governance: {
            canonicalRows: 258,
            curatedOnlyRows: 0,
            inferredOnlyRows: 0,
        },
        completion: {
            contractInventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 6, "5": 258 },
            excludedContractCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 13 },
            starterGovernance: {
                coverageByLevel: { 5: 100 },
                canonicalStarterCounts: { 5: 258 },
                defaultDeckStarterCounts: { 5: 258 },
            },
            readingCoverageContract: {
                explicitCoveragePercentByLevel: { 5: 3.69 },
                explicitCoverageEntriesByLevel: { 5: 10 },
                starterEntriesByLevel: { 5: 258 },
            },
            readingCoverageAuditByLevel: {
                N5: {
                    totalReadings: 344,
                    coveredReadings: 181,
                    priorLevelCoveredReadings: 0,
                    currentLevelCoveredReadings: 181,
                    distinctGapReadings: 147,
                    variantGapReadings: 16,
                    coverageLabel: "N5",
                    policyAudit: {
                        standaloneViolationCount: 0,
                        badgeViolationCount: 0,
                    },
                    sentenceOrthographyAudit: {
                        suspiciousKanaOnlyCount: 2,
                    },
                    exampleReadingAlignmentAudit: {
                        mismatchedExampleReadingCount: 0,
                    },
                    readingBreakdownAudit: {
                        missingMixedBreakdownCount: 0,
                        nonRubyBreakdownCount: 0,
                    },
                    cardBackAudit: {
                        requiredCoveragePercent: 100,
                        requiredReadyCount: 2500,
                        requiredTotalCount: 2500,
                        requiredMissingCount: 0,
                        fields: {
                            reading: { label: "reading", readyCount: 258, totalCount: 258 },
                            readingBreakdown: { label: "furigana breakdown", readyCount: 258, totalCount: 258 },
                            audio: { label: "audio", readyCount: 258, totalCount: 258 },
                            pitchAccent: { label: "pitch accent", readyCount: 258, totalCount: 258 },
                            meaning: { label: "meaning", readyCount: 258, totalCount: 258 },
                            jlptLevel: { label: "JLPT label", readyCount: 258, totalCount: 258 },
                            coverageRole: { label: "coverage role", readyCount: 258, totalCount: 258 },
                            focusKanji: { label: "study focus", readyCount: 258, totalCount: 258 },
                            coversReading: { label: "covered reading", readyCount: 258, totalCount: 258 },
                            kanjiBreakdown: { label: "kanji breakdown", readyCount: 258, totalCount: 258 },
                            exampleSentence: { label: "example sentence", readyCount: 258, totalCount: 258 },
                            notes: { label: "notes", readyCount: 20, totalCount: 258 },
                        },
                    },
                    readiness: {
                        status: "incomplete",
                    },
                },
            },
            readingGapTriageByLevel: {
                N5: {
                    editorialReviewItems: 147,
                    promoteCuratedExampleItems: 0,
                    deferVariantItems: 16,
                },
            },
            pitchAccentReviewByLevel: {
                N5: {
                    fieldPresent: true,
                    totalWords: 258,
                    annotatedWords: 0,
                    missingPitchAccent: 258,
                    ungovernedPitchAccent: 0,
                    sourceMismatchPitchAccent: 0,
                    invalidSourcePattern: 0,
                    sourceIdentityIssues: 0,
                    coveragePercent: 0,
                    sourceCounts: {},
                },
            },
            trueAnimationCoverage: {
                coveredKanji: 166,
                totalKanji: 166,
                svgFallbackKanji: 0,
            },
        },
        referencedKanjiCount: 166,
        package: {
            rootDir: "C:/repo/out/word-build/package",
            mediaAssetCount: 313,
            mediaCounts: {
                strokeOrder: 165,
                strokeOrderImage: 148,
                strokeOrderAnimation: 165,
                trueStrokeOrderAnimation: 165,
                svgStrokeOrderAnimationFallback: 0,
                audio: 0,
            },
            ankiPackage: {
                filePath: null,
                skipped: true,
                skipReason: "Python packaging blocked",
            },
        },
        settings: {
            includeInferred: false,
        },
    }, {
        enableAudio: false,
    });

    assert.match(text, /N5 starter governance: 100% \(258\/258\)/);
    assert.match(text, /N5 readiness status: incomplete/);
    assert.match(text, /N5 reading coverage: 52\.6% \(181\/344\)/);
    assert.match(text, /covered by earlier decks: 0/);
    assert.match(text, /covered by this deck level: 181/);
    assert.match(text, /distinct missing targets: 147, variant-style gaps: 16/);
    assert.match(text, /deck policy: 0 word level placement violations, 0 standalone wrong-level cards, 0 missing labels/);
    assert.match(text, /sentence orthography review: 2 suspicious kana-only examples/);
    assert.match(text, /example reading alignment: 0 mismatches/);
    assert.match(text, /reading breakdown review: 0 blanks, 0 non-ruby kanji breakdowns/);
    assert.match(text, /card back review: 100% \(2500\/2500\) required fields ready, 0 missing/);
    assert.match(text, /card back fields: reading 258\/258, furigana breakdown 258\/258, audio 258\/258/);
    assert.match(text, /pitch accent review: 0% \(0\/258\) annotated, 258 missing, 0 ungoverned, 0 source\/render mismatches, 0 invalid source patterns, 0 source identity issues, 0 generated labels missing, field present/);
    assert.match(text, /triage backlog: 147 review-needed before card work, 0 actionable curated candidates, 16 deferred variants or low learner value/);
    assert.match(text, /True looping animation coverage: 100% \(166\/166\)/);
    assert.match(text, /True looping animation assets: 165/);
    assert.match(text, /Canonical inventory counts: N5=258, N4=6/);
    assert.match(text, /Tracked source-only exclusions: N5=13, N4=0/);
    assert.match(text, /Anki package status: skipped \(Python packaging blocked\)/);
    assert.match(text, /Package staging: rebuilt for --levels=5/);
    assert.match(text, /Next step: import the TSV from the package exports folder/);
    assert.doesNotMatch(text, /import the generated \.apkg/);
});

test("formatWordDeckReadyReport names the ready APKG and level-specific package staging", () => {
    const text = formatWordDeckReadyReport({
        outDir: "C:/repo/out/word-build",
        levels: [5, 4],
        exports: [{ level: 5, rows: 287 }, { level: 4, rows: 700 }],
        governance: {
            canonicalRows: 987,
            curatedOnlyRows: 0,
            inferredOnlyRows: 0,
        },
        completion: {
            contractInventoryCounts: { "1": 26, "2": 28, "3": 269, "4": 700, "5": 287 },
            excludedContractCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 20 },
            starterGovernance: {
                coverageByLevel: { 5: 100 },
                canonicalStarterCounts: { 5: 287 },
                defaultDeckStarterCounts: { 5: 287 },
            },
            readingCoverageContract: {
                explicitCoveragePercentByLevel: { 5: 55.75 },
                explicitCoverageEntriesByLevel: { 5: 160 },
                starterEntriesByLevel: { 5: 287 },
            },
            readingCoverageAuditByLevel: {
                N5: {
                    totalReadings: 344,
                    coveredReadings: 239,
                    distinctGapReadings: 88,
                    variantGapReadings: 17,
                    readiness: { status: "ready_with_deferred_variants" },
                    policyAudit: { standaloneViolationCount: 0, badgeViolationCount: 0 },
                    readingBreakdownAudit: { nonRubyBreakdownCount: 0 },
                    cardBackAudit: { requiredCoveragePercent: 100, requiredReadyCount: 1, requiredTotalCount: 1, requiredMissingCount: 0, fields: {} },
                },
                N4: {
                    totalReadings: 755,
                    coveredReadings: 579,
                    distinctGapReadings: 148,
                    variantGapReadings: 28,
                    readiness: { status: "ready_with_deferred_variants" },
                    policyAudit: { standaloneViolationCount: 0, badgeViolationCount: 0 },
                    readingBreakdownAudit: { nonRubyBreakdownCount: 0 },
                    cardBackAudit: { requiredCoveragePercent: 100, requiredReadyCount: 1, requiredTotalCount: 1, requiredMissingCount: 0, fields: {} },
                },
            },
            readingGapTriageByLevel: {},
            trueAnimationCoverage: {
                coveredKanji: 440,
                totalKanji: 440,
                svgFallbackKanji: 0,
            },
        },
        referencedKanjiCount: 440,
        package: {
            rootDir: "C:/repo/out/word-build/package",
            mediaAssetCount: 1427,
            mediaCounts: {
                strokeOrder: 440,
                strokeOrderImage: 0,
                strokeOrderAnimation: 440,
                trueStrokeOrderAnimation: 440,
                svgStrokeOrderAnimationFallback: 0,
                audio: 987,
            },
            ankiPackage: {
                filePath: "C:/repo/out/word-build/package/japanese-kanji-builder-words-n5-n4.apkg",
            },
        },
        settings: {
            includeInferred: false,
        },
    }, {
        enableAudio: true,
    });

    assert.match(text, /APKG ready: C:\/repo\/out\/word-build\/package\/japanese-kanji-builder-words-n5-n4\.apkg/);
    assert.match(text, /Package staging: rebuilt for --levels=5,4/);
    assert.match(text, /Next step: import C:\/repo\/out\/word-build\/package\/japanese-kanji-builder-words-n5-n4\.apkg into Anki/);
    assert.match(text, /If you switch levels, rerun `npm run deck:words:ready -- --levels=5,4` before rerunning `npm run deck:words:apkg -- --levels=5,4`/);
});

test("resolveKanjiTsvPath points word completion back to the kanji export for the same level", () => {
    assert.equal(
        resolveKanjiTsvPath("C:/repo/out/build", 5),
        path.join("C:/repo/out/build", "exports", "jlpt-n5.tsv")
    );
});

test("buildWordDeckExitCondition keeps JSON and text exit gates on one policy surface", () => {
    assert.equal(buildWordDeckExitCondition(buildReadyExitSummary()).valid, true);

    const withActiveTriage = buildReadyExitSummary({
        completion: {
            trueAnimationCoverage: {
                coveredKanji: 2,
                totalKanji: 2,
            },
            readingGapTriageByLevel: {
                N5: {
                    editorialReviewItems: 1,
                    promoteCuratedExampleItems: 0,
                },
            },
            readingCoverageAuditByLevel: {
                N5: {
                    policyAudit: { valid: true },
                    readingBreakdownAudit: { valid: true },
                    kanjiBreakdownContextAudit: { valid: true },
                    cardBackAudit: { valid: true },
                    exampleReadingAlignmentAudit: { valid: true },
                },
            },
        },
    });
    assert.equal(buildWordDeckExitCondition(withActiveTriage).valid, true);
    assert.equal(buildWordDeckExitCondition(withActiveTriage, { requireNoActiveTriage: true }).valid, false);
    assert.equal(buildWordDeckExitCondition(withActiveTriage, { requireNoActiveTriage: true }).blocksOnActiveTriage, true);

    const blockers = [
        [
            "hasFullTrueAnimationCoverage",
            buildReadyExitSummary({
                completion: {
                    trueAnimationCoverage: { coveredKanji: 1, totalKanji: 2 },
                },
            }),
        ],
        [
            "hasPolicyViolations",
            buildReadyExitSummary({
                completion: {
                    readingCoverageAuditByLevel: {
                        N5: {
                            policyAudit: { valid: false },
                            readingBreakdownAudit: { valid: true },
                        },
                    },
                },
            }),
        ],
        [
            "hasReadingBreakdownViolations",
            buildReadyExitSummary({
                completion: {
                    readingCoverageAuditByLevel: {
                        N5: {
                            policyAudit: { valid: true },
                            readingBreakdownAudit: { valid: false },
                        },
                    },
                },
            }),
        ],
        [
            "hasKanjiBreakdownContextViolations",
            buildReadyExitSummary({
                completion: {
                    readingCoverageAuditByLevel: {
                        N5: {
                            policyAudit: { valid: true },
                            readingBreakdownAudit: { valid: true },
                            kanjiBreakdownContextAudit: { valid: false },
                        },
                    },
                },
            }),
        ],
        [
            "hasCardBackViolations",
            buildReadyExitSummary({
                completion: {
                    readingCoverageAuditByLevel: {
                        N5: {
                            policyAudit: { valid: true },
                            readingBreakdownAudit: { valid: true },
                            cardBackAudit: { valid: false },
                        },
                    },
                },
            }),
        ],
        [
            "hasExampleReadingAlignmentViolations",
            buildReadyExitSummary({
                completion: {
                    readingCoverageAuditByLevel: {
                        N5: {
                            policyAudit: { valid: true },
                            readingBreakdownAudit: { valid: true },
                            exampleReadingAlignmentAudit: { valid: false },
                        },
                    },
                },
            }),
        ],
    ];

    for (const [flagName, summary] of blockers) {
        const exitCondition = buildWordDeckExitCondition(summary);
        assert.equal(exitCondition.valid, false, `${flagName} should block word deck exit success`);
        assert.equal(exitCondition[flagName], flagName === "hasFullTrueAnimationCoverage" ? false : true);
    }
});
