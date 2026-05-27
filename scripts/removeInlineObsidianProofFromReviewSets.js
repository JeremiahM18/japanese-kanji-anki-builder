const fs = require("node:fs");
const path = require("node:path");

const {
    buildObsidianProofTargetKey,
} = require("../src/datasets/obsidianProofLedger");
const {
    buildCompatibilityEntries,
    buildEntryTargetKeys,
    getReviewSetRelativePath,
} = require("../src/services/obsidianProofCompatibilityViewService");
const {
    buildObsidianProofReconciliationReport,
} = require("../src/services/obsidianProofReconciliationService");
const {
    loadScopedLedgerEvents,
} = require("../src/services/obsidianProofProviderService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    parseLevelsArgument,
} = require("../src/services/buildPipeline");

function parseArgs(argv) {
    const options = {
        write: false,
        deckKind: "kanji",
        levels: [5, 4, 3],
        ledgerDir: undefined,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--deck-kind=")) {
            options.deckKind = parseStringOption(arg, "deck-kind").trim();
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--ledger-dir=")) {
            options.ledgerDir = parseStringOption(arg, "ledger-dir").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readJsonArray(filePath) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in review set: ${filePath}`);
    }
    return parsed;
}

function writeJsonFile(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function getInlineProofTargetKey(entry = {}, { deckKind, level }) {
    const cardReviewed = normalizeText(entry.rereviewProvenance?.cardReviewed);
    if (cardReviewed) {
        return [deckKind, `n${level}`, cardReviewed].join(":");
    }
    const [targetKey] = buildEntryTargetKeys(entry, { deckKind, level });
    return targetKey || "";
}

function stripInlineProofFromEntry(entry = {}) {
    const stripped = { ...entry };
    delete stripped.rereviewProvenance;
    return stripped;
}

function buildInlineObsidianProofRemovalForReviewSet({
    cwd,
    deckKind,
    level,
    ledgerDir,
}) {
    if (deckKind !== "kanji") {
        throw new Error(`Inline Obsidian proof removal currently supports kanji review sets only: ${deckKind}`);
    }

    const sourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
    const resolvedSourceReviewSetPath = path.resolve(cwd, sourceReviewSetPath);
    const entries = readJsonArray(resolvedSourceReviewSetPath);
    const scopedLedger = loadScopedLedgerEvents({
        cwd,
        ledgerDir,
        deckKind,
        level,
        sourceReviewSetPath,
    });
    const ledgerTargets = new Set(scopedLedger.events.map(buildObsidianProofTargetKey));

    buildCompatibilityEntries({
        entries,
        events: scopedLedger.events,
        deckKind,
        level,
    });

    const missingLedgerTargets = [];
    let inlineProofsRemoved = 0;
    const strippedEntries = entries.map((entry) => {
        if (!entry.rereviewProvenance || typeof entry.rereviewProvenance !== "object") {
            return entry;
        }
        const targetKey = getInlineProofTargetKey(entry, { deckKind, level });
        if (!ledgerTargets.has(targetKey)) {
            missingLedgerTargets.push(targetKey || `${deckKind}:n${level}:(missing target)`);
        }
        inlineProofsRemoved += 1;
        return stripInlineProofFromEntry(entry);
    });

    if (missingLedgerTargets.length > 0) {
        throw new Error([
            `Refusing to remove inline proof without matching ledger event for ${sourceReviewSetPath}`,
            missingLedgerTargets.sort().join(", "),
        ].join(": "));
    }

    return {
        deckKind,
        level,
        sourceReviewSetPath,
        resolvedSourceReviewSetPath,
        sourceEntries: entries.length,
        ledgerProofEvents: scopedLedger.events.length,
        inlineProofsRemoved,
        strippedEntries,
    };
}

function buildInlineObsidianProofRemoval(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const deckKind = options.deckKind || "kanji";
    const levels = Array.isArray(options.levels) && options.levels.length > 0 ? options.levels : [5, 4, 3];
    const reviewSets = levels.map((level) => buildInlineObsidianProofRemovalForReviewSet({
        cwd,
        deckKind,
        level,
        ledgerDir: options.ledgerDir,
    }));

    return {
        passed: true,
        write: options.write === true,
        deckKind,
        levels,
        reviewSets,
        failures: [],
    };
}

function writeInlineObsidianProofRemoval(report = {}) {
    for (const reviewSet of report.reviewSets || []) {
        writeJsonFile(reviewSet.resolvedSourceReviewSetPath, reviewSet.strippedEntries);
    }
}

function runInlineObsidianProofRemoval(options = {}) {
    const report = buildInlineObsidianProofRemoval(options);
    if (options.write) {
        writeInlineObsidianProofRemoval(report);
        const reconciliation = buildObsidianProofReconciliationReport({
            cwd: options.cwd,
            ledgerDir: options.ledgerDir,
            deckKinds: [options.deckKind || "kanji"],
            levels: report.levels,
        });
        report.reconciliation = {
            passed: reconciliation.passed,
            totals: reconciliation.totals,
            failures: reconciliation.failures || [],
        };
        if (!reconciliation.passed) {
            report.passed = false;
            report.failures.push("Post-write Obsidian proof reconciliation did not pass.");
        }
    }
    return report;
}

function formatRemovalReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Inline Obsidian Proof Removal",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Mode: ${report.write ? "write" : "dry-run"}`,
        "",
        "Authority boundary:",
        "- This removes legacy inline Obsidian proof only after canonical JSONL ledger events are present and bound to the tracked review set.",
        "- It does not certify cards, migrate word proof, change Japanese-source evidence, generate deck output, or claim release readiness.",
    ];

    for (const reviewSet of report.reviewSets || []) {
        lines.push(
            "",
            `${reviewSet.deckKind}:N${reviewSet.level}`,
            `- Source review set: ${reviewSet.sourceReviewSetPath}`,
            `- Source entries: ${reviewSet.sourceEntries}`,
            `- Ledger proof events: ${reviewSet.ledgerProofEvents}`,
            `- Inline proofs removed: ${reviewSet.inlineProofsRemoved}`
        );
    }

    if (report.reconciliation) {
        lines.push(
            "",
            "Post-write reconciliation:",
            `- Result: ${report.reconciliation.passed ? "passing" : "failing"}`,
            `- Inline proofs: ${report.reconciliation.totals?.inlineProofs || 0}`,
            `- Ledger proofs: ${report.reconciliation.totals?.ledgerProofs || 0}`,
            `- Canonical ledger proofs: ${report.reconciliation.totals?.canonicalLedgerProofs || 0}`,
            `- Mismatches: ${report.reconciliation.totals?.proofMismatches || 0}`
        );
    }

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:obsidian:proof:remove-inline", options.unknownArgs);
    const report = runInlineObsidianProofRemoval(options);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatRemovalReport(report));
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
    buildInlineObsidianProofRemoval,
    buildInlineObsidianProofRemovalForReviewSet,
    formatRemovalReport,
    parseArgs,
    runInlineObsidianProofRemoval,
    stripInlineProofFromEntry,
    writeInlineObsidianProofRemoval,
};
