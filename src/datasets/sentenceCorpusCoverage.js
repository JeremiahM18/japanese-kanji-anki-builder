function hasCuratedCoverage(entry) {
    return Boolean(
        entry?.exampleSentence
        || entry?.notes
        || entry?.englishMeaning
        || entry?.displayWord?.written
        || (entry?.preferredWords || []).length > 0
    );
}

function getCoveredKanjiSet(sentenceCorpus = [], curatedStudyData = {}) {
    const covered = new Set();

    for (const entry of sentenceCorpus) {
        if (entry?.kanji) {
            covered.add(entry.kanji);
        }
    }

    for (const [kanji, entry] of Object.entries(curatedStudyData || {})) {
        if (hasCuratedCoverage(entry)) {
            covered.add(kanji);
        }
    }

    return covered;
}

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

function buildCoverageRows(jlptOnlyJson, coveredKanjiSet) {
    const buckets = buildJlptBuckets(jlptOnlyJson);
    const levels = [...buckets.keys()].sort((a, b) => a - b);

    return levels.map((level) => {
        const kanji = buckets.get(level);
        const covered = kanji.filter((item) => coveredKanjiSet.has(item));
        const missing = kanji.filter((item) => !coveredKanjiSet.has(item));
        const coverageRatio = kanji.length > 0
            ? Number((covered.length / kanji.length).toFixed(4))
            : 0;

        return {
            level,
            totalKanji: kanji.length,
            coveredKanji: covered.length,
            missingKanji: missing.length,
            coverageRatio,
            sampleMissing: missing.slice(0, 10),
        };
    });
}

function buildCoverageSummary({ jlptOnlyJson = {}, sentenceCorpus = [], curatedStudyData = {} }) {
    const coveredKanjiSet = getCoveredKanjiSet(sentenceCorpus, curatedStudyData);
    const rows = buildCoverageRows(jlptOnlyJson, coveredKanjiSet);
    const totalKanji = rows.reduce((sum, row) => sum + row.totalKanji, 0);
    const coveredKanji = rows.reduce((sum, row) => sum + row.coveredKanji, 0);
    const missingKanji = totalKanji - coveredKanji;
    const missingByPriority = rows
        .flatMap((row) => row.sampleMissing.map((kanji) => ({ kanji, level: row.level })))
        .sort((a, b) => a.level - b.level || a.kanji.localeCompare(b.kanji));

    return {
        totalKanji,
        coveredKanji,
        missingKanji,
        coverageRatio: totalKanji > 0 ? Number((coveredKanji / totalKanji).toFixed(4)) : 0,
        sentenceCorpusEntries: sentenceCorpus.length,
        curatedStudyEntries: Object.keys(curatedStudyData || {}).length,
        levels: rows,
        missingByPriority,
    };
}

module.exports = {
    buildCoverageRows,
    buildCoverageSummary,
    buildJlptBuckets,
    getCoveredKanjiSet,
    hasCuratedCoverage,
};
