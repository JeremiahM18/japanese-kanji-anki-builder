const fs = require("node:fs");

const { normalizeSentenceCorpus } = require("../datasets/sentenceCorpus");
const { writeFileAtomicSync } = require("../utils/fs");

function readJsonArray(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in ${filePath}`);
    }

    return parsed;
}

function readJsonArrayIfExists(filePath) {
    try {
        return {
            exists: true,
            value: readJsonArray(filePath),
        };
    } catch (error) {
        if (error?.code === "ENOENT") {
            return {
                exists: false,
                value: [],
            };
        }
        throw error;
    }
}

function bootstrapSentenceCorpus({
    targetPath,
    starterPath,
    merge = false,
}) {
    const starterEntries = normalizeSentenceCorpus(readJsonArray(starterPath));
    const existingTarget = readJsonArrayIfExists(targetPath);
    const targetExists = existingTarget.exists;
    const existingEntries = existingTarget.value;
    const nextEntries = merge
        ? normalizeSentenceCorpus([...existingEntries, ...starterEntries])
        : starterEntries;

    if (!targetExists || merge) {
        writeFileAtomicSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
    }

    return {
        targetPath,
        starterPath,
        targetExists,
        merge,
        starterEntries: starterEntries.length,
        existingEntries: existingEntries.length,
        writtenEntries: targetExists && !merge ? existingEntries.length : nextEntries.length,
        changed: !targetExists || merge,
    };
}

module.exports = {
    bootstrapSentenceCorpus,
    readJsonArray,
};
