const { loadConfig } = require("../src/config");
const { parseLevelsArgument, runBuildPipeline } = require("../src/services/buildPipeline");
const { buildDoctorReport, formatDoctorReport } = require("../src/services/doctorService");
const { formatDeckReadyReport } = require("../src/services/deckReadyService");
const { assertNoUnknownArgs, collectUnknownArg, parseNumericOption, parseStringOption, invokeCliMain } = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        levels: null,
        limit: null,
        concurrency: null,
        outDir: null,
        audioReading: null,
        audioVoice: null,
        audioLocale: null,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = parseNumericOption(arg, "concurrency");
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else if (arg.startsWith("--audio-reading=")) {
            options.audioReading = parseStringOption(arg, "audio-reading");
        } else if (arg.startsWith("--audio-voice=")) {
            options.audioVoice = parseStringOption(arg, "audio-voice");
        } else if (arg.startsWith("--audio-locale=")) {
            options.audioLocale = parseStringOption(arg, "audio-locale");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));

    assertNoUnknownArgs("prepareDeck", options.unknownArgs);

    const doctorReport = await buildDoctorReport({ config });

    if (!doctorReport.ready) {
        process.stdout.write(formatDoctorReport(doctorReport));
        process.exitCode = 1;
        return;
    }

    const summary = await runBuildPipeline({
        config,
        outDir: options.outDir || config.buildOutDir,
        levels: options.levels || [5, 4, 3, 2, 1],
        limit: Number.isFinite(options.limit) ? options.limit : null,
        concurrency: Number.isFinite(options.concurrency) ? options.concurrency : null,
        skipMediaSync: false,
        syncAudioMetadata: {
            reading: options.audioReading || undefined,
            voice: options.audioVoice || undefined,
            locale: options.audioLocale || undefined,
        },
    });

    if (options.json) {
        console.log(JSON.stringify({ doctor: doctorReport, build: summary }, null, 2));
        return;
    }

    process.stdout.write(formatDeckReadyReport(summary, doctorReport));
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
