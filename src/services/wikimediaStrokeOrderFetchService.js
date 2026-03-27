const fs = require("node:fs");
const path = require("node:path");

function buildFetchTargets(plan) {
    const targets = [];

    for (const row of plan.rows || []) {
        if (row.image?.status === "confirmed_on_commons") {
            targets.push({
                kanji: row.kanji,
                level: row.level,
                kind: "image",
                fileName: row.image.fileName,
                url: row.image.downloadUrl,
                filePageUrl: row.image.filePageUrl,
            });
        }

        if (row.animation?.status === "confirmed_on_commons") {
            targets.push({
                kanji: row.kanji,
                level: row.level,
                kind: "animation",
                fileName: row.animation.fileName,
                url: row.animation.downloadUrl,
                filePageUrl: row.animation.filePageUrl,
            });
        }
    }

    return targets;
}

function buildDefaultDownloadFile() {
    return async function downloadFile(url, destinationPath) {
        const response = await fetch(url, {
            headers: {
                "user-agent": "JapaneseKanjiBuilder/1.0 (+https://commons.wikimedia.org)",
            },
        });

        if (!response.ok) {
            const error = new Error(`Download failed with ${response.status}`);
            error.status = response.status;
            throw error;
        }

        const tempPath = `${destinationPath}.${process.pid}.${Date.now()}.tmp`;
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(tempPath, buffer);
        await fs.promises.rename(tempPath, destinationPath);
    };
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error) {
    return Number(error?.status) === 429 || /429/.test(String(error?.message || ""));
}

async function fetchWikimediaStrokeOrderBatch({
    plan,
    imageSourceDir,
    animationSourceDir,
    fileLimit = 4,
    delayMs = 2000,
    maxConsecutiveRateLimits = 2,
    downloadFile = null,
    sleep = delay,
}) {
    const targets = buildFetchTargets(plan);
    const effectiveDownloadFile = downloadFile || buildDefaultDownloadFile();
    const summary = {
        totalCandidates: targets.length,
        attempted: 0,
        downloaded: 0,
        skippedExisting: 0,
        rateLimited: 0,
        stoppedForRateLimit: false,
        files: [],
        failures: [],
    };

    await fs.promises.mkdir(imageSourceDir, { recursive: true });
    await fs.promises.mkdir(animationSourceDir, { recursive: true });

    let consecutiveRateLimits = 0;

    for (const target of targets) {
        if (summary.attempted >= fileLimit) {
            break;
        }

        const destinationDir = target.kind === "image" ? imageSourceDir : animationSourceDir;
        const destinationPath = path.join(destinationDir, target.fileName);

        if (fs.existsSync(destinationPath)) {
            summary.skippedExisting += 1;
            continue;
        }

        summary.attempted += 1;

        try {
            await effectiveDownloadFile(target.url, destinationPath);
            summary.downloaded += 1;
            summary.files.push({
                ...target,
                destinationPath,
                status: "downloaded",
            });
            consecutiveRateLimits = 0;

            if (delayMs > 0) {
                await sleep(delayMs);
            }
        } catch (error) {
            if (isRateLimitError(error)) {
                summary.rateLimited += 1;
                consecutiveRateLimits += 1;
                summary.failures.push({
                    ...target,
                    status: "rate_limited",
                    message: String(error.message || error),
                });

                if (consecutiveRateLimits >= maxConsecutiveRateLimits) {
                    summary.stoppedForRateLimit = true;
                    break;
                }

                if (delayMs > 0) {
                    await sleep(delayMs * (consecutiveRateLimits + 1));
                }
                continue;
            }

            consecutiveRateLimits = 0;
            summary.failures.push({
                ...target,
                status: "failed",
                message: String(error.message || error),
            });
        }
    }

    return summary;
}

function formatWikimediaStrokeOrderFetchSummary(summary) {
    const lines = [];
    lines.push("Japanese Kanji Builder Wikimedia Stroke-Order Fetch");
    lines.push("");
    lines.push(`Confirmed Commons candidates in scope: ${summary.totalCandidates}`);
    lines.push(`Attempted downloads: ${summary.attempted}`);
    lines.push(`Downloaded files: ${summary.downloaded}`);
    lines.push(`Skipped existing files: ${summary.skippedExisting}`);
    lines.push(`Rate-limited responses: ${summary.rateLimited}`);
    if (summary.stoppedForRateLimit) {
        lines.push("Stopped early: yes, after repeated rate limits");
    }

    if (summary.files.length > 0) {
        lines.push("");
        lines.push("Downloaded:");
        for (const file of summary.files) {
            lines.push(`- ${file.kanji} (${file.kind}): ${file.fileName}`);
            lines.push(`  Commons page: ${file.filePageUrl}`);
        }
    }

    if (summary.failures.length > 0) {
        lines.push("");
        lines.push("Failures:");
        for (const failure of summary.failures) {
            lines.push(`- ${failure.kanji} (${failure.kind}): ${failure.fileName} [${failure.status}]`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildFetchTargets,
    buildDefaultDownloadFile,
    fetchWikimediaStrokeOrderBatch,
    formatWikimediaStrokeOrderFetchSummary,
    isRateLimitError,
};
