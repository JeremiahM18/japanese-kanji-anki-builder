const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { loadMediaRows } = require("../src/datasets/mediaCoverage");
const { buildJlptBuckets } = require("../src/datasets/sentenceCorpusCoverage");
const { parseLevelsArgument } = require("../src/services/mediaSourceReportService");

function parseArgs(argv) {
    const options = {
        levels: [5],
        limit: 25,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function buildMissingManagedAnimationsReport({
    jlptOnlyJson = {},
    mediaRootDir,
    levels = [5],
    limit = 25,
    loadMediaRowsImpl = loadMediaRows,
}) {
    const rows = await loadMediaRowsImpl({ jlptOnlyJson, mediaRootDir });
    const buckets = buildJlptBuckets(jlptOnlyJson);
    const targetLevels = parseLevelsArgument(levels);
    const rowMap = new Map(rows.map((row) => [row.kanji, row]));
    const targetKanji = targetLevels.flatMap((level) =>
        (buckets.get(level) || []).map((kanji) => ({ kanji, level })),
    );

    const missingRows = targetKanji
        .map(({ kanji, level }) => {
            const row = rowMap.get(kanji);
            return {
                kanji,
                level,
                hasStrokeOrder: Boolean(row?.strokeOrderAsset),
                strokeOrderSource: row?.strokeOrderAsset?.source || null,
                hasTrueAnimation: Boolean(row?.trueAnimationAsset),
            };
        })
        .filter((row) => !row.hasTrueAnimation)
        .sort((a, b) => a.level - b.level || a.kanji.localeCompare(b.kanji));

    const limitedRows = missingRows.slice(0, Math.max(1, limit || 25));

    return {
        levels: targetLevels,
        totalKanji: targetKanji.length,
        missingTrueAnimations: missingRows.length,
        trueAnimationCoverageCount: targetKanji.length - missingRows.length,
        trueAnimationCoverageRatio: targetKanji.length > 0
            ? Number(((targetKanji.length - missingRows.length) / targetKanji.length).toFixed(4))
            : 0,
        rows: limitedRows,
        truncated: missingRows.length > limitedRows.length,
        totalMissingRows: missingRows.length,
    };
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatMissingManagedAnimationsReport(report) {
    const lines = [];
    lines.push("Japanese Kanji Builder Missing Managed Animations");
    lines.push("");
    lines.push(`Target levels: ${(report.levels || []).map((level) => `N${level}`).join(", ") || "n/a"}`);
    lines.push(`Kanji in scope: ${report.totalKanji}`);
    lines.push(`True animation coverage: ${report.trueAnimationCoverageCount}/${report.totalKanji} (${formatPercent(report.trueAnimationCoverageRatio)})`);
    lines.push(`Missing true animations: ${report.missingTrueAnimations}`);

    if ((report.rows || []).length === 0) {
        lines.push("");
        lines.push("No managed true-animation gaps remain for the requested levels.");
        return `${lines.join("\n")}\n`;
    }

    lines.push("");
    lines.push("Still missing true animations:");
    for (const row of report.rows || []) {
        const strokeOrderNote = row.hasStrokeOrder
            ? `static stroke-order present via ${row.strokeOrderSource || "unknown source"}`
            : "no managed stroke-order asset yet";
        lines.push(`- ${row.kanji} (N${row.level}, ${strokeOrderNote})`);
    }

    if (report.truncated) {
        lines.push("");
        lines.push(`Showing ${report.rows.length} of ${report.totalMissingRows} missing true-animation rows. Increase --limit to see more.`);
    }

    lines.push("");
    lines.push("Next step: configure the approved GitHub animation mirror or add reviewed local animation files, then run `npm run media:sync -- --level=<n>` and rerun this report.");
    return `${lines.join("\n")}\n`;
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("media:report:animations", options.unknownArgs);
    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const report = await buildMissingManagedAnimationsReport({
        jlptOnlyJson,
        mediaRootDir: config.mediaRootDir,
        levels: options.levels,
        limit: options.limit,
    });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    process.stdout.write(formatMissingManagedAnimationsReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    buildMissingManagedAnimationsReport,
    formatMissingManagedAnimationsReport,
    main,
    parseArgs,
};
