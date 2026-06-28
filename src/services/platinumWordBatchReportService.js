const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const { extractRenderedPitchAccentPattern, parsePitchAccentPattern } = require("./pitchAccentRenderService");
const {
    ACTIVE_PLATINUM_STATUSES,
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REVIEW_ONLY_STATUSES,
    entryUsesCurrentWordPlatinumStandard,
    evaluatePlatinumWordReviewSet,
} = require("./platinumReviewService");
const {
    entryHasSubstantiveCurrentStandardRereviewProof,
} = require("./platinumWordObsidianProofService");
const {
    GENERATED_PITCH_LABEL,
    arraysMatch,
    isGeneratedPitchAccentSource,
    validateWordPitchAccentSource,
} = require("./wordPitchAccentVerificationService");
const { katakanaToHiragana } = require("../utils/japanese");

const WORD_BATCH_QUEUE_MODES = {
    MISSING_CURRENT_STANDARD: "missing-current-standard",
    BLOCKED_CURRENT_STANDARD: "blocked-current-standard",
    SUBSTANTIVE_REREVIEW: "substantive-rereview",
};
const DEFAULT_WORD_BATCH_QUEUE_MODE = WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD;
const PRIOR_WORD_SAPPHIRE_REVIEW_STANDARD = "word-sapphire-v1-evidence-lanes";
const ACTIVE_WORD_SAPPHIRE_PRECONDITION_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);

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

const COMPARABLE_IGNORED_CHARS = new Set(Array.from("「」『』（）()[]{}、。，,・.．:：/-"));

function normalizeComparable(value) {
    return katakanaToHiragana(stripMarkup(value))
        .split("")
        .filter((char) => !COMPARABLE_IGNORED_CHARS.has(char) && !/\s/u.test(char))
        .join("")
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

const GODAN_TE_TA_ENDINGS = new Map([
    ["う", ["って", "った"]],
    ["く", ["いて", "いた"]],
    ["ぐ", ["いで", "いだ"]],
    ["す", ["して", "した"]],
    ["つ", ["って", "った"]],
    ["ぬ", ["んで", "んだ"]],
    ["ぶ", ["んで", "んだ"]],
    ["む", ["んで", "んだ"]],
    ["る", ["って", "った"]],
]);

const GODAN_NEGATIVE_STEM_ENDINGS = new Map([
    ["う", "わ"],
    ["く", "か"],
    ["ぐ", "が"],
    ["す", "さ"],
    ["つ", "た"],
    ["ぬ", "な"],
    ["ぶ", "ば"],
    ["む", "ま"],
    ["る", "ら"],
]);

const GODAN_POTENTIAL_STEM_ENDINGS = new Map([
    ["う", "え"],
    ["く", "け"],
    ["ぐ", "げ"],
    ["す", "せ"],
    ["つ", "て"],
    ["ぬ", "ね"],
    ["ぶ", "べ"],
    ["む", "め"],
    ["る", "れ"],
]);

const MASU_SUFFIXES = Object.freeze(["ます", "ました", "ません", "ましょう"]);
const NEGATIVE_SUFFIXES = Object.freeze(["ない", "なかった"]);
const ICHIDAN_RU_SUFFIXES = Object.freeze([
    "て",
    "た",
    ...MASU_SUFFIXES,
    ...NEGATIVE_SUFFIXES,
    "られる",
    "られます",
    "られました",
    "られない",
]);
const GODAN_POTENTIAL_SUFFIXES = Object.freeze([
    "る",
    "た",
    "て",
    ...MASU_SUFFIXES,
    ...NEGATIVE_SUFFIXES,
]);

function containsHan(value = "") {
    return /\p{Script=Han}/u.test(String(value || ""));
}

function addSuffixedFragments(fragments, base = "", suffixes = []) {
    if (!base) {
        return;
    }

    for (const suffix of suffixes) {
        fragments.add(`${base}${suffix}`);
    }
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
            addSuffixedFragments(fragments, `${suruBase}し`, ["て", "た", ...MASU_SUFFIXES, ...NEGATIVE_SUFFIXES]);
        }
    }

    if (chars.length > 1 && GODAN_MASU_STEM_ENDINGS.has(last)) {
        const masuStem = `${base}${GODAN_MASU_STEM_ENDINGS.get(last)}`;
        fragments.add(masuStem);
        addSuffixedFragments(fragments, masuStem, MASU_SUFFIXES);
    }
    if (chars.length > 1 && GODAN_TE_TA_ENDINGS.has(last)) {
        for (const ending of GODAN_TE_TA_ENDINGS.get(last)) {
            fragments.add(`${base}${ending}`);
        }
    }
    if (chars.length > 1 && GODAN_NEGATIVE_STEM_ENDINGS.has(last)) {
        addSuffixedFragments(fragments, `${base}${GODAN_NEGATIVE_STEM_ENDINGS.get(last)}`, NEGATIVE_SUFFIXES);
    }
    if (chars.length > 1 && GODAN_POTENTIAL_STEM_ENDINGS.has(last)) {
        addSuffixedFragments(fragments, `${base}${GODAN_POTENTIAL_STEM_ENDINGS.get(last)}`, GODAN_POTENTIAL_SUFFIXES);
    }
    if (chars.length > 2 && last === "る") {
        fragments.add(base);
    }
    if (chars.length > 1 && last === "る") {
        addSuffixedFragments(fragments, base, ICHIDAN_RU_SUFFIXES);
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

function buildEntryReviewStateByIdentity(entries = []) {
    const stateByIdentity = new Map();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const word = normalizeText(entry.word);
        const readings = Array.isArray(entry.readingIncludes) ? entry.readingIncludes : [""];
        const status = normalizeText(entry.status) || "(blank)";
        for (const reading of readings) {
            const identity = buildWordIdentity({ word, reading });
            if (!identity) {
                continue;
            }
            if (!stateByIdentity.has(identity)) {
                stateByIdentity.set(identity, {
                    statuses: [],
                    hasActivePlatinum: false,
                    hasCurrentStandardPlatinum: false,
                    hasSubstantiveCurrentStandardRereview: false,
                    hasLegacyOrUnversionedPlatinum: false,
                });
            }
            const state = stateByIdentity.get(identity);
            state.statuses.push(status);
            if (ACTIVE_PLATINUM_STATUSES.includes(status)) {
                state.hasActivePlatinum = true;
                if (entryUsesCurrentWordPlatinumStandard(entry)) {
                    state.hasCurrentStandardPlatinum = true;
                    if (entryHasSubstantiveCurrentStandardRereviewProof(entry)) {
                        state.hasSubstantiveCurrentStandardRereview = true;
                    }
                } else {
                    state.hasLegacyOrUnversionedPlatinum = true;
                }
            }
        }
    }

    return stateByIdentity;
}

function buildCurrentStandardSapphireSet(entries = []) {
    const identities = new Set();

    for (const entry of Array.isArray(entries) ? entries : []) {
        if (
            !ACTIVE_WORD_SAPPHIRE_PRECONDITION_STATUSES.includes(normalizeText(entry.status))
            || entry.reviewStandard !== PRIOR_WORD_SAPPHIRE_REVIEW_STANDARD
        ) {
            continue;
        }
        const readings = Array.isArray(entry.readingIncludes) ? entry.readingIncludes : [""];
        for (const reading of readings) {
            const identity = buildWordIdentity({
                word: entry.word,
                reading,
            });
            if (identity) {
                identities.add(identity);
            }
        }
    }

    return identities;
}

function classifyReviewState(state = {}) {
    const statuses = Array.isArray(state.statuses) ? state.statuses : [];

    if (state.hasSubstantiveCurrentStandardRereview) {
        return "substantive_rereview_proven";
    }
    if (state.hasCurrentStandardPlatinum) {
        return "current_standard_platinum_only";
    }
    if (state.hasActivePlatinum) {
        return "legacy_unversioned_platinum";
    }
    return classifyReviewStatus(statuses);
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
    platinumValidationFailures = [],
    queueMode = DEFAULT_WORD_BATCH_QUEUE_MODE,
} = {}) {
    const flags = [];
    const word = normalizeText(row.word);
    const coverageRole = normalizeText(row.coverageRole);
    const meaningParts = normalizeText(row.meaning).split(/\s+\/\s+/).filter(Boolean);
    const outsideLevelLabels = [...normalizeText(row.kanjiBreakdown).matchAll(/JLPT N[1-4] kanji/g)]
        .map((match) => match[0]);

    if (reviewStatus === "blocked_current_standard_platinum") {
        flags.push("current-standard Platinum exists but fails native Platinum validation; repair the existing entry before treating the lane as complete");
        for (const failure of platinumValidationFailures.slice(0, 5)) {
            flags.push(`Platinum validation failure: ${failure}`);
        }
    } else if (reviewStatus === "substantive_rereview_proven") {
        flags.push(queueMode === WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW
            ? "already has explicit Obsidian proof; skip unless intentionally replacing prior evidence"
            : "already has current-standard Platinum and separate Obsidian proof; no missing-Platinum work required");
    } else if (reviewStatus === "current_standard_platinum_only") {
        flags.push(queueMode === WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW
            ? "has current-standard Platinum only; explicit Obsidian proof is still required"
            : "already has current-standard Platinum; no missing-Platinum work required");
    } else if (reviewStatus === "active_platinum") {
        flags.push("already has active platinum; re-review only if intentionally replacing prior evidence");
    } else if (reviewStatus === "legacy_unversioned_platinum") {
        flags.push("active platinum is legacy/unversioned; current-standard revalidation required");
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

function buildSuggestedReviewStep({ hardChecksPassed, reviewStatus, riskFlags = [], pitch = {}, queueMode = DEFAULT_WORD_BATCH_QUEUE_MODE } = {}) {
    if (!hardChecksPassed) {
        return "fix generated surface before platinum";
    }
    if (reviewStatus === "blocked_current_standard_platinum") {
        return "repair current-standard Platinum evidence/card binding, then rerun the native Platinum gate";
    }
    if (reviewStatus === "substantive_rereview_proven") {
        return queueMode === WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW
            ? "already has explicit Obsidian proof"
            : "already current-standard platinum with separate Obsidian proof";
    }
    if (reviewStatus === "current_standard_platinum_only") {
        return queueMode === WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW
            ? "explicit Obsidian proof required; Platinum is not Obsidian proof"
            : "already current-standard platinum; no missing-Platinum work required";
    }
    if (reviewStatus === "legacy_unversioned_platinum") {
        return "revalidate existing platinum under current standard";
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

function normalizeQueueMode(queue = DEFAULT_WORD_BATCH_QUEUE_MODE) {
    const normalized = normalizeText(queue);
    return Object.values(WORD_BATCH_QUEUE_MODES).includes(normalized)
        ? normalized
        : DEFAULT_WORD_BATCH_QUEUE_MODE;
}

function selectBatchRows({
    rows = [],
    entries = [],
    sapphireEntries = [],
    failingCurrentStandardIdentities = new Set(),
    words = [],
    limit = 12,
    skipSapphirePreconditionForSapphireCompatibilityReport = false,
    queue = DEFAULT_WORD_BATCH_QUEUE_MODE,
} = {}) {
    const queueMode = normalizeQueueMode(queue);
    const stateByIdentity = buildEntryReviewStateByIdentity(entries);
    const currentSapphireSet = buildCurrentStandardSapphireSet(sapphireEntries);
    const enforceSapphirePrecondition = !skipSapphirePreconditionForSapphireCompatibilityReport;
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
        .filter((row) => {
            const identity = buildWordIdentity(row);
            if (enforceSapphirePrecondition && !currentSapphireSet.has(identity)) {
                return false;
            }
            const state = stateByIdentity.get(identity) || {};
            const reviewState = classifyReviewState(state);
            if (queueMode === WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD) {
                return reviewState !== "current_standard_platinum_only"
                    && reviewState !== "substantive_rereview_proven";
            }
            if (queueMode === WORD_BATCH_QUEUE_MODES.BLOCKED_CURRENT_STANDARD) {
                return failingCurrentStandardIdentities.has(identity);
            }
            return !state.hasSubstantiveCurrentStandardRereview;
        })
        .slice(0, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 12));
}

function buildFailingCurrentStandardPlatinumByIdentity({
    rows = [],
    entries = [],
    goldenExpectations,
    sapphireEntries,
    sapphireResults,
    wordPitchAccentData = {},
    kanjiLevelData = null,
} = {}) {
    if (!Array.isArray(goldenExpectations)) {
        return new Map();
    }

    const stateByIdentity = buildEntryReviewStateByIdentity(entries);
    const report = evaluatePlatinumWordReviewSet({
        rows,
        entries,
        goldenExpectations,
        requireGoldPrecondition: true,
        sapphireEntries,
        sapphireResults: Array.isArray(sapphireResults) ? sapphireResults : [],
        requireSapphirePrecondition: Array.isArray(sapphireResults),
        wordPitchAccentData,
        kanjiLevelData,
        requireCurrentReviewStandard: true,
        requireAllRows: false,
        allowEmpty: true,
    });
    const failuresByIdentity = new Map();

    for (const result of report.results || []) {
        const identity = normalizeText(result.identity);
        const state = stateByIdentity.get(identity) || {};
        if (!identity || result.passed || !state.hasCurrentStandardPlatinum) {
            continue;
        }
        failuresByIdentity.set(identity, {
            label: result.label,
            failures: Array.isArray(result.failures) ? result.failures : [],
        });
    }

    return failuresByIdentity;
}

function buildPlatinumWordBatchReport({
    rows = [],
    entries = [],
    goldenExpectations,
    sapphireEntries = [],
    sapphireResults,
    wordPitchAccentData = {},
    kanjiLevelData = null,
    level,
    words = [],
    limit = 12,
    skipSapphirePreconditionForSapphireCompatibilityReport = false,
    queue = DEFAULT_WORD_BATCH_QUEUE_MODE,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const stateByIdentity = buildEntryReviewStateByIdentity(reviewEntries);
    const currentSapphireSet = buildCurrentStandardSapphireSet(sapphireEntries);
    const queueMode = normalizeQueueMode(queue);
    const enforceSapphirePrecondition = !skipSapphirePreconditionForSapphireCompatibilityReport;
    const failingCurrentStandardByIdentity = buildFailingCurrentStandardPlatinumByIdentity({
        rows: generatedRows,
        entries: reviewEntries,
        goldenExpectations,
        sapphireEntries,
        sapphireResults,
        wordPitchAccentData,
        kanjiLevelData,
    });
    const failingCurrentStandardIdentities = new Set(failingCurrentStandardByIdentity.keys());
    const selectedRows = selectBatchRows({
        rows: generatedRows,
        entries: reviewEntries,
        sapphireEntries,
        failingCurrentStandardIdentities,
        words,
        limit,
        skipSapphirePreconditionForSapphireCompatibilityReport,
        queue: queueMode,
    });
    const activeCount = reviewEntries.filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status))).length;
    const currentStandardCount = reviewEntries.filter((entry) => (
        ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status))
        && entryUsesCurrentWordPlatinumStandard(entry)
    )).length;
    const substantiveRereviewProvenCount = reviewEntries.filter((entry) => (
        ACTIVE_PLATINUM_STATUSES.includes(normalizeText(entry.status))
        && entryUsesCurrentWordPlatinumStandard(entry)
        && entryHasSubstantiveCurrentStandardRereviewProof(entry)
    )).length;
    const legacyOrUnversionedCount = activeCount - currentStandardCount;
    const missingRows = generatedRows.filter((row) => {
        const identity = buildWordIdentity(row);
        if (enforceSapphirePrecondition && !currentSapphireSet.has(identity)) {
            return false;
        }
        const state = stateByIdentity.get(identity) || {};
        return !state.hasActivePlatinum;
    });
    const missingCurrentStandardRows = generatedRows.filter((row) => {
        const identity = buildWordIdentity(row);
        if (enforceSapphirePrecondition && !currentSapphireSet.has(identity)) {
            return false;
        }
        const state = stateByIdentity.get(identity) || {};
        const reviewState = classifyReviewState(state);
        return reviewState !== "current_standard_platinum_only"
            && reviewState !== "substantive_rereview_proven";
    });
    const needsSubstantiveRereviewRows = generatedRows.filter((row) => {
        const identity = buildWordIdentity(row);
        if (enforceSapphirePrecondition && !currentSapphireSet.has(identity)) {
            return false;
        }
        const state = stateByIdentity.get(identity) || {};
        return !state.hasSubstantiveCurrentStandardRereview;
    });
    const failingCurrentStandardRows = generatedRows.filter((row) => {
        const identity = buildWordIdentity(row);
        if (enforceSapphirePrecondition && !currentSapphireSet.has(identity)) {
            return false;
        }
        return failingCurrentStandardIdentities.has(identity);
    });
    const requestedMissing = Array.isArray(words)
        ? words
            .map((target) => buildWordIdentity(target))
            .filter((identity) => !selectedRows.some((row) => buildWordIdentity(row) === identity))
        : [];
    const scopedToRequestedWords = Array.isArray(words) && words.length > 0;
    const includeSubstantiveRereviewQueue = queueMode === WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW;

    const cards = selectedRows.map((row) => {
        const identity = buildWordIdentity(row);
        const state = stateByIdentity.get(identity) || {};
        const statuses = state.statuses || [];
        const platinumValidation = failingCurrentStandardByIdentity.get(identity) || null;
        const platinumValidationFailures = platinumValidation?.failures || [];
        const reviewStatus = platinumValidation
            ? "blocked_current_standard_platinum"
            : classifyReviewState(state);
        const pitch = buildPitchReview(row, wordPitchAccentData);
        const hardChecks = buildHardChecks(row, wordPitchAccentData);
        const hardChecksPassed = hardChecks.every((check) => check.passed);
        const riskFlags = buildRiskFlags(row, {
            reviewStatus,
            statuses,
            pitch,
            platinumValidationFailures,
            queueMode,
        });
        if (enforceSapphirePrecondition && !currentSapphireSet.has(identity)) {
            riskFlags.unshift("missing current-standard Sapphire precondition; run Sapphire before Platinum");
        }
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
            platinumValidationFailures,
            riskFlags,
            sourceLookupLinks: buildSourceLookupLinks(row),
            suggestedReviewStep: buildSuggestedReviewStep({
                hardChecksPassed,
                reviewStatus,
                riskFlags,
                pitch,
                queueMode,
            }),
        };
    });

    return {
        level,
        scope: scopedToRequestedWords
            ? `words=${words.map(buildWordIdentity).join(",")}`
            : `queue=${queueMode} limit=${limit}`,
        queue: queueMode,
        scopedToRequestedWords,
        summary: {
            generatedRows: generatedRows.length,
            activePlatinum: activeCount,
            currentReviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
            currentStandardPlatinum: currentStandardCount,
            legacyOrUnversionedPlatinum: legacyOrUnversionedCount,
            sapphireEligibleRows: generatedRows.filter((row) => currentSapphireSet.has(buildWordIdentity(row))).length,
            blockedByMissingSapphire: enforceSapphirePrecondition
                ? generatedRows.filter((row) => !currentSapphireSet.has(buildWordIdentity(row))).length
                : 0,
            remainingPlatinum: missingRows.length,
            remainingCurrentStandard: missingCurrentStandardRows.length,
            failingCurrentStandardPlatinum: failingCurrentStandardRows.length,
            ...(includeSubstantiveRereviewQueue ? {
                substantiveRereviewProven: substantiveRereviewProvenCount,
                remainingSubstantiveRereview: needsSubstantiveRereviewRows.length,
            } : {}),
            selectedCards: cards.length,
            requestedMissing: requestedMissing.length,
        },
        requestedMissing,
        nextMissingWords: missingCurrentStandardRows.map(buildWordIdentity),
        nextBlockedCurrentStandardWords: failingCurrentStandardRows.map(buildWordIdentity),
        ...(includeSubstantiveRereviewQueue ? {
            nextSubstantiveRereviewWords: needsSubstantiveRereviewRows.map(buildWordIdentity),
        } : {}),
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
        `Queue: ${report.queue || DEFAULT_WORD_BATCH_QUEUE_MODE}`,
        `Platinum entries: ${summary.activePlatinum || 0}`,
        `Current review standard: ${summary.currentReviewStandard || CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`,
        `Current-standard Platinum entries: ${summary.currentStandardPlatinum || 0}`,
        `Legacy/unversioned platinum: ${summary.legacyOrUnversionedPlatinum || 0}`,
        `Sapphire-eligible rows: ${summary.sapphireEligibleRows || 0}`,
        `Blocked by missing Sapphire: ${summary.blockedByMissingSapphire || 0}`,
        `Missing Platinum entries: ${summary.remainingPlatinum || 0}`,
        `Missing current-standard Platinum: ${summary.remainingCurrentStandard || 0}`,
        `Failing current-standard Platinum: ${summary.failingCurrentStandardPlatinum || 0}`,
        `Selected cards: ${summary.selectedCards || 0}`,
    ];
    if (report.queue === WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW) {
        lines.splice(8, 0, `Obsidian certified: ${summary.substantiveRereviewProven || 0}`);
        lines.splice(12, 0, `Remaining Obsidian certification: ${summary.remainingSubstantiveRereview || 0}`);
    }

    if (Array.isArray(report.requestedMissing) && report.requestedMissing.length > 0) {
        lines.push("", `Requested word identities not found (${report.requestedMissing.length}):`);
        for (const identity of report.requestedMissing) {
            lines.push(`- ${identity}`);
        }
    }

    const queueWords = report.queue === WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD
        ? report.nextMissingWords
        : report.queue === WORD_BATCH_QUEUE_MODES.BLOCKED_CURRENT_STANDARD
            ? report.nextBlockedCurrentStandardWords
            : report.nextSubstantiveRereviewWords;
    const queueLabel = report.queue === WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD
        ? "Next missing current-standard Platinum queue"
        : report.queue === WORD_BATCH_QUEUE_MODES.BLOCKED_CURRENT_STANDARD
            ? "Next blocked current-standard Platinum repair queue"
            : "Next explicit Obsidian proof queue";
    if (!report.scopedToRequestedWords && Array.isArray(queueWords) && queueWords.length > 0) {
        lines.push("", `${queueLabel} (${Math.min(queueWords.length, 30)}/${queueWords.length}):`);
        for (const identity of queueWords.slice(0, 30)) {
            lines.push(`- ${identity}`);
        }
        if (queueWords.length > 30) {
            lines.push(`- ... ${queueWords.length - 30} more`);
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
        if (card.platinumValidationFailures?.length > 0) {
            lines.push("  Native Platinum validation failures:");
            for (const failure of card.platinumValidationFailures.slice(0, 12)) {
                lines.push(`    - ${failure}`);
            }
            if (card.platinumValidationFailures.length > 12) {
                lines.push(`    - ... ${card.platinumValidationFailures.length - 12} more`);
            }
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

    lines.push(
        "",
        "This report is read-only. It prepares review; it does not create platinum entries or prove release readiness.",
        "Default queue is missing-current-standard Platinum. Use --queue=blocked-current-standard for current-standard Platinum rows that fail native validation. Use --queue=substantive-rereview only for explicit Obsidian proof-status compatibility work."
    );
    return `${lines.join("\n")}\n`;
}

module.exports = {
    WORD_BATCH_QUEUE_MODES,
    DEFAULT_WORD_BATCH_QUEUE_MODE,
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
    normalizeQueueMode,
    parseExampleParts,
    selectBatchRows,
    stripMarkup,
};
