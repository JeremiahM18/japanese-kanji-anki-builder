const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const { extractRenderedPitchAccentPattern, parsePitchAccentPattern } = require("./pitchAccentRenderService");
const {
    ACTIVE_PLATINUM_STATUSES,
    NON_SHIPPING_STATUSES,
    REVIEW_ONLY_STATUSES,
} = require("./platinumReviewService");
const {
    GENERATED_PITCH_LABEL,
    arraysMatch,
    isGeneratedPitchAccentSource,
    validateWordPitchAccentSource,
} = require("./wordPitchAccentVerificationService");
const { katakanaToHiragana } = require("../utils/japanese");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function stripMarkup(value) {
    return normalizeText(value)
        .replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gu, "$1 $2")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeComparable(value) {
    return katakanaToHiragana(stripMarkup(value))
        .replace(/[「」『』（）()[\]{}]/g, "")
        .replace(/[、。，，,・.．\s:：/-]/g, "")
        .toLowerCase();
}

const GODAN_MASU_STEM_ENDINGS = new Map([
    ["う", "い"],
    ["く", "き"],
    ["ぐ", "ぎ"],
    ["す", "し"],
    ["つ", "ち"],
    ["ぬ", "に"],
    ["ぶ", "び"],
    ["む", "み"],
    ["る", "り"],
]);

function containsHan(value = "") {
    return /\p{Script=Han}/u.test(String(value || ""));
}

function buildInflectionEvidenceFragments(value = "") {
    const normalized = normalizeComparable(value);
    const fragments = new Set();
    if (normalized) {
        fragments.add(normalized);
    }

    const chars = Array.from(normalized);
    const last = chars.at(-1);
    const base = chars.slice(0, -1).join("");

    if (chars.length > 2 && normalized.endsWith("する")) {
        const suruBase = chars.slice(0, -2).join("");
        if (suruBase) {
            fragments.add(suruBase);
            fragments.add(`${suruBase}し`);
        }
    }

    if (chars.length > 1 && GODAN_MASU_STEM_ENDINGS.has(last)) {
        fragments.add(`${base}${GODAN_MASU_STEM_ENDINGS.get(last)}`);
    }
    if (chars.length > 2 && last === "る") {
        fragments.add(base);
    }
    if (chars.length > 1 && last === "い") {
        fragments.add(base);
    }

    return [...fragments].filter((fragment) => {
        if (fragment === normalized) {
            return true;
        }
        return Array.from(fragment).length >= 2 || containsHan(fragment);
    });
}

function buildReadingEvidenceFragments(reading = "") {
    return buildInflectionEvidenceFragments(reading);
}

function buildWrittenEvidenceFragments(word = "") {
    return buildInflectionEvidenceFragments(word);
}

function textContainsAnyEvidence(text = "", fragments = []) {
    const haystack = normalizeComparable(text);
    if (!haystack) {
        return false;
    }
    return fragments.some((fragment) => haystack.includes(fragment));
}

function exampleSentenceContainsWrittenWord(exampleSentence = "", writtenWord = "") {
    return textContainsAnyEvidence(exampleSentence, buildWrittenEvidenceFragments(writtenWord));
}

function exampleReadingContainsWordReading(exampleReading = "", wordReading = "") {
    return textContainsAnyEvidence(exampleReading, buildReadingEvidenceFragments(wordReading));
}

function buildWordIdentity({ word = "", reading = "" } = {}) {
    const normalizedWord = normalizeText(word);
    const normalizedReading = normalizeText(reading);
    return normalizedReading ? `${normalizedWord}|${normalizedReading}` : normalizedWord;
}

function parseExampleParts(exampleSentence = "") {
    const [sentence = "", reading = "", english = ""] = String(exampleSentence || "").split(" ／ ");
    return {
        sentence: normalizeText(sentence),
        reading: normalizeText(reading),
        english: normalizeText(english),
    };
}

function splitJapaneseList(value) {
    return normalizeText(value)
        .split("、")
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function buildEntryStatusByIdentity(entries = []) {
    const statusByIdentity = new Map();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const word = normalizeText(entry.word);
        const readings = Array.isArray(entry.readingIncludes) ? entry.readingIncludes : [""];
        for (const reading of readings) {
            const identity = buildWordIdentity({ word, reading });
            if (!identity) {
                continue;
            }
            if (!statusByIdentity.has(identity)) {
                statusByIdentity.set(identity, []);
            }
            statusByIdentity.get(identity).push(normalizeText(entry.status) || "(blank)");
        }
    }

    return statusByIdentity;
}

function classifyReviewStatus(statuses = []) {
    if (statuses.some((status) => ACTIVE_PLATINUM_STATUSES.includes(status))) {
        return "active_platinum";
    }
    if (statuses.some((status) => NON_SHIPPING_STATUSES.includes(status))) {
        return "non_shipping_decision";
    }
    if (statuses.some((status) => REVIEW_ONLY_STATUSES.includes(status))) {
        return "needs_review";
    }
    if (statuses.length > 0) {
        return "invalid_or_unknown";
    }
    return "missing_platinum";
}

function getSourcePitchEntry(row = {}, wordPitchAccentData = {}) {
    const identity = buildWordStudyEntryKey({
        written: row.word,
        reading: row.reading,
    });
    return wordPitchAccentData?.entries?.[identity] || null;
}

function hasGeneratedPitchLabel(row = {}) {
    return normalizeText(row.pitchAccent).includes(GENERATED_PITCH_LABEL);
}

function buildPitchReview(row = {}, wordPitchAccentData = {}) {
    const sourceEntry = getSourcePitchEntry(row, wordPitchAccentData);
    const source = sourceEntry?.sourceId ? wordPitchAccentData?.sources?.[sourceEntry.sourceId] : null;
    const sourcePattern = normalizeText(sourceEntry?.pattern);
    const expectedAccents = parsePitchAccentPattern(sourcePattern);
    const renderedAccents = extractRenderedPitchAccentPattern(row.pitchAccent);
    const sourceIdentityFailures = sourceEntry
        ? validateWordPitchAccentSource({
            word: row.word,
            reading: row.reading,
            sourceEntry,
            sources: wordPitchAccentData?.sources || {},
        })
        : ["pitch accent source entry is missing"];
    const generatedSource = Boolean(sourceEntry?.sourceId) && isGeneratedPitchAccentSource({
        sourceId: sourceEntry.sourceId,
        source,
    });
    const generatedLabelVisible = hasGeneratedPitchLabel(row);

    return {
        sourceId: sourceEntry?.sourceId || "",
        sourceName: source?.name || "",
        sourceWord: sourceEntry?.sourceWord || sourceEntry?.sourceQuery || "",
        sourceReading: sourceEntry?.sourceReading || sourceEntry?.generatedReading || "",
        pattern: sourcePattern,
        renderedAccents,
        expectedAccents,
        sourceIdentityFailures,
        generatedSource,
        generatedLabelVisible,
        renderedMatchesSource: expectedAccents.length > 0 && arraysMatch(renderedAccents, expectedAccents),
    };
}

function buildHardChecks(row = {}, wordPitchAccentData = {}) {
    const example = parseExampleParts(row.exampleSentence);
    const pitch = buildPitchReview(row, wordPitchAccentData);
    const focusKanji = splitJapaneseList(row.focusKanji);
    const exactAudioFragment = `word-reading-${row.word}-${row.reading}`;
    const generatedPitchNeedsLabel = pitch.generatedSource && !pitch.generatedLabelVisible;

    return [
        {
            name: "Word identity has written form and reading",
            passed: normalizeText(row.word).length > 0 && normalizeText(row.reading).length > 0,
        },
        {
            name: "ReadingBreakdown is present",
            passed: normalizeText(row.readingBreakdown).length > 0,
        },
        {
            name: "Audio is exact word plus reading",
            passed: normalizeText(row.audio).includes(exactAudioFragment),
        },
        {
            name: "PitchAccent is present",
            passed: normalizeText(row.pitchAccent).length > 0,
        },
        {
            name: "Pitch source exists",
            passed: Boolean(pitch.sourceId),
        },
        {
            name: "Pitch rendered output matches source pattern",
            passed: pitch.renderedMatchesSource,
        },
        {
            name: "Generated pitch is visibly labeled when used",
            passed: !generatedPitchNeedsLabel,
        },
        {
            name: "JLPT label is present",
            passed: normalizeText(row.jlptLevel).length > 0,
        },
        {
            name: "Coverage role is present",
            passed: normalizeText(row.coverageRole).length > 0,
        },
        {
            name: "FocusKanji is present and appears in written word",
            passed: focusKanji.length > 0 && focusKanji.every((kanji) => normalizeText(row.word).includes(kanji)),
        },
        {
            name: "CoversReading is present",
            passed: normalizeText(row.coversReading).length > 0,
        },
        {
            name: "KanjiBreakdown is present",
            passed: normalizeText(row.kanjiBreakdown).length > 0,
        },
        {
            name: "Example has Japanese, reading, and English lines",
            passed: Boolean(example.sentence && example.reading && example.english),
        },
        {
            name: "Example sentence contains written word evidence",
            passed: exampleSentenceContainsWrittenWord(example.sentence, row.word),
        },
        {
            name: "Example reading contains word reading evidence",
            passed: exampleReadingContainsWordReading(example.reading, row.reading),
        },
        {
            name: "Pitch source identity is valid",
            passed: pitch.sourceIdentityFailures.length === 0,
        },
    ];
}

function buildSourceLookupLinks(row = {}) {
    const word = normalizeText(row.word);
    const reading = normalizeText(row.reading);
    return {
        jlearn: `https://jlearn.net/dictionary/${encodeURIComponent(word)}`,
        jisho: `https://jisho.org/search/${encodeURIComponent(`${word} ${reading}`)}`,
        goo: `https://dictionary.goo.ne.jp/srch/all/${encodeURIComponent(word)}/m0u/`,
    };
}

function buildRiskFlags(row = {}, {
    reviewStatus = "missing_platinum",
    statuses = [],
    pitch = {},
} = {}) {
    const flags = [];
    const word = normalizeText(row.word);
    const coverageRole = normalizeText(row.coverageRole);
    const meaningParts = normalizeText(row.meaning).split(/\s+\/\s+/).filter(Boolean);
    const outsideLevelLabels = [...normalizeText(row.kanjiBreakdown).matchAll(/JLPT N[1-4] kanji/g)]
        .map((match) => match[0]);

    if (reviewStatus === "active_platinum") {
        flags.push("already has active platinum; re-review only if intentionally replacing prior evidence");
    } else if (reviewStatus === "needs_review") {
        flags.push("existing needs_review entry blocks platinum until resolved");
    } else if (reviewStatus === "non_shipping_decision") {
        flags.push("existing deferred/removed decision conflicts with generated export if this card still appears");
    } else if (reviewStatus === "invalid_or_unknown") {
        flags.push(`existing platinum status is not recognized: ${statuses.join(", ")}`);
    }

    if (/Reading coverage support/i.test(coverageRole)) {
        flags.push("reading-coverage support row; verify learner usefulness instead of approving for coverage alone");
    }
    if (pitch.generatedSource) {
        flags.push("generated pitch source; visible label is required and dictionary-backed pitch remains unverified");
    }
    if (pitch.sourceIdentityFailures?.length > 0) {
        flags.push(`pitch source identity issue: ${pitch.sourceIdentityFailures.join("; ")}`);
    }
    if (pitch.expectedAccents?.length > 0 && !pitch.renderedMatchesSource) {
        flags.push("rendered pitch contour does not match governed source pattern");
    }
    if (outsideLevelLabels.length > 0) {
        flags.push(`contains outside-level kanji label(s): ${[...new Set(outsideLevelLabels)].join(", ")}`);
    }
    if (/[のへをがにでと]|です|ます/.test(word) && word.length > 2) {
        flags.push("phrase-like written form; confirm this belongs in the word deck rather than as example-only support");
    }
    if (/^[\p{Script=Han}]$/u.test(word)) {
        flags.push("single-kanji word row; confirm governed word-level placement and avoid kanji-deck mixing");
    }
    if (meaningParts.length > 2) {
        flags.push("meaning has several glosses; verify the learner-facing gloss is not noisy or misleading");
    }

    return flags;
}

function buildSuggestedReviewStep({ hardChecksPassed, reviewStatus, riskFlags = [], pitch = {} } = {}) {
    if (!hardChecksPassed) {
        return "fix generated surface before platinum";
    }
    if (reviewStatus === "active_platinum") {
        return "already reviewed";
    }
    if (reviewStatus === "needs_review") {
        return "resolve existing needs_review entry";
    }
    if (reviewStatus === "non_shipping_decision") {
        return "resolve deferred/removed conflict";
    }
    if (pitch.generatedSource) {
        return "source-check pitch or approve only with visible generated-pitch warning";
    }
    if (riskFlags.some((flag) => /reading-coverage support|phrase-like|single-kanji|outside-level|several glosses/.test(flag))) {
        return "manual product judgment before platinum";
    }
    return "likely platinum after dictionary/source check";
}

function selectBatchRows({ rows = [], entries = [], words = [], limit = 12 } = {}) {
    const statusByIdentity = buildEntryStatusByIdentity(entries);
    const generatedRows = Array.isArray(rows) ? rows : [];

    if (Array.isArray(words) && words.length > 0) {
        return words
            .map((target) => generatedRows.find((row) => (
                normalizeText(row.word) === normalizeText(target.word)
                && (!normalizeText(target.reading) || normalizeText(row.reading) === normalizeText(target.reading))
            )))
            .filter(Boolean);
    }

    return generatedRows
        .filter((row) => classifyReviewStatus(statusByIdentity.get(buildWordIdentity(row)) || []) !== "active_platinum")
        .slice(0, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 12));
}

function buildPlatinumWordBatchReport({
    rows = [],
    entries = [],
    wordPitchAccentData = {},
    level,
    words = [],
    limit = 12,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const statusByIdentity = buildEntryStatusByIdentity(reviewEntries);
    const selectedRows = selectBatchRows({ rows: generatedRows, entries: reviewEntries, words, limit });
    const activeCount = reviewEntries.filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status))).length;
    const missingRows = generatedRows.filter((row) => {
        const statuses = statusByIdentity.get(buildWordIdentity(row)) || [];
        return classifyReviewStatus(statuses) !== "active_platinum";
    });
    const requestedMissing = Array.isArray(words)
        ? words
            .map((target) => buildWordIdentity(target))
            .filter((identity) => !selectedRows.some((row) => buildWordIdentity(row) === identity))
        : [];
    const scopedToRequestedWords = Array.isArray(words) && words.length > 0;

    const cards = selectedRows.map((row) => {
        const identity = buildWordIdentity(row);
        const statuses = statusByIdentity.get(identity) || [];
        const reviewStatus = classifyReviewStatus(statuses);
        const pitch = buildPitchReview(row, wordPitchAccentData);
        const hardChecks = buildHardChecks(row, wordPitchAccentData);
        const hardChecksPassed = hardChecks.every((check) => check.passed);
        const riskFlags = buildRiskFlags(row, { reviewStatus, statuses, pitch });
        const example = parseExampleParts(row.exampleSentence);
        return {
            identity,
            word: row.word,
            reading: row.reading,
            levelLabel: row.jlptLevel || (Number.isInteger(level) ? `JLPT N${level}` : ""),
            reviewStatus,
            existingStatuses: statuses,
            surface: {
                meaning: row.meaning,
                jlptLevel: row.jlptLevel,
                coverageRole: row.coverageRole,
                focusKanji: row.focusKanji,
                coversReading: row.coversReading,
                readingBreakdown: stripMarkup(row.readingBreakdown),
                kanjiBreakdown: stripMarkup(row.kanjiBreakdown),
                notes: row.notes,
                audio: row.audio,
                pitchAccent: stripMarkup(row.pitchAccent),
                example,
            },
            pitch,
            hardChecks,
            hardChecksPassed,
            riskFlags,
            sourceLookupLinks: buildSourceLookupLinks(row),
            suggestedReviewStep: buildSuggestedReviewStep({
                hardChecksPassed,
                reviewStatus,
                riskFlags,
                pitch,
            }),
        };
    });

    return {
        level,
        scope: scopedToRequestedWords
            ? `words=${words.map(buildWordIdentity).join(",")}`
            : `next-missing limit=${limit}`,
        scopedToRequestedWords,
        summary: {
            generatedRows: generatedRows.length,
            activePlatinum: activeCount,
            remainingPlatinum: missingRows.length,
            selectedCards: cards.length,
            requestedMissing: requestedMissing.length,
        },
        requestedMissing,
        nextMissingWords: missingRows.map(buildWordIdentity),
        cards,
    };
}

function formatPlatinumWordBatchReport(report = {}) {
    const levelLabel = Number.isInteger(report.level) ? `N${report.level}` : "Unknown level";
    const summary = report.summary || {};
    const lines = [
        `Japanese Kanji Builder Platinum ${levelLabel} Word Batch Report`,
        "",
        `Scope: ${report.scope || "(unknown)"}`,
        `Generated cards: ${summary.generatedRows || 0}`,
        `Active platinum: ${summary.activePlatinum || 0}`,
        `Remaining platinum: ${summary.remainingPlatinum || 0}`,
        `Selected cards: ${summary.selectedCards || 0}`,
    ];

    if (Array.isArray(report.requestedMissing) && report.requestedMissing.length > 0) {
        lines.push("", `Requested word identities not found (${report.requestedMissing.length}):`);
        for (const identity of report.requestedMissing) {
            lines.push(`- ${identity}`);
        }
    }

    if (!report.scopedToRequestedWords && Array.isArray(report.nextMissingWords) && report.nextMissingWords.length > 0) {
        lines.push("", `Next missing queue (${Math.min(report.nextMissingWords.length, 30)}/${report.nextMissingWords.length}):`);
        for (const identity of report.nextMissingWords.slice(0, 30)) {
            lines.push(`- ${identity}`);
        }
        if (report.nextMissingWords.length > 30) {
            lines.push(`- ... ${report.nextMissingWords.length - 30} more`);
        }
    }

    for (const card of report.cards || []) {
        lines.push("", `- ${card.identity} [${card.reviewStatus}]`);
        lines.push(`  Surface: Meaning=${card.surface.meaning || "(blank)"} | ${card.surface.jlptLevel || "(blank)"} | ${card.surface.coverageRole || "(blank)"}`);
        lines.push(`  Focus/Coverage: ${card.surface.focusKanji || "(blank)"} -> ${card.surface.coversReading || "(blank)"}`);
        lines.push(`  Breakdown: ${card.surface.readingBreakdown || "(blank)"}`);
        lines.push(`  Example: ${card.surface.example.sentence || "(blank)"}`);
        lines.push(`  Reading: ${card.surface.example.reading || "(blank)"}`);
        lines.push(`  English: ${card.surface.example.english || "(blank)"}`);
        lines.push(`  Audio: ${card.surface.audio || "(blank)"}`);
        lines.push(`  Pitch: ${card.pitch.pattern || "(blank)"} from ${card.pitch.sourceId || "(missing source)"} | rendered ${card.pitch.renderedAccents?.join("/") || "(none)"}${card.pitch.generatedSource ? " | generated" : ""}${card.pitch.generatedLabelVisible ? " | labeled" : ""}`);
        lines.push(`  Hard checks: ${card.hardChecksPassed ? "pass" : "fail"}`);
        for (const check of (card.hardChecks || []).filter((item) => !item.passed)) {
            lines.push(`    - ${check.name}`);
        }
        lines.push("  Source lookup:");
        lines.push(`    - JLearn: ${card.sourceLookupLinks.jlearn}`);
        lines.push(`    - Jisho: ${card.sourceLookupLinks.jisho}`);
        lines.push(`    - goo: ${card.sourceLookupLinks.goo}`);
        if (card.riskFlags?.length > 0) {
            lines.push("  Risk flags:");
            for (const flag of card.riskFlags) {
                lines.push(`    - ${flag}`);
            }
        } else {
            lines.push("  Risk flags: none");
        }
        lines.push(`  Suggested review step: ${card.suggestedReviewStep}`);
    }

    lines.push("", "This report is read-only. It prepares review; it does not create platinum entries or prove release readiness.");
    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildEntryStatusByIdentity,
    buildHardChecks,
    buildInflectionEvidenceFragments,
    buildPitchReview,
    buildPlatinumWordBatchReport,
    buildReadingEvidenceFragments,
    buildRiskFlags,
    buildSourceLookupLinks,
    buildSuggestedReviewStep,
    buildWrittenEvidenceFragments,
    buildWordIdentity,
    classifyReviewStatus,
    exampleSentenceContainsWrittenWord,
    exampleReadingContainsWordReading,
    formatPlatinumWordBatchReport,
    parseExampleParts,
    selectBatchRows,
    stripMarkup,
};
