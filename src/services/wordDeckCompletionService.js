const {
    buildWordReadingCoverageReport,
    buildWordReadingGapTriage,
    parseKanjiTsv,
    parseWordTsv,
} = require("./wordReadingCoverageService");
const { buildCoverageWordRows } = require("./wordDeckCoverageScopeService");
const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const { HAN_CHAR_RE, isKanaOnly, katakanaToHiragana } = require("../utils/japanese");

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

function buildWordDeckPitchAccentAudit({ wordRows, starterEntries = {}, wordPitchAccentData = {} }) {
    const rows = Array.isArray(wordRows) ? wordRows : [];
    const annotatedRows = [];
    const missingRows = [];
    const sourceCounts = {};
    const ungovernedRows = [];
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
            if (sourceId) {
                sourceCounts[sourceId] = (sourceCounts[sourceId] || 0) + 1;
            } else {
                ungovernedRows.push({ word, reading, pitchAccent });
            }
            annotatedRows.push({ word, reading, pitchAccent, sourceId: sourceId || "" });
            continue;
        }

        missingRows.push({ word, reading });
    }

    return {
        valid: fieldPresent,
        fieldPresent,
        totalWords: rows.length,
        annotatedWords: annotatedRows.length,
        missingPitchAccent: missingRows.length,
        sourceCounts,
        ungovernedPitchAccent: ungovernedRows.length,
        coveragePercent: rows.length > 0
            ? Number(((annotatedRows.length / rows.length) * 100).toFixed(1))
            : 0,
        annotatedRows,
        missingRows,
        ungovernedRows,
    };
}

function buildWordDeckReadingBreakdownAudit({ wordRows }) {
    const missingMixedRows = [];
    const nonRubyRows = [];

    for (const row of Array.isArray(wordRows) ? wordRows : []) {
        const word = String(row?.Word || row?.word || "").trim();
        const reading = String(row?.Reading || row?.reading || "").trim();
        const readingBreakdown = String(row?.ReadingBreakdown || row?.readingBreakdown || "").trim();
        const chars = Array.from(word);
        const hasKanji = chars.some((char) => HAN_CHAR_RE.test(char) && char !== "々");
        const hasKana = chars.some((char) => isKanaOnly(char));

        if (hasKanji && hasKana && !readingBreakdown) {
            missingMixedRows.push({ word, reading });
            continue;
        }

        if (hasKanji && readingBreakdown && !readingBreakdown.includes("<ruby>")) {
            nonRubyRows.push({ word, reading, readingBreakdown });
        }
    }

    return {
        valid: missingMixedRows.length === 0 && nonRubyRows.length === 0,
        missingMixedBreakdownCount: missingMixedRows.length,
        nonRubyBreakdownCount: nonRubyRows.length,
        missingMixedRows,
        nonRubyRows,
    };
}

function hasFieldValue(row, fieldName) {
    return String(row?.[fieldName] || "").trim().length > 0;
}

function hasJapaneseKanji(value) {
    return Array.from(String(value || "")).some((char) => HAN_CHAR_RE.test(char) && char !== "々");
}

function needsReadingBreakdown(row) {
    const chars = Array.from(String(row?.Word || row?.word || ""));
    const kanjiCount = chars.filter((char) => HAN_CHAR_RE.test(char) && char !== "々").length;
    const hasKana = chars.some((char) => isKanaOnly(char));
    return kanjiCount >= 2 || (kanjiCount > 0 && hasKana);
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

function buildWordDeckPolicyAudit({ level, wordRows, jlptLevelContract }) {
    const deckLevel = Number(level);
    if (!jlptLevelContract?.kanjiLevels) {
        return {
            valid: true,
            standaloneViolationCount: 0,
            badgeViolationCount: 0,
            standaloneViolations: [],
            badgeViolations: [],
        };
    }

    const standaloneViolations = [];
    const badgeViolations = [];

    for (const row of Array.isArray(wordRows) ? wordRows : []) {
        const written = String(row?.Word || row?.word || "").trim();
        const breakdown = String(row?.KanjiBreakdown || row?.kanjiBreakdown || "");
        const writtenChars = Array.from(written);
        const kanjiList = extractConstituentKanji(written);

        if (kanjiList.length === 0) {
            continue;
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
        valid: standaloneViolations.length === 0 && badgeViolations.length === 0,
        standaloneViolationCount: standaloneViolations.length,
        badgeViolationCount: badgeViolations.length,
        standaloneViolations,
        badgeViolations,
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
}) {
    const kanjiRows = parseKanjiTsv(kanjiTsv);
    const wordRows = parseWordTsv(wordTsv);
    const coverageScope = coverageWordTsvByLevel
        ? buildCoverageWordRows({ level, wordTsvByLevel: coverageWordTsvByLevel })
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
    });
    const sentenceOrthographyAudit = buildWordDeckSentenceOrthographyAudit({
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
    const cardBackAudit = buildWordDeckCardBackAudit({
        wordRows,
    });
    const readiness = buildWordDeckReadiness({
        inventory,
        readingCoverage: readingCoverage.summary,
        triage: triage.summary,
        policyAudit,
        readingBreakdownAudit,
        cardBackAudit,
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
        pitchAccentAudit,
        readingBreakdownAudit,
        cardBackAudit,
        readiness,
    };
}

function buildWordDeckReadiness({ inventory, readingCoverage, triage, policyAudit, readingBreakdownAudit = null, cardBackAudit = null }) {
    const hasMissingStarterRows = (inventory?.missingEligibleCount || 0) > 0;
    const hasActiveTriageItems = ((triage?.editorialReviewItems || 0) + (triage?.promoteCuratedExampleItems || 0)) > 0;
    const allOpenItemsDeferred = (triage?.totalItems || 0) > 0
        && (triage?.deferVariantItems || 0) === (triage?.totalItems || 0);
    const hasPolicyViolations = !policyAudit?.valid;
    const hasReadingBreakdownViolations = readingBreakdownAudit ? !readingBreakdownAudit.valid : false;
    const hasCardBackViolations = cardBackAudit ? !cardBackAudit.valid : false;
    const readingCoveragePercent = (readingCoverage?.totalReadings || 0) > 0
        ? Number((((readingCoverage?.coveredReadings || 0) / readingCoverage.totalReadings) * 100).toFixed(1))
        : 0;

    let status = "incomplete";
    if (!hasMissingStarterRows && !hasActiveTriageItems && !hasPolicyViolations && !hasReadingBreakdownViolations && !hasCardBackViolations) {
        status = allOpenItemsDeferred ? "ready_with_deferred_variants" : "complete";
    }

    return {
        status,
        hasMissingStarterRows,
        hasActiveTriageItems,
        hasPolicyViolations,
        hasReadingBreakdownViolations,
        hasCardBackViolations,
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
        `- Standalone wrong-level cards: ${report.policyAudit.standaloneViolationCount}`,
        `- Missing cross-level/outside-level badges: ${report.policyAudit.badgeViolationCount}`,
        "",
        "Sentence orthography review:",
        `- Suspicious kana-only examples: ${report.sentenceOrthographyAudit.suspiciousKanaOnlyCount}`,
        "",
        "Reading breakdown review:",
        `- Mixed kanji/kana rows missing breakdowns: ${report.readingBreakdownAudit?.missingMixedBreakdownCount || 0}`,
        `- Non-ruby kanji breakdowns: ${report.readingBreakdownAudit?.nonRubyBreakdownCount || 0}`,
        "",
        "Card back review:",
        `- Required back-side fields: ${report.cardBackAudit?.requiredReadyCount || 0}/${report.cardBackAudit?.requiredTotalCount || 0} (${report.cardBackAudit?.requiredMissingCount || 0} missing)`,
        `- Field coverage: ${formatCardBackFieldCoverage(report.cardBackAudit)}`,
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

    if ((report.readingBreakdownAudit?.missingMixedRows || []).length > 0) {
        lines.push("", "Mixed kanji/kana rows missing reading breakdowns:");
        for (const row of report.readingBreakdownAudit.missingMixedRows.slice(0, maxEntries)) {
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

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildWordDeckCardBackAudit,
    buildWordDeckCompletionReport,
    buildWordDeckInventorySummary,
    buildWordDeckPitchAccentAudit,
    buildWordDeckPolicyAudit,
    buildWordDeckReadingBreakdownAudit,
    buildWordDeckSentenceOrthographyAudit,
    buildWordDeckReadiness,
    formatCardBackFieldCoverage,
    formatWordDeckCompletionReport,
};
