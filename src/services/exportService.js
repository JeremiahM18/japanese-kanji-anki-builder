const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { createInferenceEngine } = require("../inference/inferenceEngine");
const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { buildOfflineFallbackCard } = require("./offlineKanjiFallback");
const { selectBestAudioAsset } = require("./audioService");
const { mapWithConcurrency } = require("../utils/concurrency");
const { labelKunReading, labelOnReading, tsvEscape } = require("../utils/text");
const { katakanaToHiragana } = require("../utils/japanese");

const ANKI_FIELD_NAMES = loadAnkiNoteSchema().fieldNames;
const MAX_INFERENCE_EXAMPLES = 3;
const MAX_INFERENCE_SENTENCES = 3;
const HAN_CHAR_RE = /\p{Script=Han}/u;

function createEmptyExportProfile() {
    return {
        rows: 0,
        fullyCuratedRows: 0,
        inferredRows: 0,
        timingsMs: {
            getKanji: 0,
            getWords: 0,
            media: 0,
            inference: 0,
            formatting: 0,
        },
    };
}

function recordProfileTiming(exportProfile, key, startedAt) {
    if (!exportProfile || !key || !Number.isFinite(startedAt)) {
        return;
    }

    exportProfile.timingsMs[key] += performance.now() - startedAt;
}

async function measureAsync(exportProfile, key, action) {
    if (!exportProfile) {
        return action();
    }

    const startedAt = performance.now();
    try {
        return await action();
    } finally {
        recordProfileTiming(exportProfile, key, startedAt);
    }
}

function formatExampleSentence(sentence) {
    if (!sentence) {
        return "";
    }

    return [sentence.japanese, sentence.reading, sentence.english]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" ／ ");
}

function formatAnkiAudioField(audioPath) {
    if (!audioPath) {
        return "";
    }

    return `[sound:${path.posix.basename(audioPath)}]`;
}

function formatAnkiStrokeOrderField(strokeOrderPath) {
    if (!strokeOrderPath) {
        return "";
    }

    return `<img src="${path.posix.basename(strokeOrderPath)}" />`;
}

function selectPrimaryReading({ displayWord, bestWord }) {
    const displayPron = String(displayWord?.pron ?? "").trim();
    if (displayPron) {
        return displayPron;
    }

    const displayWritten = String(displayWord?.written ?? "").trim();
    const bestPron = String(bestWord?.pron ?? "").trim();
    const bestWritten = String(bestWord?.written ?? "").trim();
    if (bestPron && (!displayWritten || displayWritten === bestWritten)) {
        return bestPron;
    }

    return "";
}

function selectDisplayWord({ kanji, displayWord, bestWord }) {
    const displayWritten = String(displayWord?.written ?? "").trim();
    if (displayWritten) {
        return displayWritten;
    }

    const bestWritten = String(bestWord?.written ?? "").trim();
    if (bestWritten) {
        return bestWritten;
    }

    return String(kanji ?? "").trim();
}

function extractConstituentKanji(text) {
    return [...new Set(String(text || "").match(/\p{Script=Han}/gu) || [])];
}

function normalizeReading(value) {
    return katakanaToHiragana(String(value || ""))
        .replace(/[.・]/g, "")
        .replace(/-/g, "")
        .replace(/\s+/g, "")
        .trim();
}

function hasOnlyTargetKanji(value, kanji) {
    const kanjiChars = extractConstituentKanji(value);
    return kanjiChars.length > 0 && kanjiChars.every((char) => char === kanji);
}

function selectReadingFromKanjiInfo({ kanjiInfo, contextReading = "" }) {
    const normalizedContext = normalizeReading(contextReading);
    const readings = [
        ...(Array.isArray(kanjiInfo?.kun_readings) ? kanjiInfo.kun_readings : []),
        ...(Array.isArray(kanjiInfo?.on_readings) ? kanjiInfo.on_readings : []),
    ].map(normalizeReading).filter(Boolean);

    if (normalizedContext) {
        const contextual = readings
            .filter((reading) => normalizedContext.includes(reading))
            .sort((a, b) => b.length - a.length)[0];
        if (contextual) {
            return contextual;
        }
    }

    return readings[0] || "";
}

function selectKanjiPrimaryReading({ kanji, curatedEntry = null, inferred = null, kanjiInfo = null }) {
    const breakdownWord = curatedEntry?.breakdownDisplayWord?.written;
    const breakdownPron = curatedEntry?.breakdownDisplayWord?.pron;
    if (breakdownPron && hasOnlyTargetKanji(breakdownWord, kanji)) {
        return String(breakdownPron).trim();
    }

    const curatedWord = curatedEntry?.displayWord?.written;
    const curatedPron = curatedEntry?.displayWord?.pron;
    if (curatedPron && hasOnlyTargetKanji(curatedWord, kanji)) {
        return String(curatedPron).trim();
    }

    const inferredWord = inferred?.displayWord?.written;
    const inferredPron = inferred?.displayWord?.pron;
    if (inferredPron && hasOnlyTargetKanji(inferredWord, kanji)) {
        return String(inferredPron).trim();
    }

    return selectReadingFromKanjiInfo({
        kanjiInfo,
        contextReading: curatedPron || inferredPron || inferred?.bestWord?.pron || "",
    });
}

function extractEnglishMeaningFromMeaningJP(value) {
    const parts = String(value || "").split("／");
    return String(parts.length > 1 ? parts.slice(1).join("／") : "").trim();
}

function splitMeaningList(value) {
    return String(value || "")
        .split("/")
        .map((meaning) => meaning.trim())
        .filter(Boolean);
}

function formatKanjiMeanings({ kanjiInfo, fallbackMeaning = "", curatedEntry = null } = {}) {
    const meaningSet = new Set(splitMeaningList(curatedEntry?.englishMeaning));
    const kanjiInfoMeanings = Array.isArray(kanjiInfo?.meanings)
        ? kanjiInfo.meanings.map((meaning) => String(meaning || "").trim()).filter(Boolean)
        : [];

    for (const meaning of kanjiInfoMeanings) {
        meaningSet.add(meaning);
    }

    if (meaningSet.size === 0) {
        for (const meaning of splitMeaningList(fallbackMeaning)) {
            meaningSet.add(meaning);
        }
    }

    return [...meaningSet].join(" / ");
}

function parseNoteGlossEntries(notes) {
    return String(notes || "")
        .split("／")
        .map((entry) => {
            const match = entry.trim().match(/^(?<written>.+?)\s*（(?<reading>[^）]+)）\s*-\s*(?<meaning>.+)$/u);
            if (!match?.groups) {
                return null;
            }

            return {
                written: match.groups.written.trim(),
                reading: match.groups.reading.trim(),
                meaning: match.groups.meaning.trim(),
            };
        })
        .filter(Boolean);
}

function selectPrimaryReadingMeaning({ kanji, primaryReading, curatedEntry = null, inferred = null, kanjiInfo = null }) {
    const normalizedPrimaryReading = normalizeReading(primaryReading);
    const noteEntries = [
        ...parseNoteGlossEntries(curatedEntry?.notes),
        ...parseNoteGlossEntries(inferred?.notes),
    ];
    const matchingNote = noteEntries.find((entry) => (
        normalizeReading(entry.reading) === normalizedPrimaryReading
        && hasOnlyTargetKanji(entry.written, kanji)
    ));

    if (matchingNote?.meaning) {
        return matchingNote.meaning;
    }

    const candidates = [
        curatedEntry?.breakdownDisplayWord,
        curatedEntry?.displayWord,
        inferred?.displayWord,
        inferred?.bestWord,
    ];
    const hasMatchingPrimarySurface = candidates.some((candidate) => (
        candidate
        && normalizeReading(candidate.pron) === normalizedPrimaryReading
        && hasOnlyTargetKanji(candidate.written, kanji)
    ));
    const inferredMeaning = String(
        inferred?.englishMeaning
        || extractEnglishMeaningFromMeaningJP(inferred?.meaningJP)
        || ""
    ).trim();

    if (hasMatchingPrimarySurface && inferredMeaning) {
        return inferredMeaning;
    }

    return String((Array.isArray(kanjiInfo?.meanings) ? kanjiInfo.meanings[0] : "") || inferredMeaning).trim();
}

function selectExactKanjiAudioAsset(audioAssets, { kanji, reading = "" } = {}) {
    const normalizedReading = String(reading || "").trim();
    const selected = selectBestAudioAsset(audioAssets || [], {
        category: "kanji-reading",
        text: kanji,
        reading: normalizedReading,
    });

    if (!selected || !normalizedReading) {
        return selected || null;
    }

    return String(selected.reading || "").trim() === normalizedReading ? selected : null;
}

function buildKanjiDeckInference({ kanji, inferred, kanjiInfo, curatedEntry = null }) {
    const primaryReading = selectKanjiPrimaryReading({ kanji, curatedEntry, inferred, kanjiInfo });
    const inferredMeaning = String(
        inferred?.englishMeaning
        || extractEnglishMeaningFromMeaningJP(inferred?.meaningJP)
        || ""
    ).trim();
    const primaryReadingMeaning = selectPrimaryReadingMeaning({
        kanji,
        primaryReading,
        curatedEntry,
        inferred,
        kanjiInfo,
    });
    const kanjiMeanings = formatKanjiMeanings({ kanjiInfo, fallbackMeaning: inferredMeaning, curatedEntry });
    const displayWord = { written: String(kanji || "").trim(), pron: primaryReading };

    return {
        ...inferred,
        displayWord,
        displayWordText: displayWord.written,
        primaryReading,
        meaningJP: primaryReadingMeaning,
        kanjiMeanings,
    };
}

function buildKanjiLevelLookup({ jlptOnlyJson = {}, targetKanji = "", targetJlptEntry = null } = {}) {
    const lookup = new Map();
    for (const [kanji, entry] of Object.entries(jlptOnlyJson || {})) {
        const level = Number(entry?.jlpt);
        if (HAN_CHAR_RE.test(kanji) && Number.isInteger(level)) {
            lookup.set(kanji, level);
        }
    }

    const targetLevel = Number(targetJlptEntry?.jlpt);
    if (targetKanji && Number.isInteger(targetLevel) && !lookup.has(targetKanji)) {
        lookup.set(targetKanji, targetLevel);
    }

    return lookup;
}

function formatStudyWordKanjiLabels(displayWord, kanjiLevelLookup = new Map(), { currentLevel = null } = {}) {
    const deckLevel = Number(currentLevel);
    return extractConstituentKanji(displayWord)
        .filter((kanji) => {
            const level = kanjiLevelLookup.get(kanji);
            return !(Number.isInteger(deckLevel) && level === deckLevel);
        })
        .map((kanji) => {
            const level = kanjiLevelLookup.get(kanji);
            const label = Number.isInteger(level) ? `JLPT N${level}` : "outside JLPT";
            return `<span class="kanji-level-badge">${kanji}: ${label}</span>`;
        })
        .join(" ");
}

function formatTsvRow(fields) {
    return fields.map(tsvEscape).join("\t");
}

function appendExportIssue(exportIssues, issue) {
    if (!Array.isArray(exportIssues)) {
        return;
    }

    exportIssues.push(issue);
}

async function resolveStrokeOrderFields(strokeOrderService, kanji) {
    const imagePath = typeof strokeOrderService?.getStrokeOrderImagePath === "function"
        ? await strokeOrderService.getStrokeOrderImagePath(kanji)
        : "";
    const animationPath = typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
        ? await strokeOrderService.getStrokeOrderAnimationPath(kanji)
        : "";
    const bestPath = animationPath
        || imagePath
        || (typeof strokeOrderService?.getBestStrokeOrderPath === "function"
            ? await strokeOrderService.getBestStrokeOrderPath(kanji)
            : "");

    return {
        strokeOrderPath: bestPath,
        strokeOrderImagePath: imagePath,
        strokeOrderAnimationPath: animationPath,
    };
}

async function resolveManagedMediaFields({ kanji, strokeOrderService, audioService, audioReading = "" }) {
    const manifestProvider = typeof strokeOrderService?.getManifest === "function"
        ? strokeOrderService
        : (typeof audioService?.getManifest === "function" ? audioService : null);

    if (manifestProvider) {
        const manifest = await manifestProvider.getManifest(kanji);
        const imagePath = manifest?.assets?.strokeOrderImage?.path || "";
        const animationPath = manifest?.assets?.strokeOrderAnimation?.path || "";
        const bestPath = animationPath || imagePath || "";
        const audioPath = selectExactKanjiAudioAsset(manifest?.assets?.audio || [], {
            kanji,
            reading: audioReading,
        })?.path || "";

        return {
            strokeOrderPath: bestPath,
            strokeOrderImagePath: imagePath,
            strokeOrderAnimationPath: animationPath,
            audioPath,
        };
    }

    const [strokeOrderFields, audioPath] = await Promise.all([
        resolveStrokeOrderFields(strokeOrderService, kanji),
        typeof audioService?.getBestAudioPath === "function"
            ? audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji, reading: audioReading })
            : Promise.resolve(""),
    ]);

    return {
        ...strokeOrderFields,
        audioPath,
    };
}

function shouldSkipWordFetch(inferenceEngine, kanji) {
    return typeof inferenceEngine?.hasFullyCuratedKanjiEntry === "function"
        && inferenceEngine.hasFullyCuratedKanjiEntry(kanji);
}

function shouldUseLocalJlptEntry({ inferenceEngine, kanji, jlptEntry }) {
    return Boolean(
        jlptEntry
        && typeof jlptEntry === "object"
        && shouldSkipWordFetch(inferenceEngine, kanji)
    );
}

function buildInferredRow({ kanji, inferred, kanjiInfo, kradMap, pickMainComponent, mediaFields, kanjiLevelLookup, currentLevel = null }) {
    const displayWord = inferred.displayWordText || selectDisplayWord({ kanji, displayWord: inferred.displayWord, bestWord: inferred.bestWord });
    const primaryReading = inferred.primaryReading || selectPrimaryReading(inferred);
    const studyWordKanji = formatStudyWordKanjiLabels(displayWord, kanjiLevelLookup, { currentLevel });
    const onReading = labelOnReading(kanjiInfo?.on_readings);
    const kunReading = labelKunReading(kanjiInfo?.kun_readings);
    const components = kradMap.get(kanji) || [];
    const radical = pickMainComponent(components);
    const exampleSentence = formatExampleSentence(inferred.sentenceCandidates[0]);

    return formatTsvRow([
        kanji,
        displayWord,
        inferred.meaningJP,
        primaryReading,
        inferred.kanjiMeanings,
        studyWordKanji,
        onReading,
        kunReading,
        formatAnkiStrokeOrderField(mediaFields.strokeOrderPath),
        formatAnkiStrokeOrderField(mediaFields.strokeOrderImagePath),
        formatAnkiStrokeOrderField(mediaFields.strokeOrderAnimationPath),
        formatAnkiAudioField(mediaFields.audioPath),
        radical,
        inferred.notes,
        exampleSentence,
    ]);
}

function buildFallbackRow({ fallbackCard, kanjiLevelLookup, currentLevel = null }) {
    const studyWordKanji = formatStudyWordKanjiLabels(fallbackCard.displayWord, kanjiLevelLookup, { currentLevel });

    return formatTsvRow([
        fallbackCard.kanji,
        fallbackCard.displayWord,
        fallbackCard.meaningJP,
        fallbackCard.primaryReading,
        fallbackCard.kanjiMeanings || fallbackCard.meaningJP,
        studyWordKanji,
        fallbackCard.onReading,
        fallbackCard.kunReading,
        formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderPath),
        formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderImagePath),
        formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderAnimationPath),
        formatAnkiAudioField(fallbackCard.media.audioPath),
        fallbackCard.radical,
        fallbackCard.notes,
        fallbackCard.exampleSentence,
    ]);
}

function createExportService({
    inferenceEngine = createInferenceEngine(),
    curatedStudyData = {},
    sentenceCorpus = [],
} = {}) {
    async function buildRowForKanji({
        kanji,
        jlptEntry = null,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
        audioService,
        exportProfile = null,
        exportIssues = null,
        jlptOnlyJson = {},
    }) {
        try {
            const skipWordFetch = shouldSkipWordFetch(inferenceEngine, kanji);
            const useLocalJlptEntry = shouldUseLocalJlptEntry({ inferenceEngine, kanji, jlptEntry });
            const curatedEntry = curatedStudyData?.[kanji] || null;
            const kanjiLevelLookup = buildKanjiLevelLookup({
                jlptOnlyJson,
                targetKanji: kanji,
                targetJlptEntry: jlptEntry,
            });
            const currentLevel = Number(jlptEntry?.jlpt);
            const [kanjiInfo, words] = await Promise.all([
                useLocalJlptEntry
                    ? Promise.resolve(jlptEntry)
                    : measureAsync(exportProfile, "getKanji", () => kanjiApiClient.getKanji(kanji)),
                skipWordFetch
                    ? Promise.resolve([])
                    : measureAsync(exportProfile, "getWords", () => kanjiApiClient.getWords(kanji)),
            ]);

            const inferenceStartedAt = exportProfile ? performance.now() : NaN;
            const rawInferred = inferenceEngine.inferKanjiStudyData({
                kanji,
                kanjiInfo,
                words,
                maxExamples: MAX_INFERENCE_EXAMPLES,
                maxSentences: MAX_INFERENCE_SENTENCES,
            });
            const inferred = buildKanjiDeckInference({ kanji, inferred: rawInferred, kanjiInfo, curatedEntry });
            recordProfileTiming(exportProfile, "inference", inferenceStartedAt);

            const mediaFields = await measureAsync(exportProfile, "media", () => resolveManagedMediaFields({
                kanji,
                strokeOrderService,
                audioService,
                audioReading: inferred.primaryReading,
            }));

            if (exportProfile) {
                exportProfile.rows += 1;
                if (skipWordFetch) {
                    exportProfile.fullyCuratedRows += 1;
                } else {
                    exportProfile.inferredRows += 1;
                }
            }

            const formattingStartedAt = exportProfile ? performance.now() : NaN;
            const row = buildInferredRow({
                kanji,
                inferred,
                kanjiInfo,
                kradMap,
                pickMainComponent,
                mediaFields,
                kanjiLevelLookup,
                currentLevel,
            });
            recordProfileTiming(exportProfile, "formatting", formattingStartedAt);
            return row;
        } catch (error) {
            try {
                const fallbackCard = await buildOfflineFallbackCard({
                    kanji,
                    levelLabel: `N${jlptEntry?.jlpt || "?"}`,
                    jlptEntry,
                    curatedStudyData,
                    sentenceCorpus,
                    kradMap,
                    strokeOrderService,
                    audioService,
                });
                const kanjiLevelLookup = buildKanjiLevelLookup({
                    jlptOnlyJson,
                    targetKanji: kanji,
                    targetJlptEntry: jlptEntry,
                });

                appendExportIssue(exportIssues, {
                    kanji,
                    level: jlptEntry?.jlpt || null,
                    severity: "warning",
                    resolution: "offline-local-fallback",
                    error: error instanceof Error ? error.message : String(error),
                });

                return buildFallbackRow({ fallbackCard, kanjiLevelLookup, currentLevel: Number(jlptEntry?.jlpt) });
            } catch (fallbackError) {
                appendExportIssue(exportIssues, {
                    kanji,
                    level: jlptEntry?.jlpt || null,
                    severity: "error",
                    resolution: "build-failed",
                    error: error instanceof Error ? error.message : String(error),
                    fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                });

                throw new Error(
                    `Failed to build export row for ${kanji}: ${error instanceof Error ? error.message : String(error)}; fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
                );
            }
        }
    }

    async function buildInferenceForKanji({ kanji, jlptEntry = null, jlptOnlyJson = {}, kanjiApiClient, strokeOrderService, audioService }) {
        const skipWordFetch = shouldSkipWordFetch(inferenceEngine, kanji);
        const useLocalJlptEntry = shouldUseLocalJlptEntry({ inferenceEngine, kanji, jlptEntry });
        const curatedEntry = curatedStudyData?.[kanji] || null;
        const [kanjiInfo, words] = await Promise.all([
            useLocalJlptEntry ? Promise.resolve(jlptEntry) : kanjiApiClient.getKanji(kanji),
            skipWordFetch ? Promise.resolve([]) : kanjiApiClient.getWords(kanji),
        ]);

        const rawInferred = inferenceEngine.inferKanjiStudyData({
            kanji,
            kanjiInfo,
            words,
            maxExamples: MAX_INFERENCE_EXAMPLES,
            maxSentences: MAX_INFERENCE_SENTENCES,
        });
        const inferred = buildKanjiDeckInference({ kanji, inferred: rawInferred, kanjiInfo, curatedEntry });
        const mediaFields = await resolveManagedMediaFields({
            kanji,
            strokeOrderService,
            audioService,
            audioReading: inferred.primaryReading,
        });

        const onReading = labelOnReading(kanjiInfo?.on_readings);
        const kunReading = labelKunReading(kanjiInfo?.kun_readings);
        const displayWordText = inferred.displayWordText;
        const kanjiLevelLookup = buildKanjiLevelLookup({
            jlptOnlyJson,
            targetKanji: kanji,
            targetJlptEntry: jlptEntry,
        });
        const currentLevel = Number(jlptEntry?.jlpt);

        return {
            ...inferred,
            displayWordText,
            primaryReading: inferred.primaryReading,
            kanjiMeanings: inferred.kanjiMeanings,
            studyWordKanji: formatStudyWordKanjiLabels(displayWordText, kanjiLevelLookup, { currentLevel }),
            onReading,
            kunReading,
            strokeOrderPath: mediaFields.strokeOrderPath,
            strokeOrderField: formatAnkiStrokeOrderField(mediaFields.strokeOrderPath),
            strokeOrderImagePath: mediaFields.strokeOrderImagePath,
            strokeOrderImageField: formatAnkiStrokeOrderField(mediaFields.strokeOrderImagePath),
            strokeOrderAnimationPath: mediaFields.strokeOrderAnimationPath,
            strokeOrderAnimationField: formatAnkiStrokeOrderField(mediaFields.strokeOrderAnimationPath),
            audioPath: mediaFields.audioPath,
            audioField: formatAnkiAudioField(mediaFields.audioPath),
        };
    }

    async function buildTsvForJlptLevel({
        levelNumber,
        jlptOnlyJson,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService = null,
        audioService = null,
        limit = null,
        concurrency = 8,
        exportProfile = null,
        exportIssues = null,
    }) {
        const header = ANKI_FIELD_NAMES.join("\t");

        const kanjiList = Object.entries(jlptOnlyJson)
            .filter(([, value]) => value?.jlpt === levelNumber)
            .map(([kanji]) => kanji);

        const list = Number.isFinite(limit)
            ? kanjiList.slice(0, limit)
            : kanjiList;

        const rows = await mapWithConcurrency(
            list,
            concurrency,
            async (kanji) => buildRowForKanji({
                kanji,
                jlptEntry: jlptOnlyJson[kanji] || null,
                kradMap,
                pickMainComponent,
                kanjiApiClient,
                strokeOrderService,
                audioService,
                exportProfile,
                exportIssues,
                jlptOnlyJson,
            })
        );

        return [header, ...rows].join("\n");
    }

    return {
        buildInferenceForKanji,
        buildRowForKanji,
        buildTsvForJlptLevel,
        createEmptyExportProfile,
        formatAnkiAudioField,
        formatAnkiStrokeOrderField,
        formatExampleSentence,
        formatStudyWordKanjiLabels,
    };
}

module.exports = {
    createEmptyExportProfile,
    createExportService,
    formatAnkiAudioField,
    formatAnkiStrokeOrderField,
    formatExampleSentence,
    formatStudyWordKanjiLabels,
};

