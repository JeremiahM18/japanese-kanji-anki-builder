const fs = require("node:fs");
const path = require("node:path");

function listManifestPaths(mediaRootDir) {
    const kanjiRoot = path.join(mediaRootDir, "kanji");
    if (!fs.existsSync(kanjiRoot)) {
        return [];
    }

    const results = [];
    const queue = [kanjiRoot];

    while (queue.length > 0) {
        const current = queue.shift();
        const entries = fs.readdirSync(current, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                queue.push(fullPath);
                continue;
            }

            if (entry.isFile() && entry.name === "manifest.json") {
                results.push(fullPath);
            }
        }
    }

    return results.sort((a, b) => a.localeCompare(b));
}

function buildAudioPolicyAuditReport({ mediaRootDir, audioSourcePolicy, remoteAudioBaseUrl = null }) {
    const manifestPaths = listManifestPaths(mediaRootDir);
    const releasePolicy = audioSourcePolicy.releaseAudio;
    const allowedSources = new Set(releasePolicy.allowedSourceIds || []);
    const allowedCategories = new Set(releasePolicy.allowedCategories || []);
    const requiredSpeakerName = String(releasePolicy.primarySpeakerName || "").trim();
    const sourceCounts = {};
    const violatingAssets = [];
    const uniqueSources = new Set();
    const deckCategories = new Set();
    let totalAudioAssets = 0;

    for (const manifestPath of manifestPaths) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const audioAssets = Array.isArray(manifest?.assets?.audio) ? manifest.assets.audio : [];

        for (const asset of audioAssets) {
            totalAudioAssets += 1;
            const source = String(asset?.source || "unknown");
            const category = String(asset?.category || "");
            uniqueSources.add(source);
            if (category) {
                deckCategories.add(category);
            }
            sourceCounts[source] = (sourceCounts[source] || 0) + 1;

            const violations = [];
            if (!allowedSources.has(source)) {
                violations.push("disallowed-source");
            }
            if (releasePolicy.requireVoiceMetadata && !String(asset?.voice || "").trim()) {
                violations.push("missing-voice");
            } else if (requiredSpeakerName && !String(asset?.voice || "").startsWith(`${requiredSpeakerName} /`) && String(asset?.voice || "").trim() !== requiredSpeakerName) {
                violations.push("wrong-speaker");
            }
            if (releasePolicy.requiredLocale && asset?.locale !== releasePolicy.requiredLocale) {
                violations.push("wrong-locale");
            }
            if (!allowedCategories.has(category)) {
                violations.push("disallowed-category");
            }

            if (violations.length > 0) {
                violatingAssets.push({
                    kanji: manifest.kanji,
                    path: asset.path,
                    source,
                    category,
                    voice: asset.voice || "",
                    locale: asset.locale || "",
                    violations,
                });
            }
        }
    }

    const mixedReleaseSources = releasePolicy.requireSingleSourcePerDeck && uniqueSources.size > 1;
    const remoteAudioConfigured = Boolean(remoteAudioBaseUrl);
    const remoteAudioViolation = remoteAudioConfigured && releasePolicy.remoteAudioProvidersAllowed === false;

    return {
        mediaRootDir,
        manifestCount: manifestPaths.length,
        totalAudioAssets,
        sourceCounts,
        uniqueSources: [...uniqueSources].sort((a, b) => a.localeCompare(b)),
        categories: [...deckCategories].sort((a, b) => a.localeCompare(b)),
        mixedReleaseSources,
        remoteAudioConfigured,
        remoteAudioViolation,
        violatingAssets,
        valid: !mixedReleaseSources && !remoteAudioViolation && violatingAssets.length === 0,
    };
}

function formatAudioPolicyAuditReport(report, policy) {
    const lines = [];
    lines.push("Japanese Kanji Builder Audio Policy Audit");
    lines.push("");
    lines.push(`Policy: ${policy.policyPath}`);
    lines.push(`Managed media root: ${report.mediaRootDir}`);
    lines.push(`Managed manifests scanned: ${report.manifestCount}`);
    lines.push(`Managed audio assets: ${report.totalAudioAssets}`);
    lines.push(`Allowed release source(s): ${(policy.releaseAudio.allowedSourceIds || []).join(", ")}`);
    lines.push(`Required speaker: ${policy.releaseAudio.primarySpeakerName} (style id ${policy.releaseAudio.primarySpeakerId})`);
    lines.push(`Required locale: ${policy.releaseAudio.requiredLocale}`);
    lines.push(`Allowed categories: ${(policy.releaseAudio.allowedCategories || []).join(", ")}`);
    lines.push(`Remote audio configured: ${report.remoteAudioConfigured ? "yes" : "no"}`);
    lines.push(`Release audio policy: ${report.valid ? "passing" : "failing"}`);

    if (Object.keys(report.sourceCounts).length > 0) {
        lines.push("");
        lines.push("Source counts:");
        for (const [source, count] of Object.entries(report.sourceCounts).sort((a, b) => a[0].localeCompare(b[0]))) {
            lines.push(`- ${source}: ${count}`);
        }
    }

    if (report.mixedReleaseSources) {
        lines.push("");
        lines.push("Violation: managed audio currently mixes more than one release source.");
    }

    if (report.remoteAudioViolation) {
        lines.push("");
        lines.push("Violation: remote audio provider is configured even though the release policy forbids remote audio.");
    }

    if (report.violatingAssets.length > 0) {
        lines.push("");
        lines.push("Violating assets:");
        for (const row of report.violatingAssets.slice(0, 25)) {
            lines.push(`- ${row.kanji}: ${row.path} [${row.violations.join(", ")}]`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildAudioPolicyAuditReport,
    formatAudioPolicyAuditReport,
    listManifestPaths,
};
