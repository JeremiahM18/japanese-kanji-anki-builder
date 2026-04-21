function buildStarterCuratedBuckets(starterCuratedData = {}) {
    const buckets = new Map();

    for (const [kanji, entry] of Object.entries(starterCuratedData || {})) {
        const level = entry?.jlpt;
        if (!Number.isInteger(level) || entry?.source !== "starter-curated") {
            continue;
        }

        if (!buckets.has(level)) {
            buckets.set(level, []);
        }

        buckets.get(level).push(kanji);
    }

    for (const kanjiList of buckets.values()) {
        kanjiList.sort((a, b) => a.localeCompare(b, "ja"));
    }

    return buckets;
}

function buildGoldenCoverageRows({ starterCuratedData = {}, goldenReviewSets = {}, levels = [4, 5] } = {}) {
    const starterBuckets = buildStarterCuratedBuckets(starterCuratedData);

    return (Array.isArray(levels) ? levels : [])
        .filter((level) => Number.isInteger(level))
        .map((level) => {
            const starterKanji = starterBuckets.get(level) || [];
            const coveredSet = new Set(
                (Array.isArray(goldenReviewSets[level]) ? goldenReviewSets[level] : [])
                    .map((entry) => String(entry?.kanji || "").trim())
                    .filter(Boolean)
            );
            const coveredKanji = starterKanji.filter((kanji) => coveredSet.has(kanji));
            const missingKanji = starterKanji.filter((kanji) => !coveredSet.has(kanji));

            return {
                level,
                starterCuratedKanji: starterKanji.length,
                goldenCoveredKanji: coveredKanji.length,
                missingKanji: missingKanji.length,
                coverageRatio: starterKanji.length > 0
                    ? Number((coveredKanji.length / starterKanji.length).toFixed(4))
                    : 0,
                sampleMissing: missingKanji.slice(0, 25),
            };
        });
}

function buildGoldenReviewCoverageSummary({ starterCuratedData = {}, goldenReviewSets = {}, levels = [4, 5] } = {}) {
    const rows = buildGoldenCoverageRows({ starterCuratedData, goldenReviewSets, levels });
    const starterCuratedKanji = rows.reduce((sum, row) => sum + row.starterCuratedKanji, 0);
    const goldenCoveredKanji = rows.reduce((sum, row) => sum + row.goldenCoveredKanji, 0);

    return {
        starterCuratedKanji,
        goldenCoveredKanji,
        missingKanji: starterCuratedKanji - goldenCoveredKanji,
        coverageRatio: starterCuratedKanji > 0
            ? Number((goldenCoveredKanji / starterCuratedKanji).toFixed(4))
            : 0,
        levels: rows,
    };
}

module.exports = {
    buildGoldenCoverageRows,
    buildGoldenReviewCoverageSummary,
    buildStarterCuratedBuckets,
};
