const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    readFileState,
    recoverGovernedFileTransactionSync,
    runGovernedFileTransactionSync,
} = require("../src/utils/governedFileTransaction");

function makeWorkspace() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-file-transaction-"));
    fs.mkdirSync(path.join(rootDir, "templates"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "out", "file-transactions"), { recursive: true });
    return rootDir;
}

test("governed file transaction commits all targets together", () => {
    const rootDir = makeWorkspace();
    const firstPath = path.join(rootDir, "templates", "first.json");
    const secondPath = path.join(rootDir, "templates", "second.json");
    fs.writeFileSync(firstPath, "before-one\n");
    fs.writeFileSync(secondPath, "before-two\n");

    const result = runGovernedFileTransactionSync({
        workspaceRoot: rootDir,
        transactionRoot: path.join(rootDir, "out", "file-transactions"),
        transactionName: "commit-fixture",
        changes: [
            { filePath: firstPath, data: "after-one\n" },
            { filePath: secondPath, data: "after-two\n" },
        ],
    });

    assert.equal(result.committed, true);
    assert.equal(result.targetCount, 2);
    assert.equal(fs.readFileSync(firstPath, "utf8"), "after-one\n");
    assert.equal(fs.readFileSync(secondPath, "utf8"), "after-two\n");
});

test("governed file transaction prepares the snapshot under its lock and preserves plan metadata", () => {
    const rootDir = makeWorkspace();
    const transactionRoot = path.join(rootDir, "out", "file-transactions");
    const lockPath = path.join(transactionRoot, "prepare-snapshot-fixture.lock");
    const targetPath = path.join(rootDir, "templates", "target.json");
    const metadata = { snapshot: "locked-state" };
    let validationMetadata = null;
    fs.writeFileSync(targetPath, "before\n");

    const result = runGovernedFileTransactionSync({
        workspaceRoot: rootDir,
        transactionRoot,
        lockPath,
        transactionName: "prepare-snapshot-fixture",
        prepareChanges() {
            assert.equal(fs.existsSync(lockPath), true);
            return {
                changes: [{ filePath: targetPath, data: "after\n" }],
                metadata,
            };
        },
        validateAfterWrite({ metadata: receivedMetadata }) {
            validationMetadata = receivedMetadata;
        },
    });

    assert.equal(result.metadata, metadata);
    assert.equal(validationMetadata, metadata);
    assert.equal(fs.readFileSync(targetPath, "utf8"), "after\n");
    assert.equal(fs.existsSync(lockPath), false);
});

test("governed file transaction preserves concurrent bytes when validation used an older hash", () => {
    const rootDir = makeWorkspace();
    const transactionRoot = path.join(rootDir, "out", "file-transactions");
    const lockPath = path.join(transactionRoot, "optimistic-lock-fixture.lock");
    const targetPath = path.join(rootDir, "templates", "target.json");
    fs.writeFileSync(targetPath, "validated\n");
    const validatedState = readFileState(targetPath);
    fs.writeFileSync(targetPath, "concurrent-writer\n");

    assert.throws(() => runGovernedFileTransactionSync({
        workspaceRoot: rootDir,
        transactionRoot,
        lockPath,
        transactionName: "optimistic-lock-fixture",
        changes: [{
            filePath: targetPath,
            data: "stale-transaction\n",
            expectedBeforeSha256: validatedState.sha256,
        }],
    }), /target changed after validation/);

    assert.equal(fs.readFileSync(targetPath, "utf8"), "concurrent-writer\n");
    assert.equal(fs.existsSync(lockPath), false);
});

test("governed file transaction rolls every target back after a partial commit failure", () => {
    const rootDir = makeWorkspace();
    const firstPath = path.join(rootDir, "templates", "first.json");
    const secondPath = path.join(rootDir, "templates", "second.json");
    fs.writeFileSync(firstPath, "before-one\n");
    fs.writeFileSync(secondPath, "before-two\n");

    assert.throws(() => runGovernedFileTransactionSync({
        workspaceRoot: rootDir,
        transactionRoot: path.join(rootDir, "out", "file-transactions"),
        transactionName: "rollback-fixture",
        changes: [
            { filePath: firstPath, data: "after-one\n" },
            { filePath: secondPath, data: "after-two\n" },
        ],
        injectFailure(phase, { change }) {
            if (phase === "after-commit" && change.index === 0) {
                throw new Error("injected partial commit failure");
            }
        },
    }), /rolled back.*injected partial commit failure/);

    assert.equal(fs.readFileSync(firstPath, "utf8"), "before-one\n");
    assert.equal(fs.readFileSync(secondPath, "utf8"), "before-two\n");
});

test("governed file transaction rolls back when post-write validation fails", () => {
    const rootDir = makeWorkspace();
    const targetPath = path.join(rootDir, "templates", "ledger.jsonl");
    fs.writeFileSync(targetPath, "before\n");

    assert.throws(() => runGovernedFileTransactionSync({
        workspaceRoot: rootDir,
        transactionRoot: path.join(rootDir, "out", "file-transactions"),
        transactionName: "validation-fixture",
        changes: [{ filePath: targetPath, data: "after\n" }],
        validateAfterWrite() {
            throw new Error("reconciliation failed");
        },
    }), /rolled back.*reconciliation failed/);
    assert.equal(fs.readFileSync(targetPath, "utf8"), "before\n");
});

test("governed file transaction revalidates a target immediately before replacement", () => {
    const rootDir = makeWorkspace();
    const transactionRoot = path.join(rootDir, "out", "file-transactions");
    const lockPath = path.join(transactionRoot, "revalidation-fixture.lock");
    const targetPath = path.join(rootDir, "templates", "target.json");
    fs.writeFileSync(targetPath, "before\n");

    assert.throws(() => runGovernedFileTransactionSync({
        workspaceRoot: rootDir,
        transactionRoot,
        lockPath,
        transactionName: "revalidation-fixture",
        changes: [{ filePath: targetPath, data: "transaction\n" }],
        injectFailure(phase) {
            if (phase === "before-commit") {
                fs.writeFileSync(targetPath, "concurrent-writer\n");
            }
        },
    }), /aborted before commit.*target changed before commit/);

    assert.equal(fs.readFileSync(targetPath, "utf8"), "concurrent-writer\n");
    assert.equal(fs.existsSync(lockPath), false);
});

test("governed file transaction rejects concurrent writers and exposes orphan-lock recovery", () => {
    const rootDir = makeWorkspace();
    const lockPath = path.join(rootDir, "out", "file-transactions", "shared.lock");
    const transactionDir = path.join(rootDir, "out", "file-transactions", "missing-transaction");
    fs.writeFileSync(lockPath, `${JSON.stringify({
        version: 1,
        transactionId: "orphan",
        transactionDir,
        journalPath: path.join(transactionDir, "journal.json"),
        workspaceRoot: rootDir,
        transactionRoot: path.join(rootDir, "out", "file-transactions"),
    })}\n`);

    assert.throws(() => runGovernedFileTransactionSync({
        workspaceRoot: rootDir,
        transactionRoot: path.join(rootDir, "out", "file-transactions"),
        lockPath,
        changes: [{
            filePath: path.join(rootDir, "templates", "target.json"),
            data: "{}\n",
        }],
    }), /transaction is locked/);

    const dryRun = recoverGovernedFileTransactionSync(lockPath, {
        workspaceRoot: rootDir,
    });
    assert.equal(dryRun.orphanLock, true);
    assert.equal(dryRun.recovered, false);
    const recovered = recoverGovernedFileTransactionSync(lockPath, {
        workspaceRoot: rootDir,
        write: true,
    });
    assert.equal(recovered.recoveryAction, "removed-orphan-lock");
    assert.equal(fs.existsSync(lockPath), false);
});

test("governed file transaction recovery rejects untrusted lock and journal paths", () => {
    const rootDir = makeWorkspace();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-file-transaction-outside-"));
    const transactionRoot = path.join(rootDir, "out", "file-transactions");
    const transactionDir = path.join(transactionRoot, "crafted");
    const lockPath = path.join(transactionRoot, "crafted.lock");
    fs.mkdirSync(transactionDir, { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify({
        version: 1,
        transactionId: "crafted",
        transactionDir,
        journalPath: path.join(outsideDir, "journal.json"),
        workspaceRoot: rootDir,
        transactionRoot,
    })}\n`);

    assert.throws(
        () => recoverGovernedFileTransactionSync(lockPath, {
            workspaceRoot: rootDir,
        }),
        /journal escapes its transaction directory/
    );

    fs.writeFileSync(lockPath, `${JSON.stringify({
        version: 1,
        transactionId: "crafted",
        transactionDir,
        journalPath: path.join(transactionDir, "journal.json"),
        workspaceRoot: outsideDir,
        transactionRoot,
    })}\n`);
    assert.throws(
        () => recoverGovernedFileTransactionSync(lockPath, {
            workspaceRoot: rootDir,
        }),
        /workspace does not match/
    );
});

test("governed file transaction rejects workspace paths that resolve through an outside link", () => {
    const rootDir = makeWorkspace();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-file-transaction-link-target-"));
    const linkedDir = path.join(rootDir, "templates", "linked-outside");
    fs.symlinkSync(outsideDir, linkedDir, process.platform === "win32" ? "junction" : "dir");
    const outsideTarget = path.join(outsideDir, "target.json");

    assert.throws(
        () => runGovernedFileTransactionSync({
            workspaceRoot: rootDir,
            transactionRoot: path.join(rootDir, "out", "file-transactions"),
            transactionName: "outside-link-fixture",
            changes: [{
                filePath: path.join(linkedDir, "target.json"),
                data: "{}\n",
            }],
        }),
        /target resolves outside the workspace/
    );
    assert.equal(fs.existsSync(outsideTarget), false);
});
