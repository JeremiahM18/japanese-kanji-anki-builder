const test = require("node:test");
const assert = require("node:assert/strict");

const {
    annotateAdditionalKanjiTsv,
    buildAdditionalJlptDataset,
    buildAdditionalKanjiExportFileName,
    formatAdditionalNote,
    selectPhysicalAdditionalEntries,
} = require("../src/services/additionalKanjiDeckService");

function buildEntry(overrides = {}) {
    return {
        kanji: "学",
        currentContractLevel: 4,
        targetLevel: 5,
        category: "source_claim_consensus_elsewhere",
        confidence: "weak_evidence",
        sourceConsensusLevel: 4,
        sourceIds: ["fixture_source"],
        ...overrides,
    };
}

test("selectPhysicalAdditionalEntries quarantines repeated source claims by default", () => {
    const selection = selectPhysicalAdditionalEntries([
        {
            level: 5,
            deckId: "additional_unverified_N5",
            entries: [
                buildEntry({ kanji: "古", targetLevel: 5, confidence: "weak_evidence" }),
                buildEntry({ kanji: "本", targetLevel: 5, category: "source_consensus_candidate", confidence: "standard_confidence" }),
            ],
        },
        {
            level: 1,
            deckId: "additional_unverified_N1",
            entries: [
                buildEntry({ kanji: "古", targetLevel: 1, confidence: "weak_evidence" }),
            ],
        },
    ]);

    assert.deepEqual(selection.selectedEntries.map((entry) => `${entry.kanji}:N${entry.targetLevel}`), [
        "本:N5",
    ]);
    assert.deepEqual(selection.quarantinedDuplicateKanji, ["古"]);
    assert.deepEqual(
        selection.quarantinedDuplicateClaims.map((entry) => `${entry.kanji}:N${entry.targetLevel}`).sort(),
        ["古:N1", "古:N5"]
    );
});

test("selectPhysicalAdditionalEntries can select one duplicate only when explicitly requested", () => {
    const selection = selectPhysicalAdditionalEntries([
        {
            level: 5,
            deckId: "additional_unverified_N5",
            entries: [
                buildEntry({ kanji: "古", targetLevel: 5, confidence: "weak_evidence" }),
                buildEntry({ kanji: "本", targetLevel: 5, category: "source_consensus_candidate", confidence: "standard_confidence" }),
            ],
        },
        {
            level: 1,
            deckId: "additional_unverified_N1",
            entries: [
                buildEntry({ kanji: "古", targetLevel: 1, confidence: "weak_evidence" }),
            ],
        },
    ], { duplicatePolicy: "select-best" });

    assert.deepEqual(selection.selectedEntries.map((entry) => `${entry.kanji}:N${entry.targetLevel}`), [
        "古:N5",
        "本:N5",
    ]);
    assert.deepEqual(selection.excludedDuplicateClaims.map((entry) => `${entry.kanji}:N${entry.targetLevel}`), ["古:N1"]);
    assert.deepEqual(selection.quarantinedDuplicateKanji, []);
});

test("buildAdditionalJlptDataset projects selected entries into target-level export scope", () => {
    const dataset = buildAdditionalJlptDataset({
        baseJlptOnlyJson: {
            学: { kanji: "学", jlpt: 4, meanings: ["study"] },
        },
        entries: [buildEntry({ kanji: "学", targetLevel: 5 })],
    });

    assert.deepEqual(dataset, {
        学: { kanji: "学", jlpt: 5, meanings: ["study"] },
    });
});

test("annotateAdditionalKanjiTsv labels generated rows as additional unverified", () => {
    const tsv = [
        "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
        "学\t学\tstudy\tがく\tstudy\t\tガク\tまな.ぶ\t[sound:stroke.gif]\t[sound:学.wav]\t学\tstarter note\t",
    ].join("\n");
    const annotated = annotateAdditionalKanjiTsv({
        tsv,
        entriesByKanji: new Map([["学", buildEntry({ kanji: "学", targetLevel: 5 })]]),
    });

    assert.match(annotated, /starter note Additional unverified N5 source claim\./);
    assert.match(annotated, /Current core placement: N4\./);
    assert.match(annotated, /Source lanes: fixture_source\./);
});

test("additional kanji helpers keep export names and notes explicit", () => {
    assert.equal(buildAdditionalKanjiExportFileName(4), "additional-unverified-n4.tsv");
    assert.match(formatAdditionalNote(buildEntry({ targetLevel: 5 })), /Current core placement: N4/);
});
