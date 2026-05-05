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

function buildWordLevelAnchorResult({
    written = "",
    deckLevel = null,
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

    return {
        valid: Number.isInteger(level) && sameLevelKanji.length > 0,
        written: String(written || "").trim(),
        deckLevel: level,
        constituentKanji,
        kanjiLevels,
        sameLevelKanji,
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
    return `word level placement has no same-level kanji anchor for JLPT ${levelLabel}: ${formatKanjiLevelList(result.kanjiLevels)}`;
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

function auditWordLevelAnchors({ wordLevels = {}, kanjiLevelData = {}, level = null } = {}) {
    const requestedLevel = Number(level);
    const hasLevelFilter = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 5;
    const kanjiLevelMap = normalizeKanjiLevelMap(kanjiLevelData);
    const byLevel = createLevelCounts();
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
            kanjiLevelMap,
        });
        checked += 1;
        byLevel[deckLevel].checked += 1;

        if (result.valid) {
            continue;
        }

        byLevel[deckLevel].violations += 1;
        violations.push({
            key,
            written: String(entry?.written || "").trim(),
            reading: String(entry?.reading || "").trim(),
            jlpt: deckLevel,
            kanjiLevels: result.kanjiLevels,
            message: formatWordLevelAnchorFailure(result),
        });
    }

    return {
        valid: violations.length === 0,
        checked,
        violationCount: violations.length,
        byLevel,
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
};
