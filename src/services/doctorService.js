const fs = require("node:fs");

const { buildCuratedStudySummary } = require("../datasets/curatedStudyCoverage");
const { buildMediaCoverageSummary } = require("../datasets/mediaCoverage");
const { buildCoverageSummary } = require("../datasets/sentenceCorpusCoverage");
const { loadCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadSentenceCorpus } = require("../datasets/sentenceCorpus");
const { buildCardQualitySummary } = require("./cardQualityService");
const { buildDefaultQualityThresholds, buildLevelReadinessReport } = require("./levelReadinessService");

function describePathStatus(filePath, { label, required, kind = "file" }) {
    const exists = fs.existsSync(filePath);
    let entryCount = null;

    if (exists && kind === "directory") {
        entryCount = fs.readdirSync(filePath, { withFileTypes: true }).filter((entry) => entry.isFile()).length;
    }

    return {
        label,
        path: filePath,
        required,
        kind,
        exists,
        entryCount,
    };
}

function describeMediaReadiness({ label, localDir, remoteBaseUrl, remoteEnvVar }) {
    const localStatus = describePathStatus(localDir, { label, required: false, kind: "directory" });
    const localFilesReady = Boolean(localStatus.exists && (localStatus.entryCount || 0) > 0);
    const remoteConfigured = Boolean(remoteBaseUrl);

    return {
        label,
        localPath: localDir,
        localDirectoryExists: localStatus.exists,
        localFileCount: localStatus.entryCount || 0,
        remoteConfigured,
        remoteBaseUrl: remoteBaseUrl || null,
        remoteEnvVar,
        ready: localFilesReady || remoteConfigured,
    };
}

function buildDoctorStatus(config) {
    return {
        audioEnabled: config.enableAudio !== false,
        required: [
            describePathStatus(config.jlptJsonPath, { label: "JLPT dataset", required: true }),
            describePathStatus(config.kradfilePath, { label: "KRADFILE", required: true }),
        ],
        optionalDatasets: [
            describePathStatus(config.sentenceCorpusPath, { label: "Sentence corpus", required: false }),
            describePathStatus(config.curatedStudyDataPath, { label: "Curated study data", required: false }),
        ],
        mediaSources: [
            describePathStatus(config.strokeOrderImageSourceDir, { label: "Stroke-order images", required: false, kind: "directory" }),
            describePathStatus(config.strokeOrderAnimationSourceDir, { label: "Stroke-order animations", required: false, kind: "directory" }),
            ...(config.enableAudio === false ? [] : [describePathStatus(config.audioSourceDir, { label: "Audio sources", required: false, kind: "directory" })]),
        ],
        mediaReadiness: [
            describeMediaReadiness({
                label: "Stroke-order images",
                localDir: config.strokeOrderImageSourceDir,
                remoteBaseUrl: config.remoteStrokeOrderImageBaseUrl,
                remoteEnvVar: "REMOTE_STROKE_ORDER_IMAGE_BASE_URL",
            }),
            describeMediaReadiness({
                label: "Stroke-order animations",
                localDir: config.strokeOrderAnimationSourceDir,
                remoteBaseUrl: config.remoteStrokeOrderAnimationBaseUrl,
                remoteEnvVar: "REMOTE_STROKE_ORDER_ANIMATION_BASE_URL",
            }),
            ...(config.enableAudio === false ? [] : [describeMediaReadiness({
                label: "Audio",
                localDir: config.audioSourceDir,
                remoteBaseUrl: config.remoteAudioBaseUrl,
                remoteEnvVar: "REMOTE_AUDIO_BASE_URL",
            })]),
        ],
    };
}

async function buildDoctorReport({
    config,
    buildCoverageSummaryFn = buildCoverageSummary,
    buildCuratedStudySummaryFn = buildCuratedStudySummary,
    buildMediaCoverageSummaryFn = buildMediaCoverageSummary,
    buildCardQualitySummaryFn = buildCardQualitySummary,
    buildLevelReadinessReportFn = buildLevelReadinessReport,
    loadSentenceCorpusFn = loadSentenceCorpus,
    loadCuratedStudyDataFn = loadCuratedStudyData,
}) {
    const status = buildDoctorStatus(config);
    const requiredReady = status.required.every((entry) => entry.exists);
    const sentenceCorpus = status.optionalDatasets[0].exists ? loadSentenceCorpusFn(config.sentenceCorpusPath) : [];
    const curatedStudyData = status.optionalDatasets[1].exists ? loadCuratedStudyDataFn(config.curatedStudyDataPath) : {};

    let jlptOnlyJson = {};
    if (requiredReady) {
        jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    }

    const sentenceCoverage = requiredReady
        ? buildCoverageSummaryFn({ jlptOnlyJson, sentenceCorpus, curatedStudyData })
        : null;
    const curatedCoverage = requiredReady
        ? buildCuratedStudySummaryFn({ jlptOnlyJson, curatedStudyData })
        : null;
    const mediaCoverage = requiredReady
        ? await buildMediaCoverageSummaryFn({ jlptOnlyJson, mediaRootDir: config.mediaRootDir })
        : null;
    const cardQuality = requiredReady
        ? buildCardQualitySummaryFn({ jlptOnlyJson, sentenceCorpus, curatedStudyData, levels: [5, 4, 3, 2, 1] })
        : null;
    const levelReadiness = requiredReady
        ? buildLevelReadinessReportFn({
            sentenceCoverage,
            curatedCoverage,
            mediaCoverage,
            cardQuality,
            levels: [5, 4, 3, 2, 1],
            thresholds: buildDefaultQualityThresholds({ audioEnabled: config.enableAudio !== false }),
        })
        : null;

    const nextSteps = [];
    if (!status.required[0].exists) {
        nextSteps.push(`Add the JLPT dataset at ${config.jlptJsonPath}.`);
    }
    if (!status.required[1].exists) {
        nextSteps.push(`Add KRADFILE at ${config.kradfilePath}.`);
    }
    if (requiredReady && !status.optionalDatasets[0].exists) {
        nextSteps.push(`Add an optional sentence corpus at ${config.sentenceCorpusPath} to improve example selection.`);
    }
    if (requiredReady && !status.optionalDatasets[1].exists) {
        nextSteps.push(`Add curated study data at ${config.curatedStudyDataPath} to override meanings, notes, and sentences.`);
    }

    for (const entry of status.mediaReadiness) {
        if (requiredReady && !entry.ready) {
            nextSteps.push(`Add ${entry.label.toLowerCase()} files at ${entry.localPath} or set ${entry.remoteEnvVar} to enable fallback acquisition.`);
        }
    }

    if (requiredReady && mediaCoverage && mediaCoverage.strokeOrderCoverageRatio < 1) {
        nextSteps.push(`Add stroke-order assets or configure remote fallbacks. Current stroke-order coverage is ${(mediaCoverage.strokeOrderCoverageRatio * 100).toFixed(1)}%.`);
    }
    if (config.enableAudio !== false && requiredReady && mediaCoverage && mediaCoverage.audioCoverageRatio < 1) {
        nextSteps.push(`Add audio assets or configure remote fallbacks. Current audio coverage is ${(mediaCoverage.audioCoverageRatio * 100).toFixed(1)}%.`);
    }
    if (requiredReady && sentenceCoverage && sentenceCoverage.coverageRatio < 1) {
        nextSteps.push(`Improve sentence coverage for missing kanji, starting with JLPT N${sentenceCoverage.missingByPriority[0]?.level || 5}.`);
    }
    if (requiredReady && curatedCoverage && curatedCoverage.coverageRatio < 1) {
        nextSteps.push(`Curate high-priority kanji notes or meanings. Current curated coverage is ${(curatedCoverage.coverageRatio * 100).toFixed(1)}%.`);
    }
    if (requiredReady && levelReadiness && !levelReadiness.overallReady) {
        const weakest = levelReadiness.weakestLevels?.[0];
        if (weakest) {
            nextSteps.push(`Raise JLPT N${weakest.level} to the quality gate first. It is currently failing ${weakest.failingChecks.join(", ")}.`);
            if (Array.isArray(weakest.qualityFailingChecks) && weakest.qualityFailingChecks.length > 0) {
                nextSteps.push(`Improve offline card quality for JLPT N${weakest.level}. Current quality issues: ${weakest.qualityFailingChecks.join(", ")}.`);
            }
        }
    }
    if (nextSteps.length === 0) {
        nextSteps.push("Core datasets and media coverage look healthy. The next user-facing step is previewing cards and packaging an import-ready deck.");
    }

    return {
        generatedAt: new Date().toISOString(),
        ready: requiredReady,
        status,
        coverage: {
            sentenceCorpus: sentenceCoverage,
            curatedStudyData: curatedCoverage,
            media: mediaCoverage,
        },
        quality: {
            levelReadiness,
            cardQuality,
        },
        nextSteps,
    };
}

function formatPercent(value) {
    if (typeof value !== "number") {
        return "n/a";
    }

    return `${(value * 100).toFixed(1)}%`;
}

function formatPathLine(entry) {
    const requirement = entry.required ? "required" : "optional";
    const state = entry.exists ? "present" : "missing";
    const count = entry.kind === "directory" && entry.exists
        ? ` (${entry.entryCount} file${entry.entryCount === 1 ? "" : "s"})`
        : "";

    return `- ${entry.label}: ${state} [${requirement}]${count}\n  ${entry.path}`;
}

function formatMediaReadinessLine(entry) {
    const localState = entry.localDirectoryExists
        ? `${entry.localFileCount} local file${entry.localFileCount === 1 ? "" : "s"}`
        : "local directory missing";
    const remoteState = entry.remoteConfigured
        ? `remote fallback configured (${entry.remoteEnvVar})`
        : `remote fallback not configured (${entry.remoteEnvVar})`;
    const readiness = entry.ready ? "ready" : "not ready";

    return `- ${entry.label}: ${readiness}; ${localState}; ${remoteState}`;
}

function formatDoctorReport(report) {
    const lines = [];

    lines.push("Japanese Kanji Builder Doctor");
    lines.push("");
    lines.push(`Overall status: ${report.ready ? "ready for core builds" : "missing required setup"}`);
    lines.push("");
    lines.push("Required inputs:");
    for (const entry of report.status.required) {
        lines.push(formatPathLine(entry));
    }
    lines.push("");
    lines.push("Optional study datasets:");
    for (const entry of report.status.optionalDatasets) {
        lines.push(formatPathLine(entry));
    }
    lines.push("");
    lines.push("Media source folders:");
    for (const entry of report.status.mediaSources) {
        lines.push(formatPathLine(entry));
    }
    lines.push("");
    lines.push("Media acquisition readiness:");
    for (const entry of report.status.mediaReadiness) {
        lines.push(formatMediaReadinessLine(entry));
    }

    if (report.coverage.sentenceCorpus || report.coverage.curatedStudyData || report.coverage.media) {
        lines.push("");
        lines.push("Coverage snapshot:");
        if (report.coverage.sentenceCorpus) {
            lines.push(`- Sentence support: ${formatPercent(report.coverage.sentenceCorpus.coverageRatio)} (${report.coverage.sentenceCorpus.coveredKanji}/${report.coverage.sentenceCorpus.totalKanji} kanji)`);
        }
        if (report.coverage.curatedStudyData) {
            lines.push(`- Curated overrides: ${formatPercent(report.coverage.curatedStudyData.coverageRatio)} (${report.coverage.curatedStudyData.curatedKanji}/${report.coverage.curatedStudyData.totalKanji} kanji)`);
        }
        if (report.coverage.media) {
            lines.push(`- Managed stroke-order media: ${formatPercent(report.coverage.media.strokeOrderCoverageRatio)} (${report.coverage.media.strokeOrderCovered}/${report.coverage.media.totalKanji} kanji)`);
            lines.push(`- Managed animation media: ${formatPercent(report.coverage.media.trueAnimationCoverageRatio)} (${report.coverage.media.trueAnimationCovered}/${report.coverage.media.totalKanji} kanji)`);
            if (report.status.audioEnabled) {
                lines.push(`- Managed audio media: ${formatPercent(report.coverage.media.audioCoverageRatio)} (${report.coverage.media.audioCovered}/${report.coverage.media.totalKanji} kanji)`);
                lines.push(`- Managed full media coverage: ${formatPercent(report.coverage.media.fullMediaCoverageRatio)} (${report.coverage.media.fullMediaCovered}/${report.coverage.media.totalKanji} kanji)`);
            }
        }
    }

    if (report.quality?.levelReadiness) {
        lines.push("");
        lines.push("Level quality gates:");
        lines.push("- Uses synced managed media, not just files present in local source folders.");
        lines.push(`- Overall quality gate: ${report.quality.levelReadiness.overallReady ? "passing" : "failing"}`);
        const includeAudio = report.quality.levelReadiness.thresholds.audioCoverage != null;
        for (const row of report.quality.levelReadiness.levels) {
            const metricParts = [
                `sentence ${formatPercent(row.metrics.sentenceCoverage)}`,
                `curated ${formatPercent(row.metrics.curatedCoverage)}`,
                `stroke-order ${formatPercent(row.metrics.strokeOrderCoverage)}`,
            ];
            if (includeAudio) {
                metricParts.push(`audio ${formatPercent(row.metrics.audioCoverage)}`);
                metricParts.push(`full media ${formatPercent(row.metrics.fullMediaCoverage)}`);
            }
            lines.push(`- N${row.level}: ${row.ready ? "ready" : "needs work"}; ${metricParts.join(", ")}`);
            lines.push(`  Card quality: readings ${formatPercent(row.cardQuality.metrics.readingCoverage)}, meanings ${formatPercent(row.cardQuality.metrics.meaningCoverage)}, examples ${formatPercent(row.cardQuality.metrics.exampleCoverage)}, contextual notes ${formatPercent(row.cardQuality.metrics.contextualNotesCoverage)}, generic fallback notes ${formatPercent(row.cardQuality.metrics.genericNotesFallbackRatio)}`);
            if (Array.isArray(row.cardQuality.failingChecks) && row.cardQuality.failingChecks.length > 0) {
                lines.push(`  Quality checks: ${row.cardQuality.failingChecks.join(", ")}`);
            }
        }
    }

    lines.push("");
    lines.push("Next steps:");
    for (const step of report.nextSteps) {
        lines.push(`- ${step}`);
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildDoctorReport,
    buildDoctorStatus,
    formatDoctorReport,
};

