const fs = require("node:fs");
const { buildLocalDirectoryIndex } = require("./mediaProviders");
const { buildJlptBuckets } = require("../datasets/sentenceCorpusCoverage");
const { buildStrokeOrderImageCandidates, buildStrokeOrderAnimationCandidates } = require("./strokeOrderService");
const { buildAudioFileCandidates } = require("./audioService");

const IMAGE_EXTENSIONS = new Map([
    [".svg", true],
    [".png", true],
    [".webp", true],
    [".jpg", true],
    [".jpeg", true],
]);

const ANIMATION_EXTENSIONS = new Map([
    [".gif", true],
    [".webp", true],
    [".apng", true],
    [".svg", true],
]);

const AUDIO_EXTENSIONS = new Map([
    [".mp3", true],
    [".wav", true],
    [".m4a", true],
    [".ogg", true],
    [".webm", true],
]);

function parseLevelsArgument(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.filter((level) => Number.isInteger(level)))];
    }

    const parsed = String(value ?? "")
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 5);

    return [...new Set(parsed)];
}

function hasAnyCandidate(index, candidates) {
    for (const candidate of candidates) {
        if (index.has(candidate)) {
            return true;
        }
    }

    return false;
}

function buildPreferredFileNames(baseCandidates, extensions, limit = 4) {
    const fileNames = [];

    for (const candidate of baseCandidates) {
        for (const extension of extensions) {
            fileNames.push(`${candidate}${extension}`);
            if (fileNames.length >= limit) {
                return fileNames;
            }
        }
    }

    return fileNames;
}

async function buildMediaSourceReport({
    jlptOnlyJson = {},
    strokeOrderImageSourceDir,
    strokeOrderAnimationSourceDir,
    audioSourceDir,
    audioEnabled = true,
    levels = [5],
    limit = 25,
}) {
    const imageIndex = await buildLocalDirectoryIndex(strokeOrderImageSourceDir, IMAGE_EXTENSIONS);
    const animationIndex = await buildLocalDirectoryIndex(strokeOrderAnimationSourceDir, ANIMATION_EXTENSIONS);
    const audioIndex = audioEnabled ? await buildLocalDirectoryIndex(audioSourceDir, AUDIO_EXTENSIONS) : new Map();
    const buckets = buildJlptBuckets(jlptOnlyJson);
    const targetLevels = parseLevelsArgument(levels);
    const targetKanji = targetLevels.flatMap((level) => (buckets.get(level) || []).map((kanji) => ({ kanji, level })));
    const rows = [];

    for (const entry of targetKanji) {
        const hasImage = hasAnyCandidate(imageIndex, buildStrokeOrderImageCandidates(entry.kanji));
        const hasAnimation = hasAnyCandidate(animationIndex, buildStrokeOrderAnimationCandidates(entry.kanji));
        const hasAudio = hasAnyCandidate(audioIndex, buildAudioFileCandidates({ kanji: entry.kanji, text: entry.kanji }));

        if (hasImage && hasAnimation && (!audioEnabled || hasAudio)) {
            continue;
        }

        rows.push({
            kanji: entry.kanji,
            level: entry.level,
            hasImage,
            hasAnimation,
            hasAudio,
            preferredFileNames: {
                image: !hasImage ? buildPreferredFileNames(buildStrokeOrderImageCandidates(entry.kanji), [".png", ".webp"]) : [],
                animation: !hasAnimation ? buildPreferredFileNames(buildStrokeOrderAnimationCandidates(entry.kanji), [".gif", ".webp"]) : [],
                audio: !hasAudio ? [`${entry.kanji}.mp3`, `${entry.kanji}.wav`] : [],
            },
        });
    }

    const limitedRows = rows.slice(0, Math.max(1, limit || 25));

    return {
        levels: targetLevels,
        totalKanji: targetKanji.length,
        imageAvailableCount: targetKanji.filter((entry) => hasAnyCandidate(imageIndex, buildStrokeOrderImageCandidates(entry.kanji))).length,
        animationAvailableCount: targetKanji.filter((entry) => hasAnyCandidate(animationIndex, buildStrokeOrderAnimationCandidates(entry.kanji))).length,
        audioEnabled,
        audioAvailableCount: audioEnabled ? targetKanji.filter((entry) => hasAnyCandidate(audioIndex, buildAudioFileCandidates({ kanji: entry.kanji, text: entry.kanji }))).length : 0,
        imageSourceDir: strokeOrderImageSourceDir,
        animationSourceDir: strokeOrderAnimationSourceDir,
        audioSourceDir,
        rows: limitedRows,
        truncated: rows.length > limitedRows.length,
        totalMissingRows: rows.length,
        sourceDirectoriesExist: {
            image: fs.existsSync(strokeOrderImageSourceDir),
            animation: fs.existsSync(strokeOrderAnimationSourceDir),
            audio: audioEnabled ? fs.existsSync(audioSourceDir) : false,
        },
    };
}

function formatPercent(count, total) {
    return `${total > 0 ? ((count / total) * 100).toFixed(1) : "0.0"}%`;
}

function formatMediaSourceReport(report) {
    const lines = [];
    lines.push("Japanese Kanji Builder Local Media Source Report");
    lines.push("");
    lines.push(`Target levels: ${(report.levels || []).map((level) => `N${level}`).join(", ") || "n/a"}`);
    lines.push(`Kanji in scope: ${report.totalKanji}`);
    lines.push(`Source image coverage: ${report.imageAvailableCount}/${report.totalKanji} (${formatPercent(report.imageAvailableCount, report.totalKanji)})`);
    lines.push(`Source animation coverage: ${report.animationAvailableCount}/${report.totalKanji} (${formatPercent(report.animationAvailableCount, report.totalKanji)})`);
    if (report.audioEnabled) {
        lines.push(`Source audio coverage: ${report.audioAvailableCount}/${report.totalKanji} (${formatPercent(report.audioAvailableCount, report.totalKanji)})`);
    }
    lines.push("");
    lines.push("Source directories:");
    lines.push(`- Images: ${report.imageSourceDir}${report.sourceDirectoriesExist.image ? "" : " (missing directory)"}`);
    lines.push(`- Animations: ${report.animationSourceDir}${report.sourceDirectoriesExist.animation ? "" : " (missing directory)"}`);
    if (report.audioEnabled) {
        lines.push(`- Audio: ${report.audioSourceDir}${report.sourceDirectoriesExist.audio ? "" : " (missing directory)"}`);
    }

    if ((report.rows || []).length === 0) {
        lines.push("");
        lines.push(report.audioEnabled
            ? "All requested kanji already have image, animation, and audio files available in the local source folders."
            : "All requested kanji already have image and animation files available in the local source folders.");
        lines.push("");
        lines.push("Next step: run `npm run media:sync -- --level=" + (report.levels?.[0] || 5) + " --limit=25` to import them into managed media.");
        return `${lines.join("\n")}\n`;
    }

    lines.push("");
    lines.push("Still missing in local source folders:");
    for (const row of report.rows || []) {
        lines.push(`- ${row.kanji} (N${row.level})`);
        if (!row.hasImage) {
            lines.push(`  Image: ${row.preferredFileNames.image.join(", ")}`);
        }
        if (!row.hasAnimation) {
            lines.push(`  Animation: ${row.preferredFileNames.animation.join(", ")}`);
        }
        if (report.audioEnabled && !row.hasAudio) {
            lines.push(`  Audio: ${row.preferredFileNames.audio.join(", ")}`);
        }
    }

    if (report.truncated) {
        lines.push("");
        lines.push(`Showing ${report.rows.length} of ${report.totalMissingRows} kanji with missing local source files. Increase --limit to see more.`);
    }

    lines.push("");
    lines.push("Next step: add the missing files or run the import commands, then rerun this report before `npm run media:sync`.");
    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildMediaSourceReport,
    buildPreferredFileNames,
    formatMediaSourceReport,
    hasAnyCandidate,
    parseLevelsArgument,
};
