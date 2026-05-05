const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption } = require("../src/utils/cliArgs");
const {
    auditWordLevelAnchors,
    formatKanjiLevelList,
} = require("../src/services/wordLevelAnchorAuditService");

function parseArgs(argv) {
    const options = {
        json: false,
        level: null,
        limit: 40,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatWordLevelAnchorAuditReport(report, { level = null, limit = 40 } = {}) {
    const lines = [
        "Japanese Kanji Builder Word Level Anchor Audit",
        "",
        `Scope: ${Number.isInteger(level) ? `N${level}` : "all word levels"}`,
        `Canonical rows checked: ${report.checked}`,
        `Same-level kanji anchor violations: ${report.violationCount}`,
        "",
        "By level:",
    ];

    for (const deckLevel of [5, 4, 3, 2, 1]) {
        const stats = report.byLevel?.[deckLevel] || { checked: 0, violations: 0 };
        if (Number.isInteger(level) && deckLevel !== level) {
            continue;
        }
        lines.push(`- N${deckLevel}: ${stats.violations}/${stats.checked} violations`);
    }

    if (report.violations.length > 0) {
        const shown = report.violations.slice(0, limit);
        lines.push("", `Violations (${shown.length}/${report.violations.length} shown):`);
        for (const entry of shown) {
            lines.push(`- N${entry.jlpt} ${entry.written} (${entry.reading}): ${formatKanjiLevelList(entry.kanjiLevels)}`);
        }
        if (report.violations.length > shown.length) {
            lines.push(`- ... ${report.violations.length - shown.length} more`);
        }
    }

    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:level-anchor-audit", options.unknownArgs);

    if (options.level !== null && (!Number.isInteger(options.level) || options.level < 1 || options.level > 5)) {
        throw new Error("Word level anchor audit level must be 1-5.");
    }

    const config = loadConfig();
    const contract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));
    const kanjiLevelData = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf8"));
    const report = auditWordLevelAnchors({
        wordLevels: contract.wordLevels,
        kanjiLevelData,
        level: options.level,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatWordLevelAnchorAuditReport(report, {
            level: options.level,
            limit: Number.isInteger(options.limit) ? options.limit : 40,
        }));
    }

    process.exitCode = report.valid ? 0 : 1;
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    formatWordLevelAnchorAuditReport,
    main,
    parseArgs,
};
