#!/usr/bin/env node

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
} = require("../src/utils/cliArgs");
const {
    buildLaneAuthorityDuplicationReport,
} = require("../src/services/laneAuthorityAuditService");

function parseArgs(argv = []) {
    const args = {
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            args.json = true;
        } else {
            collectUnknownArg(args, arg);
        }
    }

    return args;
}

function formatFieldCounts(fieldCounts = {}) {
    return Object.entries(fieldCounts)
        .map(([field, count]) => `${field}=${count}`)
        .join(", ");
}

function formatLaneAuthorityDuplicationReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Lane Authority Duplication Audit",
        "",
        report.boundary || "Read-only lane authority audit.",
    ];

    for (const deckKind of ["word", "kanji"]) {
        lines.push("", `${deckKind.toUpperCase()} REVIEW SETS`);
        for (const level of report.levels || []) {
            const row = report[deckKind]?.[`n${level}`] || {};
            const counts = row.counts || {};
            lines.push(
                `- N${level}: Gold=${counts.gold || 0}, Sapphire=${counts.sapphire || 0}, Platinum=${counts.platinum || 0}`
            );
            lines.push(
                `  Sapphire without Gold=${row.sapphireWithoutGold || 0}, Sapphire-minus-Platinum=${row.sapphireMinusPlatinum || 0}, Platinum-minus-Sapphire=${row.platinumMinusSapphire || 0}`
            );
            lines.push(
                `  Gold/Sapphire identical protected fields: ${formatFieldCounts(row.goldVsSapphire?.identicalByField)}`
            );
            lines.push(
                `  Sapphire/Platinum identical fields: ${formatFieldCounts(row.sapphireVsPlatinum?.identicalByField)}`
            );
        }
    }

    lines.push(
        "",
        "This command is read-only. It does not certify lanes, shrink denominators, write review data, or replace Gold/Sapphire/Platinum/Obsidian gates."
    );
    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("lane:authority:audit", options.unknownArgs);
    const report = buildLaneAuthorityDuplicationReport();

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    process.stdout.write(formatLaneAuthorityDuplicationReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    formatLaneAuthorityDuplicationReport,
    main,
    parseArgs,
};
