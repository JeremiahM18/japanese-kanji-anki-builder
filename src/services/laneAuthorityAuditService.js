const fs = require("node:fs");
const path = require("node:path");

const LEVELS = Object.freeze([5, 4, 3, 2, 1]);

const WORD_GOLD_FIELDS = Object.freeze([
    "readingIncludes",
    "meaningIncludes",
    "jlptLevelIncludes",
    "coverageRoleIncludes",
    "focusIncludes",
    "coversReadingIncludes",
    "breakdownIncludes",
    "exampleIncludes",
    "notesIncludes",
]);

const WORD_SAPPHIRE_PLATINUM_FIELDS = Object.freeze([
    ...WORD_GOLD_FIELDS,
    "pitchAccentIncludes",
    "selectionRationale",
    "reviewedAt",
    "reviewer",
    "reviewStandard",
    "revalidatedAt",
    "revalidationSummary",
    "sourceEvidence",
    "internalChecks",
    "reviewEvidence",
    "qualityGates",
    "verificationLimitations",
    "migrationProvenance",
]);

const KANJI_GOLD_FIELDS = Object.freeze([
    "readingIncludes",
    "meaningIncludes",
    "exampleIncludes",
    "notesIncludes",
]);

const KANJI_SAPPHIRE_PLATINUM_FIELDS = Object.freeze([
    ...KANJI_GOLD_FIELDS,
    "displayWordIncludes",
    "primaryReadingIncludes",
    "translationIncludes",
    "selectionRationale",
    "reviewedAt",
    "reviewer",
    "reviewStandard",
    "revalidatedAt",
    "revalidationSummary",
    "sourceEvidence",
    "internalChecks",
    "reviewEvidence",
    "qualityGates",
    "verificationLimitations",
    "migrationProvenance",
    "sapphireReviewAudit",
    "platinumReviewAudit",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonicalize(value[key])])
        );
    }
    return value === undefined ? "<undefined>" : value;
}

function stable(value) {
    return JSON.stringify(canonicalize(value));
}

function valuesMatch(left, right, field) {
    if (left?.[field] === undefined && right?.[field] === undefined) {
        return false;
    }
    return stable(left?.[field]) === stable(right?.[field]);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function activeWordEntry(entry = {}, lane) {
    const status = normalizeText(entry.status);
    if (lane === "gold") {
        return true;
    }
    if (lane === "sapphire") {
        return status === "sapphire" || status === "fixed_then_sapphire";
    }
    if (lane === "platinum") {
        return status === "platinum" || status === "fixed_then_platinum";
    }
    return false;
}

function activeKanjiEntry(entry = {}, lane) {
    const status = normalizeText(entry.status);
    if (lane === "gold") {
        return true;
    }
    if (lane === "sapphire") {
        return status === "sapphire" || status === "fixed_then_sapphire";
    }
    if (lane === "platinum") {
        return status === "platinum" || status === "fixed_then_platinum";
    }
    return false;
}

function buildWordIdentity(entry = {}) {
    const readings = Array.isArray(entry.readingIncludes) ? entry.readingIncludes : [];
    return `${normalizeText(entry.word)}|${readings.map(normalizeText).filter(Boolean).join(" / ")}`;
}

function buildKanjiIdentity(entry = {}) {
    return normalizeText(entry.kanji);
}

function indexEntries(entries = [], { lane, keyFn, activeFn }) {
    const entriesByIdentity = new Map();
    const duplicateIdentities = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!activeFn(entry, lane)) {
            continue;
        }
        const identity = keyFn(entry);
        if (!identity || identity === "|") {
            continue;
        }
        if (entriesByIdentity.has(identity)) {
            duplicateIdentities.push(identity);
        }
        entriesByIdentity.set(identity, entry);
    }

    return { entriesByIdentity, duplicateIdentities };
}

function compareIndexedEntries(left, right, fields) {
    const sharedIdentities = [...left.keys()].filter((identity) => right.has(identity));
    const identicalByField = Object.fromEntries(fields.map((field) => [field, 0]));

    for (const identity of sharedIdentities) {
        for (const field of fields) {
            if (valuesMatch(left.get(identity), right.get(identity), field)) {
                identicalByField[field] += 1;
            }
        }
    }

    return {
        shared: sharedIdentities.length,
        identicalByField,
    };
}

function countReviewers(entries = []) {
    const counts = {};
    for (const entry of entries) {
        const reviewer = normalizeText(entry.reviewer) || "<blank>";
        counts[reviewer] = (counts[reviewer] || 0) + 1;
    }
    return counts;
}

function summarizeLaneOverlap({
    goldEntries,
    sapphireEntries,
    platinumEntries,
    keyFn,
    activeFn,
    goldFields,
    sapphirePlatinumFields,
}) {
    const gold = indexEntries(goldEntries, { lane: "gold", keyFn, activeFn });
    const sapphire = indexEntries(sapphireEntries, { lane: "sapphire", keyFn, activeFn });
    const platinum = indexEntries(platinumEntries, { lane: "platinum", keyFn, activeFn });
    const sapphireKeys = [...sapphire.entriesByIdentity.keys()];
    const platinumKeys = new Set(platinum.entriesByIdentity.keys());
    const goldKeys = new Set(gold.entriesByIdentity.keys());

    return {
        counts: {
            gold: gold.entriesByIdentity.size,
            sapphire: sapphire.entriesByIdentity.size,
            platinum: platinum.entriesByIdentity.size,
        },
        duplicateIdentities: {
            gold: gold.duplicateIdentities,
            sapphire: sapphire.duplicateIdentities,
            platinum: platinum.duplicateIdentities,
        },
        sapphireWithoutGold: sapphireKeys.filter((identity) => !goldKeys.has(identity)).length,
        sapphireMinusPlatinum: sapphireKeys.filter((identity) => !platinumKeys.has(identity)).length,
        platinumMinusSapphire: [...platinumKeys].filter((identity) => !sapphire.entriesByIdentity.has(identity)).length,
        goldVsSapphire: compareIndexedEntries(gold.entriesByIdentity, sapphire.entriesByIdentity, goldFields),
        sapphireVsPlatinum: compareIndexedEntries(
            sapphire.entriesByIdentity,
            platinum.entriesByIdentity,
            sapphirePlatinumFields
        ),
        sapphireReviewers: countReviewers([...sapphire.entriesByIdentity.values()]),
        platinumReviewers: countReviewers([...platinum.entriesByIdentity.values()]),
    };
}

function buildLaneAuthorityDuplicationReport({ templatesDir = path.join(process.cwd(), "templates") } = {}) {
    const report = {
        boundary: "Read-only transitional lane-authority audit. Duplicated fields are evidence of migration debt, not desired authority.",
        levels: LEVELS,
        word: {},
        kanji: {},
    };

    for (const level of LEVELS) {
        report.word[`n${level}`] = summarizeLaneOverlap({
            goldEntries: readJson(path.join(templatesDir, `golden_n${level}_word_review_set.json`)),
            sapphireEntries: readJson(path.join(templatesDir, `sapphire_n${level}_word_review_set.json`)),
            platinumEntries: readJson(path.join(templatesDir, `platinum_n${level}_word_review_set.json`)),
            keyFn: buildWordIdentity,
            activeFn: activeWordEntry,
            goldFields: WORD_GOLD_FIELDS,
            sapphirePlatinumFields: WORD_SAPPHIRE_PLATINUM_FIELDS,
        });

        report.kanji[`n${level}`] = summarizeLaneOverlap({
            goldEntries: readJson(path.join(templatesDir, `golden_n${level}_review_set.json`)),
            sapphireEntries: readJson(path.join(templatesDir, `sapphire_n${level}_review_set.json`)),
            platinumEntries: readJson(path.join(templatesDir, `platinum_n${level}_review_set.json`)),
            keyFn: buildKanjiIdentity,
            activeFn: activeKanjiEntry,
            goldFields: KANJI_GOLD_FIELDS,
            sapphirePlatinumFields: KANJI_SAPPHIRE_PLATINUM_FIELDS,
        });
    }

    return report;
}

module.exports = {
    KANJI_GOLD_FIELDS,
    KANJI_SAPPHIRE_PLATINUM_FIELDS,
    WORD_GOLD_FIELDS,
    WORD_SAPPHIRE_PLATINUM_FIELDS,
    buildKanjiIdentity,
    buildLaneAuthorityDuplicationReport,
    buildWordIdentity,
    summarizeLaneOverlap,
};
