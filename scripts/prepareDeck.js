const { loadConfig } = require("../src/config");
const { parseLevelsArgument, runBuildPipeline } = require("../src/services/buildPipeline");
const { buildDoctorReport, formatDoctorReport } = require("../src/services/doctorService");
const { formatDeckReadyReport } = require("../src/services/deckReadyService");

function parseArgs(argv) {
    const options = {
        levels: null,
        limit: null,
        concurrency: null,
        outDir: null,
        audioReading: null,
        audioVoice: null,
        audioLocale: null,
        json: argv.includes("--json"),
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

main().catch((err) => {
    console.error(err.stack || err);
    process.exit(1);
});
