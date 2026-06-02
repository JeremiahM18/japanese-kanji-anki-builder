#!/usr/bin/env node

const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildDependencyLicenseAuditReport,
    formatAsOfDate,
    formatDependencyLicenseAuditReport,
    writeDependencyLicenseReleaseSummary,
} = require("../src/services/dependencyLicenseAuditService");

function normalizePath(filePath) {
    return filePath.split(path.sep).join("/");
}

function parseArgs(argv = []) {
    const parsed = {
        json: false,
        policyPath: undefined,
        out: undefined,
        asOfDate: undefined,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            parsed.json = true;
        } else if (arg.startsWith("--policy=")) {
            parsed.policyPath = parseStringOption(arg, "policy");
        } else if (arg.startsWith("--out=")) {
            parsed.out = parseStringOption(arg, "out");
        } else if (arg.startsWith("--as-of=")) {
            parsed.asOfDate = formatAsOfDate(parseStringOption(arg, "as-of"));
        } else {
            collectUnknownArg(parsed, arg);
        }
    }

    return parsed;
}

function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    assertNoUnknownArgs("security:licenses", args.unknownArgs);

    const report = buildDependencyLicenseAuditReport({
        policyPath: args.policyPath,
        asOfDate: args.asOfDate || formatAsOfDate(new Date()),
    });

    if (args.out && report.passed) {
        writeDependencyLicenseReleaseSummary(report, args.out);
    }

    if (args.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        if (args.out && report.passed) {
            process.stdout.write(`Wrote: ${normalizePath(args.out)}\n`);
        }
    } else {
        const text = formatDependencyLicenseAuditReport(report);
        if (report.passed) {
            process.stdout.write(text);
            if (args.out) {
                process.stdout.write(`Wrote: ${normalizePath(args.out)}\n`);
            }
        } else {
            process.stderr.write(text);
        }
    }

    if (!report.passed) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
