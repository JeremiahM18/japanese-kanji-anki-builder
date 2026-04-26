const fs = require("node:fs");

function assertObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object.`);
    }
}

function normalizeComponentList(kanji, value) {
    if (!Array.isArray(value)) {
        throw new Error(`Kanji component contract entry for ${kanji} must be an array.`);
    }

    const components = value
        .map((component) => String(component || "").trim())
        .filter(Boolean);

    if (components.length === 0) {
        throw new Error(`Kanji component contract entry for ${kanji} must include at least one component.`);
    }

    return components;
}

function normalizeKanjiComponentContract(raw) {
    assertObject(raw, "Kanji component contract");

    if (Number(raw.version) !== 1) {
        throw new Error(`Unsupported kanji component contract version: ${raw.version}`);
    }

    assertObject(raw.components, "Kanji component contract components");
    assertObject(raw.inventoryCounts, "Kanji component contract inventoryCounts");

    const components = {};
    const inventoryCounts = {};

    for (const [level, count] of Object.entries(raw.inventoryCounts)) {
        const normalizedLevel = String(level).trim();
        const normalizedCount = Number(count);
        if (!/^[1-5]$/.test(normalizedLevel) || !Number.isInteger(normalizedCount) || normalizedCount < 0) {
            throw new Error(`Invalid kanji component contract inventory count for level ${level}: ${count}`);
        }
        inventoryCounts[normalizedLevel] = normalizedCount;
    }

    for (const [kanji, value] of Object.entries(raw.components).sort(([a], [b]) => a.localeCompare(b, "ja"))) {
        const normalizedKanji = String(kanji || "").trim();
        if (!normalizedKanji) {
            throw new Error("Kanji component contract contains a blank kanji key.");
        }
        components[normalizedKanji] = normalizeComponentList(normalizedKanji, value);
    }

    return {
        ...raw,
        version: 1,
        inventoryCounts,
        components,
    };
}

function loadKanjiComponentContract(filePath) {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeKanjiComponentContract(raw);
}

function buildComponentMapFromContract(contract) {
    return new Map(
        Object.entries(contract?.components || {})
            .sort(([a], [b]) => a.localeCompare(b, "ja"))
            .map(([kanji, components]) => [kanji, [...components]])
    );
}

function loadKanjiComponentMap(filePath) {
    return buildComponentMapFromContract(loadKanjiComponentContract(filePath));
}

function countComponentCoverageForLevel({ componentContract = {}, jlptLevelContract = {}, level = 5 } = {}) {
    const targetLevel = Number(level);
    const components = componentContract.components || {};
    const kanjiForLevel = Object.entries(jlptLevelContract.kanjiLevels || {})
        .filter(([, entryLevel]) => Number(entryLevel) === targetLevel)
        .map(([kanji]) => kanji);
    const covered = kanjiForLevel
        .filter((kanji) => Array.isArray(components[kanji]) && components[kanji].length > 0)
        .length;

    return {
        expected: kanjiForLevel.length,
        covered,
        missing: kanjiForLevel.length - covered,
    };
}

module.exports = {
    buildComponentMapFromContract,
    countComponentCoverageForLevel,
    loadKanjiComponentContract,
    loadKanjiComponentMap,
    normalizeKanjiComponentContract,
};
