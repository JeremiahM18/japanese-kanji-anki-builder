const crypto = require("node:crypto");

const { XMLParser } = require("fast-xml-parser");

const { decodeKanjidic2Buffer } = require("./kanjidic2JlptSourceService");
const { normalizeJapaneseReading } = require("../utils/japanese");

const DEFAULT_SOURCE_ID = "kanjidic2_reading_reference";
const DEFAULT_SOURCE_PATH = "downloads/kanjidic2.xml.gz";
const DEFAULT_SOURCE_URL = "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz";
const DEFAULT_LICENSE_EVIDENCE_URL = "https://www.edrdg.org/wiki/KANJIDIC_Project.html";
const DEFAULT_CHECKED_AT = "2026-05-26";
const READING_REFERENCE_STANDARD = "kanji-reading-reference-v1";
const INCLUDED_READING_TYPES = Object.freeze(["ja_on", "ja_kun"]);
const EXCLUDED_READING_TYPES = Object.freeze(["nanori", "pinyin", "korean_r", "korean_h", "vietnam"]);

function asArray(value) {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function normalizeString(value) {
    return String(value ?? "").trim();
}

function getNodeText(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return normalizeString(value["#text"]);
    }
    return normalizeString(value);
}

function unique(values = []) {
    return [...new Set(values.filter(Boolean))];
}

function buildParser() {
    return new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: false,
        parseTagValue: false,
        processEntities: false,
        trimValues: true,
    });
}

function sha256Buffer(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildEmptyLevelCoverage() {
    return {
        expected: 0,
        entries: 0,
        withOnReading: 0,
        withKunReading: 0,
    };
}

function buildCoverage({ entries = {}, missingKanji = [], jlptLevelContract = {}, sourceCharacterCount = 0 } = {}) {
    const byLevel = {
        1: buildEmptyLevelCoverage(),
        2: buildEmptyLevelCoverage(),
        3: buildEmptyLevelCoverage(),
        4: buildEmptyLevelCoverage(),
        5: buildEmptyLevelCoverage(),
    };

    for (const level of Object.values(jlptLevelContract.kanjiLevels || {})) {
        if (byLevel[level]) {
            byLevel[level].expected += 1;
        }
    }

    let missingOnReading = 0;
    let missingKunReading = 0;
    for (const entry of Object.values(entries)) {
        const levelCoverage = byLevel[entry.level];
        if (!levelCoverage) {
            continue;
        }

        levelCoverage.entries += 1;
        if (entry.onReadings.length > 0) {
            levelCoverage.withOnReading += 1;
        } else {
            missingOnReading += 1;
        }
        if (entry.kunReadings.length > 0) {
            levelCoverage.withKunReading += 1;
        } else {
            missingKunReading += 1;
        }
    }

    return {
        contractKanjiCount: Object.keys(jlptLevelContract.kanjiLevels || {}).length,
        sourceCharacterCount,
        entryCount: Object.keys(entries).length,
        missingEntryCount: missingKanji.length,
        missingOnReading,
        missingKunReading,
        byLevel,
    };
}

function extractKanjidic2ReadingReference(xmlText, { jlptLevelContract = {} } = {}) {
    const parser = buildParser();
    const parsed = parser.parse(xmlText);
    const header = parsed?.kanjidic2?.header || {};
    const characters = asArray(parsed?.kanjidic2?.character);
    const contractLevels = jlptLevelContract.kanjiLevels || {};
    const contractKanjiSet = new Set(Object.keys(contractLevels));
    const entries = {};

    for (const character of characters) {
        const kanji = normalizeString(character?.literal);
        if (!contractKanjiSet.has(kanji)) {
            continue;
        }

        const readings = asArray(character?.reading_meaning?.rmgroup)
            .flatMap((rmgroup) => asArray(rmgroup?.reading));
        const onReadings = unique(readings
            .filter((reading) => reading?.["@_r_type"] === "ja_on")
            .map(getNodeText));
        const kunReadings = unique(readings
            .filter((reading) => reading?.["@_r_type"] === "ja_kun")
            .map(getNodeText));

        entries[kanji] = {
            level: contractLevels[kanji],
            onReadings,
            kunReadings,
            normalizedOnReadings: unique(onReadings.map((reading) => normalizeJapaneseReading(reading))),
            normalizedKunReadings: unique(kunReadings.map((reading) => normalizeJapaneseReading(reading))),
            sourceRef: `edrdg-kanjidic2:literal:${kanji}:reading-meaning/rmgroup/reading`,
        };
    }

    const sortedEntries = {};
    for (const [kanji, entry] of Object.entries(entries)
        .sort(([leftKanji, left], [rightKanji, right]) => left.level - right.level || leftKanji.localeCompare(rightKanji, "ja"))) {
        sortedEntries[kanji] = entry;
    }

    const missingKanji = Object.keys(contractLevels)
        .filter((kanji) => !Object.prototype.hasOwnProperty.call(sortedEntries, kanji))
        .sort((a, b) => a.localeCompare(b, "ja"));

    return {
        header: {
            fileVersion: normalizeString(header.file_version),
            databaseVersion: normalizeString(header.database_version),
            dateOfCreation: normalizeString(header.date_of_creation),
        },
        sourceCharacterCount: characters.length,
        entries: sortedEntries,
        missingKanji,
        coverage: buildCoverage({
            entries: sortedEntries,
            missingKanji,
            jlptLevelContract,
            sourceCharacterCount: characters.length,
        }),
    };
}

function buildKanjidic2ReadingReferenceContract({
    sourceBuffer,
    jlptLevelContract,
    sourcePath = DEFAULT_SOURCE_PATH,
    checkedAt = DEFAULT_CHECKED_AT,
} = {}) {
    if (!Buffer.isBuffer(sourceBuffer)) {
        throw new Error("sourceBuffer must be a Buffer.");
    }
    const xmlText = decodeKanjidic2Buffer(sourceBuffer);
    const extracted = extractKanjidic2ReadingReference(xmlText, { jlptLevelContract });

    return {
        version: 1,
        contractType: "kanji-reading-reference",
        standard: READING_REFERENCE_STANDARD,
        checkedAt,
        sourceUse: {
            sourceId: DEFAULT_SOURCE_ID,
            sourceName: "KANJIDIC2",
            sourceFamily: "kanjidic2",
            independenceGroup: "edrdg_kanjidic2",
            publisher: "Electronic Dictionary Research and Development Group",
            sourceUrl: DEFAULT_SOURCE_URL,
            license: "CC BY-SA 4.0",
            licenseEvidenceUrl: DEFAULT_LICENSE_EVIDENCE_URL,
            allowedUse: ["kanji-reading-reference"],
            disallowedUse: [
                "kanji-field-verification",
                "word-field-verification",
                "placement-claim-origin",
                "level-truth",
            ],
            attribution: "KANJIDIC2 is property of the Electronic Dictionary Research and Development Group and is licensed under Creative Commons Attribution-ShareAlike 4.0.",
        },
        sourceFile: {
            path: sourcePath,
            sha256: sha256Buffer(sourceBuffer),
            byteSize: sourceBuffer.length,
            header: extracted.header,
        },
        extraction: {
            readingTypesIncluded: [...INCLUDED_READING_TYPES],
            readingTypesExcluded: [...EXCLUDED_READING_TYPES],
            notes: "Only KANJIDIC2 ja_on and ja_kun readings are tracked here. This contract is reading-reference evidence only and does not verify card meanings, examples, JLPT placement, or release readiness.",
        },
        coverage: extracted.coverage,
        entries: extracted.entries,
    };
}

module.exports = {
    DEFAULT_CHECKED_AT,
    DEFAULT_SOURCE_ID,
    DEFAULT_SOURCE_PATH,
    READING_REFERENCE_STANDARD,
    buildKanjidic2ReadingReferenceContract,
    extractKanjidic2ReadingReference,
    sha256Buffer,
};
