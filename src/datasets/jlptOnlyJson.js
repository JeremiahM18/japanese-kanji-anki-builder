const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const {
    auditJlptInventoryAgainstContract,
    loadJlptLevelContract,
} = require("./jlptLevelContract");

const jlptOnlyEntrySchema = z.object({
    jlpt: z.number().int().min(1).max(5),
}).passthrough();

const jlptOnlyJsonSchema = z.record(z.string().min(1), jlptOnlyEntrySchema);

function parseJlptOnlyJson(value) {
    return jlptOnlyJsonSchema.parse(value);
}

function getDefaultLocalJlptOnlyJsonPath() {
    return path.resolve(process.cwd(), "data", "kanji_jlpt_only.json");
}

function getDefaultJlptLevelContractPath() {
    return path.resolve(process.cwd(), "templates", "jlpt_level_contract.json");
}

function shouldRequireContractAlignment(filePath, options = {}) {
    if (options.contractPath === null || options.requireContractAlignment === false) {
        return false;
    }
    if (options.requireContractAlignment === true) {
        return true;
    }

    return path.resolve(filePath) === getDefaultLocalJlptOnlyJsonPath()
        && fs.existsSync(getDefaultJlptLevelContractPath());
}

function buildJlptOnlyJsonDriftMessage({ audit, datasetPath, contractPath } = {}) {
    const parts = [
        `JLPT runtime dataset is out of sync with the tracked JLPT level contract.`,
        `Dataset: ${datasetPath}`,
        `Contract: ${contractPath}`,
        `Missing kanji: ${audit?.missingKanji?.length || 0}`,
        `Unexpected kanji: ${audit?.unexpectedKanji?.length || 0}`,
        `Wrong level assignments: ${audit?.levelMismatches?.length || 0}`,
        `Per-level count mismatches: ${audit?.countMismatches?.length || 0}`,
        "Run npm run data:audit:jlpt -- --strict for details or npm run data:sync:jlpt to resync the ignored local dataset.",
    ];
    return parts.join(" ");
}

function assertJlptOnlyJsonMatchesContract(jlptOnlyJson, { datasetPath, contractPath = getDefaultJlptLevelContractPath() } = {}) {
    if (!contractPath || !fs.existsSync(contractPath)) {
        return {
            valid: true,
            skipped: true,
        };
    }

    const audit = auditJlptInventoryAgainstContract(jlptOnlyJson, loadJlptLevelContract(contractPath));
    if (!audit.valid) {
        throw new Error(buildJlptOnlyJsonDriftMessage({ audit, datasetPath, contractPath }));
    }

    return audit;
}

function loadJlptOnlyJson(filePath, options = {}) {
    const text = fs.readFileSync(filePath, "utf-8");
    const parsed = parseJlptOnlyJson(JSON.parse(text));
    if (shouldRequireContractAlignment(filePath, options)) {
        assertJlptOnlyJsonMatchesContract(parsed, {
            datasetPath: path.resolve(filePath),
            contractPath: options.contractPath || getDefaultJlptLevelContractPath(),
        });
    }
    return parsed;
}

module.exports = {
    assertJlptOnlyJsonMatchesContract,
    buildJlptOnlyJsonDriftMessage,
    getDefaultJlptLevelContractPath,
    getDefaultLocalJlptOnlyJsonPath,
    jlptOnlyEntrySchema,
    jlptOnlyJsonSchema,
    loadJlptOnlyJson,
    parseJlptOnlyJson,
};
