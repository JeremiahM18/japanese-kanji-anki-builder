const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { loadJlptWordSourceEvidence } = require("../src/datasets/jlptWordSourceEvidence");
const {
    buildJlptWordSupportSurface,
    formatJlptWordSupportWorksheet,
} = require("../src/services/jlptWordSupportSurfaceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    resolveGovernedDirectChildPath,
    writeFileAtomicSync,
} = require("../src/utils/fs");

const DEFAULT_CONTRACT = "templates/jlpt_word_level_contract.json";
const DEFAULT_EVIDENCE = "templates/jlpt_word_source_evidence.json";

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        source: "",
        level: null,
        levels: null,
        out: "",
        batchOut: "",
        write: false,
        json: false,
        unknownArgs: [],
    };
    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--dry-run") {
            options.write = false;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--contract=")) {
            options.contract = parseStringOption(arg, "contract");
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = parseStringOption(arg, "evidence");
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source");
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels").map((level) => Number(level));
        } else if (arg.startsWith("--out=")) {
            options.out = parseStringOption(arg, "out");
        } else if (arg.startsWith("--batch-out=")) {
            options.batchOut = parseStringOption(arg, "batch-out");
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function hash(text) {
    return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function resolveLevelScope({ level = null, levels = null } = {}) {
    if (Number.isInteger(level) && Array.isArray(levels)) {
        throw new Error("Use either --level or --levels for word support, not both.");
    }
    const selected = Array.isArray(levels) ? levels : (Number.isInteger(level) ? [level] : []);
    if (selected.length === 0) {
        throw new Error("Missing required --level=<1-5> or --levels=<levels>.");
    }
    const seen = new Set();
    for (const selectedLevel of selected) {
        if (!Number.isInteger(selectedLevel) || selectedLevel < 1 || selectedLevel > 5) {
            throw new Error(`Word support surface received invalid JLPT level: ${selectedLevel}.`);
        }
        if (seen.has(selectedLevel)) {
            throw new Error(`Word support surface received duplicate JLPT level: N${selectedLevel}.`);
        }
        seen.add(selectedLevel);
    }
    return [...seen].sort((left, right) => right - left);
}

function resolveDefaultPath(sourceId, levelOrLevels, suffix) {
    const levels = Array.isArray(levelOrLevels) ? levelOrLevels : [levelOrLevels];
    const normalized = [...levels].sort((left, right) => right - left);
    const scope = JSON.stringify(normalized) === JSON.stringify([5, 4, 3, 2, 1])
        ? "all"
        : normalized.map((level) => `n${level}`).join("-");
    return path.join("downloads", "word-source-support", `${sourceId}-${scope}-${suffix}.tsv`);
}

function resolveGovernedOutputPath(outputPath, { cwd = process.cwd() } = {}) {
    return resolveGovernedDirectChildPath({
        baseDirectory: cwd,
        governedDirectory: path.join(cwd, "downloads", "word-source-support"),
        declaredPath: outputPath,
        extension: ".tsv",
        label: "Word-source support worksheet output",
        rejectWindowsReservedName: true,
    });
}

function normalizePathForComparison(filePath) {
    return path.resolve(filePath).toLowerCase();
}

function resolveGovernedOutputPaths({ cwd = process.cwd(), outPath, batchOutPath, sourcePath } = {}) {
    const resolvedOutPath = resolveGovernedOutputPath(outPath, { cwd });
    const resolvedBatchOutPath = resolveGovernedOutputPath(batchOutPath, { cwd });
    if (normalizePathForComparison(resolvedOutPath) === normalizePathForComparison(resolvedBatchOutPath)) {
        throw new Error("Review and reviewed-batch outputs must use distinct governed paths.");
    }
    if (sourcePath) {
        const normalizedSourcePath = normalizePathForComparison(sourcePath);
        if (
            normalizePathForComparison(resolvedOutPath) === normalizedSourcePath
            || normalizePathForComparison(resolvedBatchOutPath) === normalizedSourcePath
        ) {
            throw new Error("Word-source support outputs must not overwrite the normalized source.");
        }
    }
    return { outPath: resolvedOutPath, batchOutPath: resolvedBatchOutPath };
}

function run(options = {}) {
    if (!options.source) {
        throw new Error("Missing required --source=<source-id>.");
    }
    const levels = resolveLevelScope(options);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const evidence = loadJlptWordSourceEvidence(evidencePath);
    const source = evidence.sources?.[options.source];
    if (!source) {
        throw new Error(`Unknown JLPT word evidence source: ${options.source}`);
    }
    if (!source.local?.path) {
        throw new Error(`JLPT word evidence source ${options.source} has no pinned normalized local path.`);
    }
    const sourcePath = path.resolve(process.cwd(), source.local.path);
    const sourceText = fs.readFileSync(sourcePath);
    const contract = loadJlptWordLevelContract(options.contract || DEFAULT_CONTRACT);
    const contractEntries = Object.entries(contract.wordLevels || {})
        .map(([key, entry]) => ({ key, ...entry }));
    const builtByLevel = levels.map((level) => buildJlptWordSupportSurface({
        sourceId: options.source,
        source,
        sourceText,
        contractEntries,
        level,
    }));
    const supportRecords = {};
    const exclusionsByReason = {};
    const summaryByLevel = {};
    for (const built of builtByLevel) {
        summaryByLevel[built.level] = built.summary;
        for (const [identity, record] of Object.entries(built.supportRecords)) {
            if (supportRecords[identity]) {
                throw new Error(`Duplicate exact support identity across selected levels: ${identity}.`);
            }
            supportRecords[identity] = record;
        }
        for (const [reason, count] of Object.entries(built.exclusionsByReason || {})) {
            exclusionsByReason[reason] = (exclusionsByReason[reason] || 0) + count;
        }
    }
    const sourceIntegrity = builtByLevel[0].integrity;
    const matchedSourceRowCount = builtByLevel.reduce((total, built) => (
        total + built.summary.contractIdentityCount - (built.exclusionsByReason.missing_exact_source_identity || 0)
    ), 0);
    const summary = {
        contractIdentityCount: builtByLevel.reduce((total, built) => total + built.summary.contractIdentityCount, 0),
        eligibleSupportFactCount: Object.keys(supportRecords).length,
        excludedContractIdentityCount: builtByLevel.reduce((total, built) => total + built.summary.excludedContractIdentityCount, 0),
        outOfScopeSourceRowCount: sourceIntegrity.rowCount - matchedSourceRowCount,
    };
    const worksheet = formatJlptWordSupportWorksheet({
        supportRecords,
        reviewStatus: "needs_review",
    });
    const reviewedBatch = formatJlptWordSupportWorksheet({
        supportRecords,
        reviewStatus: "reviewed",
    });
    const outputPaths = resolveGovernedOutputPaths({
        outPath: options.out || resolveDefaultPath(options.source, levels, "review"),
        batchOutPath: options.batchOut || resolveDefaultPath(options.source, levels, "reviewed-batch"),
        sourcePath,
    });
    if (options.write) {
        fs.mkdirSync(path.dirname(outputPaths.outPath), { recursive: true });
        const verifiedOutputPaths = resolveGovernedOutputPaths({
            outPath: path.relative(process.cwd(), outputPaths.outPath),
            batchOutPath: path.relative(process.cwd(), outputPaths.batchOutPath),
            sourcePath,
        });
        writeFileAtomicSync(verifiedOutputPaths.outPath, worksheet, "utf8");
        writeFileAtomicSync(verifiedOutputPaths.batchOutPath, reviewedBatch, "utf8");
    }
    return {
        valid: builtByLevel.every((built) => built.valid),
        mode: options.write ? "write" : "dry-run",
        noDeckMutation: true,
        sourceId: options.source,
        level: levels.length === 1 ? levels[0] : null,
        levels,
        sourcePath,
        outPath: outputPaths.outPath,
        batchOutPath: outputPaths.batchOutPath,
        summary,
        summaryByLevel,
        exclusionsByReason,
        sourceIntegrity,
        worksheetIntegrity: {
            sha256: hash(worksheet),
            byteSize: Buffer.byteLength(worksheet),
            rowCount: Object.keys(supportRecords).length,
        },
        reviewedBatchIntegrity: {
            sha256: hash(reviewedBatch),
            byteSize: Buffer.byteLength(reviewedBatch),
            rowCount: Object.keys(supportRecords).length,
        },
    };
}

function formatReport(result = {}) {
    return [
        "JLPT Word Typed Support Worksheet",
        "",
        `Source: ${result.sourceId}`,
        `Levels: ${(result.levels || [result.level]).map((level) => `N${level}`).join(", ")}`,
        `Mode: ${result.mode}`,
        `Eligible typed facts: ${result.summary?.eligibleSupportFactCount || 0}`,
        `Excluded contract identities: ${result.summary?.excludedContractIdentityCount || 0}`,
        `Out-of-scope source rows: ${result.summary?.outOfScopeSourceRowCount || 0}`,
        `Review worksheet: ${result.outPath}`,
        `Reviewed batch: ${result.batchOutPath}`,
        "No deck mutation: yes",
        "",
        "The reviewed batch still requires a support-only source-access packet and governed merge before import. Support facts never grant JLPT placement authority.",
    ].join("\n") + "\n";
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:build:jlpt:word-support-input", options.unknownArgs);
    const result = run(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : formatReport(result));
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    formatReport,
    main,
    parseArgs,
    resolveDefaultPath,
    resolveLevelScope,
    resolveGovernedOutputPath,
    resolveGovernedOutputPaths,
    run,
};
