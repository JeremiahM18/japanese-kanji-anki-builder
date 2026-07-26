const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { isPathInside } = require("./fs");

let transactionCounter = 0;

/**
 * @typedef {object} GovernedTransactionJournalChange
 * @property {number} index
 * @property {string} filePath
 * @property {boolean} beforeExists
 * @property {string | null} beforeSha256
 * @property {string} afterSha256
 * @property {string | null} backupPath
 * @property {string} stagePath
 */

/**
 * @typedef {object} GovernedTransactionJournal
 * @property {number} version
 * @property {string} transactionId
 * @property {string} transactionDir
 * @property {string} journalPath
 * @property {string} workspaceRoot
 * @property {string} transactionRoot
 * @property {number} pid
 * @property {string} createdAt
 * @property {string} lockPath
 * @property {string} status
 * @property {number[]} committedIndexes
 * @property {GovernedTransactionJournalChange[]} changes
 * @property {string} [committedAt]
 * @property {string} [failure]
 * @property {string[]} [rollbackFailures]
 */

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeForPathComparison(filePath) {
    const resolved = path.resolve(filePath);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function sameResolvedPath(left, right) {
    return normalizeForPathComparison(left) === normalizeForPathComparison(right);
}

function resolveExistingAncestorRealPath(filePath, fsImpl = fs) {
    let current = path.resolve(filePath);
    while (true) {
        try {
            return fsImpl.realpathSync(current);
        } catch (error) {
            if (error?.code !== "ENOENT") {
                throw error;
            }
            const parent = path.dirname(current);
            if (parent === current) {
                throw new Error(`No existing ancestor is available for governed path: ${filePath}`);
            }
            current = parent;
        }
    }
}

function assertRealPathInsideWorkspace(filePath, workspaceRoot, fsImpl = fs, label = "path") {
    const realWorkspaceRoot = fsImpl.realpathSync(path.resolve(workspaceRoot));
    const realExistingAncestor = resolveExistingAncestorRealPath(filePath, fsImpl);
    if (
        !sameResolvedPath(realExistingAncestor, realWorkspaceRoot)
        && !isPathInside(realExistingAncestor, realWorkspaceRoot)
    ) {
        throw new Error(
            `Governed file transaction ${label} resolves outside the workspace: `
            + `${path.resolve(filePath)} -> ${realExistingAncestor}`
        );
    }
}

function ensureDirSync(dirPath, fsImpl = fs) {
    fsImpl.mkdirSync(dirPath, { recursive: true });
}

function readFileState(filePath, fsImpl = fs) {
    try {
        const bytes = fsImpl.readFileSync(filePath);
        return {
            exists: true,
            bytes,
            sha256: sha256(bytes),
        };
    } catch (error) {
        if (error?.code === "ENOENT") {
            return {
                exists: false,
                bytes: null,
                sha256: null,
            };
        }
        throw error;
    }
}

/**
 * @param {unknown} data
 * @param {BufferEncoding} [encoding]
 */
function normalizeWriteData(data, encoding = "utf8") {
    return Buffer.isBuffer(data) ? data : Buffer.from(String(data), encoding);
}

function writeDurableFileSync(filePath, data, {
    flag = "w",
    fsImpl = fs,
} = {}) {
    ensureDirSync(path.dirname(filePath), fsImpl);
    const descriptor = fsImpl.openSync(filePath, flag);
    try {
        fsImpl.writeFileSync(descriptor, data);
        fsImpl.fsyncSync(descriptor);
    } finally {
        fsImpl.closeSync(descriptor);
    }
}

function replaceFileDurablySync(filePath, data, {
    fsImpl = fs,
    suffix = "replace",
} = {}) {
    const resolvedTarget = path.resolve(filePath);
    const tempPath = path.join(
        path.dirname(resolvedTarget),
        `.${path.basename(resolvedTarget)}.${process.pid}.${Date.now()}.${transactionCounter}.${suffix}.tmp`
    );
    transactionCounter += 1;
    try {
        writeDurableFileSync(tempPath, data, { fsImpl });
        fsImpl.renameSync(tempPath, resolvedTarget);
    } finally {
        try {
            fsImpl.rmSync(tempPath, { force: true });
        } catch {
            // The rename normally consumes the temporary file.
        }
    }
}

function writeJournalSync(journalPath, journal, fsImpl = fs) {
    replaceFileDurablySync(
        journalPath,
        `${JSON.stringify(journal, null, 2)}\n`,
        { fsImpl, suffix: "journal" }
    );
}

function sanitizeTransactionName(value) {
    const normalized = String(value || "transaction")
        .trim()
        .replace(/[^A-Za-z0-9._-]+/gu, "-")
        .replace(/^-+|-+$/gu, "")
        .slice(0, 64);
    return normalized || "transaction";
}

/**
 * @param {{
 *   transactionName?: string,
 *   transactionRoot?: string,
 *   now?: () => Date,
 * }} [options]
 */
function buildTransactionPaths({
    transactionName = "transaction",
    transactionRoot = path.resolve("out/file-transactions"),
    now = () => new Date(),
} = {}) {
    const createdAt = now().toISOString();
    const stamp = createdAt.replace(/[:.]/gu, "-");
    const safeName = sanitizeTransactionName(transactionName);
    const transactionId = `${safeName}-${stamp}-${process.pid}-${transactionCounter}`;
    transactionCounter += 1;
    const transactionDir = path.join(path.resolve(transactionRoot), transactionId);
    return {
        createdAt,
        transactionDir,
        journalPath: path.join(transactionDir, "journal.json"),
        transactionId,
    };
}

function acquireLockSync(lockPath, lockRecord, fsImpl = fs) {
    ensureDirSync(path.dirname(lockPath), fsImpl);
    try {
        writeDurableFileSync(lockPath, `${JSON.stringify(lockRecord, null, 2)}\n`, {
            flag: "wx",
            fsImpl,
        });
    } catch (error) {
        if (error?.code === "EEXIST") {
            throw new Error(
                `Governed file transaction is locked: ${lockPath}. `
                + "Inspect it with data:transactions:recover before retrying; do not delete it blindly."
            );
        }
        throw error;
    }
}

/**
 * @param {Array<{
 *   filePath: string,
 *   data: unknown,
 *   encoding?: BufferEncoding,
 *   expectedBeforeSha256?: string | null,
 * }>} changes
 * @param {{workspaceRoot?: string, fsImpl?: typeof fs}} [options]
 */
function normalizeChanges(changes, {
    workspaceRoot = process.cwd(),
    fsImpl = fs,
} = {}) {
    if (!Array.isArray(changes) || changes.length === 0) {
        throw new Error("Governed file transaction requires at least one file change.");
    }
    const seen = new Set();
    return changes.map((change, index) => {
        const filePath = path.resolve(change.filePath);
        if (seen.has(filePath)) {
            throw new Error(`Governed file transaction contains duplicate target: ${filePath}`);
        }
        seen.add(filePath);
        if (!isPathInside(filePath, workspaceRoot)) {
            throw new Error(`Governed file transaction target is outside the workspace root: ${filePath}`);
        }
        assertRealPathInsideWorkspace(filePath, workspaceRoot, fsImpl, "target");
        const before = readFileState(filePath, fsImpl);
        if (
            Object.hasOwn(change, "expectedBeforeSha256")
            && change.expectedBeforeSha256 !== before.sha256
        ) {
            throw new Error(
                `Governed file transaction target changed after validation: ${filePath}; `
                + `expected ${change.expectedBeforeSha256 || "(missing)"}, found ${before.sha256 || "(missing)"}.`
            );
        }
        const bytes = normalizeWriteData(change.data, change.encoding);
        return {
            index,
            filePath,
            before,
            bytes,
            afterSha256: sha256(bytes),
        };
    });
}

function prepareTransactionFiles({
    normalizedChanges,
    transactionDir,
    fsImpl = fs,
}) {
    ensureDirSync(transactionDir, fsImpl);
    const prepared = [];
    try {
        for (const change of normalizedChanges) {
            const backupPath = path.join(transactionDir, `backup-${String(change.index).padStart(4, "0")}.bin`);
            const stagePath = path.join(
                path.dirname(change.filePath),
                `.${path.basename(change.filePath)}.${process.pid}.${Date.now()}.${change.index}.stage.tmp`
            );
            const record = {
                index: change.index,
                filePath: change.filePath,
                beforeExists: change.before.exists,
                beforeSha256: change.before.sha256,
                afterSha256: change.afterSha256,
                backupPath: change.before.exists ? backupPath : null,
                stagePath,
            };
            prepared.push(record);
            if (change.before.exists) {
                writeDurableFileSync(backupPath, change.before.bytes, { fsImpl });
            }
            writeDurableFileSync(stagePath, change.bytes, { fsImpl });
        }
        return prepared;
    } catch (error) {
        for (const record of prepared) {
            try {
                fsImpl.rmSync(record.stagePath, { force: true });
            } catch {
                // Preserve the preparation error.
            }
        }
        try {
            fsImpl.rmSync(transactionDir, { recursive: true, force: true });
        } catch {
            // Preserve the preparation error.
        }
        throw error;
    }
}

function removeTransactionArtifacts({
    journal,
    fsImpl = fs,
}) {
    for (const change of journal.changes || []) {
        try {
            fsImpl.rmSync(change.stagePath, { force: true });
        } catch {
            // Cleanup errors are handled by the transaction directory removal.
        }
    }
    if (
        journal.transactionDir
        && journal.transactionRoot
        && isPathInside(journal.transactionDir, journal.transactionRoot)
    ) {
        fsImpl.rmSync(journal.transactionDir, { recursive: true, force: true });
    }
}

function restoreTransactionTargets({
    journal,
    fsImpl = fs,
}) {
    const failures = [];
    for (const change of [...(journal.changes || [])].reverse()) {
        try {
            const current = readFileState(change.filePath, fsImpl);
            const knownState = current.sha256 === change.beforeSha256
                || current.sha256 === change.afterSha256
                || (!current.exists && !change.beforeExists);
            if (!knownState) {
                throw new Error(
                    `target has unrecognized content ${current.sha256 || "(missing)"}; `
                    + `expected before ${change.beforeSha256 || "(missing)"} or after ${change.afterSha256}`
                );
            }
            if (change.beforeExists) {
                const backup = fsImpl.readFileSync(change.backupPath);
                if (sha256(backup) !== change.beforeSha256) {
                    throw new Error("backup hash does not match the journal");
                }
                replaceFileDurablySync(change.filePath, backup, { fsImpl, suffix: "rollback" });
            } else if (current.exists) {
                fsImpl.rmSync(change.filePath, { force: true });
            }
            const restored = readFileState(change.filePath, fsImpl);
            if (restored.exists !== change.beforeExists || restored.sha256 !== change.beforeSha256) {
                throw new Error("restored target does not match the recorded pre-transaction state");
            }
        } catch (error) {
            failures.push(`${change.filePath}: ${error.message}`);
        }
    }
    return failures;
}

function runGovernedFileTransactionSync({
    changes = null,
    prepareChanges = null,
    transactionName = "transaction",
    transactionRoot = path.resolve("out/file-transactions"),
    lockPath = null,
    workspaceRoot = process.cwd(),
    validateAfterWrite = null,
    fsImpl = fs,
    now = () => new Date(),
    injectFailure = null,
} = {}) {
    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedTransactionRoot = path.resolve(transactionRoot);
    if (!isPathInside(resolvedTransactionRoot, resolvedWorkspaceRoot)) {
        throw new Error(`Transaction root must stay inside the workspace: ${resolvedTransactionRoot}`);
    }
    assertRealPathInsideWorkspace(
        resolvedTransactionRoot,
        resolvedWorkspaceRoot,
        fsImpl,
        "transaction root"
    );
    const transactionPaths = buildTransactionPaths({
        transactionName,
        transactionRoot: resolvedTransactionRoot,
        now,
    });
    const resolvedLockPath = path.resolve(
        lockPath || path.join(resolvedTransactionRoot, `${sanitizeTransactionName(transactionName)}.lock`)
    );
    if (!isPathInside(resolvedLockPath, resolvedWorkspaceRoot)) {
        throw new Error(`Transaction lock must stay inside the workspace: ${resolvedLockPath}`);
    }
    if (!isPathInside(resolvedLockPath, resolvedTransactionRoot)) {
        throw new Error(`Transaction lock must stay inside the transaction root: ${resolvedLockPath}`);
    }
    assertRealPathInsideWorkspace(resolvedLockPath, resolvedWorkspaceRoot, fsImpl, "lock");

    const lockRecord = {
        version: 1,
        transactionId: transactionPaths.transactionId,
        transactionDir: transactionPaths.transactionDir,
        journalPath: transactionPaths.journalPath,
        workspaceRoot: resolvedWorkspaceRoot,
        transactionRoot: resolvedTransactionRoot,
        pid: process.pid,
        createdAt: transactionPaths.createdAt,
    };
    acquireLockSync(resolvedLockPath, lockRecord, fsImpl);
    /** @type {GovernedTransactionJournal | null} */
    let journal = null;
    let metadata = null;
    let cleanupCompleted = false;

    try {
        const prepared = typeof prepareChanges === "function"
            ? prepareChanges()
            : { changes };
        const preparedChanges = Array.isArray(prepared) ? prepared : prepared?.changes;
        metadata = Array.isArray(prepared) ? null : prepared?.metadata;
        const normalizedChanges = normalizeChanges(preparedChanges, {
            workspaceRoot: resolvedWorkspaceRoot,
            fsImpl,
        });
        const journalChanges = prepareTransactionFiles({
            normalizedChanges,
            transactionDir: transactionPaths.transactionDir,
            fsImpl,
        });
        journal = {
            ...lockRecord,
            lockPath: resolvedLockPath,
            status: "prepared",
            committedIndexes: [],
            changes: journalChanges,
        };
        writeJournalSync(transactionPaths.journalPath, journal, fsImpl);
        injectFailure?.("prepared", { journal, metadata });

        for (const change of journal.changes) {
            injectFailure?.("before-commit", { change, journal, metadata });
            fsImpl.renameSync(change.stagePath, change.filePath);
            const committed = readFileState(change.filePath, fsImpl);
            if (committed.sha256 !== change.afterSha256) {
                throw new Error(`Committed target hash mismatch: ${change.filePath}`);
            }
            journal.status = "committing";
            journal.committedIndexes.push(change.index);
            writeJournalSync(transactionPaths.journalPath, journal, fsImpl);
            injectFailure?.("after-commit", { change, journal, metadata });
        }

        if (typeof validateAfterWrite === "function") {
            validateAfterWrite({ journal, metadata });
        }
        injectFailure?.("after-validation", { journal, metadata });
        journal.status = "committed";
        journal.committedAt = now().toISOString();
        writeJournalSync(transactionPaths.journalPath, journal, fsImpl);
        removeTransactionArtifacts({ journal, fsImpl });
        fsImpl.rmSync(resolvedLockPath, { force: true });
        cleanupCompleted = true;
        return {
            committed: true,
            metadata,
            targetCount: journal.changes.length,
            transactionId: journal.transactionId,
        };
    } catch (error) {
        if (!journal) {
            fsImpl.rmSync(resolvedLockPath, { force: true });
            cleanupCompleted = true;
            throw error;
        }
        const rollbackFailures = restoreTransactionTargets({ journal, fsImpl });
        if (rollbackFailures.length === 0) {
            removeTransactionArtifacts({ journal, fsImpl });
            fsImpl.rmSync(resolvedLockPath, { force: true });
            cleanupCompleted = true;
            const wrapped = new Error(`Governed file transaction rolled back: ${error.message}`);
            wrapped.cause = error;
            throw wrapped;
        }
        journal.status = "recovery_required";
        journal.failure = error.message;
        journal.rollbackFailures = rollbackFailures;
        writeJournalSync(transactionPaths.journalPath, journal, fsImpl);
        throw new Error(
            `Governed file transaction requires explicit recovery. Lock: ${resolvedLockPath}. `
            + `Journal: ${transactionPaths.journalPath}. Failures: ${rollbackFailures.join("; ")}`
        );
    } finally {
        if (!cleanupCompleted && !journal) {
            try {
                fsImpl.rmSync(resolvedLockPath, { force: true });
            } catch {
                // Preserve the original error if cleanup itself fails.
            }
        }
    }
}

function assertRecoveryMetadata({
    lockPath,
    lock,
    journal,
    workspaceRoot,
    fsImpl = fs,
}) {
    const resolvedLockPath = path.resolve(lockPath);
    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    if (lock?.version !== 1) {
        throw new Error(`Unsupported governed file transaction lock version: ${lock?.version}`);
    }
    for (const field of [
        "transactionId",
        "transactionDir",
        "journalPath",
        "workspaceRoot",
        "transactionRoot",
    ]) {
        if (typeof lock?.[field] !== "string" || !lock[field].trim()) {
            throw new Error(`Governed file transaction lock is missing ${field}.`);
        }
    }
    const resolvedRecordedWorkspace = path.resolve(lock.workspaceRoot);
    const resolvedTransactionRoot = path.resolve(lock.transactionRoot);
    const resolvedTransactionDir = path.resolve(lock.transactionDir);
    const resolvedJournalPath = path.resolve(lock.journalPath);
    if (!sameResolvedPath(resolvedRecordedWorkspace, resolvedWorkspaceRoot)) {
        throw new Error(
            `Governed file transaction lock workspace does not match the requested workspace: `
            + `${resolvedRecordedWorkspace} !== ${resolvedWorkspaceRoot}`
        );
    }
    if (!isPathInside(resolvedTransactionRoot, resolvedWorkspaceRoot)) {
        throw new Error(`Governed file transaction root escapes the workspace: ${resolvedTransactionRoot}`);
    }
    if (!isPathInside(resolvedLockPath, resolvedTransactionRoot)) {
        throw new Error(`Governed file transaction lock escapes its transaction root: ${resolvedLockPath}`);
    }
    if (!isPathInside(resolvedTransactionDir, resolvedTransactionRoot)) {
        throw new Error(`Governed file transaction directory escapes its transaction root: ${resolvedTransactionDir}`);
    }
    if (!isPathInside(resolvedJournalPath, resolvedTransactionDir)) {
        throw new Error(`Governed file transaction journal escapes its transaction directory: ${resolvedJournalPath}`);
    }
    for (const [candidatePath, label] of [
        [resolvedLockPath, "lock"],
        [resolvedTransactionRoot, "transaction root"],
        [resolvedTransactionDir, "transaction directory"],
        [resolvedJournalPath, "journal"],
    ]) {
        assertRealPathInsideWorkspace(candidatePath, resolvedWorkspaceRoot, fsImpl, label);
    }
    if (!journal) {
        return;
    }
    for (const [field, expected] of [
        ["transactionId", lock.transactionId],
        ["transactionDir", resolvedTransactionDir],
        ["journalPath", resolvedJournalPath],
        ["workspaceRoot", resolvedWorkspaceRoot],
        ["transactionRoot", resolvedTransactionRoot],
        ["lockPath", resolvedLockPath],
    ]) {
        const actual = journal[field];
        const matches = field === "transactionId"
            ? actual === expected
            : typeof actual === "string" && sameResolvedPath(actual, expected);
        if (!matches) {
            throw new Error(`Governed file transaction journal ${field} does not match its lock.`);
        }
    }
    if (!Array.isArray(journal.changes) || journal.changes.length === 0) {
        throw new Error("Governed file transaction journal must contain at least one target.");
    }
    const targetPaths = new Set();
    const indexes = new Set();
    for (const change of journal.changes) {
        if (!Number.isSafeInteger(change?.index) || change.index < 0 || indexes.has(change.index)) {
            throw new Error("Governed file transaction journal contains an invalid or duplicate target index.");
        }
        indexes.add(change.index);
        const resolvedTarget = path.resolve(change.filePath || "");
        const targetKey = normalizeForPathComparison(resolvedTarget);
        if (!isPathInside(resolvedTarget, resolvedWorkspaceRoot) || targetPaths.has(targetKey)) {
            throw new Error(`Governed file transaction journal contains an unsafe or duplicate target: ${resolvedTarget}`);
        }
        assertRealPathInsideWorkspace(resolvedTarget, resolvedWorkspaceRoot, fsImpl, "journal target");
        targetPaths.add(targetKey);
        const resolvedStagePath = path.resolve(change.stagePath || "");
        if (
            !isPathInside(resolvedStagePath, resolvedWorkspaceRoot)
            || !sameResolvedPath(path.dirname(resolvedStagePath), path.dirname(resolvedTarget))
        ) {
            throw new Error(`Governed file transaction stage path is not beside its target: ${resolvedStagePath}`);
        }
        assertRealPathInsideWorkspace(resolvedStagePath, resolvedWorkspaceRoot, fsImpl, "journal stage");
        if (change.beforeExists) {
            const resolvedBackupPath = path.resolve(change.backupPath || "");
            if (!isPathInside(resolvedBackupPath, resolvedTransactionDir)) {
                throw new Error(`Governed file transaction backup escapes its transaction directory: ${resolvedBackupPath}`);
            }
            assertRealPathInsideWorkspace(resolvedBackupPath, resolvedWorkspaceRoot, fsImpl, "journal backup");
            if (!/^[a-f0-9]{64}$/u.test(change.beforeSha256 || "")) {
                throw new Error(`Governed file transaction target has an invalid before hash: ${resolvedTarget}`);
            }
        } else if (change.backupPath !== null || change.beforeSha256 !== null) {
            throw new Error(`Governed file transaction missing-target metadata is inconsistent: ${resolvedTarget}`);
        }
        if (!/^[a-f0-9]{64}$/u.test(change.afterSha256 || "")) {
            throw new Error(`Governed file transaction target has an invalid after hash: ${resolvedTarget}`);
        }
    }
}

function inspectGovernedFileTransactionLock(lockPath, {
    fsImpl = fs,
    workspaceRoot = process.cwd(),
} = {}) {
    const resolvedLockPath = path.resolve(lockPath);
    const lock = JSON.parse(fsImpl.readFileSync(resolvedLockPath, "utf8"));
    assertRecoveryMetadata({
        lockPath: resolvedLockPath,
        lock,
        journal: null,
        workspaceRoot,
        fsImpl,
    });
    let journal = null;
    try {
        journal = JSON.parse(fsImpl.readFileSync(lock.journalPath, "utf8"));
    } catch (error) {
        if (error?.code !== "ENOENT") {
            throw error;
        }
    }
    assertRecoveryMetadata({
        lockPath: resolvedLockPath,
        lock,
        journal,
        workspaceRoot,
        fsImpl,
    });
    const targetStates = (journal?.changes || []).map((change) => {
        const current = readFileState(change.filePath, fsImpl);
        let state = "unknown";
        if (current.sha256 === change.beforeSha256 || (!current.exists && !change.beforeExists)) {
            state = "before";
        } else if (current.sha256 === change.afterSha256) {
            state = "after";
        }
        return {
            filePath: change.filePath,
            state,
            currentSha256: current.sha256,
            beforeSha256: change.beforeSha256,
            afterSha256: change.afterSha256,
        };
    });
    return {
        lockPath: resolvedLockPath,
        lock,
        journal,
        orphanLock: !journal,
        recoverable: !journal || targetStates.every((state) => state.state !== "unknown"),
        targetStates,
    };
}

function recoverGovernedFileTransactionSync(lockPath, {
    write = false,
    fsImpl = fs,
    workspaceRoot = process.cwd(),
} = {}) {
    const report = inspectGovernedFileTransactionLock(lockPath, {
        fsImpl,
        workspaceRoot,
    });
    if (!report.recoverable) {
        throw new Error(
            `Refusing recovery because one or more targets have unrecognized content: `
            + report.targetStates.filter((state) => state.state === "unknown").map((state) => state.filePath).join(", ")
        );
    }
    if (!write) {
        return {
            ...report,
            recovered: false,
        };
    }
    if (report.orphanLock) {
        fsImpl.rmSync(report.lockPath, { force: true });
        return {
            ...report,
            recovered: true,
            recoveryAction: "removed-orphan-lock",
        };
    }
    const rollbackFailures = restoreTransactionTargets({
        journal: report.journal,
        fsImpl,
    });
    if (rollbackFailures.length > 0) {
        throw new Error(`Governed file transaction recovery failed: ${rollbackFailures.join("; ")}`);
    }
    removeTransactionArtifacts({ journal: report.journal, fsImpl });
    fsImpl.rmSync(report.lockPath, { force: true });
    return {
        ...report,
        recovered: true,
        recoveryAction: "restored-pre-transaction-state",
    };
}

module.exports = {
    inspectGovernedFileTransactionLock,
    readFileState,
    recoverGovernedFileTransactionSync,
    runGovernedFileTransactionSync,
    sha256,
};
