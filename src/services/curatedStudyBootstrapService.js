const fs = require("node:fs");

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
    const targetExists = fs.existsSync(targetPath);
    const existingEntries = targetExists ? readJsonObject(targetPath) : {};
    const nextEntries = refreshStarter
        ? normalizeCuratedStudyData(refreshStarterEntries(starterEntries, existingEntries))
        : merge
            ? normalizeCuratedStudyData(mergeCuratedStudyData(starterEntries, existingEntries))
            : starterEntries;

    if (!targetExists || merge || refreshStarter) {
        fs.writeFileSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
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
        writtenEntries: targetExists && !merge && !refreshStarter ? Object.keys(existingEntries).length : Object.keys(nextEntries).length,
        changed: !targetExists || merge || refreshStarter,
    };
}

module.exports = {
    bootstrapCuratedStudyData,
    isStarterDerivedEntry,
    readJsonObject,
    refreshStarterEntries,
};
