const { loadConfig } = require("../src/config");
const { parseLevelsArgument, runBuildPipeline } = require("../src/services/buildPipeline");

function parseArgs(argv) {
    const options = {
        levels: null,
        limit: null,
        concurrency: null,
        outDir: null,
        skipMediaSync: false,
        audioReading: null,
        audioVoice: null,
        audioLocale: null,
    };

    for (const arg of argv) {
        if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = arg.split("=")[1];
        } else if (arg === "--skip-media-sync") {
            options.skipMediaSync = true;
        } else if (arg.startsWith("--audio-reading=")) {
            options.audioReading = arg.split("=")[1];
        } else if (arg.startsWith("--audio-voice=")) {
            options.audioVoice = arg.split("=")[1];
        } else if (arg.startsWith("--audio-locale=")) {
            options.audioLocale = arg.split("=")[1];
        }
    }

    return options;
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));
    const summary = await runBuildPipeline({
        config,
        outDir: options.outDir || config.buildOutDir,
        levels: options.levels || [5, 4, 3, 2, 1],
        limit: Number.isFinite(options.limit) ? options.limit : null,
        concurrency: Number.isFinite(options.concurrency) ? options.concurrency : null,
        skipMediaSync: options.skipMediaSync,
        syncAudioMetadata: {
            reading: options.audioReading || undefined,
            voice: options.audioVoice || undefined,
            locale: options.audioLocale || undefined,
        },
    });

    console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
    console.error(err.stack || err);
    process.exit(1);
});
