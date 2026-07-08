const fs = require("node:fs");
const path = require("node:path");

const { createVoicevoxClient } = require("../clients/voicevoxClient");
const { loadConfig } = require("../config");
const { loadAudioSourcePolicy } = require("../datasets/audioSourcePolicy");
const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { buildWordStudyEntryKey, loadWordStudyData } = require("../datasets/wordStudyData");
const { loadWordPitchAccentData, normalizeWordPitchAccentData } = require("../datasets/wordPitchAccentData");
const { describeVoicevoxError } = require("./voicevoxDoctorService");
const { mapWithConcurrency } = require("../utils/concurrency");
const { katakanaToHiragana } = require("../utils/japanese");
const {
    classifyAccent,
    collectDeckEligibleEntries,
} = require("./kanjiumPitchAccentImportService");

const VOICEVOX_WRITTEN_SOURCE_ID = "voicevox-nemo-accent-query";
const VOICEVOX_READING_SOURCE_ID = "voicevox-nemo-reading-query";

function parseLevels(value) {
    return String(value || "5")
        .split(",")
        .map((level) => Number(level.trim()))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5);
}

function parseArgs(argv) {
    const options = {
        levels: [5],
        limit: null,
        words: [],
        pitchDataPath: path.resolve("templates", "word_pitch_accent_data.json"),
        starterPath: path.resolve("templates", "starter_word_study_data.json"),
        contractPath: path.resolve("templates", "jlpt_word_level_contract.json"),
        speakerId: null,
        overwrite: argv.includes("--overwrite"),
        allowReadingFallback: argv.includes("--allow-reading-fallback"),
        requireComplete: argv.includes("--require-complete"),
    };

    for (const arg of argv) {
        if (arg === "--overwrite" || arg === "--allow-reading-fallback" || arg === "--require-complete") {
            continue;
        }
        if (arg.startsWith("--levels=")) {
            options.levels = parseLevels(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--word=")) {
            options.words = arg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean);
        } else if (arg.startsWith("--speaker-id=")) {
            options.speakerId = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--pitch-data-path=")) {
            options.pitchDataPath = path.resolve(arg.split("=")[1]);
        } else if (arg.startsWith("--starter-path=")) {
            options.starterPath = path.resolve(arg.split("=")[1]);
        } else if (arg.startsWith("--contract-path=")) {
            options.contractPath = path.resolve(arg.split("=")[1]);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function normalizeKana(value) {
    return katakanaToHiragana(String(value || ""))
        .replace(/[^\p{Script=Hiragana}ー]/gu, "");
}

function extractAccentPhraseReading(accentPhrase) {
    return (accentPhrase?.moras || [])
        .map((mora) => `${mora?.consonant ? "" : ""}${mora?.text || ""}${mora?.vowel ? "" : ""}`)
        .join("");
}

function flattenAudioQueryReading(audioQuery) {
    return (audioQuery?.accent_phrases || [])
        .flatMap((phrase) => [
            extractAccentPhraseReading(phrase),
            phrase?.pause_mora?.text || "",
        ])
        .join("");
}

function formatVoicevoxPitchPattern(audioQuery, fallbackReading) {
    const phrases = Array.isArray(audioQuery?.accent_phrases) ? audioQuery.accent_phrases : [];
    return phrases
        .map((phrase) => {
            const reading = extractAccentPhraseReading(phrase) || fallbackReading;
            const accent = Number(phrase?.accent);
            if (!Number.isInteger(accent) || accent < 0) {
                return "";
            }
            return `${accent} [${classifyAccent(accent, reading)}]`;
        })
        .filter(Boolean)
        .join(" / ");
}

async function buildVoicevoxPitchAccentEntry({ entry, voicevoxClient, speakerId, allowReadingFallback }) {
    const expectedReading = normalizeKana(entry.reading);
    const writtenQuery = await voicevoxClient.createAudioQuery({
        text: entry.written,
        speakerId,
    });
    const writtenGeneratedReading = normalizeKana(flattenAudioQueryReading(writtenQuery));
    const writtenPattern = formatVoicevoxPitchPattern(writtenQuery, entry.reading);

    if (writtenPattern && writtenGeneratedReading === expectedReading) {
        return {
            pattern: writtenPattern,
            sourceId: VOICEVOX_WRITTEN_SOURCE_ID,
            sourceQuery: entry.written,
            generatedReading: writtenGeneratedReading,
        };
    }

    if (!allowReadingFallback) {
        return {
            error: writtenGeneratedReading
                ? `reading mismatch: expected ${expectedReading}, generated ${writtenGeneratedReading}`
                : "VOICEVOX returned no generated reading",
        };
    }

    const readingQuery = await voicevoxClient.createAudioQuery({
        text: entry.reading,
        speakerId,
    });
    const readingPattern = formatVoicevoxPitchPattern(readingQuery, entry.reading);
    const readingGeneratedReading = normalizeKana(flattenAudioQueryReading(readingQuery));
    if (!readingPattern) {
        return { error: "VOICEVOX reading-query fallback returned no pitch pattern" };
    }

    return {
        pattern: readingPattern,
        sourceId: VOICEVOX_READING_SOURCE_ID,
        sourceQuery: entry.reading,
        generatedReading: readingGeneratedReading || expectedReading,
    };
}

async function importVoicevoxPitchAccents({
    starterEntries,
    jlptWordLevelContract,
    pitchAccentData,
    levels,
    speakerId,
    voicevoxClient,
    overwrite = false,
    allowReadingFallback = false,
    limit = null,
    words = [],
    concurrency = 2,
    engineUrl = "",
}) {
    const nextData = normalizeWordPitchAccentData(pitchAccentData);
    const wordSet = new Set(words);
    const deckEntries = collectDeckEligibleEntries({ levels, starterEntries, jlptWordLevelContract })
        .filter((entry) => wordSet.size === 0 || wordSet.has(entry.written) || wordSet.has(buildWordStudyEntryKey(entry)))
        .filter((entry) => overwrite || !nextData.entries[buildWordStudyEntryKey(entry)])
        .slice(0, Number.isFinite(limit) ? limit : undefined);
    const results = await mapWithConcurrency(deckEntries, concurrency, async (entry) => {
        const key = buildWordStudyEntryKey(entry);
        try {
            const pitchEntry = await buildVoicevoxPitchAccentEntry({
                entry,
                voicevoxClient,
                speakerId,
                allowReadingFallback,
            });
            if (pitchEntry.error) {
                return {
                    written: entry.written,
                    reading: entry.reading,
                    status: "failed",
                    error: pitchEntry.error,
                };
            }
            nextData.entries[key] = pitchEntry;
            return {
                written: entry.written,
                reading: entry.reading,
                status: "imported",
                sourceId: pitchEntry.sourceId,
                pattern: pitchEntry.pattern,
            };
        } catch (error) {
            return {
                written: entry.written,
                reading: entry.reading,
                status: "failed",
                error: describeVoicevoxError(error, engineUrl),
            };
        }
    });

    const allDeckEntries = collectDeckEligibleEntries({ levels, starterEntries, jlptWordLevelContract });
    const missingAfterImport = allDeckEntries
        .filter((entry) => !nextData.entries[buildWordStudyEntryKey(entry)])
        .map((entry) => ({ written: entry.written, reading: entry.reading }));

    return {
        data: normalizeWordPitchAccentData(nextData),
        summary: {
            levels,
            attempted: results.length,
            imported: results.filter((row) => row.status === "imported").length,
            failed: results.filter((row) => row.status === "failed").length,
            missingAfterImport: missingAfterImport.length,
            totalDeckEntries: allDeckEntries.length,
            coverageAfterImport: allDeckEntries.length > 0
                ? Number((((allDeckEntries.length - missingAfterImport.length) / allDeckEntries.length) * 100).toFixed(1))
                : 0,
        },
        results,
        missingAfterImport,
    };
}

function formatVoicevoxPitchImportSummary(report) {
    const lines = [
        "Japanese Kanji Builder VOICEVOX Pitch Import",
        "",
        `Levels: ${report.summary.levels.map((level) => `N${level}`).join(", ")}`,
        `Attempted: ${report.summary.attempted}`,
        `Imported: ${report.summary.imported}`,
        `Failed: ${report.summary.failed}`,
        `Missing after import: ${report.summary.missingAfterImport}`,
        `Coverage after import: ${report.summary.coverageAfterImport}%`,
    ];

    const failures = report.results.filter((row) => row.status === "failed");
    if (failures.length > 0) {
        lines.push("", "Failures:");
        for (const row of failures.slice(0, 40)) {
            lines.push(`- ${row.written} (${row.reading}): ${row.error}`);
        }
    }

    if (report.missingAfterImport.length > 0) {
        lines.push("", "Still missing:");
        for (const row of report.missingAfterImport.slice(0, 40)) {
            lines.push(`- ${row.written} (${row.reading})`);
        }
    }

    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const audioSourcePolicy = loadAudioSourcePolicy();
    const speakerId = options.speakerId
        ?? config.voicevoxSpeakerId
        ?? audioSourcePolicy.releaseAudio.primarySpeakerId;

    if (!Number.isInteger(speakerId)) {
        throw new Error("Missing VOICEVOX speaker id. Set VOICEVOX_SPEAKER_ID or pass --speaker-id=... .");
    }

    const starterEntries = loadWordStudyData({
        starterPath: options.starterPath,
        localPath: null,
    });
    const jlptWordLevelContract = loadJlptWordLevelContract(options.contractPath);
    const pitchAccentData = loadWordPitchAccentData(options.pitchDataPath);
    const report = await importVoicevoxPitchAccents({
        starterEntries,
        jlptWordLevelContract,
        pitchAccentData,
        levels: options.levels,
        speakerId,
        voicevoxClient: createVoicevoxClient({ baseUrl: config.voicevoxEngineUrl }),
        overwrite: options.overwrite,
        allowReadingFallback: options.allowReadingFallback,
        limit: Number.isFinite(options.limit) ? options.limit : null,
        words: options.words,
        concurrency: config.exportConcurrency,
        engineUrl: config.voicevoxEngineUrl,
    });

    fs.writeFileSync(options.pitchDataPath, `${JSON.stringify(report.data, null, 2)}\n`, "utf-8");
    process.stdout.write(formatVoicevoxPitchImportSummary(report));
    if (report.summary.failed > 0 || (options.requireComplete && report.summary.missingAfterImport > 0)) {
        process.exitCode = 1;
    }
}

module.exports = {
    buildVoicevoxPitchAccentEntry,
    extractAccentPhraseReading,
    flattenAudioQueryReading,
    formatVoicevoxPitchImportSummary,
    formatVoicevoxPitchPattern,
    importVoicevoxPitchAccents,
    main,
    parseArgs,
};
