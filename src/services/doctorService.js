const fs = require("node:fs");

const { buildCuratedStudySummary } = require("../datasets/curatedStudyCoverage");
const { buildMediaCoverageSummary } = require("../datasets/mediaCoverage");
const { buildCoverageSummary } = require("../datasets/sentenceCorpusCoverage");
const { loadCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadSentenceCorpus } = require("../datasets/sentenceCorpus");

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

function buildDoctorStatus(config) {
    return {
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
            describePathStatus(config.audioSourceDir, { label: "Audio sources", required: false, kind: "directory" }),
        ],
    };
}

async function buildDoctorReport({
    config,
    buildCoverageSummaryFn = buildCoverageSummary,
    buildCuratedStudySummaryFn = buildCuratedStudySummary,
    buildMediaCoverageSummaryFn = buildMediaCoverageSummary,
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
    if (requiredReady && mediaCoverage && mediaCoverage.strokeOrderCoverageRatio < 1) {
        nextSteps.push(`Add stroke-order assets or configure remote fallbacks. Current stroke-order coverage is ${(mediaCoverage.strokeOrderCoverageRatio * 100).toFixed(1)}%.`);
    }
    if (requiredReady && mediaCoverage && mediaCoverage.audioCoverageRatio < 1) {
        nextSteps.push(`Add audio assets or configure remote fallbacks. Current audio coverage is ${(mediaCoverage.audioCoverageRatio * 100).toFixed(1)}%.`);
    }
    if (requiredReady && sentenceCoverage && sentenceCoverage.coverageRatio < 1) {
        nextSteps.push(`Improve sentence coverage for missing kanji, starting with JLPT N${sentenceCoverage.missingByPriority[0]?.level || 5}.`);
    }
    if (requiredReady && curatedCoverage && curatedCoverage.coverageRatio < 1) {
        nextSteps.push(`Curate high-priority kanji notes or meanings. Current curated coverage is ${(curatedCoverage.coverageRatio * 100).toFixed(1)}%.`);
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
            lines.push(`- Stroke-order media: ${formatPercent(report.coverage.media.strokeOrderCoverageRatio)} (${report.coverage.media.strokeOrderCovered}/${report.coverage.media.totalKanji} kanji)`);
            lines.push(`- Audio media: ${formatPercent(report.coverage.media.audioCoverageRatio)} (${report.coverage.media.audioCovered}/${report.coverage.media.totalKanji} kanji)`);
            lines.push(`- Full media coverage: ${formatPercent(report.coverage.media.fullMediaCoverageRatio)} (${report.coverage.media.fullMediaCovered}/${report.coverage.media.totalKanji} kanji)`);
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

