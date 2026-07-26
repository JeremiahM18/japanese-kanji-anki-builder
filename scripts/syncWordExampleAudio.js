const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const {
    WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY,
    buildWordExampleAudioScope,
} = require("../src/services/wordAudioService");
const { mapWithConcurrency } = require("../src/utils/concurrency");

function parseArgs(argv) {
    const options = {
        level: 5,
        limit: null,
        words: [],
        tsvPath: "",
    };

    for (const arg of argv) {
        if (arg.startsWith("--level=")) {
            options.level = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--word=")) {
            options.words = arg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean);
        } else if (arg.startsWith("--tsv-path=")) {
            options.tsvPath = arg.split("=")[1].trim();
        } else {
            throw new Error(`Unknown argument for syncWordExampleAudio: ${arg}`);
        }
    }

    return options;
}

function summarizeSyncResults(results) {
    return {
        totalExamples: results.length,
        synced: results.filter((row) => row.found).length,
        missingSourceAudio: results.filter((row) => !row.found).length,
        errors: results.filter((row) => row.error),
    };
}

function formatWordExampleAudioSyncSummary(report) {
    const lines = [];
    lines.push("Japanese Kanji Builder Word Example Sentence Audio Sync");
    lines.push("");
    lines.push(`Total word examples: ${report.summary.totalExamples}`);
    lines.push(`Synced: ${report.summary.synced}`);
    lines.push(`Missing source audio: ${report.summary.missingSourceAudio}`);
    lines.push(`Errors: ${report.summary.errors.length}`);

    if (report.summary.errors.length > 0) {
        lines.push("");
        lines.push("Errors:");
        for (const row of report.summary.errors.slice(0, 20)) {
            lines.push(`- ${row.word}: ${row.error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const policy = loadAudioSourcePolicy();
    const { audioService } = createMediaServices(config);

    const wordTsvPath = options.tsvPath
        ? path.resolve(options.tsvPath)
        : path.join(path.dirname(config.buildOutDir), "word-build", "exports", `jlpt-n${options.level}-words.tsv`);
    if (!fs.existsSync(wordTsvPath)) {
        throw new Error(`Missing word TSV at ${wordTsvPath}. Build the word deck first.`);
    }

    const wordScope = buildWordExampleAudioScope({
        wordTsv: fs.readFileSync(wordTsvPath, "utf-8"),
        limit: Number.isFinite(options.limit) ? options.limit : null,
        words: options.words,
    });

    const results = await mapWithConcurrency(wordScope, config.exportConcurrency, async (entry) => {
        try {
            const result = await audioService.syncKanji(entry.hostKanji, {
                category: WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY,
                text: entry.exampleText,
                reading: entry.exampleReading,
                identityHash: entry.identityHash,
                voice: policy.releaseAudio.primarySpeakerName,
                locale: policy.releaseAudio.requiredLocale,
            });
            const found = Boolean(
                (result?.manifest?.assets?.audio || []).some((asset) => (
                    asset.category === WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY
                    && asset.text === entry.exampleText
                    && asset.reading === entry.exampleReading
                ))
            );
            return {
                word: entry.written,
                reading: entry.reading,
                hostKanji: entry.hostKanji,
                exampleText: entry.exampleText,
                exampleReading: entry.exampleReading,
                identityHash: entry.identityHash,
                found,
            };
        } catch (error) {
            return {
                word: entry.written,
                reading: entry.reading,
                hostKanji: entry.hostKanji,
                exampleText: entry.exampleText,
                exampleReading: entry.exampleReading,
                identityHash: entry.identityHash,
                found: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });

    const report = {
        results,
        summary: summarizeSyncResults(results),
    };
    process.stdout.write(formatWordExampleAudioSyncSummary(report));
    if (report.summary.errors.length > 0) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    formatWordExampleAudioSyncSummary,
    main,
    parseArgs,
    summarizeSyncResults,
};
