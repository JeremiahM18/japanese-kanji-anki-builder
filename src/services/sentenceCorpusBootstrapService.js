const fs = require("node:fs");

const { normalizeSentenceCorpus } = require("../datasets/sentenceCorpus");

function readJsonArray(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in ${filePath}`);
    }

    return parsed;
}

function bootstrapSentenceCorpus({
    targetPath,
    starterPath,
    merge = false,
}) {
    const starterEntries = normalizeSentenceCorpus(readJsonArray(starterPath));
    const targetExists = fs.existsSync(targetPath);
    const existingEntries = targetExists ? readJsonArray(targetPath) : [];
    const nextEntries = merge
        ? normalizeSentenceCorpus([...existingEntries, ...starterEntries])
        : starterEntries;

    if (!targetExists || merge) {
        fs.writeFileSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
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
