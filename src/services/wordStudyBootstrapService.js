const {
    normalizeWordStudyData,
    refreshStarterEntries,
} = require("../datasets/wordStudyData");
const { readJsonObject, readJsonObjectIfExists } = require("./curatedStudyBootstrapService");
const { writeFileAtomicSync } = require("../utils/fs");

function bootstrapWordStudyData({
    targetPath,
    starterPath,
    merge = false,
    refreshStarter = false,
}) {
    const starterEntries = normalizeWordStudyData(readJsonObject(starterPath));
    const existingTarget = readJsonObjectIfExists(targetPath);
    const targetExists = existingTarget.exists;
    const existingEntries = existingTarget.value;
    const nextEntries = refreshStarter
        ? normalizeWordStudyData(refreshStarterEntries(starterEntries, existingEntries))
        : merge
        ? normalizeWordStudyData({ ...existingEntries, ...starterEntries })
        : starterEntries;

    if (!targetExists || merge || refreshStarter) {
        writeFileAtomicSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
    }

    return {
        targetPath,
        starterPath,
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
    bootstrapWordStudyData,
    refreshStarterEntries,
};
