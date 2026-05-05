const {
    buildWordReadingCoverageReport,
    buildWordReadingGapTriage,
    parseCoversReadingField,
    parseKanjiTsv,
    parseWordTsv,
} = require("./wordReadingCoverageService");
const {
    extractRenderedPitchAccentPattern,
    parsePitchAccentPattern,
} = require("./pitchAccentRenderService");
const {
    GENERATED_PITCH_LABEL,
    isGeneratedPitchAccentSource,
    validateWordPitchAccentSource,
} = require("./wordPitchAccentVerificationService");
const { buildCoverageWordRows } = require("./wordDeckCoverageScopeService");
const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const { HAN_CHAR_RE, isKanaOnly, katakanaToHiragana } = require("../utils/japanese");
const {
    buildWordLevelAnchorResult,
    formatKanjiLevelList,
} = require("./wordLevelAnchorAuditService");

function extractConstituentKanji(text) {
    return [...new Set(
        Array.from(String(text || ""))
            .filter((char) => HAN_CHAR_RE.test(char) && char !== "々")
    )];
}

function extractExampleSentenceJapanese(exampleSentence) {
    return String(exampleSentence || "")
        .split(" ／ ")
        .map((part) => part.trim())
        .filter(Boolean)[0] || "";
}

function extractExampleSentenceReading(exampleSentence) {
    return String(exampleSentence || "")
        .split(" ／ ")
        .map((part) => part.trim())
        .filter(Boolean)[1] || "";
}

function normalizeKanaSearchText(value) {
    return katakanaToHiragana(String(value || ""))
        .replace(/[^\p{Script=Hiragana}ー]/gu, "");
}

function buildWordDeckSentenceOrthographyAudit({ wordRows }) {
    const flaggedRows = [];

    for (const row of Array.isArray(wordRows) ? wordRows : []) {
        const word = String(row?.Word || row?.word || "").trim();
        const reading = String(row?.Reading || row?.reading || "").trim();
        const japaneseSentence = extractExampleSentenceJapanese(
            row?.ExampleSentence || row?.exampleSentence || ""
        );
        const kanjiList = extractConstituentKanji(word);

        if (!word || !reading || !japaneseSentence || kanjiList.length === 0) {
            continue;
        }

        if (kanjiList.some((kanji) => japaneseSentence.includes(kanji))) {
            continue;
        }

        const normalizedReading = normalizeKanaSearchText(reading);
        const normalizedJapaneseSentence = normalizeKanaSearchText(japaneseSentence);

        if (!normalizedReading || !normalizedJapaneseSentence.includes(normalizedReading)) {
            continue;
        }

        flaggedRows.push({
            word,
            reading,
            sentence: japaneseSentence,
            missingKanji: kanjiList,
        });
    }

    return {
        suspiciousKanaOnlyCount: flaggedRows.length,
        flaggedRows,
    };
}

function buildWordDeckExampleReadingAlignmentAudit({ wordRows }) {
    const flaggedRows = [];

    for (const row of Array.isArray(wordRows) ? wordRows : []) {
        const word = String(row?.Word || row?.word || "").trim();
        const reading = String(row?.Reading || row?.reading || "").trim();
        const exampleSentence = row?.ExampleSentence || row?.exampleSentence || "";
        const japaneseSentence = extractExampleSentenceJapanese(exampleSentence);
        const readingSentence = extractExampleSentenceReading(exampleSentence);

        if (!word || !reading || !japaneseSentence || !readingSentence) {
            continue;
        }

        if (!japaneseSentence.includes(word)) {
            continue;
        }

        const normalizedReading = normalizeKanaSearchText(reading);
        const normalizedReadingSentence = normalizeKanaSearchText(readingSentence);

        if (!normalizedReading || normalizedReadingSentence.includes(normalizedReading)) {
            continue;
        }

        flaggedRows.push({
            word,
            reading,
            sentence: japaneseSentence,
            sentenceReading: readingSentence,
        });
    }

    return {
        valid: flaggedRows.length === 0,
        mismatchedExampleReadingCount: flaggedRows.length,
        flaggedRows,
    };
}

function buildWordDeckPitchAccentAudit({ wordRows, starterEntries = {}, wordPitchAccentData = {} }) {
    const rows = Array.isArray(wordRows) ? wordRows : [];
    const annotatedRows = [];
    const missingRows = [];
    const sourceCounts = {};
    const ungovernedRows = [];
    const sourceMismatchRows = [];
    const invalidSourceRows = [];
    const sourceIdentityRows = [];
    const generatedUnlabeledRows = [];
    let fieldPresent = rows.length === 0;

    for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(row, "PitchAccent")) {
            fieldPresent = true;
        }

        const pitchAccent = String(row?.PitchAccent || row?.pitchAccent || "").trim();
        const word = String(row?.Word || row?.word || "").trim();
        const reading = String(row?.Reading || row?.reading || "").trim();
        const key = buildWordStudyEntryKey({ written: word, reading });

        if (pitchAccent) {
            const pitchEntry = wordPitchAccentData?.entries?.[key] || null;
            const starterEntry = starterEntries?.[key] || null;
            const sourceId = String(pitchEntry?.sourceId || starterEntry?.pitchAccentSource || "").trim();
            const sourcePattern = String(pitchEntry?.pattern || starterEntry?.pitchAccent || "").trim();
            const expectedAccents = parsePitchAccentPattern(sourcePattern);
            const renderedAccents = extractRenderedPitchAccentPattern(pitchAccent);
            const sourceEntry = pitchEntry || (sourceId && sourcePattern ? {
                pattern: sourcePattern,
                sourceId,
            } : null);
            if (sourceId) {
                sourceCounts[sourceId] = (sourceCounts[sourceId] || 0) + 1;
            } else {
                ungovernedRows.push({ word, reading, pitchAccent });
            }
            if (
                isGeneratedPitchAccentSource({
                    sourceId,
                    source: wordPitchAccentData?.sources?.[sourceId],
                })
                && !pitchAccent.includes(GENERATED_PITCH_LABEL)
            ) {
                generatedUnlabeledRows.push({ word, reading, sourceId, pitchAccent });
            }
            if (sourceId && expectedAccents.length === 0) {
                invalidSourceRows.push({ word, reading, sourceId, sourcePattern });
            } else if (
                sourceId
                && (
                    renderedAccents.length !== expectedAccents.length
                    || renderedAccents.some((accent, index) => accent !== expectedAccents[index])
                )
            ) {
                sourceMismatchRows.push({
                    word,
                    reading,
                    pitchAccent,
                    sourceId,
                    sourcePattern,
                    expectedAccents,
                    renderedAccents,
                });
            }
            if (sourceId) {
                const sourceIdentityFailures = validateWordPitchAccentSource({
                    word,
                    reading,
                    sourceEntry,
                    sources: wordPitchAccentData?.sources || {},
                });
                if (sourceIdentityFailures.length > 0) {
                    sourceIdentityRows.push({
                        word,
                        reading,
                        sourceId,
                        sourcePattern,
                        failures: sourceIdentityFailures,
                    });
                }
            }
            annotatedRows.push({
                word,
                reading,
                pitchAccent,
                sourceId: sourceId || "",
                sourcePattern,
                expectedAccents,
                renderedAccents,
            });
            continue;
        }

        missingRows.push({ word, reading });
    }

    return {
        valid: fieldPresent
            && missingRows.length === 0
            && ungovernedRows.length === 0
            && sourceMismatchRows.length === 0
            && invalidSourceRows.length === 0
            && sourceIdentityRows.length === 0
            && generatedUnlabeledRows.length === 0,
        fieldPresent,
        totalWords: rows.length,
        annotatedWords: annotatedRows.length,
        missingPitchAccent: missingRows.length,
        sourceCounts,
        ungovernedPitchAccent: ungovernedRows.length,
        sourceMismatchPitchAccent: sourceMismatchRows.length,
        invalidSourcePattern: invalidSourceRows.length,
        sourceIdentityIssues: sourceIdentityRows.length,
        generatedUnlabeledPitchAccent: generatedUnlabeledRows.length,
        coveragePercent: rows.length > 0
            ? Number(((annotatedRows.length / rows.length) * 100).toFixed(1))
            : 0,
        annotatedRows,
        missingRows,
        ungovernedRows,
        sourceMismatchRows,
        invalidSourceRows,
        sourceIdentityRows,
        generatedUnlabeledRows,
    };
}

function buildWordDeckReadingBreakdownAudit({ wordRows }) {
    const missingRows = [];
    const missingMixedRows = [];
    const nonRubyRows = [];

    for (const row of Array.isArray(wordRows) ? wordRows : []) {
        const word = String(row?.Word || row?.word || "").trim();
        const reading = String(row?.Reading || row?.reading || "").trim();
        const readingBreakdown = String(row?.ReadingBreakdown || row?.readingBreakdown || "").trim();
        const chars = Array.from(word);
        const hasKanji = chars.some((char) => HAN_CHAR_RE.test(char) && char !== "々");
        const hasKana = chars.some((char) => isKanaOnly(char));

        if (!readingBreakdown) {
            missingRows.push({ word, reading });
            if (hasKanji && hasKana) {
                missingMixedRows.push({ word, reading });
            }
            continue;
        }

        if (hasKanji && readingBreakdown && !readingBreakdown.includes("<ruby>")) {
            nonRubyRows.push({ word, reading, readingBreakdown });
        }
    }

    return {
        valid: missingRows.length === 0 && nonRubyRows.length === 0,
        missingBreakdownCount: missingRows.length,
        missingMixedBreakdownCount: missingMixedRows.length,
        nonRubyBreakdownCount: nonRubyRows.length,
        missingRows,
        missingMixedRows,
        nonRubyRows,
    };
}

function extractReadingBreakdownContexts(readingBreakdown) {
    const contexts = [];
    const rubyPattern = /<ruby>([^<]+)<rt>([^<]+)<\/rt><\/ruby>/g;
    let match;

    while ((match = rubyPattern.exec(String(readingBreakdown || ""))) !== null) {
        const surface = String(match[1] || "").trim();
        const reading = String(match[2] || "").trim();
        const kanjiList = extractConstituentKanji(surface);
        if (!surface || !reading || kanjiList.length === 0) {
            continue;
        }

        if (kanjiList.length === 1 && !surface.includes("々")) {
            contexts.push({
                type: "single",
                surface,
                reading,
                kanji: kanjiList[0],
            });
            continue;
        }

        if (kanjiList.length > 1) {
            contexts.push({
                type: "group",
                surface,
                reading,
                kanjiList,
            });
        }
    }

    return contexts;
}

function extractReadingBreakdownKanjiReadings(readingBreakdown) {
    return extractReadingBreakdownContexts(readingBreakdown)
        .filter((context) => context.type === "single")
        .map((context) => ({
            kanji: context.kanji,
            reading: context.reading,
        }));
}

function normalizeKanjiBreakdownPrimaryReading(value) {
    return String(value || "")
        .replace(/^word reading:\s*/i, "")
        .trim();
}

function extractKanjiBreakdownPrimaryReadings(kanjiBreakdown) {
    const readings = new Map();
    const itemPattern = /<span class="kanji-char">([^<]+)<\/span>([\s\S]*?)(?=<span class="kanji-char">|$)/g;
    let match;

    while ((match = itemPattern.exec(String(kanjiBreakdown || ""))) !== null) {
        const kanji = String(match[1] || "").trim();
        const body = String(match[2] || "");
        const primaryMatch = body.match(/<span class="kanji-primary">([^<]*)<\/span>/);
        const meaningMatch = body.match(/<div class="kanji-meaning">([^（／<]+)/);
        if (kanji && primaryMatch) {
            const rawReading = String(primaryMatch[1] || "").trim();
            readings.set(kanji, {
                rawReading,
                reading: normalizeKanjiBreakdownPrimaryReading(rawReading),
                scope: rawReading.toLowerCase().startsWith("word reading:") ? "word" : "kanji",
                displaySurface: String(meaningMatch?.[1] || kanji).trim(),
            });
        }
    }

    return readings;
}

function kanjiBreakdownReadingMatchesContext({ expectedReading, actualReading }) {
    return actualReading === expectedReading;
}

function coverageReadingMatchesContext({ expectedReading, actualReading }) {
    const expectedCoverageReading = normalizeKanaSearchText(expectedReading);
    const normalizedActualCoverageReading = normalizeKanaSearchText(actualReading);
    return normalizedActualCoverageReading === expectedCoverageReading
        || normalizedActualCoverageReading.startsWith(expectedCoverageReading);
}

function buildWordDeckKanjiBreakdownContextAudit({ wordRows }) {
    const mismatchedRows = [];
    const coverageMismatchedRows = [];

    for (const row of Array.isArray(wordRows) ? wordRows : []) {
        const word = String(row?.Word || row?.word || "").trim();
        const reading = String(row?.Reading || row?.reading || "").trim();
        const constituentKanji = Array.from(word).filter((char) => HAN_CHAR_RE.test(char) && char !== "々");
        if (constituentKanji.length === 0) {
            continue;
        }

        const contexts = extractReadingBreakdownContexts(row?.ReadingBreakdown || row?.readingBreakdown || "");
        const readingPairs = extractReadingBreakdownKanjiReadings(row?.ReadingBreakdown || row?.readingBreakdown || "");
        if (readingPairs.length === 0) {
            const hasGroupContext = contexts.some((context) => context.type === "group");
            if (!hasGroupContext) {
                continue;
            }
        }

        const coverageReadings = parseCoversReadingField(row?.CoversReading || row?.coversReading || "");
        const readingCounts = new Map();
        for (const pair of readingPairs) {
            readingCounts.set(pair.kanji, (readingCounts.get(pair.kanji) || 0) + 1);
        }

        const breakdownReadings = extractKanjiBreakdownPrimaryReadings(row?.KanjiBreakdown || row?.kanjiBreakdown || "");
        for (const pair of readingPairs) {
            if (readingCounts.get(pair.kanji) !== 1 || !breakdownReadings.has(pair.kanji)) {
                continue;
            }

            const breakdown = breakdownReadings.get(pair.kanji);
            const actualReading = breakdown?.reading || "";
            if (!kanjiBreakdownReadingMatchesContext({
                expectedReading: pair.reading,
                actualReading,
            })) {
                mismatchedRows.push({
                    word,
                    reading,
                    kanji: pair.kanji,
                    expectedReading: pair.reading,
                    actualReading,
                });
            }

            if (coverageReadings.has(pair.kanji)) {
                const actualCoverageReading = coverageReadings.get(pair.kanji);
                if (!coverageReadingMatchesContext({
                    expectedReading: pair.reading,
                    actualReading: actualCoverageReading,
                })) {
                    coverageMismatchedRows.push({
                        word,
                        reading,
                        kanji: pair.kanji,
                        expectedReading: pair.reading,
                        actualCoverageReading,
                    });
                }
            }
        }

        for (const [kanji, actualCoverageReading] of coverageReadings.entries()) {
            const contextualReadings = readingPairs
                .filter((pair) => pair.kanji === kanji)
                .map((pair) => pair.reading);
            if (contextualReadings.length <= 1) {
                continue;
            }

            const matchesAnyContext = contextualReadings.some((expectedReading) => coverageReadingMatchesContext({
                expectedReading,
                actualReading: actualCoverageReading,
            }));
            if (!matchesAnyContext) {
                coverageMismatchedRows.push({
                    word,
                    reading,
                    kanji,
                    expectedReading: contextualReadings.join(" / "),
                    actualCoverageReading,
                });
            }
        }

        const groupContexts = contexts.filter((context) => context.type === "group");
        for (const group of groupContexts) {
            for (const kanji of group.kanjiList) {
                if (!breakdownReadings.has(kanji)) {
                    continue;
                }

                const breakdown = breakdownReadings.get(kanji);
                if (
                    breakdown.scope !== "word"
                    || breakdown.reading !== group.reading
                    || breakdown.displaySurface !== group.surface
                ) {
                    mismatchedRows.push({
                        word,
                        reading,
                        kanji,
                        expectedReading: group.reading,
                        actualReading: breakdown?.reading || "",
                        expectedSurface: group.surface,
                    });
                }

                if (coverageReadings.has(kanji)) {
                    coverageMismatchedRows.push({
                        word,
                        reading,
                        kanji,
                        groupSurface: group.surface,
                        groupReading: group.reading,
                        actualCoverageReading: coverageReadings.get(kanji),
                    });
                }
            }
        }
    }

    const mismatchCount = mismatchedRows.length + coverageMismatchedRows.length;
    return {
        valid: mismatchCount === 0,
        mismatchCount,
        mismatchedRows,
        coverageMismatchedRows,
    };
}

function hasFieldValue(row, fieldName) {
    return String(row?.[fieldName] || "").trim().length > 0;
}

function hasJapaneseKanji(value) {
    return Array.from(String(value || "")).some((char) => HAN_CHAR_RE.test(char) && char !== "々");
}

function needsReadingBreakdown(row) {
    return String(row?.Word || row?.word || "").trim().length > 0;
}

function buildFieldCoverage({ rows, key, label, fieldName, required, appliesTo = () => true, maxMissingRows = 20 }) {
    let readyCount = 0;
    let totalCount = 0;
    let missingCount = 0;
    const missingRows = [];

    for (const row of rows) {
        if (!appliesTo(row)) {
            continue;
        }

        totalCount += 1;
        if (hasFieldValue(row, fieldName)) {
            readyCount += 1;
            continue;
        }

        missingCount += 1;
        if (missingRows.length < maxMissingRows) {
            missingRows.push({
                word: String(row?.Word || row?.word || "").trim(),
                reading: String(row?.Reading || row?.reading || "").trim(),
            });
        }
    }

    return {
        key,
        label,
        fieldName,
        required,
        readyCount,
        totalCount,
        missingCount,
        coveragePercent: totalCount > 0
            ? Number(((readyCount / totalCount) * 100).toFixed(1))
            : 100,
        missingRows,
    };
}

function buildWordDeckCardBackAudit({ wordRows, maxMissingRows = 20 }) {
    const rows = Array.isArray(wordRows) ? wordRows : [];
    const fieldRules = [
        { key: "reading", label: "reading", fieldName: "Reading", required: true },
        {
            key: "readingBreakdown",
            label: "furigana breakdown",
            fieldName: "ReadingBreakdown",
            required: true,
            appliesTo: needsReadingBreakdown,
        },
        { key: "audio", label: "audio", fieldName: "Audio", required: true },
        { key: "pitchAccent", label: "pitch accent", fieldName: "PitchAccent", required: true },
        { key: "meaning", label: "meaning", fieldName: "Meaning", required: true },
        { key: "jlptLevel", label: "JLPT label", fieldName: "JLPTLevel", required: true },
        { key: "coverageRole", label: "coverage role", fieldName: "CoverageRole", required: true },
        { key: "focusKanji", label: "study focus", fieldName: "FocusKanji", required: true },
        { key: "coversReading", label: "covered reading", fieldName: "CoversReading", required: true },
        {
            key: "kanjiBreakdown",
            label: "kanji breakdown",
            fieldName: "KanjiBreakdown",
            required: true,
            appliesTo: (row) => hasJapaneseKanji(row?.Word || row?.word),
        },
        { key: "exampleSentence", label: "example sentence", fieldName: "ExampleSentence", required: true },
        { key: "notes", label: "notes", fieldName: "Notes", required: false },
    ];
    const fields = Object.fromEntries(
        fieldRules.map((rule) => [rule.key, buildFieldCoverage({ rows, maxMissingRows, ...rule })])
    );
    const requiredFields = Object.values(fields).filter((field) => field.required);
    const requiredMissingRows = requiredFields.flatMap((field) => field.missingRows.map((row) => ({
        ...row,
        field: field.label,
    })));
    const requiredReadyCount = requiredFields.reduce((total, field) => total + field.readyCount, 0);
    const requiredTotalCount = requiredFields.reduce((total, field) => total + field.totalCount, 0);
    const requiredMissingCount = requiredFields.reduce((total, field) => total + field.missingCount, 0);

    return {
        valid: requiredMissingCount === 0,
        totalRows: rows.length,
        requiredReadyCount,
        requiredTotalCount,
        requiredMissingCount,
        requiredCoveragePercent: requiredTotalCount > 0
            ? Number(((requiredReadyCount / requiredTotalCount) * 100).toFixed(1))
            : 100,
        fields,
        requiredMissingRows,
    };
}

function buildWordDeckPolicyAudit({ level, wordRows, jlptLevelContract, starterEntries = {} }) {
    const deckLevel = Number(level);
    if (!jlptLevelContract?.kanjiLevels) {
        return {
            valid: true,
            sameLevelAnchorViolationCount: 0,
            standaloneViolationCount: 0,
            badgeViolationCount: 0,
            focusViolationCount: 0,
            sameLevelAnchorViolations: [],
            standaloneViolations: [],
            badgeViolations: [],
            focusViolations: [],
        };
    }

    const standaloneViolations = [];
    const badgeViolations = [];
    const focusViolations = [];
    const sameLevelAnchorViolations = [];

    for (const row of Array.isArray(wordRows) ? wordRows : []) {
        const written = String(row?.Word || row?.word || "").trim();
        const reading = String(row?.Reading || row?.reading || "").trim();
        const breakdown = String(row?.KanjiBreakdown || row?.kanjiBreakdown || "");
        const writtenChars = Array.from(written);
        const kanjiList = extractConstituentKanji(written);
        const focusKanji = String(row?.FocusKanji || row?.focusKanji || "")
            .split("、")
            .map((kanji) => kanji.trim())
            .filter(Boolean);
        const key = buildWordStudyEntryKey({ written, reading });
        const learnerFitReason = starterEntries?.[key]?.levelPlacement?.reason || "";

        if (kanjiList.length === 0) {
            continue;
        }

        const anchorResult = buildWordLevelAnchorResult({
            written,
            deckLevel,
            learnerFitReason,
            kanjiLevelData: jlptLevelContract,
        });
        if (!anchorResult.valid) {
            sameLevelAnchorViolations.push({
                word: written,
                reading,
                deckLevel,
                anchorLevel: anchorResult.anchorLevel,
                placementStatus: anchorResult.placementStatus,
                kanjiLevels: anchorResult.kanjiLevels,
                learnerFitReason: anchorResult.learnerFitReason,
            });
        }

        for (const kanji of focusKanji) {
            if (!kanjiList.includes(kanji)) {
                focusViolations.push({
                    word: written,
                    kanji,
                    focusKanji: focusKanji.join("、"),
                });
            }
        }

        if (writtenChars.length === 1 && kanjiList.length === 1) {
            const kanji = kanjiList[0];
            const actualLevel = jlptLevelContract?.kanjiLevels?.[kanji] ?? null;

            if (!Number.isInteger(actualLevel) || actualLevel !== deckLevel) {
                standaloneViolations.push({
                    word: written,
                    kanji,
                    actualLevel,
                });
            }
            continue;
        }

        for (const kanji of kanjiList) {
            const actualLevel = jlptLevelContract?.kanjiLevels?.[kanji] ?? null;
            const expectedLabel = Number.isInteger(actualLevel)
                ? (actualLevel === deckLevel ? "" : `JLPT N${actualLevel} kanji`)
                : "Outside JLPT contract";

            if (!expectedLabel) {
                continue;
            }

            if (!breakdown.includes(expectedLabel)) {
                badgeViolations.push({
                    word: written,
                    kanji,
                    actualLevel,
                    expectedLabel,
                });
            }
        }
    }

    return {
        valid: sameLevelAnchorViolations.length === 0
            && standaloneViolations.length === 0
            && badgeViolations.length === 0
            && focusViolations.length === 0,
        sameLevelAnchorViolationCount: sameLevelAnchorViolations.length,
        levelPlacementViolationCount: sameLevelAnchorViolations.length,
        standaloneViolationCount: standaloneViolations.length,
        badgeViolationCount: badgeViolations.length,
        focusViolationCount: focusViolations.length,
        sameLevelAnchorViolations,
        levelPlacementViolations: sameLevelAnchorViolations,
        standaloneViolations,
        badgeViolations,
        focusViolations,
    };
}

function buildWordDeckInventorySummary({ level, starterEntries, jlptWordLevelContract, builtWordRows }) {
    const canonicalEntries = Object.entries(jlptWordLevelContract?.wordLevels || {})
        .filter(([, entry]) => entry?.jlpt === level)
        .map(([key, entry]) => ({
            key,
            written: String(entry?.written || "").trim(),
            reading: String(entry?.reading || "").trim(),
            jlpt: entry?.jlpt ?? null,
            starterEntry: starterEntries?.[key] || null,
        }));
    const excludedEntries = Object.entries(jlptWordLevelContract?.excludedWordLevels || {})
        .filter(([, entry]) => entry?.jlpt === level)
        .map(([key, entry]) => ({
            key,
            written: String(entry?.written || "").trim(),
            reading: String(entry?.reading || "").trim(),
            jlpt: entry?.jlpt ?? null,
            exclusionReason: String(entry?.exclusionReason || "").trim(),
            starterEntry: starterEntries?.[key] || null,
        }));
    const builtKeys = new Set(
        (Array.isArray(builtWordRows) ? builtWordRows : []).map((row) => buildWordStudyEntryKey({
            written: row?.Word || row?.word,
            reading: row?.Reading || row?.reading,
        }))
    );

    const starterEligibleEntries = canonicalEntries;
    const builtEligibleEntries = starterEligibleEntries.filter((entry) => builtKeys.has(entry.key));
    const missingEligibleEntries = starterEligibleEntries.filter((entry) => !builtKeys.has(entry.key));
    const builtExtraEntries = (Array.isArray(builtWordRows) ? builtWordRows : [])
        .map((row) => ({
            key: buildWordStudyEntryKey({
                written: row?.Word || row?.word,
                reading: row?.Reading || row?.reading,
            }),
            written: String(row?.Word || row?.word || "").trim(),
            reading: String(row?.Reading || row?.reading || "").trim(),
            jlptLevel: String(row?.JLPTLevel || row?.jlptLevel || "").trim(),
        }))
        .filter((entry) => !canonicalEntries.some((contractEntry) => contractEntry.key === entry.key))
        .filter((entry) => !excludedEntries.some((contractEntry) => contractEntry.key === entry.key));

    return {
        level,
        canonicalInventoryCount: canonicalEntries.length,
        starterEligibleCount: starterEligibleEntries.length,
        builtEligibleCount: builtEligibleEntries.length,
        excludedSourceCount: excludedEntries.length,
        missingEligibleCount: missingEligibleEntries.length,
        extraBuiltCount: builtExtraEntries.length,
        starterEligibleCoveragePercent: starterEligibleEntries.length > 0
            ? Number(((builtEligibleEntries.length / starterEligibleEntries.length) * 100).toFixed(2))
            : 0,
        canonicalInventoryCoveragePercent: canonicalEntries.length > 0
            ? Number(((builtEligibleEntries.length / canonicalEntries.length) * 100).toFixed(2))
            : 0,
        excludedSourceEntries: excludedEntries,
        missingEligibleEntries,
        builtExtraEntries,
    };
}

function buildWordDeckCompletionReport({
    level,
    starterEntries,
    jlptWordLevelContract,
    jlptLevelContract,
    kanjiTsv,
    wordTsv,
    wordPitchAccentData = {},
    coverageWordTsvByLevel = null,
    coverageLevels = null,
}) {
    const kanjiRows = parseKanjiTsv(kanjiTsv);
    const wordRows = parseWordTsv(wordTsv);
    const coverageScope = coverageWordTsvByLevel
        ? buildCoverageWordRows({ level, wordTsvByLevel: coverageWordTsvByLevel, availableLevels: coverageLevels })
        : {
            coverageLevels: [level],
            coverageLabel: `N${level}`,
            wordRows,
        };
    const inventory = buildWordDeckInventorySummary({
        level,
        starterEntries,
        jlptWordLevelContract,
        builtWordRows: wordRows,
    });
    const readingCoverage = buildWordReadingCoverageReport({
        kanjiRows,
        wordRows: coverageScope.wordRows,
        levelLabel: `N${level}`,
    });
    const triage = buildWordReadingGapTriage(readingCoverage);
    const policyAudit = buildWordDeckPolicyAudit({
        level,
        wordRows,
        jlptLevelContract,
        starterEntries,
    });
    const sentenceOrthographyAudit = buildWordDeckSentenceOrthographyAudit({
        wordRows,
    });
    const exampleReadingAlignmentAudit = buildWordDeckExampleReadingAlignmentAudit({
        wordRows,
    });
    const pitchAccentAudit = buildWordDeckPitchAccentAudit({
        wordRows,
        starterEntries,
        wordPitchAccentData,
    });
    const readingBreakdownAudit = buildWordDeckReadingBreakdownAudit({
        wordRows,
    });
    const kanjiBreakdownContextAudit = buildWordDeckKanjiBreakdownContextAudit({
        wordRows,
    });
    const cardBackAudit = buildWordDeckCardBackAudit({
        wordRows,
    });
    const readiness = buildWordDeckReadiness({
        inventory,
        readingCoverage: readingCoverage.summary,
        triage: triage.summary,
        policyAudit,
        readingBreakdownAudit,
        kanjiBreakdownContextAudit,
        cardBackAudit,
        exampleReadingAlignmentAudit,
        pitchAccentAudit,
    });

    return {
        level,
        inventory,
        readingCoverage: readingCoverage.summary,
        coverageScope: {
            levels: coverageScope.coverageLevels,
            label: coverageScope.coverageLabel,
        },
        triage: triage.summary,
        policyAudit,
        sentenceOrthographyAudit,
        exampleReadingAlignmentAudit,
        pitchAccentAudit,
        readingBreakdownAudit,
        kanjiBreakdownContextAudit,
        cardBackAudit,
        readiness,
    };
}

function buildWordDeckReadiness({ inventory, readingCoverage, triage, policyAudit, readingBreakdownAudit = null, kanjiBreakdownContextAudit = null, cardBackAudit = null, exampleReadingAlignmentAudit = null, pitchAccentAudit = null }) {
    const hasMissingStarterRows = (inventory?.missingEligibleCount || 0) > 0;
    const hasActiveTriageItems = ((triage?.editorialReviewItems || 0) + (triage?.promoteCuratedExampleItems || 0)) > 0;
    const allOpenItemsDeferred = (triage?.totalItems || 0) > 0
        && (triage?.deferVariantItems || 0) === (triage?.totalItems || 0);
    const hasPolicyViolations = !policyAudit?.valid;
    const hasReadingBreakdownViolations = readingBreakdownAudit ? !readingBreakdownAudit.valid : false;
    const hasKanjiBreakdownContextViolations = kanjiBreakdownContextAudit ? !kanjiBreakdownContextAudit.valid : false;
    const hasCardBackViolations = cardBackAudit ? !cardBackAudit.valid : false;
    const hasExampleReadingAlignmentViolations = exampleReadingAlignmentAudit ? !exampleReadingAlignmentAudit.valid : false;
    const hasPitchAccentViolations = pitchAccentAudit ? !pitchAccentAudit.valid : false;
    const readingCoveragePercent = (readingCoverage?.totalReadings || 0) > 0
        ? Number((((readingCoverage?.coveredReadings || 0) / readingCoverage.totalReadings) * 100).toFixed(1))
        : 0;

    let status = "incomplete";
    if (!hasMissingStarterRows && !hasActiveTriageItems && !hasPolicyViolations && !hasReadingBreakdownViolations && !hasKanjiBreakdownContextViolations && !hasCardBackViolations && !hasExampleReadingAlignmentViolations && !hasPitchAccentViolations) {
        status = allOpenItemsDeferred ? "ready_with_deferred_variants" : "complete";
    }

    return {
        status,
        hasMissingStarterRows,
        hasActiveTriageItems,
        hasPolicyViolations,
        hasReadingBreakdownViolations,
        hasKanjiBreakdownContextViolations,
        hasCardBackViolations,
        hasExampleReadingAlignmentViolations,
        hasPitchAccentViolations,
        allOpenItemsDeferred,
        readingCoveragePercent,
    };
}

function formatCardBackFieldCoverage(cardBackAudit) {
    return Object.values(cardBackAudit?.fields || {})
        .map((field) => `${field.label} ${field.readyCount}/${field.totalCount}`)
        .join(", ");
}

function formatWordDeckCompletionReport(report, { maxEntries = 20 } = {}) {
    const lines = [
        `Japanese Kanji Builder Word Deck Completion Audit (N${report.level})`,
        "",
        "Readiness:",
        `- Status: ${report.readiness.status}`,
        `- Active triage backlog cleared: ${report.readiness.hasActiveTriageItems ? "no" : "yes"}`,
        `- Remaining open items are deferred variants only: ${report.readiness.allOpenItemsDeferred ? "yes" : "no"}`,
        `- Reading coverage: ${report.readiness.readingCoveragePercent}%`,
        `- Coverage counted from decks: ${report.coverageScope?.label || `N${report.level}`}`,
        "",
        "Vocabulary coverage:",
        `- Canonical inventory rows: ${report.inventory.canonicalInventoryCount}`,
        `- Starter-eligible rows: ${report.inventory.starterEligibleCount}`,
        `- Built starter-eligible rows: ${report.inventory.builtEligibleCount} (${report.inventory.starterEligibleCoveragePercent}%)`,
        `- Tracked source-only exclusions: ${report.inventory.excludedSourceCount}`,
        `- Missing starter-eligible rows: ${report.inventory.missingEligibleCount}`,
        `- Built rows outside canonical inventory: ${report.inventory.extraBuiltCount}`,
        "",
        "Deck policy audit:",
        `- Word level placement violations: ${report.policyAudit.levelPlacementViolationCount || 0}`,
        `- Standalone wrong-level cards: ${report.policyAudit.standaloneViolationCount}`,
        `- Missing cross-level/outside-level badges: ${report.policyAudit.badgeViolationCount}`,
        `- Focus kanji outside written word: ${report.policyAudit.focusViolationCount || 0}`,
        "",
        "Sentence orthography review:",
        `- Suspicious kana-only examples: ${report.sentenceOrthographyAudit.suspiciousKanaOnlyCount}`,
        `- Example reading mismatches: ${report.exampleReadingAlignmentAudit?.mismatchedExampleReadingCount || 0}`,
        "",
        "Reading breakdown review:",
        `- Rows missing reading breakdowns: ${report.readingBreakdownAudit?.missingBreakdownCount || 0}`,
        `- Mixed kanji/kana rows missing breakdowns: ${report.readingBreakdownAudit?.missingMixedBreakdownCount || 0}`,
        `- Non-ruby kanji breakdowns: ${report.readingBreakdownAudit?.nonRubyBreakdownCount || 0}`,
        `- Kanji breakdown context mismatches: ${report.kanjiBreakdownContextAudit?.mismatchCount || 0}`,
        "",
        "Card back review:",
        `- Required back-side fields: ${report.cardBackAudit?.requiredReadyCount || 0}/${report.cardBackAudit?.requiredTotalCount || 0} (${report.cardBackAudit?.requiredMissingCount || 0} missing)`,
        `- Field coverage: ${formatCardBackFieldCoverage(report.cardBackAudit)}`,
        "",
        "Pitch accent review:",
        `- Annotated rows: ${report.pitchAccentAudit?.annotatedWords || 0}/${report.pitchAccentAudit?.totalWords || 0}`,
        `- Missing pitch accent: ${report.pitchAccentAudit?.missingPitchAccent || 0}`,
        `- Ungoverned pitch accent: ${report.pitchAccentAudit?.ungovernedPitchAccent || 0}`,
        `- Source/render mismatches: ${report.pitchAccentAudit?.sourceMismatchPitchAccent || 0}`,
        `- Invalid source patterns: ${report.pitchAccentAudit?.invalidSourcePattern || 0}`,
        `- Source identity issues: ${report.pitchAccentAudit?.sourceIdentityIssues || 0}`,
        `- Generated pitch missing labels: ${report.pitchAccentAudit?.generatedUnlabeledPitchAccent || 0}`,
        "",
        "Reading coverage:",
        `- Readings audited: ${report.readingCoverage.totalReadings}`,
        `- Covered by word deck: ${report.readingCoverage.coveredReadings}`,
        `- Covered by JLPT core words: ${report.readingCoverage.coreCoveredReadings}`,
        `- Covered by reading-support words: ${report.readingCoverage.supportCoveredReadings}`,
        `- Covered by earlier decks: ${report.readingCoverage.priorLevelCoveredReadings || 0}`,
        `- Covered by this deck level: ${report.readingCoverage.currentLevelCoveredReadings || 0}`,
        `- Curated example exists but missing from word deck: ${report.readingCoverage.missingWordCardReadings}`,
        `- No curated example yet: ${report.readingCoverage.missingExampleReadings}`,
    ];

    if (report.inventory.missingEligibleEntries.length > 0) {
        lines.push("", "Missing starter-eligible N-level rows:");
        for (const entry of report.inventory.missingEligibleEntries.slice(0, maxEntries)) {
            lines.push(`- ${entry.written} (${entry.reading})`);
        }
    }

    if (report.inventory.excludedSourceEntries.length > 0) {
        lines.push("", "Tracked source-only exclusions outside canonical inventory:");
        for (const entry of report.inventory.excludedSourceEntries.slice(0, maxEntries)) {
            const reason = entry.exclusionReason ? ` — ${entry.exclusionReason}` : "";
            lines.push(`- ${entry.written} (${entry.reading})${reason}`);
        }
    }

    if (report.sentenceOrthographyAudit.flaggedRows.length > 0) {
        lines.push("", "Suspicious kana-only example sentences:");
        for (const row of report.sentenceOrthographyAudit.flaggedRows.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading}) — ${row.sentence}`);
        }
    }

    if ((report.exampleReadingAlignmentAudit?.flaggedRows || []).length > 0) {
        lines.push("", "Example reading mismatches:");
        for (const row of report.exampleReadingAlignmentAudit.flaggedRows.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading}) — ${row.sentence} ／ ${row.sentenceReading}`);
        }
    }

    if ((report.readingBreakdownAudit?.missingRows || []).length > 0) {
        lines.push("", "Rows missing reading breakdowns:");
        for (const row of report.readingBreakdownAudit.missingRows.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading})`);
        }
    }

    if ((report.readingBreakdownAudit?.nonRubyRows || []).length > 0) {
        lines.push("", "Non-ruby kanji reading breakdowns:");
        for (const row of report.readingBreakdownAudit.nonRubyRows.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading}) — ${row.readingBreakdown}`);
        }
    }

    if ((report.cardBackAudit?.requiredMissingRows || []).length > 0) {
        lines.push("", "Required card-back field gaps:");
        for (const row of report.cardBackAudit.requiredMissingRows.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading}) — ${row.field}`);
        }
    }

    if ((report.policyAudit?.levelPlacementViolations || []).length > 0) {
        lines.push("", "Word level placement violations:");
        for (const row of report.policyAudit.levelPlacementViolations.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading}) — ${row.placementStatus}; ${formatKanjiLevelList(row.kanjiLevels)}`);
        }
    }

    if ((report.pitchAccentAudit?.sourceMismatchRows || []).length > 0) {
        lines.push("", "Pitch accent source/render mismatches:");
        for (const row of report.pitchAccentAudit.sourceMismatchRows.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading}) — expected ${row.expectedAccents.join("/")} from ${row.sourcePattern}; rendered ${row.renderedAccents.join("/") || "(none)"}`);
        }
    }

    if ((report.pitchAccentAudit?.sourceIdentityRows || []).length > 0) {
        lines.push("", "Pitch accent source identity issues:");
        for (const row of report.pitchAccentAudit.sourceIdentityRows.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading}) — ${row.failures.join("; ")}`);
        }
    }

    if ((report.pitchAccentAudit?.generatedUnlabeledRows || []).length > 0) {
        lines.push("", "Generated pitch accent rows missing learner labels:");
        for (const row of report.pitchAccentAudit.generatedUnlabeledRows.slice(0, maxEntries)) {
            lines.push(`- ${row.word} (${row.reading}) — ${row.sourceId}`);
        }
    }

    if ((report.kanjiBreakdownContextAudit?.mismatchedRows || []).length > 0) {
        lines.push("", "Kanji breakdown context mismatches:");
        for (const row of report.kanjiBreakdownContextAudit.mismatchedRows.slice(0, maxEntries)) {
            const expectedSurface = row.expectedSurface ? `${row.expectedSurface} / ` : "";
            lines.push(`- ${row.word} (${row.reading}) ${row.kanji}: expected ${expectedSurface}${row.expectedReading}, found ${row.actualReading || "(blank)"}`);
        }
    }

    if ((report.kanjiBreakdownContextAudit?.coverageMismatchedRows || []).length > 0) {
        lines.push("", "Coverage readings that disagree with ReadingBreakdown:");
        for (const row of report.kanjiBreakdownContextAudit.coverageMismatchedRows.slice(0, maxEntries)) {
            if (row.groupSurface) {
                lines.push(`- ${row.word} (${row.reading}) ${row.kanji}: has ${row.actualCoverageReading}, but ${row.groupSurface} is read as ${row.groupReading}`);
                continue;
            }
            lines.push(`- ${row.word} (${row.reading}) ${row.kanji}: expected ${row.expectedReading}, found ${row.actualCoverageReading}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildWordDeckCardBackAudit,
    buildWordDeckKanjiBreakdownContextAudit,
    buildWordDeckCompletionReport,
    buildWordDeckInventorySummary,
    buildWordDeckExampleReadingAlignmentAudit,
    buildWordDeckPitchAccentAudit,
    buildWordDeckPolicyAudit,
    buildWordDeckReadingBreakdownAudit,
    buildWordDeckSentenceOrthographyAudit,
    buildWordDeckReadiness,
    formatCardBackFieldCoverage,
    formatWordDeckCompletionReport,
};
