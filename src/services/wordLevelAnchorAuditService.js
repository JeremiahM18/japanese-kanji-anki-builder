const { HAN_CHAR_RE } = require("../utils/japanese");

function extractConstituentKanji(text) {
    return [...new Set(
        Array.from(String(text || ""))
            .filter((char) => HAN_CHAR_RE.test(char) && char !== "々")
    )];
}

function normalizeKanjiLevelMap(kanjiLevelData = {}) {
    if (kanjiLevelData?.kanjiLevels) {
        return kanjiLevelData.kanjiLevels;
    }

    return Object.fromEntries(
        Object.entries(kanjiLevelData || {})
            .map(([kanji, value]) => {
                if (Number.isInteger(value)) {
                    return [kanji, value];
                }
                if (Number.isInteger(value?.jlpt)) {
                    return [kanji, value.jlpt];
                }
                return [kanji, null];
            })
            .filter(([, level]) => Number.isInteger(level))
    );
}

function formatKanjiLevel(level) {
    return Number.isInteger(level) ? `N${level}` : "outside-JLPT";
}

function normalizeDeckLevel(deckLevel) {
    const level = Number(deckLevel);
    return Number.isInteger(level) && level >= 1 && level <= 5 ? level : null;
}

function normalizeLearnerFitReason(value) {
    return String(value || "").trim();
}

function normalizePlacementMode(value) {
    const mode = String(value || "").trim();
    return mode === "vocabulary-level" || mode === "learner-fit" ? mode : "";
}

function resolvePlacementStatus({
    deckLevel,
    anchorLevel,
    sameLevelKanji = [],
    knownLevels = [],
    placementMode = "",
    learnerFitReason = "",
} = {}) {
    if (!Number.isInteger(deckLevel)) {
        return "invalid_deck_level";
    }
    if (normalizePlacementMode(placementMode) === "vocabulary-level") {
        return normalizeLearnerFitReason(learnerFitReason)
            ? "vocabulary_level_with_support_kanji"
            : "vocabulary_level_missing_reason";
    }
    if (!Array.isArray(knownLevels) || knownLevels.length === 0) {
        return "no_known_jlpt_kanji";
    }
    if (Array.isArray(sameLevelKanji) && sameLevelKanji.length > 0) {
        return "anchor_level";
    }

    const hasHarderThanDeckKanji = knownLevels.some((level) => level < deckLevel);
    if (hasHarderThanDeckKanji) {
        return "too_easy_for_kanji";
    }

    if (Number.isInteger(anchorLevel) && deckLevel < anchorLevel) {
        return normalizeLearnerFitReason(learnerFitReason)
            ? "later_with_learner_fit_reason"
            : "later_missing_learner_fit_reason";
    }

    return "too_easy_for_kanji";
}

function buildWordLevelAnchorResult({
    written = "",
    deckLevel = null,
    placementMode = "",
    learnerFitReason = "",
    kanjiLevelData = {},
    kanjiLevelMap = normalizeKanjiLevelMap(kanjiLevelData),
} = {}) {
    const level = normalizeDeckLevel(deckLevel);
    const constituentKanji = extractConstituentKanji(written);
    const kanjiLevels = constituentKanji.map((kanji) => ({
        kanji,
        level: Number.isInteger(kanjiLevelMap?.[kanji]) ? kanjiLevelMap[kanji] : null,
    }));
    const sameLevelKanji = kanjiLevels
        .filter((entry) => entry.level === level)
        .map((entry) => entry.kanji);
    const knownLevels = kanjiLevels
        .map((entry) => entry.level)
        .filter((entryLevel) => Number.isInteger(entryLevel));
    const fallbackAnchorLevel = knownLevels.length > 0 ? Math.max(...knownLevels) : null;
    const anchorLevel = sameLevelKanji.length > 0 ? level : fallbackAnchorLevel;
    const anchorKanji = kanjiLevels
        .filter((entry) => entry.level === anchorLevel)
        .map((entry) => entry.kanji);
    const normalizedPlacementMode = normalizePlacementMode(placementMode);
    const normalizedLearnerFitReason = normalizeLearnerFitReason(learnerFitReason);
    const placementStatus = resolvePlacementStatus({
        deckLevel: level,
        anchorLevel,
        sameLevelKanji,
        knownLevels,
        placementMode: normalizedPlacementMode,
        learnerFitReason: normalizedLearnerFitReason,
    });

    return {
        valid: placementStatus === "anchor_level"
            || placementStatus === "later_with_learner_fit_reason"
            || placementStatus === "vocabulary_level_with_support_kanji",
        written: String(written || "").trim(),
        deckLevel: level,
        anchorLevel,
        constituentKanji,
        kanjiLevels,
        sameLevelKanji,
        anchorKanji,
        placementMode: normalizedPlacementMode,
        learnerFitReason: normalizedLearnerFitReason,
        placementStatus,
    };
}

function formatKanjiLevelList(kanjiLevels = []) {
    if (!Array.isArray(kanjiLevels) || kanjiLevels.length === 0) {
        return "no kanji";
    }

    return kanjiLevels
        .map((entry) => `${entry.kanji}:${formatKanjiLevel(entry.level)}`)
        .join(", ");
}

function formatWordLevelAnchorFailure(result = {}) {
    const levelLabel = Number.isInteger(result.deckLevel) ? `N${result.deckLevel}` : "(unknown)";
    const anchorLabel = Number.isInteger(result.anchorLevel)
        ? `N${result.anchorLevel}`
        : "no known JLPT kanji level";

    if (result.placementStatus === "too_easy_for_kanji") {
        return `word level placement lacks a current-level kanji anchor for ${levelLabel}; harder support floor ${anchorLabel}: ${formatKanjiLevelList(result.kanjiLevels)}`;
    }
    if (result.placementStatus === "later_missing_learner_fit_reason") {
        return `later learner-fit placement from all-easier kanji anchor ${anchorLabel} to ${levelLabel} requires levelPlacement.reason: ${formatKanjiLevelList(result.kanjiLevels)}`;
    }
    if (result.placementStatus === "vocabulary_level_missing_reason") {
        return `vocabulary-level placement for ${levelLabel} requires levelPlacement.reason: ${formatKanjiLevelList(result.kanjiLevels)}`;
    }

    return `word level placement is invalid for ${levelLabel}; kanji anchor ${anchorLabel}: ${formatKanjiLevelList(result.kanjiLevels)}`;
}

function createLevelCounts() {
    return {
        1: { checked: 0, violations: 0 },
        2: { checked: 0, violations: 0 },
        3: { checked: 0, violations: 0 },
        4: { checked: 0, violations: 0 },
        5: { checked: 0, violations: 0 },
    };
}

function createPlacementStatusCounts() {
    return {
        too_easy_for_kanji: 0,
        later_missing_learner_fit_reason: 0,
        vocabulary_level_missing_reason: 0,
        no_known_jlpt_kanji: 0,
        invalid_deck_level: 0,
    };
}

function resolvePlacementMode({ key, wordEntry = {}, wordStudyData = {} } = {}) {
    return normalizePlacementMode(
        wordEntry?.levelPlacement?.mode
        || wordStudyData?.[key]?.levelPlacement?.mode
    );
}

function resolveLearnerFitReason({ key, wordEntry = {}, wordStudyData = {} } = {}) {
    return normalizeLearnerFitReason(
        wordEntry?.levelPlacement?.reason
        || wordStudyData?.[key]?.levelPlacement?.reason
    );
}

function auditWordLevelAnchors({ wordLevels = {}, wordStudyData = {}, kanjiLevelData = {}, level = null } = {}) {
    const requestedLevel = Number(level);
    const hasLevelFilter = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 5;
    const kanjiLevelMap = normalizeKanjiLevelMap(kanjiLevelData);
    const byLevel = createLevelCounts();
    const byPlacementStatus = createPlacementStatusCounts();
    const violations = [];
    let checked = 0;

    for (const [key, entry] of Object.entries(wordLevels || {})) {
        const deckLevel = Number(entry?.jlpt);
        if (!Number.isInteger(deckLevel) || deckLevel < 1 || deckLevel > 5) {
            continue;
        }
        if (hasLevelFilter && deckLevel !== requestedLevel) {
            continue;
        }

        const result = buildWordLevelAnchorResult({
            written: entry?.written,
            deckLevel,
            placementMode: resolvePlacementMode({ key, wordEntry: entry, wordStudyData }),
            learnerFitReason: resolveLearnerFitReason({ key, wordEntry: entry, wordStudyData }),
            kanjiLevelMap,
        });
        checked += 1;
        byLevel[deckLevel].checked += 1;

        if (result.valid) {
            continue;
        }

        byLevel[deckLevel].violations += 1;
        if (Object.prototype.hasOwnProperty.call(byPlacementStatus, result.placementStatus)) {
            byPlacementStatus[result.placementStatus] += 1;
        }
        violations.push({
            key,
            written: String(entry?.written || "").trim(),
            reading: String(entry?.reading || "").trim(),
            jlpt: deckLevel,
            anchorLevel: result.anchorLevel,
            placementStatus: result.placementStatus,
            kanjiLevels: result.kanjiLevels,
            placementMode: result.placementMode,
            learnerFitReason: result.learnerFitReason,
            message: formatWordLevelAnchorFailure(result),
        });
    }

    return {
        valid: violations.length === 0,
        checked,
        violationCount: violations.length,
        byLevel,
        byPlacementStatus,
        violations,
    };
}

module.exports = {
    auditWordLevelAnchors,
    buildWordLevelAnchorResult,
    extractConstituentKanji,
    formatKanjiLevel,
    formatKanjiLevelList,
    formatWordLevelAnchorFailure,
    normalizeKanjiLevelMap,
    normalizePlacementMode,
};
