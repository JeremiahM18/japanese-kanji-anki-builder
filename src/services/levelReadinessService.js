function buildDefaultQualityThresholds() {
    return {
        sentenceCoverage: 0.9,
        curatedCoverage: 0.6,
        strokeOrderCoverage: 0.9,
        audioCoverage: 0.75,
        fullMediaCoverage: 0.75,
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

function buildLevelReadinessReport({
    sentenceCoverage = null,
    curatedCoverage = null,
    mediaCoverage = null,
    levels = [5, 4, 3, 2, 1],
    thresholds = buildDefaultQualityThresholds(),
} = {}) {
    const sentenceLevels = toLevelMap(sentenceCoverage?.levels);
    const curatedLevels = toLevelMap(curatedCoverage?.levels);
    const mediaLevels = toLevelMap(mediaCoverage?.levels);
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

        const checks = [
            buildCheck({ label: "sentence coverage", actual: sentenceRow.coverageRatio || 0, threshold: thresholds.sentenceCoverage }),
            buildCheck({ label: "curated coverage", actual: curatedRow.coverageRatio || 0, threshold: thresholds.curatedCoverage }),
            buildCheck({ label: "stroke-order coverage", actual: mediaRow.strokeOrderCoverageRatio || 0, threshold: thresholds.strokeOrderCoverage }),
            buildCheck({ label: "audio coverage", actual: mediaRow.audioCoverageRatio || 0, threshold: thresholds.audioCoverage }),
            buildCheck({ label: "full media coverage", actual: mediaRow.fullMediaCoverageRatio || 0, threshold: thresholds.fullMediaCoverage }),
        ];

        const passedChecks = checks.filter((check) => check.passed).length;
        const failingChecks = checks.filter((check) => !check.passed);
        const readinessScore = checks.length > 0 ? Number((passedChecks / checks.length).toFixed(4)) : 0;

        return {
            level,
            ready: failingChecks.length === 0,
            readinessScore,
            totalKanji: sentenceRow.totalKanji || curatedRow.totalKanji || mediaRow.totalKanji || 0,
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
        }));

    return {
        thresholds,
        overallReady: rows.length > 0 && rows.every((row) => row.ready),
        readyLevels,
        levels: rows,
        weakestLevels,
    };
}

function formatPercent(value) {
    return `${((value || 0) * 100).toFixed(1)}%`;
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
    lines.push(`- Audio coverage: ${formatPercent(report.thresholds.audioCoverage)}`);
    lines.push(`- Full media coverage: ${formatPercent(report.thresholds.fullMediaCoverage)}`);

    if (Array.isArray(report.weakestLevels) && report.weakestLevels.length > 0) {
        lines.push("");
        lines.push("Weakest levels:");
        for (const entry of report.weakestLevels) {
            lines.push(`- N${entry.level}: ${(entry.readinessScore * 100).toFixed(1)}% checks passing (${entry.failingChecks.join(", ") || "none"})`);
        }
    }

    lines.push("");
    lines.push("Level readiness:");
    for (const row of report.levels || []) {
        lines.push(`- N${row.level}: ${row.ready ? "ready" : "needs work"}; ${(row.readinessScore * 100).toFixed(1)}% checks passing`);
        lines.push(`  Sentence ${formatPercent(row.metrics.sentenceCoverage)}, curated ${formatPercent(row.metrics.curatedCoverage)}, stroke-order ${formatPercent(row.metrics.strokeOrderCoverage)}, audio ${formatPercent(row.metrics.audioCoverage)}, full media ${formatPercent(row.metrics.fullMediaCoverage)}`);
        if (row.failingChecks.length > 0) {
            lines.push(`  Failing checks: ${row.failingChecks.join(", ")}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildDefaultQualityThresholds,
    buildLevelReadinessReport,
    formatLevelReadinessReport,
};
