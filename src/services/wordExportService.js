const { createInferenceEngine } = require("../inference/inferenceEngine");
const { buildMeaningJP } = require("../inference/meaningInference");
const { inferSentenceCandidates, scoreCorpusSentence } = require("../inference/sentenceInference");
const { createExportService, formatExampleSentence } = require("./exportService");
const { buildOfflineFallbackCard } = require("./previewCardService");
const { mapWithConcurrency } = require("../utils/concurrency");
const { tsvEscape } = require("../utils/text");
const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");

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
    return buildWordStudyEntryKey({
        written: String(candidate?.written || "").trim(),
        reading: String(candidate?.pron || "").trim(),
    });
}

function buildWordNotes(curatedEntry) {
    return String(curatedEntry?.notes || "").trim();
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

function extractEnglishMeaningFromMeaningJP(meaningJP) {
    const text = String(meaningJP || "").trim();
    if (!text) {
        return "";
    }

    const parts = text.split("／").map((part) => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : text;
}

function buildDisplayCandidate(inference, sourceKanji) {
    const written = String(sourceKanji || "").trim();
    if (!written) {
        return null;
    }

    const exactCandidate = pickBestExactSingleCandidate(inference, sourceKanji);
    const pron = String(exactCandidate?.pron || inference?.primaryReading || inference?.displayWord?.pron || "").trim();
    const gloss = String(exactCandidate?.gloss || inference?.englishMeaning || extractEnglishMeaningFromMeaningJP(inference?.meaningJP) || "").trim();

    return {
        written,
        pron,
        gloss,
        score: Number.MAX_SAFE_INTEGER - 1,
        corpusSupportScore: Number.MAX_SAFE_INTEGER - 1,
        variant: { priorities: ["display-word"] },
    };
}

function buildWordStudyIndexes(wordStudyData = {}) {
    const exactEntries = new Map();
    const entriesByWritten = new Map();
    const entriesByKanji = new Map();

    for (const entry of Object.values(wordStudyData || {})) {
        const key = buildWordStudyEntryKey(entry);
        exactEntries.set(key, entry);

        const written = String(entry?.written || "").trim();
        if (!entriesByWritten.has(written)) {
            entriesByWritten.set(written, []);
        }
        entriesByWritten.get(written).push(entry);

        for (const kanji of extractConstituentKanji(written)) {
            if (!entriesByKanji.has(kanji)) {
                entriesByKanji.set(kanji, []);
            }
            entriesByKanji.get(kanji).push(entry);
        }
    }

    return {
        exactEntries,
        entriesByWritten,
        entriesByKanji,
    };
}

function buildCuratedCandidate(entry) {
    return {
        written: entry.written,
        pron: entry.reading,
        gloss: entry.meaning,
        score: Number.MAX_SAFE_INTEGER,
        corpusSupportScore: Number.MAX_SAFE_INTEGER,
        variant: { priorities: ["curated-word"] },
    };
}

function getCandidateLevel({ candidate, curatedEntry, jlptOnlyJson, fallbackLevel }) {
    if (Number.isInteger(curatedEntry?.jlpt)) {
        return curatedEntry.jlpt;
    }

    return inferWordLevel({
        written: candidate?.written,
        jlptOnlyJson,
        fallbackLevel,
    });
}

function hasCuratedWrittenVariant(candidate, wordStudyIndexes) {
    const written = String(candidate?.written || "").trim();
    return (wordStudyIndexes.entriesByWritten.get(written) || []).length > 0;
}

function isAllowedByCuratedWords(candidate, wordStudyIndexes) {
    if (!hasCuratedWrittenVariant(candidate, wordStudyIndexes)) {
        return true;
    }

    return wordStudyIndexes.exactEntries.has(buildWordKey(candidate));
}

function dedupeCandidatePool(pool) {
    const deduped = new Map();
    for (const candidate of pool) {
        const key = buildWordKey(candidate);
        if (!key || key === "|") {
            continue;
        }

        const existing = deduped.get(key);
        if (!existing || (candidate.score || 0) > (existing.score || 0)) {
            deduped.set(key, candidate);
        }
    }

    return [...deduped.values()];
}

function buildCandidatePool({
    inference,
    sourceKanji,
    maxWordsPerKanji,
    minimumCandidateScore,
    wordStudyIndexes,
    levelNumber,
    jlptOnlyJson,
    includeInferred = false,
}) {
    const pool = [];
    const curatedCandidates = (wordStudyIndexes.entriesByKanji.get(sourceKanji) || [])
        .filter((entry) => getCandidateLevel({
            candidate: entry,
            curatedEntry: entry,
            jlptOnlyJson,
            fallbackLevel: levelNumber,
        }) === levelNumber)
        .map(buildCuratedCandidate);

    pool.push(...curatedCandidates);

    if (!includeInferred) {
        return dedupeCandidatePool(pool);
    }

    const displayCandidate = buildDisplayCandidate(inference, sourceKanji);
    if (displayCandidate && isAllowedByCuratedWords(displayCandidate, wordStudyIndexes)) {
        pool.push(displayCandidate);
    }

    const rankedCandidates = (Array.isArray(inference?.candidates) ? inference.candidates : [])
        .filter((candidate) => Number.isFinite(candidate?.score) && candidate.score >= minimumCandidateScore)
        .filter((candidate) => candidate?.written && extractConstituentKanji(candidate.written).length > 0)
        .filter((candidate) => candidate.written.length > 0)
        .filter((candidate) => candidate.written !== sourceKanji)
        .filter((candidate) => (candidate.corpusSupportScore || 0) > 0 || (candidate.variant?.priorities?.length || 0) > 0)
        .filter((candidate) => isAllowedByCuratedWords(candidate, wordStudyIndexes));

    const scopedCandidates = Number.isFinite(maxWordsPerKanji)
        ? rankedCandidates.slice(0, maxWordsPerKanji)
        : rankedCandidates;

    pool.push(...scopedCandidates);
    return dedupeCandidatePool(pool);
}

function buildWordSupportScore(candidate, sentenceCorpus) {
    const entries = (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
        .filter((entry) => entry?.written === candidate?.written);

    if (entries.length === 0) {
        return 0;
    }

    let score = 100;
    if (entries.some((entry) => String(entry?.reading || "").trim() === String(candidate?.pron || "").trim())) {
        score += 300;
    }
    if (entries.some((entry) => String(entry?.reading || "").includes(String(candidate?.pron || "")))) {
        score += 100;
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

function selectWordSentence({ candidate, curatedEntry, sourceKanji, constituentKanji, sentenceCorpus }) {
    if (curatedEntry?.exampleSentence) {
        return {
            japanese: curatedEntry.exampleSentence.japanese,
            reading: curatedEntry.exampleSentence.reading || candidate.pron,
            english: curatedEntry.exampleSentence.english,
        };
    }

    const wordEntries = (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
        .filter((entry) => entry?.written === candidate?.written);

    if (wordEntries.length > 0) {
        const targetKanji = sourceKanji || constituentKanji[0] || "";
        const bestEntry = [...wordEntries].sort((a, b) => {
            const aExactPronMatch = String(a?.reading || "").trim() === String(candidate?.pron || "").trim() ? 1 : 0;
            const bExactPronMatch = String(b?.reading || "").trim() === String(candidate?.pron || "").trim() ? 1 : 0;
            if (bExactPronMatch !== aExactPronMatch) {
                return bExactPronMatch - aExactPronMatch;
            }

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

function buildBreakdownInference({ kanji, inference, curatedEntry = null }) {
    const exactCandidate = pickBestExactSingleCandidate(inference, kanji);
    const exactPron = String(exactCandidate?.pron || "").trim();
    const inferredPrimaryReading = String(inference?.primaryReading || "").trim();
    const curatedDisplayWord = curatedEntry?.displayWord?.written
        ? {
            written: String(curatedEntry.displayWord.written).trim(),
            pron: String(curatedEntry.displayWord.pron || "").trim(),
        }
        : null;
    const useExactCandidate = !curatedDisplayWord
        && exactCandidate?.written === kanji
        && exactPron
        && !KATAKANA_ONLY_RE.test(exactPron)
        && exactPron === inferredPrimaryReading;
    const displayWord = curatedDisplayWord || (useExactCandidate
        ? { written: kanji, pron: exactPron }
        : { written: kanji, pron: "" });
    const englishMeaning = String(
        curatedEntry?.englishMeaning
        || inference?.englishMeaning
        || extractEnglishMeaningFromMeaningJP(inference?.meaningJP)
        || ""
    ).trim();

    return {
        primaryReading: curatedDisplayWord?.pron || (useExactCandidate ? exactPron : ""),
        meaningJP: buildMeaningJP(displayWord, englishMeaning),
        onReading: inference?.onReading || "",
        kunReading: inference?.kunReading || "",
        strokeOrderField: inference?.strokeOrderField || "",
        strokeOrderImageField: inference?.strokeOrderImageField || "",
        strokeOrderAnimationField: inference?.strokeOrderAnimationField || "",
    };
}

function buildBreakdownHtmlItem({ kanji, inference, curatedEntry = null }) {
    const breakdown = buildBreakdownInference({ kanji, inference, curatedEntry });
    const readingLines = [
        breakdown.onReading ? `<div class="kanji-reading-line"><span class="kanji-reading-label">On:</span> ${breakdown.onReading}</div>` : "",
        breakdown.kunReading ? `<div class="kanji-reading-line"><span class="kanji-reading-label">Kun:</span> ${breakdown.kunReading}</div>` : "",
    ].filter(Boolean).join("");

    return [
        '<div class="kanji-breakdown-item">',
        '<div class="kanji-breakdown-head">',
        `<span class="kanji-char">${kanji}</span>`,
        breakdown.primaryReading ? `<span class="kanji-primary">${breakdown.primaryReading}</span>` : "",
        "</div>",
        breakdown.meaningJP ? `<div class="kanji-meaning">${breakdown.meaningJP}</div>` : "",
        readingLines,
        "</div>",
    ].join("");
}

function createWordExportService({
    sentenceCorpus = [],
    curatedStudyData = {},
    wordStudyData = {},
    inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData }),
    kanjiExportService = createExportService({ inferenceEngine }),
} = {}) {
    const wordStudyIndexes = buildWordStudyIndexes(wordStudyData);

    async function buildOfflineKanjiInference({ kanji, jlptEntry, strokeOrderService, audioService }) {
        const fallbackCard = await buildOfflineFallbackCard({
            kanji,
            levelLabel: `N${jlptEntry?.jlpt || "?"}`,
            jlptEntry,
            curatedStudyData,
            sentenceCorpus,
            kradMap: new Map(),
            strokeOrderService,
            audioService,
        });

        return {
            candidates: [],
            displayWord: {
                written: fallbackCard.displayWord,
                pron: fallbackCard.primaryReading,
            },
            primaryReading: fallbackCard.primaryReading,
            englishMeaning: extractEnglishMeaningFromMeaningJP(fallbackCard.meaningJP),
            meaningJP: fallbackCard.meaningJP,
            notes: fallbackCard.notes,
            sentenceCandidates: [],
            onReading: fallbackCard.onReading,
            kunReading: fallbackCard.kunReading,
            strokeOrderPath: fallbackCard.media.strokeOrderPath,
            strokeOrderField: fallbackCard.fields.strokeOrderField,
            strokeOrderImagePath: fallbackCard.media.strokeOrderImagePath,
            strokeOrderImageField: fallbackCard.fields.strokeOrderImageField,
            strokeOrderAnimationPath: fallbackCard.media.strokeOrderAnimationPath,
            strokeOrderAnimationField: fallbackCard.fields.strokeOrderAnimationField,
            audioPath: fallbackCard.media.audioPath,
            audioField: fallbackCard.fields.audioField,
        };
    }

    async function buildKanjiInferenceCache({ kanjiList, jlptOnlyJson, kanjiApiClient, strokeOrderService, audioService, concurrency = 8 }) {
        const cache = new Map();
        const inferredCards = await mapWithConcurrency(
            [...new Set((Array.isArray(kanjiList) ? kanjiList : []).filter(Boolean))],
            concurrency,
            async (kanji) => {
                try {
                    return {
                        kanji,
                        inference: await kanjiExportService.buildInferenceForKanji({
                            kanji,
                            kanjiApiClient,
                            strokeOrderService,
                            audioService,
                        }),
                    };
                } catch {
                    return {
                        kanji,
                        inference: await buildOfflineKanjiInference({
                            kanji,
                            jlptEntry: jlptOnlyJson?.[kanji] || {},
                            strokeOrderService,
                            audioService,
                        }),
                    };
                }
            }
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
        includeInferred = false,
    }) {
        const sourceKanjiList = Object.entries(jlptOnlyJson || {})
            .filter(([, value]) => value?.jlpt === levelNumber)
            .map(([kanji]) => kanji);
        const scopedSourceKanji = Number.isFinite(limit)
            ? sourceKanjiList.slice(0, limit)
            : sourceKanjiList;
        const kanjiInferenceCache = await buildKanjiInferenceCache({
            kanjiList: scopedSourceKanji,
            jlptOnlyJson,
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
                wordStudyIndexes,
                levelNumber,
                jlptOnlyJson,
                includeInferred,
            });

            for (const candidate of candidatePool) {
                const curatedEntry = wordStudyIndexes.exactEntries.get(buildWordKey(candidate)) || null;
                const assignedLevel = getCandidateLevel({
                    candidate,
                    curatedEntry,
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
                        curatedEntry,
                        level: assignedLevel,
                        sourceKanji: new Set([sourceKanji]),
                    });
                    continue;
                }

                const preferredCandidate = pickPreferredCandidate(existing.candidate, candidate, sentenceCorpus);
                if (preferredCandidate !== existing.candidate) {
                    existing.candidate = preferredCandidate;
                    existing.curatedEntry = wordStudyIndexes.exactEntries.get(buildWordKey(preferredCandidate)) || null;
                }
                existing.sourceKanji.add(sourceKanji);
            }
        }

        for (const curatedEntry of wordStudyIndexes.exactEntries.values()) {
            const candidate = buildCuratedCandidate(curatedEntry);
            const assignedLevel = getCandidateLevel({
                candidate,
                curatedEntry,
                jlptOnlyJson,
                fallbackLevel: levelNumber,
            });

            if (assignedLevel !== levelNumber) {
                continue;
            }

            const key = buildWordKey(candidate);
            if (wordCandidates.has(key)) {
                continue;
            }

            wordCandidates.set(key, {
                candidate,
                curatedEntry,
                level: assignedLevel,
                sourceKanji: new Set(extractConstituentKanji(candidate.written)),
            });
        }

        const requiredConstituentKanji = [...new Set(
            [...wordCandidates.values()].flatMap((entry) => extractConstituentKanji(entry.candidate.written))
        )];
        const missingKanji = requiredConstituentKanji.filter((kanji) => !kanjiInferenceCache.has(kanji));
        if (missingKanji.length > 0) {
            const additionalCache = await buildKanjiInferenceCache({
                kanjiList: missingKanji,
                jlptOnlyJson,
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
            || a.candidate.pron.localeCompare(b.candidate.pron)
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
                    return buildBreakdownHtmlItem({
                        kanji,
                        inference,
                        curatedEntry: curatedStudyData?.[kanji] || null,
                    });
                })
                .filter(Boolean)
                .join("");
            const exampleSentence = formatExampleSentence(selectWordSentence({
                candidate: entry.candidate,
                curatedEntry: entry.curatedEntry,
                sourceKanji: [...entry.sourceKanji][0] || "",
                constituentKanji,
                sentenceCorpus,
            }));

            rows.push([
                entry.candidate.written,
                entry.curatedEntry?.reading || entry.candidate.pron,
                entry.curatedEntry?.meaning || entry.candidate.gloss,
                buildJlptLabel(entry.level),
                breakdownHtml,
                exampleSentence,
                buildWordNotes(entry.curatedEntry),
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
        buildBreakdownInference,
        buildWordDeckForLevel,
        buildWordTsvForJlptLevel,
        buildCandidatePool,
        buildWordKey,
        buildWordNotes,
        inferWordLevel,
        extractConstituentKanji,
        pickPreferredCandidate,
        selectWordSentence,
    };
}

const defaultWordExportService = createWordExportService();

module.exports = {
    buildBreakdownInference,
    buildCandidatePool,
    buildDisplayCandidate,
    buildJlptLabel,
    buildWordKey,
    buildWordNotes,
    buildWordStudyIndexes,
    buildWordSupportScore,
    createWordExportService,
    defaultWordExportService,
    extractConstituentKanji,
    inferWordLevel,
    isAllowedByCuratedWords,
    pickBestExactSingleCandidate,
    pickPreferredCandidate,
    selectWordSentence,
};

