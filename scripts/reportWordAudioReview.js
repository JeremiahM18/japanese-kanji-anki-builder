const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { buildWordAudioReviewReport, formatWordAudioReviewReport } = require("../src/services/wordAudioReviewService");

function parseArgs(argv) {
    const options = {
        level: 5,
        limit: 25,
        words: [],
        json: argv.includes("--json"),
        tsvPath: "",
    };

    for (const arg of argv) {
        if (arg === "--json") {
            continue;
        }
        if (arg.startsWith("--level=")) {
            options.level = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--word=")) {
            options.words = arg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean);
        } else if (arg.startsWith("--tsv-path=")) {
            options.tsvPath = arg.split("=")[1].trim();
        }
    }

    return options;
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

    const report = await buildWordAudioReviewReport({
        wordTsv: fs.readFileSync(wordTsvPath, "utf-8"),
        audioSourcePolicy: policy,
        audioService,
        mediaRootDir: config.mediaRootDir,
        limit: options.limit,
        words: options.words,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatWordAudioReviewReport(report, policy));
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
