const path = require("node:path");
const {
    loadJlptKanjiSourceEvidence,
    normalizeJlptLevelAssignment,
} = require("../datasets/jlptKanjiSourceEvidence");

const DEFAULT_JLPT_KANJI_SOURCE_EVIDENCE_PATH = path.resolve(
    __dirname,
    "..",
    "..",
    "templates",
    "jlpt_kanji_source_evidence.json"
);

let cachedJlptKanjiSourceEvidence = null;

function normalizeText(value) {
    return String(value ?? "").trim();
}

function getDefaultJlptKanjiSourceEvidence() {
    if (!cachedJlptKanjiSourceEvidence) {
        cachedJlptKanjiSourceEvidence = loadJlptKanjiSourceEvidence(DEFAULT_JLPT_KANJI_SOURCE_EVIDENCE_PATH);
    }

    return cachedJlptKanjiSourceEvidence;
}

function loadKanjiSourceOriginEvidence(filePath = DEFAULT_JLPT_KANJI_SOURCE_EVIDENCE_PATH) {
    return loadJlptKanjiSourceEvidence(filePath);
}

function normalizeAssignmentLevelRange(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((level) => normalizeJlptLevelAssignment(level))
        .filter((level) => Number.isInteger(level));
}

function assignmentIncludesLevel(assignment = {}, targetLevel = null) {
    if (!Number.isInteger(targetLevel)) {
        return false;
    }

    const exactLevel = normalizeJlptLevelAssignment(assignment.level);
    if (exactLevel === targetLevel) {
        return true;
    }

    return normalizeAssignmentLevelRange(assignment.levelRange).includes(targetLevel);
}

function parseEntryTargetLevel(entry = {}) {
    const levelIncludes = Array.isArray(entry.levelIncludes) ? entry.levelIncludes : [];
    for (const value of levelIncludes) {
        const level = normalizeJlptLevelAssignment(value);
        if (Number.isInteger(level)) {
            return level;
        }
    }

    return null;
}

function sourceCanBePlacementOrigin(source = {}) {
    return source.status !== "blocked"
        && source.status !== "deprecated"
        && ["assignment", "operational", "derived"].includes(source.sourceKind);
}

function resolveKanjiSourceOriginIds({
    evidence = getDefaultJlptKanjiSourceEvidence(),
    kanji = "",
    targetLevel = null,
} = {}) {
    const normalizedKanji = normalizeText(kanji);
    if (!normalizedKanji || !Number.isInteger(targetLevel)) {
        return [];
    }

    const originIds = [];
    for (const [sourceId, assignments] of Object.entries(evidence.assignments || {})) {
        const assignment = assignments?.[normalizedKanji];
        if (!assignment || (assignment.reviewStatus || "reviewed") !== "reviewed") {
            continue;
        }
        if (!assignmentIncludesLevel(assignment, targetLevel)) {
            continue;
        }
        if (!sourceCanBePlacementOrigin(evidence.sources?.[sourceId] || {})) {
            continue;
        }
        originIds.push(sourceId);
    }

    return [...new Set(originIds)].sort();
}

function resolveKanjiSourceOriginIdsForEntry({ evidence, entry = {} } = {}) {
    return resolveKanjiSourceOriginIds({
        evidence,
        kanji: entry.kanji,
        targetLevel: parseEntryTargetLevel(entry),
    });
}

module.exports = {
    DEFAULT_JLPT_KANJI_SOURCE_EVIDENCE_PATH,
    assignmentIncludesLevel,
    getDefaultJlptKanjiSourceEvidence,
    loadKanjiSourceOriginEvidence,
    parseEntryTargetLevel,
    resolveKanjiSourceOriginIds,
    resolveKanjiSourceOriginIdsForEntry,
};
