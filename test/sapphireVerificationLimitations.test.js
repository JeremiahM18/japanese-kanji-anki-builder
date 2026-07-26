const assert = require("node:assert/strict");
const test = require("node:test");

const {
    validateWordSapphireVerificationLimitations,
    wordSapphireVerificationLimitationSchema,
} = require("../src/datasets/sapphireVerificationLimitations");
const {
    formatSapphireWordReviewReport,
} = require("../src/services/sapphireWordReviewService");

function buildEntry(limitation, manualReviewDetail = "Manual review accepted verification limitation(s).") {
    return {
        verificationLimitations: [limitation],
        reviewEvidence: [{
            type: "manual-review",
            source: "Sapphire product review",
            detail: manualReviewDetail,
        }],
    };
}

test("word Sapphire limitation schema rejects legacy fields, statuses, and extra properties", () => {
    assert.equal(wordSapphireVerificationLimitationSchema.safeParse({
        field: "pitch-accent-source",
        status: "accepted_limitation",
        label: "generated pitch source",
        reviewNote: "Reviewed.",
    }).success, false);
    assert.equal(wordSapphireVerificationLimitationSchema.safeParse({
        field: "pitchAccent",
        status: "externally_unverified",
        label: "Generated pitch (unverified)",
        reviewNote: "Reviewed.",
        ungoverned: true,
    }).success, false);
});

test("word Sapphire limitation validator requires manual acknowledgement and a visible limitation label", () => {
    const limitation = {
        field: "sourcePriority",
        status: "limited_source",
        label: "JMdict priority marker",
        reviewNote: "The governed source row has no priority marker.",
    };

    assert.deepEqual(
        validateWordSapphireVerificationLimitations(buildEntry(limitation, "Manual review completed.")),
        [
            "verification limitation label must visibly disclose limited or unverified status: JMdict priority marker",
            "verification limitation sourcePriority must bind to manual-review evidence",
        ]
    );
});

test("word Sapphire pitch limitation requires the generated field to disclose unverified status", () => {
    const limitation = {
        field: "pitchAccent",
        status: "externally_unverified",
        label: "Generated pitch (unverified)",
        reviewNote: "Generated pitch was reviewed for structural use only.",
    };

    assert.deepEqual(
        validateWordSapphireVerificationLimitations(
            buildEntry(limitation),
            { pitchAccent: "Pitch 1: 2" }
        ),
        ["pitchAccent verification limitation must remain visibly labeled as unverified in the generated pitch field"]
    );
    assert.deepEqual(
        validateWordSapphireVerificationLimitations(
            buildEntry(limitation),
            { pitchAccent: "Generated pitch (unverified): Pitch 1: 2" }
        ),
        []
    );
});

test("word Sapphire report always renders canonical limitation labels and statuses", () => {
    const output = formatSapphireWordReviewReport({
        passed: true,
        verificationLimitations: [{
            word: "一枚",
            reading: "いちまい",
            field: "sourceAvailability",
            label: "Curated source only; JMdict-priority evidence unavailable",
            status: "limited_source",
        }],
    });

    assert.match(
        output,
        /一枚 \(いちまい\) sourceAvailability: Curated source only; JMdict-priority evidence unavailable \(limited_source\)/
    );
});
