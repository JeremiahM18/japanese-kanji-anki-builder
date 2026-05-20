const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");

function countByStatus(entries = {}) {
    return Object.values(entries).reduce((counts, entry) => {
        const status = entry?.status || "unknown";
        counts[status] = (counts[status] || 0) + 1;
        return counts;
    }, {});
}

function buildNlpModelGovernanceReport({
    manifestPath = buildDefaultNlpModelManifestPath(),
    loadManifestFn = loadNlpModelManifest,
} = {}) {
    const manifest = loadManifestFn(manifestPath);
    const runtimes = Object.entries(manifest.runtimes || {}).map(([id, runtime]) => ({ id, ...runtime }));
    const models = Object.entries(manifest.models || {}).map(([id, model]) => ({ id, ...model }));
    const activeModels = models.filter((model) => model.status === "active");

    return {
        generatedAt: new Date().toISOString(),
        passed: true,
        manifestPath: manifest.manifestPath || manifestPath,
        policy: manifest.policy,
        counts: {
            runtimes: runtimes.length,
            models: models.length,
            activeModels: activeModels.length,
            runtimesByStatus: countByStatus(manifest.runtimes),
            modelsByStatus: countByStatus(manifest.models),
        },
        runtimes,
        models,
        releaseBoundary: {
            modelOutputsAreCertificationEvidence: false,
            modelOutputsMayWriteTrackedTemplatesDirectly: false,
            promotionRequiresHumanReview: manifest.policy.promotionPolicy === "human_review_required",
        },
    };
}

function formatStatusCounts(counts = {}) {
    const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) {
        return "none";
    }
    return entries.map(([status, count]) => `${status}=${count}`).join(", ");
}

function formatNlpModelGovernanceReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Model Governance Audit",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Manifest: ${report.manifestPath || "unknown"}`,
        `Policy authority: ${report.policy?.authority || "unknown"}`,
        `Promotion policy: ${report.policy?.promotionPolicy || "unknown"}`,
        "",
        "Counts:",
        `- runtimes: ${report.counts?.runtimes || 0} (${formatStatusCounts(report.counts?.runtimesByStatus)})`,
        `- models: ${report.counts?.models || 0} (${formatStatusCounts(report.counts?.modelsByStatus)})`,
        `- active models: ${report.counts?.activeModels || 0}`,
        "",
        "Release boundary:",
        `- model outputs certify cards: ${report.releaseBoundary?.modelOutputsAreCertificationEvidence ? "yes" : "no"}`,
        `- model outputs may write tracked templates directly: ${report.releaseBoundary?.modelOutputsMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`,
    ];

    if ((report.runtimes || []).length > 0) {
        lines.push("", "Runtimes:");
        for (const runtime of report.runtimes) {
            lines.push(`- ${runtime.id}: ${runtime.status}; ${runtime.runtimeType}; tasks ${runtime.allowedTasks.join(", ")}`);
        }
    }

    if ((report.models || []).length > 0) {
        lines.push("", "Models:");
        for (const model of report.models) {
            lines.push(`- ${model.id}: ${model.status}; task ${model.task}; runtime ${model.runtimeId}; uses ${model.allowedUses.join(", ") || "none"}`);
        }
    } else {
        lines.push("", "Models: none active or registered yet");
    }

    lines.push(
        "",
        "Next step: generate governed tokenization artifacts before activating any model output lane."
    );

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildNlpModelGovernanceReport,
    formatNlpModelGovernanceReport,
};
