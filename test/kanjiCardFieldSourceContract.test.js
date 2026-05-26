const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
    auditKanjiCardFieldSourceContract,
    loadKanjiCardFieldSourceContract,
} = require("../src/datasets/kanjiCardFieldSourceContract");
const { loadKanjiReadingReferenceContract } = require("../src/datasets/kanjiReadingReferenceContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadPlatinumCardSourceManifest } = require("../src/datasets/platinumCardSourceManifest");
const { buildKanjiCardFieldSourceContract } = require("../src/services/kanjiCardFieldSourceContractService");
const { resolveKanjiSourceOriginIdsForEntry } = require("../src/services/platinumKanjiSourceOriginService");

function loadAuditInputs() {
    return {
        fieldSourceContract: loadKanjiCardFieldSourceContract("templates/kanji_card_field_source_contract.json"),
        jlptLevelContract: loadJlptLevelContract("templates/jlpt_level_contract.json"),
        platinumCardSourceManifest: loadPlatinumCardSourceManifest("templates/platinum_card_source_manifest.json"),
        readingReferenceContract: loadKanjiReadingReferenceContract("templates/kanji_reading_reference_contract.json"),
    };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

test("tracked N5 kanji card field source contract passes governed coverage audit", () => {
    const inputs = loadAuditInputs();
    const audit = auditKanjiCardFieldSourceContract({
        ...inputs,
        level: 5,
    });

    assert.equal(audit.passed, true);
    assert.deepEqual(audit.failures, []);
    assert.equal(audit.counts.expectedKanji, 80);
    assert.equal(audit.counts.entries, 80);
    assert.equal(audit.counts.missing, 0);
    assert.equal(audit.counts.extra, 0);

    const entries = Object.values(inputs.fieldSourceContract.entries);
    assert.equal(entries.every((entry) => entry.fieldEvidence.every((evidence) => evidence.fieldVerifierSourceIds.includes("kanjipedia"))), true);
    assert.equal(entries.every((entry) => entry.fieldEvidence.every((evidence) => !evidence.fieldVerifierSourceIds.includes("kanjidic2_reading_reference"))), true);
    assert.equal(entries.every((entry) => entry.fieldEvidence.every((evidence) => evidence.citationMode === "manual-field-bound-citation")), true);
});

test("builder reproduces the tracked N5 kanji card field source contract deterministically", () => {
    const tracked = loadKanjiCardFieldSourceContract("templates/kanji_card_field_source_contract.json");
    const platinumEntries = JSON.parse(fs.readFileSync("templates/platinum_n5_review_set.json", "utf8"));
    const sourceOriginEvidence = loadJlptKanjiSourceEvidence("templates/jlpt_kanji_source_evidence.json");
    const generated = buildKanjiCardFieldSourceContract({
        jlptLevelContract: loadJlptLevelContract("templates/jlpt_level_contract.json"),
        platinumEntries,
        platinumCardSourceManifest: loadPlatinumCardSourceManifest("templates/platinum_card_source_manifest.json"),
        sourceOriginIdsByKanji: Object.fromEntries(platinumEntries.map((entry) => [
            entry.kanji,
            resolveKanjiSourceOriginIdsForEntry({
                evidence: sourceOriginEvidence,
                entry,
            }),
        ])),
        level: 5,
        checkedAt: tracked.checkedAt,
        reviewSetPath: tracked.scope.sourceReviewSetPath,
        jlptLevelContractPath: tracked.sourceFiles.jlptLevelContractPath,
        sourceManifestPath: tracked.sourceFiles.platinumCardSourceManifestPath,
        sourceOriginEvidencePath: tracked.sourceFiles.sourceOriginEvidencePath,
    });

    assert.deepEqual(generated, tracked);
});

test("audit rejects generated or ignored local artifacts as kanji field source evidence", () => {
    const inputs = loadAuditInputs();
    const contract = clone(inputs.fieldSourceContract);
    contract.entries["一"].fieldEvidence[0].source = "templates/golden_n5_kanji_review_set.json";
    contract.entries["一"].fieldEvidence[0].detail = "generated local cache claimed as source truth";

    const audit = auditKanjiCardFieldSourceContract({
        ...inputs,
        fieldSourceContract: contract,
        level: 5,
    });

    assert.equal(audit.passed, false);
    assert.match(audit.failures.join("\n"), /must not cite generated, ignored local, or reading-reference-only artifacts/);
});

test("audit rejects reading-reference-only data as kanji field verifier", () => {
    const inputs = loadAuditInputs();
    const contract = clone(inputs.fieldSourceContract);
    contract.entries["一"].fieldEvidence[0].sourceIds = ["kanjidic2_reading_reference"];
    contract.entries["一"].fieldEvidence[0].fieldVerifierSourceIds = ["kanjidic2_reading_reference"];
    contract.entries["一"].fieldEvidence[0].supportingSourceIds = [];

    const audit = auditKanjiCardFieldSourceContract({
        ...inputs,
        fieldSourceContract: contract,
        level: 5,
    });

    assert.equal(audit.passed, false);
    assert.match(audit.failures.join("\n"), /kanjidic2_reading_reference is not active for kanji-field-verification/);
});

test("audit rejects unresolved primary readings even when source evidence exists", () => {
    const inputs = loadAuditInputs();
    const contract = clone(inputs.fieldSourceContract);
    contract.entries["一"].fieldValues.primaryReading = "ない";
    contract.entries["一"].cardKey = "一|ない";

    const audit = auditKanjiCardFieldSourceContract({
        ...inputs,
        fieldSourceContract: contract,
        level: 5,
    });

    assert.equal(audit.passed, false);
    assert.match(audit.failures.join("\n"), /primaryReading is not present in the governed reading-reference contract/);
});
