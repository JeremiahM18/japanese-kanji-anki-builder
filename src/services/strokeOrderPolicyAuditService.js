const fs = require("node:fs");

const { listManifestPaths } = require("./audioPolicyAuditService");

function addCount(map, key) {
    const normalized = key || "unknown";
    map[normalized] = (map[normalized] || 0) + 1;
}

function collectStrokeOrderAsset({ manifest, asset, kind, allowedSources }) {
    if (!asset) {
        return null;
    }

    const source = String(asset?.source || "unknown");
    const violations = [];
    if (!allowedSources.has(source)) {
        violations.push("disallowed-source");
    }

    return {
        kanji: manifest.kanji,
        kind,
        path: asset.path || "",
        source,
        mimeType: asset.mimeType || "",
        violations,
    };
}

function countDistinctSources(assets) {
    return new Set(assets.map((asset) => asset.source)).size;
}

function buildStrokeOrderPolicyAuditReport({
    mediaRootDir,
    strokeOrderSourcePolicy,
    remoteStrokeOrderImageBaseUrl = null,
    remoteStrokeOrderAnimationBaseUrl = null,
    remoteStrokeOrderAnimCjkBaseUrl = null,
}) {
    const manifestPaths = listManifestPaths(mediaRootDir);
    const releasePolicy = strokeOrderSourcePolicy.releaseStrokeOrder;
    const allowedImageSources = new Set(releasePolicy.allowedImageSourceIds || []);
    const allowedAnimationSources = new Set(releasePolicy.allowedAnimationSourceIds || []);
    const sourceCounts = {
        image: {},
        animation: {},
    };
    const imageAssets = [];
    const animationAssets = [];
    const violatingAssets = [];

    for (const manifestPath of manifestPaths) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const imageAsset = collectStrokeOrderAsset({
            manifest,
            asset: manifest?.assets?.strokeOrderImage,
            kind: "image",
            allowedSources: allowedImageSources,
        });
        const animationAsset = collectStrokeOrderAsset({
            manifest,
            asset: manifest?.assets?.strokeOrderAnimation,
            kind: "animation",
            allowedSources: allowedAnimationSources,
        });

        if (imageAsset) {
            imageAssets.push(imageAsset);
            addCount(sourceCounts.image, imageAsset.source);
            if (imageAsset.violations.length > 0) {
                violatingAssets.push(imageAsset);
            }
        }

        if (animationAsset) {
            animationAssets.push(animationAsset);
            addCount(sourceCounts.animation, animationAsset.source);
            if (animationAsset.violations.length > 0) {
                violatingAssets.push(animationAsset);
            }
        }
    }

    const remoteImageConfigured = Boolean(remoteStrokeOrderImageBaseUrl);
    const remoteAnimationConfigured = Boolean(remoteStrokeOrderAnimationBaseUrl || remoteStrokeOrderAnimCjkBaseUrl);
    const remoteImageViolation = remoteImageConfigured && releasePolicy.remoteImageProvidersAllowed === false;
    const remoteAnimationViolation = remoteAnimationConfigured && releasePolicy.remoteAnimationProvidersAllowed === false;
    const mixedImageSources = releasePolicy.requireSingleImageSourcePerDeck && countDistinctSources(imageAssets) > 1;
    const mixedAnimationSources = releasePolicy.requireSingleAnimationSourcePerDeck && countDistinctSources(animationAssets) > 1;

    return {
        mediaRootDir,
        manifestCount: manifestPaths.length,
        imageAssetCount: imageAssets.length,
        animationAssetCount: animationAssets.length,
        sourceCounts,
        uniqueImageSources: Object.keys(sourceCounts.image).sort((a, b) => a.localeCompare(b)),
        uniqueAnimationSources: Object.keys(sourceCounts.animation).sort((a, b) => a.localeCompare(b)),
        remoteImageConfigured,
        remoteAnimationConfigured,
        remoteImageViolation,
        remoteAnimationViolation,
        mixedImageSources,
        mixedAnimationSources,
        violatingAssets,
        valid: !remoteImageViolation
            && !remoteAnimationViolation
            && !mixedImageSources
            && !mixedAnimationSources
            && violatingAssets.length === 0,
    };
}

function formatStrokeOrderPolicyAuditReport(report, policy) {
    const lines = [];
    lines.push("Japanese Kanji Builder Stroke-Order Policy Audit");
    lines.push("");
    lines.push(`Policy: ${policy.policyPath}`);
    lines.push(`Managed media root: ${report.mediaRootDir}`);
    lines.push(`Managed manifests scanned: ${report.manifestCount}`);
    lines.push(`Managed static image assets: ${report.imageAssetCount}`);
    lines.push(`Managed animation assets: ${report.animationAssetCount}`);
    lines.push(`Allowed image source(s): ${(policy.releaseStrokeOrder.allowedImageSourceIds || []).join(", ")}`);
    lines.push(`Allowed animation source(s): ${(policy.releaseStrokeOrder.allowedAnimationSourceIds || []).join(", ")}`);
    lines.push(`Remote image provider configured: ${report.remoteImageConfigured ? "yes" : "no"}`);
    lines.push(`Remote animation provider configured: ${report.remoteAnimationConfigured ? "yes" : "no"}`);
    lines.push(`Release stroke-order policy: ${report.valid ? "passing" : "failing"}`);

    for (const [label, counts] of [["Image", report.sourceCounts.image], ["Animation", report.sourceCounts.animation]]) {
        if (Object.keys(counts).length === 0) {
            continue;
        }
        lines.push("");
        lines.push(`${label} source counts:`);
        for (const [source, count] of Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))) {
            lines.push(`- ${source}: ${count}`);
        }
    }

    if (report.remoteImageViolation) {
        lines.push("");
        lines.push("Violation: remote image provider is configured even though the release policy forbids remote static images.");
    }

    if (report.remoteAnimationViolation) {
        lines.push("");
        lines.push("Violation: remote animation provider is configured even though the release policy forbids remote animations.");
    }

    if (report.mixedImageSources) {
        lines.push("");
        lines.push("Violation: managed static images currently mix more than one release source.");
    }

    if (report.mixedAnimationSources) {
        lines.push("");
        lines.push("Violation: managed animations currently mix more than one release source.");
    }

    if (report.violatingAssets.length > 0) {
        lines.push("");
        lines.push("Violating assets:");
        for (const row of report.violatingAssets.slice(0, 25)) {
            lines.push(`- ${row.kanji} ${row.kind}: ${row.path} [${row.violations.join(", ")}]`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildStrokeOrderPolicyAuditReport,
    formatStrokeOrderPolicyAuditReport,
};
