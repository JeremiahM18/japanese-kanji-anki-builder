const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TEST_ROOT_DIR = path.resolve(__dirname, "..", "test");
const TEST_FILE_SUFFIX = ".test.js";
const TEST_SCOPES = Object.freeze({
    "ci-release": Object.freeze([
        "branchProtectionPolicy.test.js",
        "ciSmokeService.test.js",
        "dependencyLicenseAudit.test.js",
        "githubRepositorySettingsAudit.test.js",
        "hostileInputSecurity.test.js",
        "releaseGateService.test.js",
        "releasePolicy.test.js",
        "releaseQaEvidenceService.test.js",
        "sbomGeneration.test.js",
        "sdlcMetrics.test.js",
        "secretAudit.test.js",
        "securityRequirementsTraceability.test.js",
        "supplyChainPolicy.test.js",
    ]),
    "docs-governance": Object.freeze([
        "deckCloseoutStatusService.test.js",
        "documentationStatusAudit.test.js",
        "focusedVerificationPlanService.test.js",
        "laneOpsStatusService.test.js",
        "laneWorkPacketService.test.js",
        "outputIsolationService.test.js",
        "repositoryGovernance.test.js",
        "runNodeTestsScript.test.js",
    ]),
    "kanji-lanes": Object.freeze([
        "additionalKanjiDeckService.test.js",
        "buildPipeline.test.js",
        "deckReadyService.test.js",
        "goldenReviewCoverage.test.js",
        "goldenReviewService.test.js",
        "kanjiCardFieldSourceContract.test.js",
        "kanjiComponentContract.test.js",
        "kanjiDeckContractService.test.js",
        "kanjiDeckGeneratedSurfaceAuditService.test.js",
        "kanjiDeckPartitionPlanService.test.js",
        "kanjiDeckReviewStatusService.test.js",
        "kanjiReadingReferenceContract.test.js",
        "laneAuthorityAuditService.test.js",
        "platinumCardSourceManifest.test.js",
        "platinumEvidenceService.test.js",
        "platinumGovernanceGateService.test.js",
        "platinumKanjiBatchReportService.test.js",
        "platinumKanjiReviewService.test.js",
        "platinumKanjiSourceOriginService.test.js",
        "platinumReviewService.test.js",
        "platinumTrackedReviewSets.test.js",
        "prepareDeck.test.js",
        "reviewGoldenAdditionalKanjiLevel.test.js",
        "reviewGoldenLevelScript.test.js",
        "reviewPlatinumKanjiLevel.test.js",
        "reviewPlatinumKanjiLevelScript.test.js",
        "sapphireTrackedReviewSets.test.js",
        "slimKanjiSapphireReviewSets.test.js",
        "trackedSourceArtifactService.test.js",
    ]),
    "media-audio": Object.freeze([
        "audioGenerationService.test.js",
        "audioImportService.test.js",
        "audioPolicyAuditService.test.js",
        "audioReviewService.test.js",
        "audioService.test.js",
        "audioSourcePolicy.test.js",
        "freeStrokeOrderImportService.test.js",
        "importKanjiumPitchAccents.test.js",
        "importVoicevoxPitchAccents.test.js",
        "kanjiVgImportService.test.js",
        "manageVoicevoxContainer.test.js",
        "mediaCoverage.test.js",
        "mediaGapService.test.js",
        "mediaProviders.test.js",
        "mediaSourceReportService.test.js",
        "mediaStore.test.js",
        "mediaSync.test.js",
        "pitchAccentRenderService.test.js",
        "reportAudioReviewScript.test.js",
        "reportMissingManagedAnimations.test.js",
        "strokeOrderPolicyAuditService.test.js",
        "strokeOrderService.test.js",
        "voicevoxClient.test.js",
        "voicevoxDoctorService.test.js",
        "wordAudioReviewService.test.js",
        "wordPitchAccentData.test.js",
        "wordPitchAccentVerificationService.test.js",
    ]),
    nlp: Object.freeze([
        "nlpDraftProposalService.test.js",
        "nlpEmbeddingArtifactService.test.js",
        "nlpEmbeddingGenerationService.test.js",
        "nlpEmbeddingModelEvaluationService.test.js",
        "nlpEmbeddingSmokeGateService.test.js",
        "nlpExampleRerankingService.test.js",
        "nlpGovernanceGateService.test.js",
        "nlpModelGovernanceService.test.js",
        "nlpModelManifest.test.js",
        "nlpReadingGapCandidateDiscoveryService.test.js",
        "nlpReviewPacketService.test.js",
        "nlpRuntimeDoctorService.test.js",
        "nlpSenseFitAuditService.test.js",
        "nlpSuggestionArtifact.test.js",
        "nlpSuggestionArtifactService.test.js",
        "nlpTokenizationArtifact.test.js",
        "nlpTokenizationArtifactService.test.js",
        "nlpTokenizationAuditService.test.js",
        "nlpTokenizationGenerationService.test.js",
        "nlpWordTokenizationMismatchExceptions.test.js",
        "runKanjiNlpSignalSupportScript.test.js",
        "runWordNlpExpansionSupportScript.test.js",
    ]),
    "obsidian-proof": Object.freeze([
        "obsidianKanjiCertificationStatusService.test.js",
        "obsidianProofCompatibilityView.test.js",
        "obsidianProofEtlBenchmark.test.js",
        "obsidianProofInlineMigration.test.js",
        "obsidianProofInlineRemoval.test.js",
        "obsidianProofLedger.test.js",
        "obsidianProofLedgerAppend.test.js",
        "obsidianProofProviderParity.test.js",
        "obsidianProofProviderService.test.js",
        "obsidianProofReconciliation.test.js",
        "obsidianProofSqliteMirror.test.js",
        "obsidianWordCertificationStatusService.test.js",
        "platinumKanjiRereviewStatusService.test.js",
        "platinumWordRereviewStatusService.test.js",
    ]),
    performance: Object.freeze([
        "benchmarkBuild.test.js",
        "benchmarkExport.test.js",
        "jlptKanjiSourceEvidenceCostReport.test.js",
        "memoryUsage.test.js",
        "obsidianProofEtlBenchmark.test.js",
        "performanceMemoryAuditMatrix.test.js",
    ]),
    "source-evidence": Object.freeze([
        "jlptKanjiSourceAccessPacketService.test.js",
        "jlptKanjiSourceBatchService.test.js",
        "jlptKanjiSourceAccessService.test.js",
        "jlptKanjiSourceEvidenceCostReport.test.js",
        "jlptKanjiSourceEvidence.test.js",
        "jlptKanjiSourceImportService.test.js",
        "jlptKanjiSourceInputService.test.js",
        "jlptKanjiSourceInputTemplateService.test.js",
        "jlptKanjiSourceLevelDeltaService.test.js",
        "jlptKanjiSourceReviewPacket.test.js",
        "jlptOfficialOccurrenceService.test.js",
        "jlptTaxonomyGovernance.test.js",
        "jlptWordSourceInputCommandServices.test.js",
        "jlptWordSourceGovernance.test.js",
        "kanjidic2JlptSourceService.test.js",
        "kanjidic2ReadingReferenceService.test.js",
        "pinJlptKanjiSourceInputScript.test.js",
        "reportJlptKanjiSourceOcrIntakeScript.test.js",
        "repositoryGovernance.test.js",
        "runNodeTestsScript.test.js",
        "tanosJlptKanjiSourceService.test.js",
        "wordCommonExpansionSourceAdequacy.test.js",
        "wordSourceManifest.test.js",
    ]),
    "word-lanes": Object.freeze([
        "goldWordExpectationScaffoldService.test.js",
        "jlptWordLevelContract.test.js",
        "jmdictWordSourceService.test.js",
        "platinumWordBatchReportService.test.js",
        "platinumWordRereviewStatusService.test.js",
        "platinumWordSourcePostureService.test.js",
        "prepareWordDeckScript.test.js",
        "reportWordCandidateAgreementScript.test.js",
        "reportWordCommonExpansionSelectorScript.test.js",
        "reportWordCoverageUpliftScript.test.js",
        "reportWordExpansionSignalsScript.test.js",
        "reportWordInventoryExpansionCandidatesScript.test.js",
        "reportWordReadingGapPlanScript.test.js",
        "reviewGoldenWordLevel.test.js",
        "reviewPlatinumWordLevel.test.js",
        "reviewSapphireWordLevel.test.js",
        "sapphireWordBatchReportService.test.js",
        "sapphireWordTrackedReviewSets.test.js",
        "tanosJlptWordSourceService.test.js",
        "tubelexWordFrequencyService.test.js",
        "wordCandidateAgreementService.test.js",
        "wordCommonExpansionSelectorService.test.js",
        "wordCommonExpansionSourceAdequacy.test.js",
        "wordDeckCompletionService.test.js",
        "wordDeckCoverageScopeService.test.js",
        "wordExportService.test.js",
        "wordInventoryExpansionCandidateService.test.js",
        "wordLevelInventoryStatusService.test.js",
        "wordLevelAnchorAuditService.test.js",
        "wordReadingCoverageService.test.js",
        "wordReadingGapPlanService.test.js",
        "wordSourceManifest.test.js",
        "wordStudyData.test.js",
    ]),
});

// Keep the test invocation compatible across the supported Node matrix.
// Newer runtimes can opt into shared-process execution, while older CI lanes
// still run with the plain built-in runner and the same explicit test file set.
function parseNodeVersion(version = process.versions.node) {
    const [major = 0, minor = 0] = String(version)
        .split(".")
        .map((part) => Number.parseInt(part, 10));

    return { major, minor };
}

function supportsTestIsolationFlag(version = process.versions.node) {
    const { major } = parseNodeVersion(version);

    return major >= 24;
}

function parseRunNodeTestsArgs(argv = []) {
    const passthroughArgs = [];
    let scope = null;

    for (const arg of argv) {
        if (arg.startsWith("--scope=")) {
            scope = arg.slice("--scope=".length);
            continue;
        }
        passthroughArgs.push(arg);
    }

    if (scope && !TEST_SCOPES[scope]) {
        throw new Error(`Unknown test scope: ${scope}`);
    }

    return { passthroughArgs, scope };
}

function buildNodeTestArgs(version = process.versions.node, passthroughArgs = [], options = {}) {
    const parsed = parseRunNodeTestsArgs(passthroughArgs);
    const scope = options.scope || parsed.scope;
    const args = ["--test"];

    if (supportsTestIsolationFlag(version)) {
        args.push("--test-isolation=none");
    }

    if (scope && !TEST_SCOPES[scope]) {
        throw new Error(`Unknown test scope: ${scope}`);
    }

    args.push(...parsed.passthroughArgs);
    args.push(...findTestFiles(TEST_ROOT_DIR, scope));
    return args;
}

function findScopedTestFiles(rootDir, scope) {
    return TEST_SCOPES[scope].map((fileName) => {
        const testPath = path.join(rootDir, fileName);
        if (!fs.existsSync(testPath)) {
            throw new Error(`Missing test file for ${scope} scope: ${testPath}`);
        }
        return path.relative(process.cwd(), testPath);
    });
}

function findTestFiles(rootDir = TEST_ROOT_DIR, scope = null) {
    if (scope) {
        if (!TEST_SCOPES[scope]) {
            throw new Error(`Unknown test scope: ${scope}`);
        }
        return findScopedTestFiles(rootDir, scope);
    }

    const discovered = [];
    const pending = [rootDir];

    while (pending.length > 0) {
        const currentDir = pending.pop();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                pending.push(entryPath);
                continue;
            }

            if (entry.isFile() && entry.name.endsWith(TEST_FILE_SUFFIX)) {
                discovered.push(path.relative(process.cwd(), entryPath));
            }
        }
    }

    discovered.sort((left, right) => left.localeCompare(right));
    return discovered;
}

function main() {
    const args = buildNodeTestArgs(process.versions.node, process.argv.slice(2));
    const result = spawnSync(process.execPath, args, {
        stdio: "inherit",
        shell: false,
        windowsHide: true,
    });

    if (result.error) {
        throw result.error;
    }

    process.exit(result.status ?? 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    TEST_SCOPES,
    buildNodeTestArgs,
    findScopedTestFiles,
    findTestFiles,
    parseNodeVersion,
    parseRunNodeTestsArgs,
    supportsTestIsolationFlag,
};
