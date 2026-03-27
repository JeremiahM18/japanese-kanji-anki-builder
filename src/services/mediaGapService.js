const fs = require("node:fs");

const { readManifestIfExists } = require("./mediaStore");
const { buildAudioFileCandidates } = require("./audioService");
const {
    buildStrokeOrderAnimationCandidates,
    buildStrokeOrderImageCandidates,
} = require("./strokeOrderService");
const { buildJlptBuckets } = require("../datasets/sentenceCorpusCoverage");

function formatLevelLabel(level) {
    return `N${level}`;
}

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

function pickPreferredFileNames(baseNames, extensions, limit = 3) {
    const results = [];

    for (const baseName of baseNames) {
        for (const extension of extensions) {
            results.push(`${baseName}${extension}`);
            if (results.length >= limit) {
                return results;
            }
        }
    }

    return results;
}

function buildImageFilePlan(kanji) {
    const acceptedBaseNames = buildStrokeOrderImageCandidates(kanji);
    const preferredBases = [];

    for (const baseName of acceptedBaseNames) {
        if (baseName.endsWith("-bw") || baseName.endsWith("-red") || baseName === kanji) {
            preferredBases.push(baseName);
        }
    }

    preferredBases.sort((a, b) => {
        const aPriority = a === kanji ? 0 : a.endsWith("-bw") ? 1 : a.endsWith("-red") ? 2 : 3;
        const bPriority = b === kanji ? 0 : b.endsWith("-bw") ? 1 : b.endsWith("-red") ? 2 : 3;
        const aIndex = acceptedBaseNames.indexOf(a);
        const bIndex = acceptedBaseNames.indexOf(b);
        return aPriority - bPriority || aIndex - bIndex;
    });

    return {
        acceptedBaseNames,
        preferredFileNames: pickPreferredFileNames(preferredBases, [".png", ".webp", ".jpg", ".jpeg", ".svg"], 4),
    };
}

function buildAnimationFilePlan(kanji) {
    const acceptedBaseNames = buildStrokeOrderAnimationCandidates(kanji);
    const preferredBases = [];

    for (const baseName of acceptedBaseNames) {
        if (baseName.endsWith("-order") || baseName === kanji) {
            preferredBases.push(baseName);
        }
    }

    preferredBases.sort((a, b) => {
        const aPriority = a.endsWith("-order") ? 0 : 1;
        const bPriority = b.endsWith("-order") ? 0 : 1;
        const aIndex = acceptedBaseNames.indexOf(a);
        const bIndex = acceptedBaseNames.indexOf(b);
        return aPriority - bPriority || aIndex - bIndex;
    });

    return {
        acceptedBaseNames,
        preferredFileNames: pickPreferredFileNames(preferredBases, [".gif", ".webp", ".apng", ".svg"], 4),
    };
}

function buildAudioFilePlan(kanji) {
    const acceptedBaseNames = buildAudioFileCandidates({ kanji, text: kanji });
    const preferredBases = acceptedBaseNames.filter((baseName) => baseName === kanji);

    return {
        acceptedBaseNames,
        preferredFileNames: pickPreferredFileNames(preferredBases, [".mp3", ".wav", ".m4a", ".ogg", ".webm"], 3),
    };
}

async function buildMediaGapReport({
    jlptOnlyJson = {},
    mediaRootDir,
    strokeOrderImageSourceDir,
    strokeOrderAnimationSourceDir,
    audioSourceDir,
    levels = [5],
    limit = 25,
}) {
    const buckets = buildJlptBuckets(jlptOnlyJson);
    const targetLevels = parseLevelsArgument(levels);
    const targetKanji = targetLevels.flatMap((level) => (buckets.get(level) || []).map((kanji) => ({ kanji, level })));
    const rows = [];

    for (const entry of targetKanji) {
        const manifest = await readManifestIfExists(mediaRootDir, entry.kanji);
        const hasImage = Boolean(manifest?.assets?.strokeOrderImage);
        const hasAnimation = Boolean(manifest?.assets?.strokeOrderAnimation);
        const hasAudio = Array.isArray(manifest?.assets?.audio) && manifest.assets.audio.length > 0;

        if (hasImage && hasAnimation && hasAudio) {
            continue;
        }

        rows.push({
            kanji: entry.kanji,
            level: entry.level,
            missingImage: !hasImage,
            missingAnimation: !hasAnimation,
            missingAudio: !hasAudio,
            plans: {
                image: !hasImage ? buildImageFilePlan(entry.kanji) : null,
                animation: !hasAnimation ? buildAnimationFilePlan(entry.kanji) : null,
                audio: !hasAudio ? buildAudioFilePlan(entry.kanji) : null,
            },
        });
    }

    const limitedRows = rows.slice(0, Math.max(1, limit || 25));

    return {
        levels: targetLevels,
        totalKanji: targetKanji.length,
        missingImageCount: rows.filter((row) => row.missingImage).length,
        missingAnimationCount: rows.filter((row) => row.missingAnimation).length,
        missingAudioCount: rows.filter((row) => row.missingAudio).length,
        imageSourceDir: strokeOrderImageSourceDir,
        animationSourceDir: strokeOrderAnimationSourceDir,
        audioSourceDir,
        rows: limitedRows,
        truncated: rows.length > limitedRows.length,
        totalMissingRows: rows.length,
        sourceDirectoriesExist: {
            image: fs.existsSync(strokeOrderImageSourceDir),
            animation: fs.existsSync(strokeOrderAnimationSourceDir),
            audio: fs.existsSync(audioSourceDir),
        },
    };
}

function formatMediaGapReport(report) {
    const lines = [];

    lines.push("Japanese Kanji Builder Media Acquisition Plan");
    lines.push("");
    lines.push(`Target levels: ${(report.levels || []).map(formatLevelLabel).join(", ") || "n/a"}`);
    lines.push(`Kanji in scope: ${report.totalKanji}`);
    lines.push(`Missing stroke-order images: ${report.missingImageCount}`);
    lines.push(`Missing stroke-order animations: ${report.missingAnimationCount}`);
    lines.push(`Missing audio: ${report.missingAudioCount}`);
    lines.push("");
    lines.push("Source directories:");
    lines.push(`- Images: ${report.imageSourceDir}${report.sourceDirectoriesExist.image ? "" : " (missing directory)"}`);
    lines.push(`- Animations: ${report.animationSourceDir}${report.sourceDirectoriesExist.animation ? "" : " (missing directory)"}`);
    lines.push(`- Audio: ${report.audioSourceDir}${report.sourceDirectoriesExist.audio ? "" : " (missing directory)"}`);

    if ((report.rows || []).length === 0) {
        lines.push("");
        lines.push("All requested kanji already have image, animation, and audio assets.");
        return `${lines.join("\n")}\n`;
    }

    lines.push("");
    lines.push("Missing media by kanji:");

    for (const row of report.rows || []) {
        lines.push(`- ${row.kanji} (${formatLevelLabel(row.level)})`);

        if (row.missingImage) {
            lines.push(`  Image: ${row.plans.image.preferredFileNames.join(", ")}`);
        }

        if (row.missingAnimation) {
            lines.push(`  Animation: ${row.plans.animation.preferredFileNames.join(", ")}`);
        }

        if (row.missingAudio) {
            lines.push(`  Audio: ${row.plans.audio.preferredFileNames.join(", ")}`);
        }
    }

    if (report.truncated) {
        lines.push("");
        lines.push(`Showing ${report.rows.length} of ${report.totalMissingRows} kanji with missing media. Increase --limit to see more.`);
    }

    lines.push("");
    const syncLevel = report.levels?.[0] || 5;
    lines.push("Next step: add files with one of the suggested names to the matching source directories, then run `npm run media:sync -- --level=" + syncLevel + " --limit=25`.");
    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildAudioFilePlan,
    buildAnimationFilePlan,
    buildImageFilePlan,
    buildMediaGapReport,
    formatMediaGapReport,
    parseLevelsArgument,
};
