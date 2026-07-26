const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    recoverGovernedFileTransactionSync,
} = require("../src/utils/governedFileTransaction");
const { isPathInside } = require("../src/utils/fs");

function parseArgs(argv = []) {
    const options = {
        json: false,
        lockPath: "",
        unknownArgs: [],
        write: false,
    };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--write") {
            options.write = true;
        } else if (arg.startsWith("--lock=")) {
            options.lockPath = parseStringOption(arg, "lock").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function formatRecoveryReport(report = {}) {
    const lines = [
        "Governed file transaction recovery",
        `Mode: ${report.recovered ? "recovered" : "dry-run"}`,
        `Lock: ${report.lockPath}`,
        `Transaction: ${report.lock?.transactionId || "(unknown)"}`,
        `Journal: ${report.journal ? report.lock?.journalPath : "(missing; orphan lock)"}`,
        `Recoverable: ${report.recoverable ? "yes" : "no"}`,
        `Action: ${report.recoveryAction || "none"}`,
        "Targets:",
    ];
    for (const target of report.targetStates || []) {
        lines.push(`- ${target.filePath}: ${target.state}`);
    }
    lines.push(
        "",
        "Recovery boundary:",
        "- Dry-run is the default. --write restores the recorded pre-transaction state and removes the matching lock only after hash verification.",
        "- Unknown target content fails closed; the command does not overwrite unrecognized user changes."
    );
    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:transactions:recover", options.unknownArgs);
    if (!options.lockPath) {
        throw new Error("Missing required --lock=<out/file-transactions/*.lock>.");
    }
    const workspaceRoot = process.cwd();
    const lockPath = path.resolve(workspaceRoot, options.lockPath);
    const transactionRoot = path.join(workspaceRoot, "out", "file-transactions");
    if (!isPathInside(lockPath, transactionRoot)) {
        throw new Error(`Transaction recovery lock must stay under ${transactionRoot}: ${lockPath}`);
    }
    const report = recoverGovernedFileTransactionSync(lockPath, {
        workspaceRoot,
        write: options.write,
    });
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatRecoveryReport(report));
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    formatRecoveryReport,
    main,
    parseArgs,
};
