const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildWordStudyEntryKey } = require("../src/datasets/wordStudyData");
const {
    buildWordCandidateAgreementReport,
    formatWordCandidateAgreementReport,
} = require("../src/services/wordCandidateAgreementService");

function writeFixtureSource(dir, fileName, text) {
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, text);
    return {
        path: filePath,
        byteSize: Buffer.byteLength(text),
        rowCount: text.trim().split(/\r?\n/u).length - 1,
    };
}

function buildManifest({ candidateSource, dictionarySource, frequencySource }) {
    return {
        version: 1,
        checkedAt: "2026-05-11",
        sourcePurposeRules: {
            community_web_list: {
                description: "Discovery only.",
                allowedUse: ["candidate-discovery", "level-hint"],
                disallowedUse: ["card-approval"],
            },
            dictionary: {
                description: "Dictionary verification.",
                allowedUse: ["dictionary-verification", "reading-verification", "meaning-verification"],
                disallowedUse: ["level-truth"],
            },
            dictionary_priority: {
                description: "Dictionary priority support.",
                allowedUse: ["frequency-sanity", "usefulness-support"],
                disallowedUse: ["level-truth"],
            },
        },
        sources: {
            "fixture-jlpt": {
                name: "Fixture JLPT list",
                tier: 4,
                status: "active",
                sourceType: "community_web_list",
                origin: {
                    url: "https://example.com/jlpt",
                    localPath: candidateSource.path,
                },
                licenseUse: {
                    status: "needs_review",
                    notes: "Fixture discovery source.",
                },
                checkedAt: "2026-05-11",
                local: {
                    path: candidateSource.path,
                    format: "tsv",
                    byteSize: candidateSource.byteSize,
                    rowCount: candidateSource.rowCount,
                    columns: ["written", "reading", "meaning", "jlpt"],
                },
                intendedUse: ["candidate-discovery", "level-hint"],
                allowedUse: ["candidate-discovery", "level-hint"],
                disallowedUse: ["card-approval"],
                candidatePolicy: {
                    levels: [5],
                    kanjiScope: "known-jlpt",
                    requireSourceLevel: true,
                },
            },
            "fixture-dictionary": {
                name: "Fixture dictionary",
                tier: 2,
                status: "active",
                sourceType: "dictionary",
                origin: {
                    url: "https://example.com/dict",
                    localPath: dictionarySource.path,
                },
                licenseUse: {
                    status: "approved",
                    notes: "Fixture dictionary source.",
                },
                checkedAt: "2026-05-11",
                local: {
                    path: dictionarySource.path,
                    format: "tsv",
                    byteSize: dictionarySource.byteSize,
                    rowCount: dictionarySource.rowCount,
                    columns: ["written", "reading", "meaning"],
                },
                intendedUse: ["dictionary-verification"],
                allowedUse: ["dictionary-verification", "reading-verification", "meaning-verification"],
                disallowedUse: ["level-truth"],
            },
            "fixture-priority": {
                name: "Fixture priority source",
                tier: 3,
                status: "active",
                sourceType: "dictionary_priority",
                origin: {
                    url: "https://example.com/priority",
                    localPath: frequencySource.path,
                },
                licenseUse: {
                    status: "approved",
                    notes: "Fixture commonness source.",
                },
                checkedAt: "2026-05-11",
                local: {
                    path: frequencySource.path,
                    format: "tsv",
                    byteSize: frequencySource.byteSize,
                    rowCount: frequencySource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
                intendedUse: ["frequency-sanity", "usefulness-support"],
                allowedUse: ["frequency-sanity", "usefulness-support"],
                disallowedUse: ["level-truth"],
            },
        },
    };
}

test("buildWordCandidateAgreementReport seeds candidates from discovery sources and attaches dictionary support", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-candidate-agreement-"));
    const candidateSource = writeFixtureSource(
        dir,
        "jlpt.tsv",
        "written\treading\tmeaning\tjlpt\n学校\tがっこう\tschool\tN5\n山川\tさんせん\tmountains and rivers\tN5\n～山\t～やま\tmountain suffix\tN5\n"
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        "written\treading\tmeaning\n山川\tさんせん\tmountains and rivers\n辞書\tじしょ\tdictionary\n"
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        "written\treading\tmeaning\tfrequencyRank\n山川\tさんせん\tmountains and rivers\t100\n辞書\tじしょ\tdictionary\t\n"
    );

    const report = buildWordCandidateAgreementReport({
        levels: [5],
        limit: 10,
        manifest: buildManifest({ candidateSource, dictionarySource, frequencySource }),
        jlptLevelContract: {
            kanjiLevels: {
                学: 5,
                校: 5,
                山: 5,
                川: 5,
                上: 5,
                辞: 3,
                書: 4,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "学校|がっこう": {
                    written: "学校",
                    reading: "がっこう",
                    jlpt: 5,
                },
            },
            excludedWordLevels: {},
        },
        starterEntries: {
            [buildWordStudyEntryKey({ written: "学校", reading: "がっこう" })]: {
                exampleSentence: {
                    japanese: "学校へ行きます。",
                    english: "I go to school.",
                },
            },
        },
        triageDecisionsByLevelSource: {
            N5: {
                "fixture-jlpt": {
                    "山川|さんせん": {
                        decision: "keep_candidate",
                        priority: "high",
                        reason: "Useful fixture candidate.",
                        nextStep: "Review later.",
                    },
                },
            },
        },
        wordPitchAccentData: {
            entries: {
                "学校|がっこう": {
                    pattern: "0 [heiban]",
                },
            },
        },
    });

    assert.equal(report.placementAudit.violationCount, 0);
    assert.equal(report.sourceBlockers.length, 0);
    assert.equal(report.levelReports[0].summary.targetRows, 3);
    assert.equal(report.levelReports[0].summary.candidateStatusCounts.keep_candidate, 1);
    assert.equal(report.levelReports[0].summary.candidateStatusCounts.identity_blocked, 1);
    assert.equal(report.levelReports[0].summary.candidateStatusCounts.already_governed, 1);

    const mountainRiver = report.levelReports[0].rows.find((row) => row.key === "山川|さんせん");
    assert.equal(mountainRiver.dictionaryVerified, true);
    assert.equal(mountainRiver.frequencySupported, true);
    assert.equal(mountainRiver.triageStatus, "keep_candidate");
    assert.deepEqual(mountainRiver.sourceIds, ["fixture-dictionary", "fixture-jlpt", "fixture-priority"]);
    assert.match(formatWordCandidateAgreementReport(report), /Read-only report/);
    assert.match(formatWordCandidateAgreementReport(report), /Placement gate: 0\/1 word-level placement violations/);
});
