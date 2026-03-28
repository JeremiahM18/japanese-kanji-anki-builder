const fs = require("node:fs");

const { normalizeWordStudyData } = require("../datasets/wordStudyData");
const { readJsonObject } = require("./curatedStudyBootstrapService");

function bootstrapWordStudyData({
    targetPath,
    starterPath,
    merge = false,
}) {
    const starterEntries = normalizeWordStudyData(readJsonObject(starterPath));
    const targetExists = fs.existsSync(targetPath);
    const existingEntries = targetExists ? readJsonObject(targetPath) : {};
    const nextEntries = merge
        ? normalizeWordStudyData({ ...existingEntries, ...starterEntries })
        : starterEntries;

    if (!targetExists || merge) {
        fs.writeFileSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
    }

    return {
        targetPath,
        starterPath,
        targetExists,
        merge,
        starterEntries: Object.keys(starterEntries).length,
        existingEntries: Object.keys(existingEntries).length,
        writtenEntries: targetExists && !merge ? Object.keys(existingEntries).length : Object.keys(nextEntries).length,
        changed: !targetExists || merge,
    };
}

module.exports = {
    bootstrapWordStudyData,
};
