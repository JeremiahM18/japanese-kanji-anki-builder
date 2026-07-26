const assert = require("node:assert/strict");
const test = require("node:test");

const {
    migrateEntry,
    parseArgs,
} = require("../scripts/migrateSapphireVerificationLimitations");

test("Sapphire limitation migration canonicalizes legacy pitch and source vocabulary", () => {
    const pitch = migrateEntry({
        verificationLimitations: [{
            field: "pitch-accent-source",
            status: "accepted_limitation",
            label: "generated pitch accent source",
            reviewNote: "Generated pitch source was reviewed.",
        }],
    });
    const source = migrateEntry({
        verificationLimitations: [{
            field: "source-priority",
            status: "accepted_limitation",
            label: "JMdict priority marker absent",
            reviewNote: "No priority marker exists.",
        }],
    });

    assert.deepEqual(pitch.entry.verificationLimitations[0], {
        field: "pitchAccent",
        status: "externally_unverified",
        label: "Generated pitch (unverified)",
        reviewNote: "Generated pitch source was reviewed.",
    });
    assert.equal(source.entry.verificationLimitations[0].field, "sourcePriority");
    assert.equal(source.entry.verificationLimitations[0].status, "limited_source");
});

test("Sapphire limitation migration CLI is dry-run by default and records unknown arguments", () => {
    assert.deepEqual(parseArgs(["--json"]), {
        json: true,
        unknownArgs: [],
        write: false,
    });
    assert.deepEqual(parseArgs(["--write", "--mystery"]).unknownArgs, ["--mystery"]);
});
