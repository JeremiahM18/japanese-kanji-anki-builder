const assert = require("node:assert/strict");
const test = require("node:test");

const {
    formatRecoveryReport,
    parseArgs,
} = require("../scripts/recoverGovernedFileTransaction");

test("transaction recovery CLI is dry-run by default and rejects unknown arguments upstream", () => {
    assert.deepEqual(parseArgs(["--lock=out/file-transactions/word-silver.lock", "--json"]), {
        json: true,
        lockPath: "out/file-transactions/word-silver.lock",
        unknownArgs: [],
        write: false,
    });
    assert.deepEqual(parseArgs(["--mystery"]).unknownArgs, ["--mystery"]);
});

test("transaction recovery report states its hash-verified recovery boundary", () => {
    const text = formatRecoveryReport({
        recovered: false,
        recoverable: true,
        lockPath: "out/file-transactions/example.lock",
        lock: {
            transactionId: "example-1",
            journalPath: "out/file-transactions/example-1/journal.json",
        },
        journal: { status: "recovery_required" },
        targetStates: [{
            filePath: "templates/example.json",
            state: "after",
        }],
    });
    assert.match(text, /Dry-run is the default/);
    assert.match(text, /Unknown target content fails closed/);
});
