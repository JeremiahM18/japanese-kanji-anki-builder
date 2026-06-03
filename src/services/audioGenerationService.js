const fs = require("node:fs");
const path = require("node:path");

const { createKanjiApiClient } = require("../clients/kanjiApiClient");
const { createVoicevoxClient } = require("../clients/voicevoxClient");
const { loadCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadSentenceCorpus } = require("../datasets/sentenceCorpus");
const { createInferenceEngine } = require("../inference/inferenceEngine");
const { buildKanjiDeckInference } = require("./exportService");
const { normalizeTokenForFileName } = require("./audioService");
const { mapWithConcurrency } = require("../utils/concurrency");
const { ensureDir, isPathInside, writeFileAtomicSync } = require("../utils/fs");
const { isKanaOnly, katakanaToHiragana } = require("../utils/japanese");

const MAX_VOICEVOX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_SIDECAR_FIELD_CHARS = 500;

function normalizeKanaReading(value) {
    return katakanaToHiragana(String(value || ""))
        .replace(/[.・]/g, "")
        .replace(/-/g, "")
        .replace(/\s+/g, "")
        .trim();
}

function selectPreferredAudioReading({ inferenceResult, kanjiInfo }) {
    const primaryReading = normalizeKanaReading(inferenceResult?.primaryReading);
    const displayWritten = String(inferenceResult?.displayWord?.written || "").trim();
    const displayPron = normalizeKanaReading(inferenceResult?.displayWord?.pron);
    const bestWritten = String(inferenceResult?.bestWord?.written || "").trim();
    const bestPron = normalizeKanaReading(inferenceResult?.bestWord?.pron);

    const ranked = [
        {
            source: "primary-reading",
            text: primaryReading,
        },
        {
            source: "display-word",
            text: displayPron,
        },
        {
            source: "best-word-display-match",
            text: displayWritten && displayWritten === bestWritten ? bestPron : "",
        },
        {
            source: "best-word",
            text: !displayWritten ? bestPron : "",
        },
        ...((Array.isArray(kanjiInfo?.kun_readings) ? kanjiInfo.kun_readings : []).map((reading) => ({
            source: "kun-reading",
            text: normalizeKanaReading(reading),
        }))),
        ...((Array.isArray(kanjiInfo?.on_readings) ? kanjiInfo.on_readings : []).map((reading) => ({
            source: "on-reading",
            text: normalizeKanaReading(reading),
        }))),
    ];

    for (const candidate of ranked) {
        if (candidate.text && isKanaOnly(candidate.text)) {
            return candidate;
        }
    }

    return {
        source: "kanji-fallback",
        text: "",
    };
}

function buildVoicevoxSpeakerLabel(speakers, speakerId) {
    for (const speaker of Array.isArray(speakers) ? speakers : []) {
        for (const style of Array.isArray(speaker.styles) ? speaker.styles : []) {
            if (style.id === speakerId) {
                return `${speaker.name} / ${style.name}`;
            }
        }
    }

    return `VOICEVOX speaker ${speakerId}`;
}

function normalizeAudioSidecarField(value) {
    return String(value ?? "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
        .trim()
        .slice(0, MAX_AUDIO_SIDECAR_FIELD_CHARS);
}

function buildAudioSourceSidecarPayload({
    source,
    voice,
    locale = "ja-JP",
    category = "kanji-reading",
    text,
    reading,
    notes = "",
}) {
    return {
        version: 1,
        source: normalizeAudioSidecarField(source),
        voice: normalizeAudioSidecarField(voice),
        locale: normalizeAudioSidecarField(locale),
        category: normalizeAudioSidecarField(category),
        text: normalizeAudioSidecarField(text),
        reading: normalizeAudioSidecarField(reading),
        notes: normalizeAudioSidecarField(notes),
    };
}

function buildManagedVoicevoxAudioBuffer(value) {
    const buffer = Buffer.isBuffer(value)
        ? Buffer.from(value)
        : value instanceof Uint8Array
            ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
            : null;
    if (!buffer || buffer.length === 0) {
        throw new Error("VOICEVOX synthesis returned empty or non-binary audio.");
    }
    if (buffer.length > MAX_VOICEVOX_AUDIO_BYTES) {
        throw new Error(`VOICEVOX synthesis returned audio larger than ${MAX_VOICEVOX_AUDIO_BYTES} bytes.`);
    }
    return buffer;
}

function writeManagedVoicevoxAudio(outputPath, audioBuffer) {
    writeFileAtomicSync(outputPath, buildManagedVoicevoxAudioBuffer(audioBuffer));
}

function writeAudioSourceSidecar({
    outputPath,
    audioSourceDir = path.dirname(outputPath),
    source,
    voice,
    locale = "ja-JP",
    category = "kanji-reading",
    text,
    reading,
    notes = "",
}) {
    const sidecarPath = resolveAudioSourceOutputPath(
        audioSourceDir,
        `${path.basename(outputPath, path.extname(outputPath))}.json`
    );
    const payload = buildAudioSourceSidecarPayload({
        source,
        voice,
        locale,
        category,
        text,
        reading,
        notes,
    });

    writeFileAtomicSync(sidecarPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function formatVoicevoxSpeakerTable(speakers) {
    const lines = [];
    lines.push("Japanese Kanji Builder VOICEVOX Speakers");
    lines.push("");

    for (const speaker of Array.isArray(speakers) ? speakers : []) {
        lines.push(`${speaker.name}`);
        for (const style of Array.isArray(speaker.styles) ? speaker.styles : []) {
            lines.push(`- ${style.id}: ${style.name}`);
        }
        lines.push("");
    }

    return `${lines.join("\n").trimEnd()}\n`;
}

function buildWordAudioSourceFileName({ hostKanji, written, reading }) {
    const parts = [
        normalizeTokenForFileName(hostKanji),
        normalizeTokenForFileName(written),
        normalizeTokenForFileName(reading),
    ].filter(Boolean);
    return `${parts.join("-")}.wav`;
}

function buildKanjiAudioSourceFileName(kanji) {
    const token = normalizeTokenForFileName(kanji);
    if (!token) {
        throw new Error("Kanji audio filename is empty after normalization.");
    }
    return `${token}.wav`;
}

function resolveAudioSourceOutputPath(audioSourceDir, fileName) {
    const rootDir = path.resolve(audioSourceDir);
    const outputPath = path.resolve(rootDir, fileName);
    if (!isPathInside(outputPath, rootDir)) {
        throw new Error(`Refusing to write audio outside audio source directory: ${outputPath}`);
    }
    return outputPath;
}

async function generateVoicevoxAudioForKanjiList({
    kanjiList,
    config,
    speakerId,
    concurrency,
    overwrite = false,
    sourceId = "voicevox",
    locale = "ja-JP",
    voiceLabel = "",
    fallbackVoiceLabel = "",
    kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    }),
    voicevoxClient = createVoicevoxClient({
        baseUrl: config.voicevoxEngineUrl,
    }),
    sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath),
    curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath),
    inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData }),
}) {
    ensureDir(config.audioSourceDir);
    let listedSpeakers = [];
    if (typeof voicevoxClient.listSpeakers === "function") {
        try {
            listedSpeakers = await voicevoxClient.listSpeakers();
        } catch {
            listedSpeakers = [];
        }
    }
    const resolvedVoiceLabel = cleanVoiceLabel(voiceLabel)
        || (listedSpeakers.length > 0 ? buildVoicevoxSpeakerLabel(listedSpeakers, speakerId) : "")
        || cleanVoiceLabel(fallbackVoiceLabel)
        || buildVoicevoxSpeakerLabel([], speakerId);

    const summary = {
        totalKanji: kanjiList.length,
        generated: 0,
        skippedExisting: 0,
        failed: 0,
        results: [],
    };

    await mapWithConcurrency(kanjiList, concurrency || config.exportConcurrency, async (kanji) => {
        const outputPath = resolveAudioSourceOutputPath(config.audioSourceDir, buildKanjiAudioSourceFileName(kanji));
        if (!overwrite && fs.existsSync(outputPath)) {
            summary.skippedExisting += 1;
            summary.results.push({ kanji, status: "skipped", outputPath, reason: "existing-file" });
            return;
        }

        try {
            const [kanjiInfo, words] = await Promise.all([
                kanjiApiClient.getKanji(kanji),
                kanjiApiClient.getWords(kanji),
            ]);
            const rawInferenceResult = inferenceEngine.inferKanjiStudyData({
                kanji,
                kanjiInfo,
                words,
                maxExamples: 3,
                maxSentences: 3,
            });
            const inferenceResult = buildKanjiDeckInference({
                kanji,
                inferred: rawInferenceResult,
                kanjiInfo,
                curatedEntry: curatedStudyData?.[kanji] || null,
            });
            const preferredReading = selectPreferredAudioReading({ inferenceResult, kanjiInfo });

            if (!preferredReading.text) {
                throw new Error("No kana reading available for synthesis.");
            }

            const audioBuffer = await voicevoxClient.synthesize({
                text: preferredReading.text,
                speakerId,
            });
            writeManagedVoicevoxAudio(outputPath, audioBuffer);
            writeAudioSourceSidecar({
                outputPath,
                audioSourceDir: config.audioSourceDir,
                source: sourceId,
                voice: resolvedVoiceLabel,
                locale,
                category: "kanji-reading",
                text: kanji,
                reading: preferredReading.text,
                notes: `Generated by VOICEVOX speaker ${speakerId}`,
            });

            summary.generated += 1;
            summary.results.push({
                kanji,
                status: "generated",
                outputPath,
                reading: preferredReading.text,
                readingSource: preferredReading.source,
                bestWord: inferenceResult.bestWord?.written || "",
            });
        } catch (error) {
            summary.failed += 1;
            summary.results.push({
                kanji,
                status: "failed",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    return summary;
}

async function generateVoicevoxAudioForWordList({
    words,
    config,
    speakerId,
    concurrency,
    overwrite = false,
    sourceId = "voicevox",
    locale = "ja-JP",
    voiceLabel = "",
    fallbackVoiceLabel = "",
    voicevoxClient = createVoicevoxClient({
        baseUrl: config.voicevoxEngineUrl,
    }),
}) {
    ensureDir(config.audioSourceDir);
    let listedSpeakers = [];
    if (typeof voicevoxClient.listSpeakers === "function") {
        try {
            listedSpeakers = await voicevoxClient.listSpeakers();
        } catch {
            listedSpeakers = [];
        }
    }
    const resolvedVoiceLabel = cleanVoiceLabel(voiceLabel)
        || (listedSpeakers.length > 0 ? buildVoicevoxSpeakerLabel(listedSpeakers, speakerId) : "")
        || cleanVoiceLabel(fallbackVoiceLabel)
        || buildVoicevoxSpeakerLabel([], speakerId);

    const summary = {
        totalWords: words.length,
        generated: 0,
        skippedExisting: 0,
        failed: 0,
        results: [],
    };

    await mapWithConcurrency(words, concurrency || config.exportConcurrency, async (entry) => {
        const outputPath = resolveAudioSourceOutputPath(config.audioSourceDir, buildWordAudioSourceFileName(entry));
        if (!overwrite && fs.existsSync(outputPath)) {
            summary.skippedExisting += 1;
            summary.results.push({ word: entry.written, reading: entry.reading, status: "skipped", outputPath, reason: "existing-file" });
            return;
        }

        try {
            const normalizedReading = normalizeKanaReading(entry.reading);
            if (!normalizedReading || !isKanaOnly(normalizedReading)) {
                throw new Error("No kana reading available for synthesis.");
            }

            const audioBuffer = await voicevoxClient.synthesize({
                text: normalizedReading,
                speakerId,
            });
            writeManagedVoicevoxAudio(outputPath, audioBuffer);
            writeAudioSourceSidecar({
                outputPath,
                audioSourceDir: config.audioSourceDir,
                source: sourceId,
                voice: resolvedVoiceLabel,
                locale,
                category: "word-reading",
                text: entry.written,
                reading: entry.reading,
                notes: `Generated by VOICEVOX speaker ${speakerId} for host kanji ${entry.hostKanji}; synthesized reading ${normalizedReading}`,
            });

            summary.generated += 1;
            summary.results.push({
                word: entry.written,
                reading: entry.reading,
                hostKanji: entry.hostKanji,
                status: "generated",
                outputPath,
            });
        } catch (error) {
            summary.failed += 1;
            summary.results.push({
                word: entry.written,
                reading: entry.reading,
                hostKanji: entry.hostKanji,
                status: "failed",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    return summary;
}

function cleanVoiceLabel(value) {
    const normalized = String(value || "").trim();
    return normalized || "";
}

function formatVoicevoxGenerationSummary(summary, options = {}) {
    const lines = [];
    lines.push("Japanese Kanji Builder VOICEVOX Audio Generation");
    lines.push("");
    lines.push(`Speaker ID: ${options.speakerId}`);
    lines.push(`Audio destination: ${options.audioSourceDir}`);
    lines.push(`Total kanji: ${summary.totalKanji}`);
    lines.push(`Generated: ${summary.generated}`);
    lines.push(`Skipped existing: ${summary.skippedExisting}`);
    lines.push(`Failed: ${summary.failed}`);

    const failedRows = summary.results.filter((row) => row.status === "failed");
    if (failedRows.length > 0) {
        lines.push("");
        lines.push("Failures:");
        for (const row of failedRows.slice(0, 20)) {
            lines.push(`- ${row.kanji}: ${row.error}`);
        }
    }

    const generatedRows = summary.results.filter((row) => row.status === "generated");
    if (generatedRows.length > 0) {
        lines.push("");
        lines.push("Sample generated:");
        for (const row of generatedRows.slice(0, 10)) {
            lines.push(`- ${row.kanji}: ${row.reading} (${row.readingSource})`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildKanjiAudioSourceFileName,
    buildWordAudioSourceFileName,
    buildVoicevoxSpeakerLabel,
    cleanVoiceLabel,
    formatVoicevoxGenerationSummary,
    formatVoicevoxSpeakerTable,
    generateVoicevoxAudioForKanjiList,
    generateVoicevoxAudioForWordList,
    isKanaOnly,
    katakanaToHiragana,
    normalizeKanaReading,
    resolveAudioSourceOutputPath,
    selectPreferredAudioReading,
    writeAudioSourceSidecar,
};
