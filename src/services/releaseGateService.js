const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { loadAudioSourcePolicy } = require("../datasets/audioSourcePolicy");
const { buildAudioPolicyAuditReport } = require("./audioPolicyAuditService");
const { buildToolchainStatus, getBlockedTools, getMissingPackagingTools } = require("./toolchainService");
const { runCiSmoke } = require("./ciSmokeService");

const RELEASE_GATE_SCOPE = Object.freeze({
    type: "smoke-fixture",
    validates: [
        "deterministic CI smoke fixture exports",
        "smoke fixture package contracts",
        "smoke fixture audio provenance policy",
        "optional smoke fixture .apkg packaging when --require-apkg-tools is set",
    ],
    doesNotValidate: [
        "public product deck readiness",
        "tracked-source N5/N4 deck coverage",
        "level golden review benchmarks",
        "manual Anki import or learner UX review",
    ],
    followUp: "Run level-specific readiness, golden review, accessibility, provenance, and manual QA checks before public release.",
});

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

function buildReleaseGateReport({ smokeSummary, toolchainStatus, requireApkgTools, audioPolicyReport, audioSourcePolicy }) {
    return {
        generatedAt: new Date().toISOString(),
        requireApkgTools,
        validationScope: RELEASE_GATE_SCOPE,
        toolchain: toolchainStatus,
        smoke: {
            rootDir: smokeSummary.rootDir,
            kanjiOutDir: smokeSummary.kanjiBuild.outDir,
            wordOutDir: smokeSummary.wordBuild.outDir,
            kanjiExports: smokeSummary.kanjiBuild.exports.length,
            wordRows: smokeSummary.wordBuild.rows,
        },
        audioPolicy: {
            policyPath: audioSourcePolicy.policyPath,
            valid: audioPolicyReport.valid,
            manifestCount: audioPolicyReport.manifestCount,
            totalAudioAssets: audioPolicyReport.totalAudioAssets,
            uniqueSources: audioPolicyReport.uniqueSources,
            mixedReleaseSources: audioPolicyReport.mixedReleaseSources,
            remoteAudioConfigured: audioPolicyReport.remoteAudioConfigured,
            remoteAudioViolation: audioPolicyReport.remoteAudioViolation,
            violatingAssets: audioPolicyReport.violatingAssets.length,
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
    loadAudioSourcePolicyFn = loadAudioSourcePolicy,
    buildAudioPolicyAuditReportFn = buildAudioPolicyAuditReport,
} = {}) {
    const toolchainStatus = buildToolchainStatusFn();
    const missingPackagingTools = getMissingPackagingTools(toolchainStatus);
    const blockedTools = getBlockedTools(toolchainStatus).filter((tool) => (
        Array.isArray(toolchainStatus.packaging)
        && toolchainStatus.packaging.some((packagingTool) => packagingTool?.name === tool?.name)
    ));

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
        assert.ok(smokeSummary.config?.mediaRootDir, "Smoke summary must include mediaRootDir for audio policy verification");
        const audioSourcePolicy = loadAudioSourcePolicyFn();
        const audioPolicyReport = buildAudioPolicyAuditReportFn({
            mediaRootDir: smokeSummary.config?.mediaRootDir,
            audioSourcePolicy,
            remoteAudioBaseUrl: smokeSummary.config?.remoteAudioBaseUrl || null,
        });
        assert.equal(audioPolicyReport.valid, true, "Release gate audio policy audit failed");
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
            audioPolicyReport,
            audioSourcePolicy,
        });
    } finally {
        if (shouldCleanupTempDir) {
            fs.rmSync(smokeSummary.rootDir, { recursive: true, force: true });
        }
    }
}

module.exports = {
    RELEASE_GATE_SCOPE,
    assertPackageSummary,
    assertPathExists,
    assertTsvHeaderMatches,
    buildReleaseGateReport,
    parseTsvHeader,
    runReleaseGate,
};
