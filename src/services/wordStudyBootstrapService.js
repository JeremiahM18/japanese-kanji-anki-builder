const fs = require("node:fs");

const {
    normalizeWordStudyData,
    refreshStarterEntries,
} = require("../datasets/wordStudyData");
const { readJsonObject } = require("./curatedStudyBootstrapService");

function bootstrapWordStudyData({
    targetPath,
    starterPath,
    merge = false,
    refreshStarter = false,
}) {
    const starterEntries = normalizeWordStudyData(readJsonObject(starterPath));
    const targetExists = fs.existsSync(targetPath);
    const existingEntries = targetExists ? readJsonObject(targetPath) : {};
    const nextEntries = refreshStarter
        ? normalizeWordStudyData(refreshStarterEntries(starterEntries, existingEntries))
        : merge
        ? normalizeWordStudyData({ ...existingEntries, ...starterEntries })
        : starterEntries;

    if (!targetExists || merge || refreshStarter) {
        fs.writeFileSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
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
