const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { createVoicevoxClient } = require("../src/clients/voicevoxClient");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const { buildWordAudioScope } = require("../src/services/wordAudioService");
const { formatVoicevoxGenerationSummary, generateVoicevoxAudioForWordList } = require("../src/services/audioGenerationService");

function parseArgs(argv) {
    const options = {
        level: 5,
        limit: null,
        words: [],
        speakerId: null,
        voiceName: "",
        locale: null,
        overwrite: argv.includes("--overwrite"),
        tsvPath: "",
    };

    for (const arg of argv) {
        if (arg === "--overwrite") {
            continue;
        }
        if (arg.startsWith("--level=")) {
            options.level = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--word=")) {
            options.words = arg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean);
        } else if (arg.startsWith("--speaker-id=")) {
            options.speakerId = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--voice-name=")) {
            options.voiceName = arg.split("=")[1].trim();
        } else if (arg.startsWith("--locale=")) {
            options.locale = arg.split("=")[1].trim();
        } else if (arg.startsWith("--tsv-path=")) {
            options.tsvPath = arg.split("=")[1].trim();
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const audioSourcePolicy = loadAudioSourcePolicy();
    const resolvedSpeakerId = options.speakerId
        ?? config.voicevoxSpeakerId
        ?? audioSourcePolicy.releaseAudio.primarySpeakerId;

    if (!Number.isInteger(resolvedSpeakerId)) {
        throw new Error("Missing VOICEVOX speaker id. Set VOICEVOX_SPEAKER_ID or pass --speaker-id=... .");
    }

    const wordTsvPath = options.tsvPath
        ? path.resolve(options.tsvPath)
        : path.join(path.dirname(config.buildOutDir), "word-build", "exports", `jlpt-n${options.level}-words.tsv`);
    if (!fs.existsSync(wordTsvPath)) {
        throw new Error(`Missing word TSV at ${wordTsvPath}. Build the word deck first.`);
    }

    const wordTsv = fs.readFileSync(wordTsvPath, "utf-8");
    const wordScope = buildWordAudioScope({
        wordTsv,
        limit: Number.isFinite(options.limit) ? options.limit : null,
        words: options.words,
    });

    const summary = await generateVoicevoxAudioForWordList({
        words: wordScope,
        config,
        speakerId: resolvedSpeakerId,
        concurrency: config.exportConcurrency,
        overwrite: options.overwrite,
        sourceId: audioSourcePolicy.releaseAudio.primarySourceId,
        voiceLabel: options.voiceName,
        fallbackVoiceLabel: audioSourcePolicy.releaseAudio.primarySpeakerName,
        locale: options.locale || audioSourcePolicy.releaseAudio.requiredLocale,
        voicevoxClient: createVoicevoxClient({
            baseUrl: config.voicevoxEngineUrl,
        }),
    });

    process.stdout.write(formatVoicevoxGenerationSummary({
        totalKanji: summary.totalWords,
        generated: summary.generated,
        skippedExisting: summary.skippedExisting,
        failed: summary.failed,
        results: summary.results.map((row) => ({
            kanji: row.word,
            status: row.status,
            reading: row.reading,
            readingSource: row.hostKanji ? `word-reading via ${row.hostKanji}` : "word-reading",
            error: row.error,
        })),
    }, {
        speakerId: resolvedSpeakerId,
        audioSourceDir: config.audioSourceDir,
    }));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
