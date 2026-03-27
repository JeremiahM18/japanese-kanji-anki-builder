const fs = require("node:fs");

const { normalizeCuratedStudyData } = require("../datasets/curatedStudyData");

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
    merge = false,
}) {
    const starterEntries = normalizeCuratedStudyData(readJsonObject(starterPath));
    const targetExists = fs.existsSync(targetPath);
    const existingEntries = targetExists ? readJsonObject(targetPath) : {};
    const nextEntries = merge
        ? normalizeCuratedStudyData({ ...existingEntries, ...starterEntries })
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
    bootstrapCuratedStudyData,
    readJsonObject,
};
