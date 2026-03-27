const fs = require("node:fs");
const path = require("node:path");

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
        const error = new Error(`Commons discovery request failed with ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

function loadDiscoveryCache(discoveryCachePath) {
    if (!discoveryCachePath || !fs.existsSync(discoveryCachePath)) {
        return {};
    }

    try {
        return JSON.parse(fs.readFileSync(discoveryCachePath, "utf-8"));
    } catch {
        return {};
    }
}

function saveDiscoveryCache(discoveryCachePath, cache) {
    if (!discoveryCachePath) {
        return;
    }

    fs.mkdirSync(path.dirname(discoveryCachePath), { recursive: true });
    fs.writeFileSync(discoveryCachePath, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

function cloneDiscoveryEntry(entry) {
    return entry ? JSON.parse(JSON.stringify(entry)) : null;
}

function buildPlanAsset(kanji, kind, discoveredAsset, status) {
    if (discoveredAsset) {
        return {
            ...discoveredAsset,
            attribution: COMMONS_PROJECT_NOTE,
            status,
        };
    }

    const fileName = buildCommonsFileName(kanji, kind);
    return {
        fileName,
        filePageUrl: buildCommonsFilePageUrl(fileName),
        downloadUrl: buildCommonsRedirectUrl(fileName),
        attribution: COMMONS_PROJECT_NOTE,
        status,
    };
}

function summarizeStatuses(rows) {
    const summary = {
        confirmed_on_commons: 0,
        not_found_on_commons: 0,
        guessed_name: 0,
        discovery_unavailable: 0,
    };

    for (const row of rows) {
        for (const asset of [row.image, row.animation]) {
            if (!asset) {
                continue;
            }
            summary[asset.status] = (summary[asset.status] || 0) + 1;
        }
    }

    return summary;
}

async function buildWikimediaStrokeOrderPlan({
    jlptOnlyJson = {},
    strokeOrderImageSourceDir,
    strokeOrderAnimationSourceDir,
    levels = [5],
    limit = 25,
    discover = false,
    fetchJson = null,
    discoveryCachePath = null,
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
    const discoveryCache = discover ? loadDiscoveryCache(discoveryCachePath) : {};
    let cacheDirty = false;
    let discoveryAvailable = discover;
    let discoveryErrorMessage = null;

    for (const row of sourceReport.rows || []) {
        let discovery = discover ? cloneDiscoveryEntry(discoveryCache[row.kanji]) : null;
        let discoveryState = discover ? "cache" : "disabled";

        if (discover && !discovery && fetchDiscoveryJson && discoveryAvailable) {
            try {
                discovery = await discoverWikimediaStrokeOrderForKanji(row.kanji, {
                    fetchJson: fetchDiscoveryJson,
                });
                discoveryCache[row.kanji] = discovery;
                cacheDirty = true;
                discoveryState = "fetched";
            } catch (error) {
                discoveryAvailable = false;
                discoveryErrorMessage = error.message;
                discoveryState = "error";
            }
        }

        const fallbackStatus = !discover
            ? "guessed_name"
            : discoveryState === "error" || (!discovery && !discoveryAvailable)
                ? "discovery_unavailable"
                : "not_found_on_commons";

        rows.push({
            kanji: row.kanji,
            level: row.level,
            gapType: row.gapType,
            image: row.hasImage ? null : buildPlanAsset(row.kanji, "image", discovery?.image || null, discovery?.image ? "confirmed_on_commons" : fallbackStatus),
            animation: row.hasAnimation ? null : buildPlanAsset(row.kanji, "animation", discovery?.animation || null, discovery?.animation ? "confirmed_on_commons" : fallbackStatus),
            discovery,
            discoveryState,
        });
    }

    if (cacheDirty) {
        saveDiscoveryCache(discoveryCachePath, discoveryCache);
    }

    return {
        levels: parseLevelsArgument(levels),
        totalKanji: sourceReport.totalKanji,
        imageMissingCount: rows.filter((row) => Boolean(row.image)).length,
        animationMissingCount: rows.filter((row) => Boolean(row.animation)).length,
        discover,
        discoveryAvailable,
        discoveryErrorMessage,
        statusSummary: summarizeStatuses(rows),
        rows,
        truncated: sourceReport.truncated,
        totalMissingRows: sourceReport.totalMissingRows,
        imageSourceDir: strokeOrderImageSourceDir,
        animationSourceDir: strokeOrderAnimationSourceDir,
        projectNote: COMMONS_PROJECT_NOTE,
        discoveryCachePath,
    };
}

function formatWikimediaStrokeOrderSheet(plan) {
    const lines = [];
    lines.push("Japanese Kanji Builder Wikimedia Stroke-Order Sheet");
    lines.push("");

    for (const row of plan.rows || []) {
        const parts = [row.kanji, `N${row.level}`, row.gapType || "unknown-gap"];

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
            : status === "discovery_unavailable"
                ? "discovery unavailable; guessed Commons filename shown"
                : "guessed Commons name";
}

function formatGapLabel(gapType) {
    if (gapType === "animation_only") return "animation only";
    if (gapType === "image_only") return "image only";
    if (gapType === "missing_stroke_order") return "missing both stroke-order files";
    return "mixed gap";
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
        if (plan.discoveryCachePath) {
            lines.push(`Discovery cache: ${plan.discoveryCachePath}`);
        }
        lines.push(`- Confirmed on Commons: ${plan.statusSummary.confirmed_on_commons || 0}`);
        lines.push(`- Not found on Commons: ${plan.statusSummary.not_found_on_commons || 0}`);
        lines.push(`- Discovery unavailable fallback: ${plan.statusSummary.discovery_unavailable || 0}`);
        if (plan.discoveryErrorMessage) {
            lines.push(`Discovery note: ${plan.discoveryErrorMessage}`);
        }
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
        lines.push(`- ${row.kanji} (N${row.level}, ${formatGapLabel(row.gapType)})`);
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
    lines.push("Next step: use the animation-only rows first for the fastest N5 progress. If discovery is unavailable, the guessed Commons filenames are still shown so you can try direct file pages manually. After downloading, import with `npm run media:import:stroke-order` and rerun `npm run media:sources`.");
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
    loadDiscoveryCache,
    saveDiscoveryCache,
};
