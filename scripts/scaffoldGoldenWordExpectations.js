const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { buildWordRowsForLevel } = require("./reviewPlatinumWordLevel");
const {
    buildGoldWordExpectationScaffold,
    formatGoldWordExpectationScaffold,
} = require("../src/services/goldWordExpectationScaffoldService");

function parseLevel(value) {
    const normalized = String(value ?? "").trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseWordIdentity(value) {
    const text = String(value ?? "").trim();
    const separator = text.includes("|") ? "|" : ":";
    const [word = "", reading = ""] = text.split(separator);
    return {
        word: word.trim(),
        reading: reading.trim(),
    };
}

function parseWordIdentities(arg, name) {
    return parseCsvOption(arg, name)
        .map(parseWordIdentity)
        .filter((entry) => entry.word);
}

function parseArgs(argv) {
    const options = {
        json: false,
        level: null,
        limit: 8,
        out: "",
        unknownArgs: [],
        words: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseLevel(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--out=")) {
            options.out = parseStringOption(arg, "out");
        } else if (arg.startsWith("--words=")) {
            options.words = parseWordIdentities(arg, "words");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readGoldenReviewSet(level, { cwd = process.cwd() } = {}) {
    const reviewSetPath = path.join(cwd, "templates", `golden_n${level}_word_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing Gold word review set at ${reviewSetPath}`);
    }

    return JSON.parse(fs.readFileSync(reviewSetPath, "utf8"));
}

function resolveDraftOutputPath(outPath, { cwd = process.cwd() } = {}) {
    const resolved = path.resolve(cwd, outPath);
    const relative = path.relative(cwd, resolved);

    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Gold scaffold output must stay inside the repository workspace.");
    }
    if (relative === "templates" || relative.startsWith(`templates${path.sep}`)) {
        throw new Error("Refusing to write Gold scaffold drafts under templates; promote reviewed expectations manually.");
    }

    return resolved;
}

async function main({ commandName = "deck:words:gold:scaffold" } = {}) {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs(commandName, options.unknownArgs);

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        throw new Error("Gold word expectation scaffold level must be 1-5.");
    }

    const config = loadConfig();
    const expectations = readGoldenReviewSet(options.level);
    const rows = await buildWordRowsForLevel({ level: options.level, config });
    const report = buildGoldWordExpectationScaffold({
        rows,
        expectations,
        level: options.level,
        limit: options.limit,
        words: options.words,
    });
    const jsonText = `${JSON.stringify(report, null, 2)}\n`;

    if (options.out) {
        const outputPath = resolveDraftOutputPath(options.out);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, jsonText, "utf8");
    }

    if (options.json) {
        process.stdout.write(jsonText);
        return;
    }

    process.stdout.write(formatGoldWordExpectationScaffold(report));
    if (options.out) {
        process.stdout.write(`\nDraft JSON written to ${options.out}\n`);
    }
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
    parseWordIdentities,
    parseWordIdentity,
    readGoldenReviewSet,
    resolveDraftOutputPath,
};
