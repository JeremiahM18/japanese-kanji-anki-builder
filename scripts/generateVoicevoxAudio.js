const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { createVoicevoxClient } = require("../src/clients/voicevoxClient");
const { formatVoicevoxGenerationSummary, formatVoicevoxSpeakerTable, generateVoicevoxAudioForKanjiList } = require("../src/services/audioGenerationService");
const { parseLevelArgument, selectKanjiForSync } = require("../src/services/mediaSync");

function parseArgs(argv) {
    const options = {
        level: null,
        limit: null,
        concurrency: null,
        kanji: [],
        speakerId: null,
        overwrite: argv.includes("--overwrite"),
        listSpeakers: argv.includes("--list-speakers"),
    };

    for (const arg of argv) {
        if (arg.startsWith("--level=")) {
            options.level = parseLevelArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = arg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean);
        } else if (arg.startsWith("--speaker-id=")) {
            options.speakerId = Number(arg.split("=")[1]);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();

    const voicevoxClient = createVoicevoxClient({
        baseUrl: config.voicevoxEngineUrl,
    });

    if (options.listSpeakers) {
        const speakers = await voicevoxClient.listSpeakers();
        process.stdout.write(formatVoicevoxSpeakerTable(speakers));
        return;
    }

    if (!Number.isInteger(options.speakerId ?? config.voicevoxSpeakerId)) {
        throw new Error("Missing VOICEVOX speaker id. Set VOICEVOX_SPEAKER_ID or pass --speaker-id=... .");
    }

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const kanjiList = selectKanjiForSync({
        jlptOnlyJson,
        level: options.level,
        limit: options.limit,
        kanji: options.kanji,
    });

    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });

    const summary = await generateVoicevoxAudioForKanjiList({
        kanjiList,
        config,
        speakerId: options.speakerId ?? config.voicevoxSpeakerId,
        concurrency: options.concurrency || config.exportConcurrency,
        overwrite: options.overwrite,
        kanjiApiClient,
        voicevoxClient,
    });

    process.stdout.write(formatVoicevoxGenerationSummary(summary, {
        speakerId: options.speakerId ?? config.voicevoxSpeakerId,
        audioSourceDir: config.audioSourceDir,
    }));
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
