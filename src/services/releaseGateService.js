const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { buildToolchainStatus, getBlockedTools, getMissingPackagingTools } = require("./toolchainService");
const { runCiSmoke } = require("./ciSmokeService");

function assertPathExists(filePath) {
    assert.equal(fs.existsSync(filePath), true, `Expected path to exist: ${filePath}`);
}

function parseTsvHeader(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    const [header = ""] = text.split(/\r?\n/, 1);
    return header.split("\t");
}

function assertTsvHeaderMatches(filePath, expectedHeader) {
    assert.deepEqual(parseTsvHeader(filePath), expectedHeader, `Unexpected TSV header at ${filePath}`);
}

function assertPackageSummary(packageSummary, { label, requireApkgTools = false }) {
    assert.ok(packageSummary, `${label} package summary is required`);
    assertPathExists(packageSummary.rootDir);
    assertPathExists(packageSummary.exportsDir);
    assertPathExists(packageSummary.mediaDir);
    assertPathExists(packageSummary.readmePath);
    assert.ok(packageSummary.exportCount >= 1, `${label} package should contain exports`);
    assert.ok(packageSummary.mediaAssetCount >= 1, `${label} package should contain media assets`);

    if (requireApkgTools) {
        assert.equal(packageSummary.ankiPackage?.skipped, false, `${label} should produce an .apkg when packaging tools are required`);
        assertPathExists(packageSummary.ankiPackage.filePath);
    }
}

function buildReleaseGateReport({ smokeSummary, toolchainStatus, requireApkgTools }) {
    return {
        generatedAt: new Date().toISOString(),
        requireApkgTools,
        toolchain: toolchainStatus,
        smoke: {
            rootDir: smokeSummary.rootDir,
            kanjiOutDir: smokeSummary.kanjiBuild.outDir,
            wordOutDir: smokeSummary.wordBuild.outDir,
            kanjiExports: smokeSummary.kanjiBuild.exports.length,
            wordRows: smokeSummary.wordBuild.rows,
        },
        packageVerification: smokeSummary.packageVerification,
    };
}

async function runReleaseGate({
    rootDir = null,
    keepTempDir = false,
    requireApkgTools = false,
    runCiSmokeFn = runCiSmoke,
    buildToolchainStatusFn = buildToolchainStatus,
} = {}) {
    const toolchainStatus = buildToolchainStatusFn();
    const missingPackagingTools = getMissingPackagingTools(toolchainStatus);
    const blockedTools = getBlockedTools(toolchainStatus).filter((tool) => Array.isArray(toolchainStatus.packaging) && toolchainStatus.packaging.includes(tool));

    if (requireApkgTools && (missingPackagingTools.length > 0 || blockedTools.length > 0)) {
        const issueParts = [];
        if (missingPackagingTools.length > 0) {
            issueParts.push(`unavailable: ${missingPackagingTools.map((tool) => tool.name).join(", ")}`);
        }
        if (blockedTools.length > 0) {
            issueParts.push(`blocked in this runtime: ${blockedTools.map((tool) => tool.name).join(", ")}`);
        }
        throw new Error(`Release gate requires packaging tools, but these are ${issueParts.join("; ")}`);
    }

    const shouldCleanupTempDir = !rootDir && !keepTempDir;
    const smokeSummary = await runCiSmokeFn({ rootDir, keepTempDir: true });

    try {
        const kanjiTsvPath = path.join(smokeSummary.kanjiBuild.outDir, "exports", "jlpt-n5.tsv");
        const wordTsvPath = path.join(smokeSummary.wordBuild.outDir, "exports", "jlpt-n5-words.tsv");
        assertPathExists(kanjiTsvPath);
        assertPathExists(wordTsvPath);
        assertTsvHeaderMatches(kanjiTsvPath, loadAnkiNoteSchema("kanji").fieldNames);
        assertTsvHeaderMatches(wordTsvPath, loadAnkiNoteSchema("word").fieldNames);
        assertPackageSummary(smokeSummary.kanjiBuild.package, { label: "Kanji", requireApkgTools });
        assertPackageSummary(smokeSummary.wordBuild.package, { label: "Word", requireApkgTools });

        return buildReleaseGateReport({
            smokeSummary,
            toolchainStatus,
            requireApkgTools,
        });
    } finally {
        if (shouldCleanupTempDir) {
            fs.rmSync(smokeSummary.rootDir, { recursive: true, force: true });
        }
    }
}

module.exports = {
    assertPackageSummary,
    assertPathExists,
    assertTsvHeaderMatches,
    buildReleaseGateReport,
    parseTsvHeader,
    runReleaseGate,
};
