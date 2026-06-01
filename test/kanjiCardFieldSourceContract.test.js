const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    auditKanjiCardFieldSourceContract,
    defaultKanjiCardFieldSourceContractPathForLevel,
    loadKanjiCardFieldSourceContract,
} = require("../src/datasets/kanjiCardFieldSourceContract");
const { loadKanjiReadingReferenceContract } = require("../src/datasets/kanjiReadingReferenceContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadPlatinumCardSourceManifest } = require("../src/datasets/platinumCardSourceManifest");
const { buildKanjiCardFieldSourceContract } = require("../src/services/kanjiCardFieldSourceContractService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    loadReviewSetWithObsidianProof,
} = require("../src/services/obsidianProofProviderService");
const { resolveKanjiSourceOriginIdsForEntry } = require("../src/services/platinumKanjiSourceOriginService");
const { parseArgs, run: runBuildKanjiCardFieldSourceContract } = require("../scripts/buildKanjiCardFieldSourceContract");

function loadAuditInputs(level = 5) {
    return {
        fieldSourceContract: loadKanjiCardFieldSourceContract(defaultKanjiCardFieldSourceContractPathForLevel(level)),
        jlptLevelContract: loadJlptLevelContract("templates/jlpt_level_contract.json"),
        platinumCardSourceManifest: loadPlatinumCardSourceManifest("templates/platinum_card_source_manifest.json"),
        readingReferenceContract: loadKanjiReadingReferenceContract("templates/kanji_reading_reference_contract.json"),
    };
}

function reviewSetPathForLevel(level = 5) {
    return `templates/platinum_n${level}_review_set.json`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

test("builder CLI defaults to ledger-if-available proof provider", () => {
    const options = parseArgs(["--level=3", "--proof-provider=inline"]);
    const defaults = parseArgs(["--level=3"]);

    assert.equal(defaults.proofProvider, "ledger-if-available");
    assert.equal(options.proofProvider, "inline");
    assert.equal(options.reviewSet, "templates/platinum_n3_review_set.json");
});

test("builder fails closed before writing N1 reset field-source contract", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-n1-field-source-"));
    const out = path.join(tempDir, "n1.json");

    try {
        assert.throws(
            () => runBuildKanjiCardFieldSourceContract({ level: 1, out }),
            /Generated kanji card field source contract failed audit:[\s\S]*Missing N1 field-source contract entries:[\s\S]*丁, 丑, 且, 丘, 丙, 丞, 丹, 乃/
        );
        assert.equal(fs.existsSync(out), false);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("tracked kanji card field source contracts pass governed coverage audit", () => {
    for (const { level, expectedKanji } of [
        { level: 5, expectedKanji: 80 },
        { level: 4, expectedKanji: 212 },
    ]) {
        const inputs = loadAuditInputs(level);
        const audit = auditKanjiCardFieldSourceContract({
            ...inputs,
            level,
        });

        assert.equal(audit.passed, true, `N${level} audit should pass`);
        assert.deepEqual(audit.failures, []);
        assert.equal(audit.counts.expectedKanji, expectedKanji);
        assert.equal(audit.counts.entries, expectedKanji);
        assert.equal(audit.counts.missing, 0);
        assert.equal(audit.counts.extra, 0);

        const entries = Object.values(inputs.fieldSourceContract.entries);
        assert.equal(entries.every((entry) => entry.fieldEvidence.every((evidence) => evidence.fieldVerifierSourceIds.length > 0)), true);
        assert.equal(entries.every((entry) => entry.fieldEvidence.every((evidence) => !evidence.fieldVerifierSourceIds.includes("kanjidic2_reading_reference"))), true);
        assert.equal(entries.every((entry) => entry.fieldEvidence.every((evidence) => evidence.citationMode === "manual-field-bound-citation")), true);
    }
});

test("builder reproduces tracked kanji card field source contracts deterministically", () => {
    for (const level of [5, 4]) {
        const tracked = loadKanjiCardFieldSourceContract(defaultKanjiCardFieldSourceContractPathForLevel(level));
        const platinumEntries = loadReviewSetWithObsidianProof({
            deckKind: "kanji",
            level,
            sourceReviewSetPath: reviewSetPathForLevel(level),
            proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
        }).entries;
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
            level,
            checkedAt: tracked.checkedAt,
            reviewSetPath: tracked.scope.sourceReviewSetPath,
            jlptLevelContractPath: tracked.sourceFiles.jlptLevelContractPath,
            sourceManifestPath: tracked.sourceFiles.platinumCardSourceManifestPath,
            sourceOriginEvidencePath: tracked.sourceFiles.sourceOriginEvidencePath,
        });

        assert.deepEqual(generated, tracked, `N${level} builder output should match tracked contract`);
    }
});

test("audit rejects generated or ignored local artifacts as kanji field source evidence", () => {
    const inputs = loadAuditInputs();
    const contract = clone(inputs.fieldSourceContract);
    contract.entries["一"].fieldEvidence[0].source = "templates/golden_n5_kanji_review_set.json";
    contract.entries["一"].fieldEvidence[0].detail = "generated TSV artifact claimed as source truth";

    const audit = auditKanjiCardFieldSourceContract({
        ...inputs,
        fieldSourceContract: contract,
        level: 5,
    });

    assert.equal(audit.passed, false);
    assert.match(audit.failures.join("\n"), /must not cite generated, ignored local, or reading-reference-only artifacts/);
});

test("audit allows field-bound wording about generated card fields when governed source evidence is present", () => {
    const inputs = loadAuditInputs();
    const contract = clone(inputs.fieldSourceContract);
    contract.entries["一"].fieldEvidence[0].detail = "The generated card fields PrimaryReading いち and primary meaning one are source-supported by the cited Kanjipedia manual field-bound evidence.";

    const audit = auditKanjiCardFieldSourceContract({
        ...inputs,
        fieldSourceContract: contract,
        level: 5,
    });

    assert.equal(audit.passed, true);
    assert.deepEqual(audit.failures, []);
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
