const fs = require("node:fs");

const { writeFileAtomicSync, writeFileIfMissingSync } = require("../utils/fs");
const {
    isStarterDerivedEntry,
    mergeCuratedStudyData,
    normalizeCuratedStudyData,
    refreshStarterEntries,
    resolveTrackedStarterPaths,
} = require("../datasets/curatedStudyData");

function readJsonObject(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(text);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error(`Expected JSON object in ${filePath}`);
    }

    return parsed;
}

function readJsonObjectIfExists(filePath) {
    try {
        return {
            exists: true,
            value: readJsonObject(filePath),
        };
    } catch (error) {
        if (error?.code === "ENOENT") {
            return {
                exists: false,
                value: {},
            };
        }
        throw error;
    }
}

function bootstrapCuratedStudyData({
    targetPath,
    starterPath,
    starterPaths,
    merge = false,
    refreshStarter = false,
}) {
    const resolvedStarterPaths = resolveTrackedStarterPaths({ starterPath, starterPaths });
    const starterEntries = normalizeCuratedStudyData(
        resolvedStarterPaths.reduce((mergedEntries, entryPath) => mergeCuratedStudyData(mergedEntries, readJsonObject(entryPath)), {})
    );
    const existingTarget = readJsonObjectIfExists(targetPath);
    const targetExists = existingTarget.exists;
    const existingEntries = existingTarget.value;
    const nextEntries = refreshStarter
        ? normalizeCuratedStudyData(refreshStarterEntries(starterEntries, existingEntries))
        : merge
            ? normalizeCuratedStudyData(mergeCuratedStudyData(starterEntries, existingEntries))
            : starterEntries;

    let changed = false;
    if (merge || refreshStarter) {
        writeFileAtomicSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
        changed = true;
    } else {
        changed = writeFileIfMissingSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
    }

    return {
        targetPath,
        starterPath,
        starterPaths: resolvedStarterPaths,
        targetExists,
        merge,
        refreshStarter,
        starterEntries: Object.keys(starterEntries).length,
        existingEntries: Object.keys(existingEntries).length,
        writtenEntries: changed ? Object.keys(nextEntries).length : Object.keys(existingEntries).length,
        changed,
    };
}

module.exports = {
    bootstrapCuratedStudyData,
    isStarterDerivedEntry,
    readJsonObject,
    readJsonObjectIfExists,
    refreshStarterEntries,
};
