const test = require("node:test");
const assert = require("node:assert/strict");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadPlatinumCardSourceManifest } = require("../src/datasets/platinumCardSourceManifest");
const {
    auditKanjiReadingReferenceContract,
    loadKanjiReadingReferenceContract,
    parseKanjiReadingReferenceContract,
} = require("../src/datasets/kanjiReadingReferenceContract");

function buildFixtureContract(overrides = {}) {
    return {
        version: 1,
        contractType: "kanji-reading-reference",
        standard: "kanji-reading-reference-v1",
        checkedAt: "2026-05-26",
        sourceUse: {
            sourceId: "kanjidic2_reading_reference",
            sourceName: "KANJIDIC2",
            sourceFamily: "kanjidic2",
            independenceGroup: "edrdg_kanjidic2",
            publisher: "Electronic Dictionary Research and Development Group",
            sourceUrl: "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
            license: "CC BY-SA 4.0",
            licenseEvidenceUrl: "https://www.edrdg.org/wiki/KANJIDIC_Project.html",
            allowedUse: ["kanji-reading-reference"],
            disallowedUse: [
                "kanji-field-verification",
                "word-field-verification",
                "placement-claim-origin",
                "level-truth",
            ],
            attribution: "Fixture attribution.",
            ...(overrides.sourceUse || {}),
        },
        sourceFile: {
            path: "downloads/kanjidic2.xml.gz",
            sha256: "a".repeat(64),
            byteSize: 123,
            header: {
                fileVersion: "4",
                databaseVersion: "fixture",
                dateOfCreation: "2026-05-26",
            },
        },
        extraction: {
            readingTypesIncluded: ["ja_on", "ja_kun"],
            readingTypesExcluded: ["nanori"],
            notes: "Fixture extraction.",
        },
        coverage: {
            contractKanjiCount: 1,
            sourceCharacterCount: 1,
            entryCount: 1,
            missingEntryCount: 0,
            missingOnReading: 0,
            missingKunReading: 0,
            byLevel: {
                1: { expected: 0, entries: 0, withOnReading: 0, withKunReading: 0 },
                2: { expected: 0, entries: 0, withOnReading: 0, withKunReading: 0 },
                3: { expected: 0, entries: 0, withOnReading: 0, withKunReading: 0 },
                4: { expected: 0, entries: 0, withOnReading: 0, withKunReading: 0 },
                5: { expected: 1, entries: 1, withOnReading: 1, withKunReading: 1 },
            },
        },
        entries: {
            日: {
                level: 5,
                onReadings: ["ニチ"],
                kunReadings: ["ひ"],
                normalizedOnReadings: ["にち"],
                normalizedKunReadings: ["ひ"],
                sourceRef: "edrdg-kanjidic2:literal:日:reading-meaning/rmgroup/reading",
            },
        },
        ...overrides.contract,
    };
}

test("parseKanjiReadingReferenceContract validates source-use boundaries", () => {
    const parsed = parseKanjiReadingReferenceContract(buildFixtureContract());
    assert.equal(parsed.contractType, "kanji-reading-reference");

    assert.throws(() => parseKanjiReadingReferenceContract(buildFixtureContract({
        sourceUse: {
            allowedUse: ["kanji-reading-reference", "kanji-field-verification"],
        },
    })), /both allows and disallows/);

    assert.throws(() => parseKanjiReadingReferenceContract(buildFixtureContract({
        sourceUse: {
            disallowedUse: ["word-field-verification", "placement-claim-origin", "level-truth"],
        },
    })), /must include kanji-field-verification/);

    assert.throws(() => parseKanjiReadingReferenceContract(buildFixtureContract({
        contract: {
            extraction: {
                readingTypesIncluded: ["ja_on", "nanori"],
                readingTypesExcluded: ["ja_kun"],
                notes: "Bad extraction.",
            },
        },
    })), /readingTypesIncluded must be exactly ja_on,ja_kun/);
});

test("tracked kanji reading reference contract is governed and covers the JLPT kanji contract", () => {
    const readingReferenceContract = loadKanjiReadingReferenceContract("templates/kanji_reading_reference_contract.json");
    const jlptLevelContract = loadJlptLevelContract("templates/jlpt_level_contract.json");
    const platinumCardSourceManifest = loadPlatinumCardSourceManifest("templates/platinum_card_source_manifest.json");

    const audit = auditKanjiReadingReferenceContract({
        readingReferenceContract,
        jlptLevelContract,
        platinumCardSourceManifest,
    });

    assert.equal(audit.passed, true, audit.failures.join("\n"));
    assert.equal(audit.counts.contractKanji, 2212);
    assert.equal(audit.counts.readingReferenceEntries, 2212);
    assert.equal(audit.counts.missingKanji, 0);
    assert.equal(readingReferenceContract.sourceUse.allowedUse.includes("kanji-reading-reference"), true);
    assert.equal(readingReferenceContract.sourceUse.disallowedUse.includes("kanji-field-verification"), true);
    assert.deepEqual(readingReferenceContract.entries["腹"].normalizedKunReadings, ["はら"]);
    assert.equal(readingReferenceContract.entries["腹"].normalizedOnReadings.includes("ふく"), true);
    assert.equal(readingReferenceContract.entries["好"].normalizedKunReadings.includes("このむ"), true);
});
