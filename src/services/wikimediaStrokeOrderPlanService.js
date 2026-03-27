const { buildMediaSourceReport, parseLevelsArgument } = require("./mediaSourceReportService");
const { discoverWikimediaStrokeOrderForKanji } = require("./wikimediaStrokeOrderDiscoveryService");

const COMMONS_BASE_URL = "https://commons.wikimedia.org";
const COMMONS_PROJECT_NOTE = "Wikimedia Commons CJK Stroke Order Project";

function buildCommonsFileName(kanji, kind) {
    if (kind === "animation") {
        return `${kanji}-order.gif`;
    }

    return `${kanji}-bw.png`;
}

function buildCommonsFilePageUrl(fileName) {
    return `${COMMONS_BASE_URL}/wiki/File:${encodeURIComponent(fileName)}`;
}

function buildCommonsRedirectUrl(fileName) {
    return `${COMMONS_BASE_URL}/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

async function defaultFetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Commons discovery request failed with ${response.status}`);
    }

    return response.json();
}

function buildPlanAsset(kanji, kind, discoveredAsset, discover) {
    if (discoveredAsset) {
        return {
            ...discoveredAsset,
            attribution: COMMONS_PROJECT_NOTE,
            status: "confirmed_on_commons",
        };
    }

    const fileName = buildCommonsFileName(kanji, kind);
    return {
        fileName,
        filePageUrl: buildCommonsFilePageUrl(fileName),
        downloadUrl: buildCommonsRedirectUrl(fileName),
        attribution: COMMONS_PROJECT_NOTE,
        status: discover ? "not_found_on_commons" : "guessed_name",
    };
}

async function buildWikimediaStrokeOrderPlan({
    jlptOnlyJson = {},
    strokeOrderImageSourceDir,
    strokeOrderAnimationSourceDir,
    levels = [5],
    limit = 25,
    discover = false,
    fetchJson = null,
}) {
    const sourceReport = await buildMediaSourceReport({
        jlptOnlyJson,
        strokeOrderImageSourceDir,
        strokeOrderAnimationSourceDir,
        audioSourceDir: "",
        audioEnabled: false,
        levels,
        limit,
    });

    const rows = [];
    const fetchDiscoveryJson = fetchJson || (typeof fetch === "function" ? defaultFetchJson : null);

    for (const row of sourceReport.rows || []) {
        let discovery = null;

        if (discover && fetchDiscoveryJson) {
            discovery = await discoverWikimediaStrokeOrderForKanji(row.kanji, {
                fetchJson: fetchDiscoveryJson,
            });
        }

        rows.push({
            kanji: row.kanji,
            level: row.level,
            image: row.hasImage ? null : buildPlanAsset(row.kanji, "image", discovery?.image || null, discover),
            animation: row.hasAnimation ? null : buildPlanAsset(row.kanji, "animation", discovery?.animation || null, discover),
            discovery,
        });
    }

    return {
        levels: parseLevelsArgument(levels),
        totalKanji: sourceReport.totalKanji,
        imageMissingCount: rows.filter((row) => Boolean(row.image)).length,
        animationMissingCount: rows.filter((row) => Boolean(row.animation)).length,
        discover,
        rows,
        truncated: sourceReport.truncated,
        totalMissingRows: sourceReport.totalMissingRows,
        imageSourceDir: strokeOrderImageSourceDir,
        animationSourceDir: strokeOrderAnimationSourceDir,
        projectNote: COMMONS_PROJECT_NOTE,
    };
}

function formatWikimediaStrokeOrderSheet(plan) {
    const lines = [];
    lines.push("Japanese Kanji Builder Wikimedia Stroke-Order Sheet");
    lines.push("");

    for (const row of plan.rows || []) {
        const parts = [row.kanji, `N${row.level}`];

        if (row.image) {
            parts.push(row.image.fileName, row.image.filePageUrl);
            if (plan.discover) {
                parts.push(row.image.status);
            }
        }

        if (row.animation) {
            parts.push(row.animation.fileName, row.animation.filePageUrl);
            if (plan.discover) {
                parts.push(row.animation.status);
            }
        }

        lines.push(parts.join(" | "));
    }

    if ((plan.rows || []).length === 0) {
        lines.push("No missing Wikimedia-style stroke-order files were detected.");
    }

    return `${lines.join("\n")}\n`;
}

function formatDiscoveryStatus(status) {
    return status === "confirmed_on_commons"
        ? "confirmed on Commons"
        : status === "not_found_on_commons"
            ? "not found on Commons at discovery time"
            : "guessed Commons name";
}

function formatWikimediaStrokeOrderPlan(plan) {
    const lines = [];
    lines.push("Japanese Kanji Builder Wikimedia Stroke-Order Plan");
    lines.push("");
    lines.push(`Target levels: ${(plan.levels || []).map((level) => `N${level}`).join(", ") || "n/a"}`);
    lines.push(`Kanji in scope: ${plan.totalKanji}`);
    lines.push(`Missing Commons-style static images: ${plan.imageMissingCount}`);
    lines.push(`Missing Commons-style animations: ${plan.animationMissingCount}`);
    if (plan.discover) {
        lines.push("Discovery mode: enabled");
    }
    lines.push("");
    lines.push(`Recommended source: ${plan.projectNote}`);
    lines.push(`Image destination: ${plan.imageSourceDir}`);
    lines.push(`Animation destination: ${plan.animationSourceDir}`);

    if ((plan.rows || []).length === 0) {
        lines.push("");
        lines.push("No missing Wikimedia-style stroke-order files were detected for the requested levels.");
        return `${lines.join("\n")}\n`;
    }

    lines.push("");
    lines.push("Download checklist:");
    for (const row of plan.rows || []) {
        lines.push(`- ${row.kanji} (N${row.level})`);
        if (row.image) {
            lines.push(`  Image file: ${row.image.fileName}`);
            lines.push(`  Image page: ${row.image.filePageUrl}`);
            if (plan.discover) {
                lines.push(`  Image status: ${formatDiscoveryStatus(row.image.status)}`);
            }
        }
        if (row.animation) {
            lines.push(`  Animation file: ${row.animation.fileName}`);
            lines.push(`  Animation page: ${row.animation.filePageUrl}`);
            if (plan.discover) {
                lines.push(`  Animation status: ${formatDiscoveryStatus(row.animation.status)}`);
            }
        }
    }

    if (plan.truncated) {
        lines.push("");
        lines.push(`Showing ${plan.rows.length} of ${plan.totalMissingRows} kanji with missing Wikimedia-style stroke-order files. Increase --limit to see more.`);
    }

    lines.push("");
    lines.push("Next step: if guessed Commons names start failing, run `npm run media:discover:stroke-order` to resolve real Wikimedia titles first; then download the listed files, keep the source page URLs for attribution, import them with `npm run media:import:stroke-order`, and rerun `npm run media:sources`.");
    return `${lines.join("\n")}\n`;
}

module.exports = {
    COMMONS_BASE_URL,
    COMMONS_PROJECT_NOTE,
    buildCommonsFileName,
    buildCommonsFilePageUrl,
    buildCommonsRedirectUrl,
    buildWikimediaStrokeOrderPlan,
    formatWikimediaStrokeOrderPlan,
    formatWikimediaStrokeOrderSheet,
};
