function buildJlptBuckets(jlptOnlyJson = {}) {
    const buckets = new Map();

    for (const [kanji, value] of Object.entries(jlptOnlyJson)) {
        const level = value?.jlpt;
        if (!Number.isInteger(level)) {
            continue;
        }

        if (!buckets.has(level)) {
            buckets.set(level, []);
        }

        buckets.get(level).push(kanji);
    }

    for (const entries of buckets.values()) {
        entries.sort((a, b) => a.localeCompare(b));
    }

    return buckets;
}

function getCuratedCoverageSet(curatedStudyData = {}) {
    const covered = new Set();

    for (const [kanji, entry] of Object.entries(curatedStudyData || {})) {
        if (entry?.exampleSentence || entry?.notes || entry?.englishMeaning || (entry?.preferredWords || []).length > 0) {
            covered.add(kanji);
        }
    }

    return covered;
}

function buildCuratedCoverageRows(jlptOnlyJson, curatedStudyData) {
    const coveredKanjiSet = getCuratedCoverageSet(curatedStudyData);
    const buckets = buildJlptBuckets(jlptOnlyJson);
    const levels = [...buckets.keys()].sort((a, b) => a - b);

    return levels.map((level) => {
        const kanji = buckets.get(level);
        const covered = kanji.filter((item) => coveredKanjiSet.has(item));
        const missing = kanji.filter((item) => !coveredKanjiSet.has(item));

        return {
            level,
            totalKanji: kanji.length,
            curatedKanji: covered.length,
            missingKanji: missing.length,
            coverageRatio: kanji.length > 0 ? Number((covered.length / kanji.length).toFixed(4)) : 0,
            sampleMissing: missing.slice(0, 10),
        };
    });
}

function buildCuratedStudySummary({ jlptOnlyJson = {}, curatedStudyData = {} }) {
    const rows = buildCuratedCoverageRows(jlptOnlyJson, curatedStudyData);
    const entries = Object.entries(curatedStudyData || {});
    const totalKanji = rows.reduce((sum, row) => sum + row.totalKanji, 0);
    const curatedKanji = rows.reduce((sum, row) => sum + row.curatedKanji, 0);

    return {
        totalKanji,
        curatedKanji,
        missingKanji: totalKanji - curatedKanji,
        coverageRatio: totalKanji > 0 ? Number((curatedKanji / totalKanji).toFixed(4)) : 0,
        curatedStudyEntries: entries.length,
        customMeaningEntries: entries.filter(([, entry]) => Boolean(entry?.englishMeaning)).length,
        customNotesEntries: entries.filter(([, entry]) => Boolean(entry?.notes)).length,
        customSentenceEntries: entries.filter(([, entry]) => Boolean(entry?.exampleSentence)).length,
        blockedWordEntries: entries.filter(([, entry]) => (entry?.blockedWords || []).length > 0).length,
        preferredWordEntries: entries.filter(([, entry]) => (entry?.preferredWords || []).length > 0).length,
        levels: rows,
        missingByPriority: rows
            .flatMap((row) => row.sampleMissing.map((kanji) => ({ kanji, level: row.level })))
            .sort((a, b) => a.level - b.level || a.kanji.localeCompare(b.kanji)),
    };
}

module.exports = {
    buildCuratedCoverageRows,
    buildCuratedStudySummary,
    getCuratedCoverageSet,
};
