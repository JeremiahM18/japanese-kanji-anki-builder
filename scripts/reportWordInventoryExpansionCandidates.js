const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { loadWordSourceManifest } = require("../src/datasets/wordSourceManifest");
const {
    buildSourceFileIntegrity,
    validateSourceIntegrity,
} = require("../src/services/wordCandidateAgreementService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption } = require("../src/utils/cliArgs");
const {
    buildWordInventoryExpansionCandidateReport,
    formatWordInventoryExpansionCandidateReport,
    parseCandidateSourceText,
} = require("../src/services/wordInventoryExpansionCandidateService");
const {
    loadTriageDecisions,
    resolveTriagePath,
} = require("../src/services/wordInventoryExpansionTriageService");

const DEFAULT_WORD_SOURCE_MANIFEST = "templates/word_source_manifest.json";

function parseArgs(argv) {
    const options = {
        format: "auto",
        json: false,
        kanjiScope: "at-or-below",
        kanjiScopeExplicit: false,
        level: 5,
        limit: 50,
        manifest: DEFAULT_WORD_SOURCE_MANIFEST,
        requireSourceLevel: false,
        requireSourceLevelExplicit: false,
        source: "",
        sourceLabel: "",
        triage: "",
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--require-source-level") {
            options.requireSourceLevel = true;
        } else if (arg.startsWith("--format=")) {
            options.format = String(arg.split("=")[1] || "").trim();
        } else if (arg.startsWith("--kanji-scope=")) {
            options.kanjiScope = String(arg.split("=")[1] || "").trim();
            options.kanjiScopeExplicit = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--manifest=")) {
            options.manifest = String(arg.slice("--manifest=".length) || "").trim();
        } else if (arg.startsWith("--source=")) {
            options.source = String(arg.slice("--source=".length) || "").trim();
        } else if (arg.startsWith("--source-label=")) {
            options.sourceLabel = String(arg.slice("--source-label=".length) || "").trim();
        } else if (arg.startsWith("--triage=")) {
            options.triage = String(arg.slice("--triage=".length) || "").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (options.requireSourceLevel) {
        options.requireSourceLevelExplicit = true;
    }

    return options;
}

function resolveManifestPath(manifestPath = DEFAULT_WORD_SOURCE_MANIFEST) {
    return path.resolve(process.cwd(), manifestPath || DEFAULT_WORD_SOURCE_MANIFEST);
}

function formatCandidateDiscoverySource(sourceId, sourceConfig = {}) {
    const levels = Array.isArray(sourceConfig.candidatePolicy?.levels) && sourceConfig.candidatePolicy.levels.length > 0
        ? sourceConfig.candidatePolicy.levels.map((sourceLevel) => `N${sourceLevel}`).join(",")
        : "all levels";
    const localPath = sourceConfig.local?.path || sourceConfig.origin?.localPath || "no local path";
    const status = sourceConfig.status && sourceConfig.status !== "active"
        ? `${sourceConfig.status}; `
        : "";
    return `${sourceId} (${status}${levels}; ${localPath})`;
}

function getActiveCandidateDiscoverySources(manifest = {}) {
    return Object.entries(manifest.sources || {})
        .filter(([, sourceConfig]) => (
            sourceConfig.status === "active"
            && Array.isArray(sourceConfig.allowedUse)
            && sourceConfig.allowedUse.includes("candidate-discovery")
            && sourceConfig.local?.path
        ));
}

function hasCandidateDiscoveryIntent(sourceConfig = {}) {
    return (
        Array.isArray(sourceConfig.intendedUse)
        && sourceConfig.intendedUse.includes("candidate-discovery")
    ) || (
        Array.isArray(sourceConfig.allowedUse)
        && sourceConfig.allowedUse.includes("candidate-discovery")
    );
}

function sourceSupportsLevel(sourceConfig = {}, level) {
    return !Array.isArray(sourceConfig.candidatePolicy?.levels)
        || sourceConfig.candidatePolicy.levels.length === 0
        || sourceConfig.candidatePolicy.levels.includes(level);
}

function sourceDeclaresLevel(sourceConfig = {}, level) {
    return (
        Array.isArray(sourceConfig.candidatePolicy?.levels)
        && sourceConfig.candidatePolicy.levels.includes(level)
    ) || (
        Array.isArray(sourceConfig.levels)
        && sourceConfig.levels.includes(level)
    );
}

function getInactiveCandidateDiscoverySourcesForLevel(manifest = {}, level) {
    return Object.entries(manifest.sources || {})
        .filter(([, sourceConfig]) => (
            sourceConfig.status !== "active"
            && hasCandidateDiscoveryIntent(sourceConfig)
            && sourceDeclaresLevel(sourceConfig, level)
        ));
}

function formatMissingManifestSourceError({ manifest, manifestPath = DEFAULT_WORD_SOURCE_MANIFEST, level } = {}) {
    const activeSources = getActiveCandidateDiscoverySources(manifest);
    const sourceSummary = activeSources.length > 0
        ? activeSources.map(([sourceId, sourceConfig]) => formatCandidateDiscoverySource(sourceId, sourceConfig)).join("; ")
        : "none";
    const inactiveSources = getInactiveCandidateDiscoverySourcesForLevel(manifest, level);
    const messages = [
        `No active candidate-discovery word source is registered for N${level} in ${manifestPath}.`,
        `Active candidate-discovery sources: ${sourceSummary}.`,
    ];
    if (inactiveSources.length > 0) {
        messages.push(`Registered inactive candidate-discovery sources for N${level}: ${inactiveSources.map(([sourceId, sourceConfig]) => formatCandidateDiscoverySource(sourceId, sourceConfig)).join("; ")}.`);
    }
    messages.push(`Register an active source with allowedUse candidate-discovery, local.path, integrity pins, and candidatePolicy.levels including ${level}, or pass --source=... with --source-label=... for an explicit read-only inspection.`);
    return messages.join(" ");
}

function resolveSourcePath(source, { manifest, manifestPath = DEFAULT_WORD_SOURCE_MANIFEST, level } = {}) {
    if (!source && manifest) {
        const matchingSources = getActiveCandidateDiscoverySources(manifest)
            .filter(([, sourceConfig]) => sourceSupportsLevel(sourceConfig, level));

        if (matchingSources.length === 1) {
            return path.resolve(process.cwd(), matchingSources[0][1].local.path);
        }
        if (matchingSources.length > 1) {
            throw new Error(`Multiple candidate-discovery sources match N${level}; provide --source explicitly.`);
        }
        throw new Error(formatMissingManifestSourceError({ manifest, manifestPath, level }));
    }

    if (!source) {
        throw new Error("Missing --source path. Provide a TSV, CSV, or JSON vocab source to inspect.");
    }
    return path.resolve(process.cwd(), source);
}

function resolveManifestSourceForPath(manifest = {}, sourcePath = "") {
    const resolvedSourcePath = path.resolve(sourcePath);
    for (const [sourceId, sourceConfig] of Object.entries(manifest.sources || {})) {
        if (!sourceConfig.local?.path) {
            continue;
        }
        if (path.resolve(process.cwd(), sourceConfig.local.path) === resolvedSourcePath) {
            return {
                sourceId,
                sourceConfig,
            };
        }
    }
    return null;
}

function validateManifestSourceFile({ manifestSource, sourceBuffer, sourceRows } = {}) {
    if (!manifestSource) {
        return [];
    }
    return validateSourceIntegrity(
        manifestSource.sourceConfig,
        buildSourceFileIntegrity({ sourceBuffer, sourceRows })
    );
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:expansion-candidates", options.unknownArgs);

    const level = Number(options.level);
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Expansion candidate level must be 1-5.");
    }
    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Expansion candidate limit must be a positive integer.");
    }

    const manifestPath = resolveManifestPath(options.manifest);
    const manifest = fs.existsSync(manifestPath)
        ? loadWordSourceManifest(manifestPath)
        : null;
    const sourcePath = resolveSourcePath(options.source, { manifest, manifestPath: options.manifest, level });
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Candidate source does not exist: ${sourcePath}`);
    }
    const manifestSource = manifest ? resolveManifestSourceForPath(manifest, sourcePath) : null;
    const sourceLabel = options.sourceLabel || manifestSource?.sourceId || path.basename(sourcePath);
    const sourceFormat = options.format === "auto" && manifestSource?.sourceConfig?.local?.format
        ? manifestSource.sourceConfig.local.format
        : options.format;
    const candidatePolicy = manifestSource?.sourceConfig?.candidatePolicy || {};
    const kanjiScope = options.kanjiScopeExplicit
        ? options.kanjiScope
        : candidatePolicy.kanjiScope || options.kanjiScope;
    const requireSourceLevel = options.requireSourceLevelExplicit
        ? options.requireSourceLevel
        : Boolean(candidatePolicy.requireSourceLevel);

    const sourceBuffer = fs.readFileSync(sourcePath);
    const sourceRows = parseCandidateSourceText(sourceBuffer.toString("utf8"), {
        format: sourceFormat,
    });
    const sourceIntegrityBlockers = validateManifestSourceFile({
        manifestSource,
        sourceBuffer,
        sourceRows,
    });
    if (sourceIntegrityBlockers.length > 0) {
        throw new Error(`Candidate source integrity failed for ${sourceLabel}: ${sourceIntegrityBlockers.join("; ")}`);
    }
    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows,
        targetLevel: level,
        kanjiScope,
        limit,
        requireSourceLevel,
        sourceLabel,
        triageDecisions: loadTriageDecisions({
            triagePath: options.triage,
            level,
            sourceLabel,
        }),
        jlptLevelContract: loadJlptLevelContract(path.join(process.cwd(), "templates", "jlpt_level_contract.json")),
        jlptWordLevelContract: loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json")),
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatWordInventoryExpansionCandidateReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_WORD_SOURCE_MANIFEST,
    formatMissingManifestSourceError,
    getActiveCandidateDiscoverySources,
    getInactiveCandidateDiscoverySourcesForLevel,
    loadTriageDecisions,
    main,
    parseArgs,
    resolveManifestPath,
    resolveManifestSourceForPath,
    resolveSourcePath,
    resolveTriagePath,
    validateManifestSourceFile,
};
