const path = require("node:path");

const { assertSafeGeneratedPath } = require("../utils/fs");

const DEFAULT_RUN_OUTPUT_BASE = path.join("out", "run-outputs");
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

function normalizeRunId(runId) {
    const normalized = String(runId || "").trim();
    if (!RUN_ID_PATTERN.test(normalized) || normalized.includes("..")) {
        throw new Error("Invalid --run-id. Use 1-64 ASCII letters, numbers, dots, underscores, or dashes, starting with a letter or number.");
    }
    return normalized;
}

function normalizeDeckKind(deckKind = "kanji") {
    const normalized = String(deckKind || "kanji").trim().toLowerCase();
    if (["word", "words"].includes(normalized)) {
        return "word";
    }
    if (["kanji-additional", "additional-kanji"].includes(normalized)) {
        return "kanji-additional";
    }
    if (normalized === "kanji") {
        return "kanji";
    }
    throw new Error(`Unsupported output deck kind: ${deckKind}`);
}

function normalizeLevelsForSlug(levels = []) {
    const normalized = [...new Set((Array.isArray(levels) ? levels : [])
        .map((level) => Number(level))
        .filter((level) => [1, 2, 3, 4, 5].includes(level)))]
        .sort((left, right) => right - left);
    return normalized.length > 0 ? normalized : [5, 4, 3, 2, 1];
}

function buildOutputScopeSlug({ deckKind = "kanji", levels = [] } = {}) {
    const kind = normalizeDeckKind(deckKind);
    const levelSlug = normalizeLevelsForSlug(levels)
        .map((level) => `n${level}`)
        .join("-");
    return `${kind}-${levelSlug}`;
}

function resolveIsolatedOutputDir({
    runId,
    outDirBase = DEFAULT_RUN_OUTPUT_BASE,
    deckKind = "kanji",
    levels = [],
    cwd = process.cwd(),
} = {}) {
    const safeRunId = normalizeRunId(runId);
    const resolvedBase = path.resolve(cwd, outDirBase || DEFAULT_RUN_OUTPUT_BASE);
    const outputDir = path.join(resolvedBase, safeRunId, buildOutputScopeSlug({ deckKind, levels }));
    return assertSafeGeneratedPath(outputDir, { label: "run-isolated output directory" });
}

function resolveOutputDir({
    explicitOutDir = null,
    runId = null,
    outDirBase = null,
    defaultOutDir,
    deckKind = "kanji",
    levels = [],
    cwd = process.cwd(),
} = {}) {
    if (explicitOutDir && runId) {
        throw new Error("Use only one of --out-dir or --run-id for build output isolation.");
    }
    if (explicitOutDir && outDirBase) {
        throw new Error("Use --out-dir-base only with --run-id, not with --out-dir.");
    }
    if (outDirBase && !runId) {
        throw new Error("Use --out-dir-base only together with --run-id.");
    }
    if (explicitOutDir) {
        return path.resolve(cwd, explicitOutDir);
    }
    if (runId) {
        return resolveIsolatedOutputDir({ runId, outDirBase, deckKind, levels, cwd });
    }
    return path.resolve(cwd, defaultOutDir);
}

module.exports = {
    DEFAULT_RUN_OUTPUT_BASE,
    buildOutputScopeSlug,
    normalizeRunId,
    resolveIsolatedOutputDir,
    resolveOutputDir,
};
