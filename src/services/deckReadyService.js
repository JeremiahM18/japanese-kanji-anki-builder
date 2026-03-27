function formatCount(value) {
    return Number.isFinite(value) ? String(value) : "0";
}

function formatDeckReadyReport(summary, doctorReport = null) {
    const packageSummary = summary.package || {};
    const mediaCounts = packageSummary.mediaCounts || {
        strokeOrder: 0,
        strokeOrderImage: 0,
        strokeOrderAnimation: 0,
        audio: 0,
    };

    const lines = [];
    lines.push("Japanese Kanji Builder Deck Ready");
    lines.push("");
    lines.push(`Output directory: ${summary.outDir}`);
    lines.push(`Package directory: ${packageSummary.rootDir || "n/a"}`);
    lines.push(`Levels: ${(summary.levels || []).map((level) => `N${level}`).join(", ") || "n/a"}`);
    lines.push(`Exports generated: ${formatCount(packageSummary.exportCount ?? summary.exports?.length)}`);
    lines.push(`Unique packaged media files: ${formatCount(packageSummary.mediaAssetCount)}`);
    lines.push("");
    lines.push("Packaged media by field:");
    lines.push(`- Stroke-order field references: ${formatCount(mediaCounts.strokeOrder)}`);
    lines.push(`- Stroke-order images: ${formatCount(mediaCounts.strokeOrderImage)}`);
    lines.push(`- Stroke-order animations: ${formatCount(mediaCounts.strokeOrderAnimation)}`);
    lines.push(`- Audio fields: ${formatCount(mediaCounts.audio)}`);

    if (doctorReport?.status?.mediaReadiness) {
        lines.push("");
        lines.push("Acquisition readiness:");
        for (const entry of doctorReport.status.mediaReadiness) {
            lines.push(`- ${entry.label}: ${entry.ready ? "ready" : "not ready"}`);
        }
    }

    lines.push("");
    lines.push("Coverage snapshot:");
    lines.push(`- Stroke-order coverage: ${((summary.coverage?.strokeOrder || 0) * 100).toFixed(1)}%`);
    lines.push(`- Audio coverage: ${((summary.coverage?.audio || 0) * 100).toFixed(1)}%`);
    lines.push(`- Full media coverage: ${((summary.coverage?.fullMedia || 0) * 100).toFixed(1)}%`);

    lines.push("");
    if ((packageSummary.mediaAssetCount || 0) === 0) {
        lines.push("Next step: add local media sources or configure remote fallback providers, then rerun `npm run deck:ready`.");
    } else {
        lines.push("Next step: import the TSV from the package exports folder and copy the packaged media into Anki's `collection.media` directory.");
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    formatDeckReadyReport,
};
