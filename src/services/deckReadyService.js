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
    const levelReadiness = doctorReport?.quality?.levelReadiness || null;
    const audioEnabled = doctorReport?.status?.audioEnabled !== false;

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

    if (levelReadiness) {
        lines.push("");
        lines.push("Level quality gates:");
        lines.push(`- Overall quality gate: ${levelReadiness.overallReady ? "passing" : "failing"}`);
        for (const row of levelReadiness.levels.filter((entry) => (summary.levels || []).includes(entry.level))) {
            lines.push(`- N${row.level}: ${row.ready ? "ready" : "needs work"}; ${(row.readinessScore * 100).toFixed(1)}% checks passing`);
        }
    }

    lines.push("");
    if ((packageSummary.mediaAssetCount || 0) === 0) {
        lines.push("Next step: add local media sources or configure remote fallback providers, then rerun `npm run deck:ready`.");
    } else if (levelReadiness && !levelReadiness.overallReady) {
        const weakest = levelReadiness.weakestLevels?.[0];
        if (weakest) {
            lines.push(`Next step: raise JLPT N${weakest.level} above the quality gate before calling the deck truly ready.`);
        } else {
            lines.push("Next step: improve level quality gate coverage before calling the deck truly ready.");
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
