const { createInferenceEngine } = require("../inference/inferenceEngine");
const { inferSentenceCandidates, scoreCorpusSentence } = require("../inference/sentenceInference");
const { createExportService, formatExampleSentence } = require("./exportService");
const { mapWithConcurrency } = require("../utils/concurrency");
const { tsvEscape } = require("../utils/text");
const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");

const WORD_FIELD_NAMES = loadAnkiNoteSchema("word").fieldNames;
const HAN_RE = /\p{Script=Han}/u;
const KATAKANA_ONLY_RE = /^[\p{Script=Katakana}ー]+$/u;

function extractConstituentKanji(text) {
    return [...new Set(Array.from(String(text ?? "")).filter((char) => HAN_RE.test(char)))];
}

function inferWordLevel({ written, jlptOnlyJson, fallbackLevel = null }) {
    const constituentLevels = extractConstituentKanji(written)
        .map((kanji) => jlptOnlyJson?.[kanji]?.jlpt)
        .filter((level) => Number.isInteger(level));

    if (constituentLevels.length === 0) {
        return fallbackLevel;
    }

    return Math.min(...constituentLevels);
}

function buildWordKey(candidate) {
    return String(candidate?.written || "").trim();
}

function buildWordNotes() {
    return "";
}

function buildJlptLabel(level) {
    return Number.isInteger(level) ? `JLPT N${level}` : "";
}

function pickBestExactSingleCandidate(inference, sourceKanji) {
    const exactMatches = (Array.isArray(inference?.candidates) ? inference.candidates : [])
        .filter((candidate) => candidate?.written === sourceKanji);

    if (exactMatches.length === 0) {
        return null;
    }

    return [...exactMatches].sort((a, b) => {
        const aReadable = KATAKANA_ONLY_RE.test(String(a?.pron || "")) ? 0 : 1;
        const bReadable = KATAKANA_ONLY_RE.test(String(b?.pron || "")) ? 0 : 1;
        if (bReadable !== aReadable) {
            return bReadable - aReadable;
        }
        return (b.score || 0) - (a.score || 0);
    })[0];
}

function buildDisplayCandidate(inference, sourceKanji) {
    const written = String(sourceKanji || "").trim();
    if (!written) {
        return null;
    }

    const exactCandidate = pickBestExactSingleCandidate(inference, sourceKanji);
    const pron = String(exactCandidate?.pron || inference?.primaryReading || inference?.displayWord?.pron || "").trim();
    const gloss = String(exactCandidate?.gloss || inference?.englishMeaning || "").trim();

    return {
        written,
        pron,
        gloss,
        score: Number.MAX_SAFE_INTEGER,
        corpusSupportScore: Number.MAX_SAFE_INTEGER,
        variant: { priorities: ["display-word"] },
    };
}

function buildCandidatePool({ inference, sourceKanji, maxWordsPerKanji, minimumCandidateScore }) {
    const pool = [];
    const displayCandidate = buildDisplayCandidate(inference, sourceKanji);
    if (displayCandidate) {
        pool.push(displayCandidate);
    }

    const rankedCandidates = (Array.isArray(inference?.candidates) ? inference.candidates : [])
        .filter((candidate) => Number.isFinite(candidate?.score) && candidate.score >= minimumCandidateScore)
        .filter((candidate) => candidate?.written && extractConstituentKanji(candidate.written).length > 0)
        .filter((candidate) => candidate.written !== sourceKanji)
        .filter((candidate) => candidate.written.length > 1)
        .filter((candidate) => (candidate.corpusSupportScore || 0) > 0 || (candidate.variant?.priorities?.length || 0) > 0);

    const scopedCandidates = Number.isFinite(maxWordsPerKanji)
        ? rankedCandidates.slice(0, maxWordsPerKanji)
        : rankedCandidates;

    pool.push(...scopedCandidates);
    return pool;
}

function buildWordSupportScore(candidate, sentenceCorpus) {
    const entries = (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
        .filter((entry) => entry?.written === candidate?.written);

    if (entries.length === 0) {
        return 0;
    }

    let score = 100;
    if (entries.some((entry) => String(entry?.reading || "").includes(String(candidate?.pron || "")))) {
        score += 200;
    }
    if (entries.some((entry) => String(entry?.japanese || "").includes(candidate?.written || ""))) {
        score += 50;
    }

    return score;
}

function pickPreferredCandidate(existingCandidate, incomingCandidate, sentenceCorpus) {
    const existingSupport = buildWordSupportScore(existingCandidate, sentenceCorpus);
    const incomingSupport = buildWordSupportScore(incomingCandidate, sentenceCorpus);

    if (incomingSupport !== existingSupport) {
        return incomingSupport > existingSupport ? incomingCandidate : existingCandidate;
    }
    if ((incomingCandidate?.corpusSupportScore || 0) !== (existingCandidate?.corpusSupportScore || 0)) {
        return (incomingCandidate?.corpusSupportScore || 0) > (existingCandidate?.corpusSupportScore || 0)
            ? incomingCandidate
            : existingCandidate;
    }
    if ((incomingCandidate?.score || 0) !== (existingCandidate?.score || 0)) {
        return (incomingCandidate?.score || 0) > (existingCandidate?.score || 0)
            ? incomingCandidate
            : existingCandidate;
    }
    return String(incomingCandidate?.pron || "").length < String(existingCandidate?.pron || "").length
        ? incomingCandidate
        : existingCandidate;
}

function selectWordSentence({ candidate, sourceKanji, constituentKanji, sentenceCorpus }) {
    const wordEntries = (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
        .filter((entry) => entry?.written === candidate?.written);

    if (wordEntries.length > 0) {
        const targetKanji = sourceKanji || constituentKanji[0] || "";
        const bestEntry = [...wordEntries].sort((a, b) => {
            const aPronMatch = String(a?.reading || "").includes(String(candidate?.pron || "")) ? 1 : 0;
            const bPronMatch = String(b?.reading || "").includes(String(candidate?.pron || "")) ? 1 : 0;
            if (bPronMatch !== aPronMatch) {
                return bPronMatch - aPronMatch;
            }
            return scoreCorpusSentence(b, candidate, targetKanji) - scoreCorpusSentence(a, candidate, targetKanji);
        })[0];

        return {
            japanese: bestEntry.japanese,
            reading: bestEntry.reading || candidate.pron,
            english: bestEntry.english,
        };
    }

    const inferred = inferSentenceCandidates({
        rankedCandidates: [candidate],
        kanji: sourceKanji || constituentKanji[0] || "",
        sentenceCorpus,
        maxSentences: 1,
    })[0];

    return inferred ? {
        japanese: inferred.japanese,
        reading: inferred.reading,
        english: inferred.english,
    } : null;
}

function buildBreakdownHtmlItem({ kanji, inference }) {
    const mediaField = inference.strokeOrderAnimationField || inference.strokeOrderImageField || inference.strokeOrderField || "";
    const readingLines = [
        inference.primaryReading ? `<div class="kanji-reading-line">Primary: ${inference.primaryReading}</div>` : "",
        inference.onReading ? `<div class="kanji-reading-line">On-yomi: ${inference.onReading}</div>` : "",
        inference.kunReading ? `<div class="kanji-reading-line">Kun-yomi: ${inference.kunReading}</div>` : "",
    ].filter(Boolean).join("");

    return [
        '<div class="kanji-breakdown-item">',
        '<div class="kanji-breakdown-head">',
        `<span class="kanji-char">${kanji}</span>`,
        inference.primaryReading ? `<span class="kanji-primary">${inference.primaryReading}</span>` : "",
        '</div>',
        inference.meaningJP ? `<div class="kanji-meaning">${inference.meaningJP}</div>` : "",
        readingLines,
        mediaField ? `<div class="kanji-media">${mediaField}</div>` : "",
        '</div>',
    ].join("");
}

function createWordExportService({
    sentenceCorpus = [],
    curatedStudyData = {},
    inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData }),
    kanjiExportService = createExportService({ inferenceEngine }),
} = {}) {
    async function buildKanjiInferenceCache({ kanjiList, kanjiApiClient, strokeOrderService, audioService, concurrency = 8 }) {
        const cache = new Map();
        const inferredCards = await mapWithConcurrency(
            [...new Set((Array.isArray(kanjiList) ? kanjiList : []).filter(Boolean))],
            concurrency,
            async (kanji) => ({
                kanji,
                inference: await kanjiExportService.buildInferenceForKanji({
                    kanji,
                    kanjiApiClient,
                    strokeOrderService,
                    audioService,
                }),
            })
        );

        for (const entry of inferredCards) {
            cache.set(entry.kanji, entry.inference);
        }

        return cache;
    }

    async function buildWordDeckForLevel({
        levelNumber,
        jlptOnlyJson,
        kanjiApiClient,
        strokeOrderService = null,
        audioService = null,
        limit = null,
        concurrency = 8,
        maxWordsPerKanji = null,
        minimumCandidateScore = 20,
    }) {
        const sourceKanjiList = Object.entries(jlptOnlyJson || {})
            .filter(([, value]) => value?.jlpt === levelNumber)
            .map(([kanji]) => kanji);
        const scopedSourceKanji = Number.isFinite(limit)
            ? sourceKanjiList.slice(0, limit)
            : sourceKanjiList;
        const kanjiInferenceCache = await buildKanjiInferenceCache({
            kanjiList: scopedSourceKanji,
            kanjiApiClient,
            strokeOrderService,
            audioService,
            concurrency,
        });
        const wordCandidates = new Map();

        for (const sourceKanji of scopedSourceKanji) {
            const inference = kanjiInferenceCache.get(sourceKanji);
            if (!inference) {
                continue;
            }

            const candidatePool = buildCandidatePool({
                inference,
                sourceKanji,
                maxWordsPerKanji,
                minimumCandidateScore,
            });

            for (const candidate of candidatePool) {
                const assignedLevel = inferWordLevel({
                    written: candidate.written,
                    jlptOnlyJson,
                    fallbackLevel: levelNumber,
                });

                if (assignedLevel !== levelNumber) {
                    continue;
                }

                const key = buildWordKey(candidate);
                const existing = wordCandidates.get(key);
                if (!existing) {
                    wordCandidates.set(key, {
                        candidate,
                        level: assignedLevel,
                        sourceKanji: new Set([sourceKanji]),
                    });
                    continue;
                }

                const preferredCandidate = pickPreferredCandidate(existing.candidate, candidate, sentenceCorpus);
                if (preferredCandidate !== existing.candidate) {
                    existing.candidate = preferredCandidate;
                }
                existing.sourceKanji.add(sourceKanji);
            }
        }

        const requiredConstituentKanji = [...new Set(
            [...wordCandidates.values()].flatMap((entry) => extractConstituentKanji(entry.candidate.written))
        )];
        const missingKanji = requiredConstituentKanji.filter((kanji) => !kanjiInferenceCache.has(kanji));
        if (missingKanji.length > 0) {
            const additionalCache = await buildKanjiInferenceCache({
                kanjiList: missingKanji,
                kanjiApiClient,
                strokeOrderService,
                audioService,
                concurrency,
            });
            for (const [kanji, inference] of additionalCache.entries()) {
                kanjiInferenceCache.set(kanji, inference);
            }
        }

        const rows = [];
        const mediaKanji = new Set();
        const sortedEntries = [...wordCandidates.values()].sort((a, b) => (
            (b.candidate.score || 0) - (a.candidate.score || 0)
            || a.candidate.written.length - b.candidate.written.length
            || a.candidate.written.localeCompare(b.candidate.written)
        ));

        for (const entry of sortedEntries) {
            const constituentKanji = extractConstituentKanji(entry.candidate.written);
            const breakdownHtml = constituentKanji
                .map((kanji) => {
                    mediaKanji.add(kanji);
                    const inference = kanjiInferenceCache.get(kanji);
                    if (!inference) {
                        return "";
                    }
                    return buildBreakdownHtmlItem({ kanji, inference });
                })
                .filter(Boolean)
                .join("");
            const exampleSentence = formatExampleSentence(selectWordSentence({
                candidate: entry.candidate,
                sourceKanji: [...entry.sourceKanji][0] || "",
                constituentKanji,
                sentenceCorpus,
            }));

            rows.push([
                entry.candidate.written,
                entry.candidate.pron,
                entry.candidate.gloss,
                buildJlptLabel(entry.level),
                breakdownHtml,
                exampleSentence,
                buildWordNotes(entry),
            ].map(tsvEscape).join("\t"));
        }

        return {
            header: WORD_FIELD_NAMES.join("\t"),
            rows,
            mediaKanji: [...mediaKanji].sort(),
        };
    }

    async function buildWordTsvForJlptLevel(options) {
        const result = await buildWordDeckForLevel(options);
        return {
            tsv: [result.header, ...result.rows].join("\n"),
            mediaKanji: result.mediaKanji,
            rowCount: result.rows.length,
        };
    }

    return {
        buildWordDeckForLevel,
        buildWordTsvForJlptLevel,
        buildCandidatePool,
        buildWordKey,
        inferWordLevel,
        extractConstituentKanji,
        pickPreferredCandidate,
        selectWordSentence,
    };
}

const defaultWordExportService = createWordExportService();

module.exports = {
    buildCandidatePool,
    buildDisplayCandidate,
    buildJlptLabel,
    buildWordKey,
    buildWordNotes,
    buildWordSupportScore,
    createWordExportService,
    defaultWordExportService,
    extractConstituentKanji,
    inferWordLevel,
    pickBestExactSingleCandidate,
    pickPreferredCandidate,
    selectWordSentence,
};
