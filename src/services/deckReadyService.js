function formatCount(value) {
    return Number.isFinite(value) ? String(value) : "0";
}

function formatPercent(value) {
    return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatDeckReadyReport(summary, doctorReport = null) {
    const packageSummary = summary.package || {};
    const mediaCounts = packageSummary.mediaCounts || {
        strokeOrder: 0,
        strokeOrderImage: 0,
        strokeOrderAnimation: 0,
        audio: 0,
    };
    const exportIssues = summary.exportIssues || { count: 0, warnings: 0, errors: 0 };
    const exportIssuesPath = summary.reports?.exportIssuesPath || "reports/export-issues.json";
    const levelReadiness = doctorReport?.quality?.levelReadiness || null;
    const audioEnabled = doctorReport?.status?.audioEnabled !== false;
    const selectedLevels = Array.isArray(summary.levels) ? summary.levels : [];
    const selectedReadinessRows = levelReadiness?.levels?.filter((entry) => selectedLevels.includes(entry.level)) || [];
    const selectedWeakestLevel = selectedReadinessRows.length > 0
        ? [...selectedReadinessRows].sort((a, b) => a.readinessScore - b.readinessScore || b.level - a.level)[0]
        : null;

    const lines = [];
    lines.push("Japanese Kanji Builder Deck Ready");
    lines.push("");
    lines.push(`Output directory: ${summary.outDir}`);
    lines.push(`Package directory: ${packageSummary.rootDir || "n/a"}`);
    if (packageSummary.ankiPackage?.filePath) {
        lines.push(`Anki package: ${packageSummary.ankiPackage.filePath}`);
    }
    lines.push(`Levels: ${(summary.levels || []).map((level) => `N${level}`).join(", ") || "n/a"}`);
    lines.push(`Exports generated: ${formatCount(packageSummary.exportCount ?? summary.exports?.length)}`);
    lines.push(`Unique packaged media files: ${formatCount(packageSummary.mediaAssetCount)}`);
    lines.push("");
    lines.push("Packaged media by field:");
    lines.push(`- Stroke-order field references: ${formatCount(mediaCounts.strokeOrder)}`);
    lines.push(`- Stroke-order images: ${formatCount(mediaCounts.strokeOrderImage)}`);
    lines.push(`- Stroke-order animation fields: ${formatCount(mediaCounts.strokeOrderAnimation)}`);
    if (audioEnabled) {
        lines.push(`- Audio fields: ${formatCount(mediaCounts.audio)}`);
    }

    if (packageSummary.ankiPackage?.skipped) {
        lines.push("");
        lines.push(`Anki package status: skipped (${packageSummary.ankiPackage.skipReason})`);
    }

    if (doctorReport?.status?.mediaReadiness) {
        lines.push("");
        lines.push("Acquisition readiness:");
        for (const entry of doctorReport.status.mediaReadiness) {
            lines.push(`- ${entry.label}: ${entry.ready ? "ready" : "not ready"}`);
        }
    }

    lines.push("");
    lines.push("Coverage snapshot:");
    lines.push(`- Stroke-order coverage: ${formatPercent(summary.coverage?.strokeOrder || 0)}`);
    lines.push(`- Animation coverage: ${formatPercent(summary.coverage?.trueAnimation || 0)}`);
    if (audioEnabled) {
        lines.push(`- Audio coverage: ${formatPercent(summary.coverage?.audio || 0)}`);
        lines.push(`- Full media coverage: ${formatPercent(summary.coverage?.fullMedia || 0)}`);
    }

    lines.push("");
    lines.push("Export health:");
    lines.push(`- Export fallback issues: ${formatCount(exportIssues.count)}`);
    if (exportIssues.count > 0) {
        lines.push(`- Fallback warnings: ${formatCount(exportIssues.warnings)}`);
        lines.push(`- Hard export errors: ${formatCount(exportIssues.errors)}`);
        lines.push(`- Export issue report: ${exportIssuesPath}`);
    }

    if (levelReadiness) {
        lines.push("");
        lines.push("Level quality gates:");
        lines.push(`- Overall quality gate: ${levelReadiness.overallReady ? "passing" : "failing"}`);
        for (const row of selectedReadinessRows) {
            lines.push(`- N${row.level}: ${row.ready ? "ready" : "needs work"}; ${(row.readinessScore * 100).toFixed(1)}% checks passing`);
        }
    }

    lines.push("");
    if (exportIssues.count > 0) {
        lines.push("Next step: inspect `reports/export-issues.json` and either fix the missing curated/local data or rerun with `--allow-export-fallbacks` only if you intentionally accept those fallback cards.");
    } else if ((packageSummary.mediaAssetCount || 0) === 0) {
        lines.push("Next step: add local media sources or configure remote fallback providers, then rerun `npm run deck:ready`.");
    } else if (selectedWeakestLevel && !selectedWeakestLevel.ready) {
        lines.push(`Next step: raise JLPT N${selectedWeakestLevel.level} above the quality gate before calling this deck truly ready.`);
    } else if (levelReadiness && !levelReadiness.overallReady) {
        const globalWeakest = levelReadiness.weakestLevels?.[0];
        if (globalWeakest) {
            lines.push(`Next step: this deck is ready, but the project-wide quality gate is still blocked by JLPT N${globalWeakest.level}. Use \`npm run deck:readiness:global\` to track the remaining levels.`);
        } else {
            lines.push("Next step: this deck is ready, but the project-wide quality gate is still failing. Use `npm run deck:readiness:global` to track the remaining levels.");
        }
    } else if (packageSummary.ankiPackage?.filePath) {
        lines.push("Next step: import the generated `.apkg` file into Anki.");
    } else {
        lines.push("Next step: import the TSV from the package exports folder and copy the packaged media into Anki's `collection.media` directory.");
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    formatDeckReadyReport,
};
