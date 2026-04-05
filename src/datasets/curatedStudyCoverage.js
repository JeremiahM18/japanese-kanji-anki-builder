const fs = require("node:fs");
const path = require("node:path");

const { classifyGloss, extractWordCandidates } = require("../inference/candidateExtractor");

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

function hasCuratedCoverage(entry) {
    return Boolean(
        entry?.exampleSentence
        || entry?.notes
        || entry?.englishMeaning
        || entry?.displayWord?.written
        || (entry?.preferredWords || []).length > 0
    );
}

function getCuratedCoverageSet(curatedStudyData = {}) {
    const covered = new Set();

    for (const [kanji, entry] of Object.entries(curatedStudyData || {})) {
        if (hasCuratedCoverage(entry)) {
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

function buildMissingKanjiEntries(jlptOnlyJson = {}, curatedStudyData = {}, level = null) {
    const coveredKanjiSet = getCuratedCoverageSet(curatedStudyData);
    const buckets = buildJlptBuckets(jlptOnlyJson);
    const levels = [...buckets.keys()].sort((a, b) => a - b);

    return levels
        .filter((rowLevel) => !Number.isInteger(level) || rowLevel === level)
        .flatMap((rowLevel) => (buckets.get(rowLevel) || [])
            .filter((kanji) => !coveredKanjiSet.has(kanji))
            .map((kanji) => ({ kanji, level: rowLevel })));
}

function buildWordCachePath(cacheDir, kanji) {
    const bytes = Buffer.from(String(kanji || ""));
    const suffix = [...bytes]
        .map((value) => value.toString(16).toUpperCase().padStart(2, "0"))
        .join("_");

    return path.join(cacheDir, `words__${suffix}.json`);
}

function readCachedWords(cacheDir, kanji) {
    if (!cacheDir) {
        return [];
    }

    const filePath = buildWordCachePath(cacheDir, kanji);
    if (!fs.existsSync(filePath)) {
        return [];
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
}

function extractRankedWordCandidates(wordsJson, kanji) {
    const preferredEntries = (Array.isArray(wordsJson) ? wordsJson : []).map((entry) => {
        const variants = Array.isArray(entry?.variants) ? entry.variants : [];
        const matchingVariants = variants.filter((variant) => String(variant?.written || "").includes(kanji));

        return {
            ...entry,
            variants: matchingVariants.length > 0 ? matchingVariants : variants,
        };
    });

    return extractWordCandidates(preferredEntries);
}

function scoreWordCandidate(candidate) {
    const priorities = Array.isArray(candidate?.variant?.priorities) ? candidate.variant.priorities.length : 0;
    const writtenLength = String(candidate?.written || "").length;
    const pronLength = String(candidate?.pron || "").length;
    const glossMeta = classifyGloss(candidate?.meaning?.glosses || []);
    const exactKanji = String(candidate?.written || "").length === 1 ? 1 : 0;
    const commonShape = writtenLength >= 2 && writtenLength <= 4 ? 1 : 0;
    const conciseReading = pronLength > 0 && pronLength <= 6 ? 1 : 0;

    return {
        score:
            priorities * 100
            + exactKanji * 30
            + commonShape * 20
            + conciseReading * 10
            - (glossMeta.isName ? 50 : 0)
            - (glossMeta.isObscure ? 40 : 0)
            - Math.max(0, writtenLength - 4) * 5
            - Math.max(0, pronLength - 6) * 2,
        priorities,
        exactKanji: Boolean(exactKanji),
        commonShape: Boolean(commonShape),
        conciseReading: Boolean(conciseReading),
        isName: glossMeta.isName,
        isObscure: glossMeta.isObscure,
    };
}

function buildMissingKanjiPriorityList(missingEntries = [], { cacheDir = null } = {}) {
    const candidates = missingEntries
        .map(({ kanji, level: rowLevel }) => {
            const wordCandidates = extractRankedWordCandidates(readCachedWords(cacheDir, kanji), kanji);
            const rankedWords = wordCandidates
                .map((candidate) => ({
                    ...candidate,
                    ranking: scoreWordCandidate(candidate),
                }))
                .sort((a, b) => {
                    if (b.ranking.score !== a.ranking.score) {
                        return b.ranking.score - a.ranking.score;
                    }
                    if (b.ranking.priorities !== a.ranking.priorities) {
                        return b.ranking.priorities - a.ranking.priorities;
                    }
                    if (String(a.written).length !== String(b.written).length) {
                        return String(a.written).length - String(b.written).length;
                    }
                    return String(a.written).localeCompare(String(b.written));
                });
            const bestCandidate = rankedWords[0] || null;

            return {
                kanji,
                level: rowLevel,
                candidateScore: bestCandidate?.ranking?.score ?? -1,
                candidatePriorityCount: bestCandidate?.ranking?.priorities ?? 0,
                bestCandidate: bestCandidate
                    ? {
                        written: bestCandidate.written,
                        pron: bestCandidate.pron,
                        gloss: bestCandidate.gloss,
                        priorities: bestCandidate.variant.priorities || [],
                    }
                    : null,
            };
        })
        .sort((a, b) => {
            if (a.level !== b.level) {
                return a.level - b.level;
            }
            if (b.candidateScore !== a.candidateScore) {
                return b.candidateScore - a.candidateScore;
            }
            if (b.candidatePriorityCount !== a.candidatePriorityCount) {
                return b.candidatePriorityCount - a.candidatePriorityCount;
            }
            return a.kanji.localeCompare(b.kanji);
        });

    return candidates.map(({ kanji, level: rowLevel, bestCandidate }) => ({
        kanji,
        level: rowLevel,
        ...(bestCandidate ? { bestCandidate } : {}),
    }));
}

function buildCuratedStudySummary({ jlptOnlyJson = {}, curatedStudyData = {}, cacheDir = null, level = null } = {}) {
    const rows = buildCuratedCoverageRows(jlptOnlyJson, curatedStudyData);
    const missingEntries = buildMissingKanjiEntries(jlptOnlyJson, curatedStudyData, level);
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
        customDisplayWordEntries: entries.filter(([, entry]) => Boolean(entry?.displayWord?.written)).length,
        customNotesEntries: entries.filter(([, entry]) => Boolean(entry?.notes)).length,
        customSentenceEntries: entries.filter(([, entry]) => Boolean(entry?.exampleSentence)).length,
        blockedWordEntries: entries.filter(([, entry]) => (entry?.blockedWords || []).length > 0).length,
        preferredWordEntries: entries.filter(([, entry]) => (entry?.preferredWords || []).length > 0).length,
        levels: rows,
        missingByPriority: buildMissingKanjiPriorityList(missingEntries, { cacheDir }),
    };
}

module.exports = {
    buildMissingKanjiEntries,
    buildMissingKanjiPriorityList,
    buildCuratedCoverageRows,
    buildCuratedStudySummary,
    buildWordCachePath,
    extractRankedWordCandidates,
    getCuratedCoverageSet,
    hasCuratedCoverage,
    readCachedWords,
    scoreWordCandidate,
};
