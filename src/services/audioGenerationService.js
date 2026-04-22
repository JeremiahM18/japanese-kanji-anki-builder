const fs = require("node:fs");
const path = require("node:path");

const { createKanjiApiClient } = require("../clients/kanjiApiClient");
const { createVoicevoxClient } = require("../clients/voicevoxClient");
const { loadCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadSentenceCorpus } = require("../datasets/sentenceCorpus");
const { createInferenceEngine } = require("../inference/inferenceEngine");
const { mapWithConcurrency } = require("../utils/concurrency");
const { ensureDir } = require("../utils/fs");
const { isKanaOnly, katakanaToHiragana } = require("../utils/japanese");

function normalizeKanaReading(value) {
    return katakanaToHiragana(String(value || ""))
        .replace(/[.・]/g, "")
        .replace(/-/g, "")
        .replace(/\s+/g, "")
        .trim();
}

function selectPreferredAudioReading({ inferenceResult, kanjiInfo }) {
    const ranked = [
        {
            source: "best-word",
            text: normalizeKanaReading(inferenceResult?.bestWord?.pron),
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

function writeAudioSourceSidecar({
    outputPath,
    source,
    voice,
    locale = "ja-JP",
    category = "kanji-reading",
    text,
    reading,
    notes = "",
}) {
    const sidecarPath = outputPath.replace(/\.[^.]+$/, ".json");
    const payload = {
        version: 1,
        source,
        voice,
        locale,
        category,
        text,
        reading,
        notes,
    };

    fs.writeFileSync(sidecarPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
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

async function generateVoicevoxAudioForKanjiList({
    kanjiList,
    config,
    speakerId,
    concurrency,
    overwrite = false,
    sourceId = "voicevox",
    locale = "ja-JP",
    voiceLabel = "",
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
    const resolvedVoiceLabel = cleanVoiceLabel(voiceLabel)
        || buildVoicevoxSpeakerLabel(
            typeof voicevoxClient.listSpeakers === "function" ? await voicevoxClient.listSpeakers() : [],
            speakerId
        );

    const summary = {
        totalKanji: kanjiList.length,
        generated: 0,
        skippedExisting: 0,
        failed: 0,
        results: [],
    };

    await mapWithConcurrency(kanjiList, concurrency || config.exportConcurrency, async (kanji) => {
        const outputPath = path.join(config.audioSourceDir, `${kanji}.wav`);
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
            const inferenceResult = inferenceEngine.inferKanjiStudyData({
                kanji,
                kanjiInfo,
                words,
                maxExamples: 3,
                maxSentences: 3,
            });
            const preferredReading = selectPreferredAudioReading({ inferenceResult, kanjiInfo });

            if (!preferredReading.text) {
                throw new Error("No kana reading available for synthesis.");
            }

            const audioBuffer = await voicevoxClient.synthesize({
                text: preferredReading.text,
                speakerId,
            });
            fs.writeFileSync(outputPath, audioBuffer);
            writeAudioSourceSidecar({
                outputPath,
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
    buildVoicevoxSpeakerLabel,
    cleanVoiceLabel,
    formatVoicevoxGenerationSummary,
    formatVoicevoxSpeakerTable,
    generateVoicevoxAudioForKanjiList,
    isKanaOnly,
    katakanaToHiragana,
    normalizeKanaReading,
    selectPreferredAudioReading,
    writeAudioSourceSidecar,
};
