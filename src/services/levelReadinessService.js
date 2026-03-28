function buildDefaultQualityThresholds({ audioEnabled = true } = {}) {
    return {
        sentenceCoverage: 0.9,
        curatedCoverage: 0.6,
        strokeOrderCoverage: 0.9,
        audioCoverage: audioEnabled ? 0.75 : null,
        fullMediaCoverage: audioEnabled ? 0.75 : null,
    };
}

function buildDefaultCardQualityThresholds() {
    return {
        readingCoverage: 1,
        meaningCoverage: 0.98,
        exampleCoverage: 0.9,
        contextualNotesCoverage: 0.9,
    };
}

function toLevelMap(rows = [], keyField = "level") {
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [row[keyField], row]));
}

function buildCheck({ label, actual, threshold }) {
    return {
        label,
        actual: typeof actual === "number" ? Number(actual.toFixed(4)) : 0,
        threshold,
        passed: actual >= threshold,
    };
}

function buildCardQualityChecks(metrics, thresholds) {
    return [
        buildCheck({ label: "local reading coverage", actual: metrics.readingCoverage || 0, threshold: thresholds.readingCoverage }),
        buildCheck({ label: "local meaning coverage", actual: metrics.meaningCoverage || 0, threshold: thresholds.meaningCoverage }),
        buildCheck({ label: "local example coverage", actual: metrics.exampleCoverage || 0, threshold: thresholds.exampleCoverage }),
        buildCheck({ label: "contextual notes coverage", actual: metrics.contextualNotesCoverage || 0, threshold: thresholds.contextualNotesCoverage }),
    ];
}

function buildLevelReadinessReport({
    sentenceCoverage = null,
    curatedCoverage = null,
    mediaCoverage = null,
    cardQuality = null,
    levels = [5, 4, 3, 2, 1],
    thresholds = buildDefaultQualityThresholds(),
    cardQualityThresholds = buildDefaultCardQualityThresholds(),
} = {}) {
    const sentenceLevels = toLevelMap(sentenceCoverage?.levels);
    const curatedLevels = toLevelMap(curatedCoverage?.levels);
    const mediaLevels = toLevelMap(mediaCoverage?.levels);
    const cardQualityLevels = toLevelMap(cardQuality?.levels);
    const normalizedLevels = [...new Set((Array.isArray(levels) ? levels : [5, 4, 3, 2, 1]).filter((level) => Number.isInteger(level)))];

    const rows = normalizedLevels.map((level) => {
        const sentenceRow = sentenceLevels.get(level) || { totalKanji: 0, coveredKanji: 0, coverageRatio: 0, sampleMissing: [] };
        const curatedRow = curatedLevels.get(level) || { totalKanji: sentenceRow.totalKanji, curatedKanji: 0, coverageRatio: 0, sampleMissing: [] };
        const mediaRow = mediaLevels.get(level) || {
            totalKanji: sentenceRow.totalKanji,
            strokeOrderCovered: 0,
            audioCovered: 0,
            fullMediaCovered: 0,
            strokeOrderCoverageRatio: 0,
            audioCoverageRatio: 0,
            fullMediaCoverageRatio: 0,
            sampleMissing: [],
        };
        const cardQualityRow = cardQualityLevels.get(level) || {
            totalKanji: sentenceRow.totalKanji,
            readingCovered: 0,
            meaningCovered: 0,
            exampleCovered: 0,
            contextualNotesCovered: 0,
            genericNotesFallback: 0,
            readingCoverageRatio: 0,
            meaningCoverageRatio: 0,
            exampleCoverageRatio: 0,
            contextualNotesCoverageRatio: 0,
            genericNotesFallbackRatio: 0,
            sampleMissing: { reading: [], meaning: [], example: [], contextualNotes: [] },
        };

        const checks = [
            buildCheck({ label: "sentence coverage", actual: sentenceRow.coverageRatio || 0, threshold: thresholds.sentenceCoverage }),
            buildCheck({ label: "curated coverage", actual: curatedRow.coverageRatio || 0, threshold: thresholds.curatedCoverage }),
            buildCheck({ label: "stroke-order coverage", actual: mediaRow.strokeOrderCoverageRatio || 0, threshold: thresholds.strokeOrderCoverage }),
            thresholds.audioCoverage == null ? null : buildCheck({ label: "audio coverage", actual: mediaRow.audioCoverageRatio || 0, threshold: thresholds.audioCoverage }),
            thresholds.fullMediaCoverage == null ? null : buildCheck({ label: "full media coverage", actual: mediaRow.fullMediaCoverageRatio || 0, threshold: thresholds.fullMediaCoverage }),
        ].filter(Boolean);

        const qualityChecks = buildCardQualityChecks({
            readingCoverage: cardQualityRow.readingCoverageRatio || 0,
            meaningCoverage: cardQualityRow.meaningCoverageRatio || 0,
            exampleCoverage: cardQualityRow.exampleCoverageRatio || 0,
            contextualNotesCoverage: cardQualityRow.contextualNotesCoverageRatio || 0,
        }, cardQualityThresholds);

        const passedChecks = checks.filter((check) => check.passed).length;
        const failingChecks = checks.filter((check) => !check.passed);
        const readinessScore = checks.length > 0 ? Number((passedChecks / checks.length).toFixed(4)) : 0;

        return {
            level,
            ready: failingChecks.length === 0,
            readinessScore,
            totalKanji: sentenceRow.totalKanji || curatedRow.totalKanji || mediaRow.totalKanji || cardQualityRow.totalKanji || 0,
            metrics: {
                sentenceCoverage: sentenceRow.coverageRatio || 0,
                curatedCoverage: curatedRow.coverageRatio || 0,
                strokeOrderCoverage: mediaRow.strokeOrderCoverageRatio || 0,
                audioCoverage: mediaRow.audioCoverageRatio || 0,
                fullMediaCoverage: mediaRow.fullMediaCoverageRatio || 0,
            },
            counts: {
                sentenceCovered: sentenceRow.coveredKanji || 0,
                curatedCovered: curatedRow.curatedKanji || 0,
                strokeOrderCovered: mediaRow.strokeOrderCovered || 0,
                audioCovered: mediaRow.audioCovered || 0,
                fullMediaCovered: mediaRow.fullMediaCovered || 0,
            },
            cardQuality: {
                metrics: {
                    readingCoverage: cardQualityRow.readingCoverageRatio || 0,
                    meaningCoverage: cardQualityRow.meaningCoverageRatio || 0,
                    exampleCoverage: cardQualityRow.exampleCoverageRatio || 0,
                    contextualNotesCoverage: cardQualityRow.contextualNotesCoverageRatio || 0,
                    genericNotesFallbackRatio: cardQualityRow.genericNotesFallbackRatio || 0,
                },
                counts: {
                    readingCovered: cardQualityRow.readingCovered || 0,
                    meaningCovered: cardQualityRow.meaningCovered || 0,
                    exampleCovered: cardQualityRow.exampleCovered || 0,
                    contextualNotesCovered: cardQualityRow.contextualNotesCovered || 0,
                    genericNotesFallback: cardQualityRow.genericNotesFallback || 0,
                },
                checks: qualityChecks,
                failingChecks: qualityChecks.filter((check) => !check.passed).map((check) => check.label),
                sampleMissing: cardQualityRow.sampleMissing || { reading: [], meaning: [], example: [], contextualNotes: [] },
            },
            checks,
            failingChecks: failingChecks.map((check) => check.label),
            sampleMissing: {
                sentence: sentenceRow.sampleMissing || [],
                curated: curatedRow.sampleMissing || [],
                media: (mediaRow.sampleMissing || []).slice(0, 10),
            },
        };
    }).sort((a, b) => a.level - b.level);

    const readyLevels = rows.filter((row) => row.ready).map((row) => row.level);
    const weakestLevels = [...rows]
        .sort((a, b) => a.readinessScore - b.readinessScore || b.level - a.level)
        .slice(0, 3)
        .map((row) => ({
            level: row.level,
            readinessScore: row.readinessScore,
            failingChecks: row.failingChecks,
            qualityFailingChecks: row.cardQuality.failingChecks,
        }));

    return {
        thresholds,
        cardQualityThresholds,
        overallReady: rows.length > 0 && rows.every((row) => row.ready),
        readyLevels,
        levels: rows,
        weakestLevels,
    };
}

function formatPercent(value) {
    return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatCardQualityMetricsLine(metrics = {}) {
    return `Card quality: readings ${formatPercent(metrics.readingCoverage)}, meanings ${formatPercent(metrics.meaningCoverage)}, examples ${formatPercent(metrics.exampleCoverage)}, contextual notes ${formatPercent(metrics.contextualNotesCoverage)}, generic fallback notes ${formatPercent(metrics.genericNotesFallbackRatio)}`;
}

function formatLevelReadinessReport(report) {
    const lines = [];

    lines.push("Japanese Kanji Builder Level Readiness");
    lines.push("");
    lines.push(`Overall quality gate: ${report.overallReady ? "passing" : "failing"}`);
    lines.push("Thresholds:");
    lines.push(`- Sentence coverage: ${formatPercent(report.thresholds.sentenceCoverage)}`);
    lines.push(`- Curated coverage: ${formatPercent(report.thresholds.curatedCoverage)}`);
    lines.push(`- Stroke-order coverage: ${formatPercent(report.thresholds.strokeOrderCoverage)}`);
    if (report.thresholds.audioCoverage != null) {
        lines.push(`- Audio coverage: ${formatPercent(report.thresholds.audioCoverage)}`);
        lines.push(`- Full media coverage: ${formatPercent(report.thresholds.fullMediaCoverage)}`);
    }

    lines.push("");
    lines.push("Card quality diagnostics:");
    lines.push(`- Local reading coverage target: ${formatPercent(report.cardQualityThresholds.readingCoverage)}`);
    lines.push(`- Local meaning coverage target: ${formatPercent(report.cardQualityThresholds.meaningCoverage)}`);
    lines.push(`- Local example coverage target: ${formatPercent(report.cardQualityThresholds.exampleCoverage)}`);
    lines.push(`- Contextual notes coverage target: ${formatPercent(report.cardQualityThresholds.contextualNotesCoverage)}`);

    if (Array.isArray(report.weakestLevels) && report.weakestLevels.length > 0) {
        lines.push("");
        lines.push("Weakest levels:");
        for (const entry of report.weakestLevels) {
            const qualityTail = Array.isArray(entry.qualityFailingChecks) && entry.qualityFailingChecks.length > 0
                ? `; quality: ${entry.qualityFailingChecks.join(", ")}`
                : "";
            lines.push(`- N${entry.level}: ${(entry.readinessScore * 100).toFixed(1)}% checks passing (${entry.failingChecks.join(", ") || "none"})${qualityTail}`);
        }
    }

    lines.push("");
    lines.push("Level readiness:");
    for (const row of report.levels || []) {
        lines.push(`- N${row.level}: ${row.ready ? "ready" : "needs work"}; ${(row.readinessScore * 100).toFixed(1)}% checks passing`);
        const metricParts = [
            `Sentence ${formatPercent(row.metrics.sentenceCoverage)}`,
            `curated ${formatPercent(row.metrics.curatedCoverage)}`,
            `stroke-order ${formatPercent(row.metrics.strokeOrderCoverage)}`,
        ];
        if (report.thresholds.audioCoverage != null) {
            metricParts.push(`audio ${formatPercent(row.metrics.audioCoverage)}`);
            metricParts.push(`full media ${formatPercent(row.metrics.fullMediaCoverage)}`);
        }
        lines.push(`  ${metricParts.join(", ")}`);
        lines.push(`  ${formatCardQualityMetricsLine(row.cardQuality.metrics)}`);
        if (row.failingChecks.length > 0) {
            lines.push(`  Failing checks: ${row.failingChecks.join(", ")}`);
        }
        if (row.cardQuality.failingChecks.length > 0) {
            lines.push(`  Quality checks: ${row.cardQuality.failingChecks.join(", ")}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildDefaultCardQualityThresholds,
    buildDefaultQualityThresholds,
    buildLevelReadinessReport,
    formatCardQualityMetricsLine,
    formatLevelReadinessReport,
};
