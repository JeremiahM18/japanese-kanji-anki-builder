const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
    loadObsidianProofLedger,
} = require("../datasets/obsidianProofLedger");
const {
    assertSafeGeneratedPath,
    ensureDir,
    getDefaultGeneratedPathRoots,
} = require("../utils/fs");
const { hashFileSync } = require("../utils/fileHash");
const { resolvePythonCommand } = require("./toolchainService");

const DEFAULT_OBSIDIAN_PROOF_SQLITE_DIR = path.join("out", "obsidian-proof", "sqlite");
const DEFAULT_OBSIDIAN_PROOF_SQLITE_DB_FILE = "obsidian-proof-ledger.sqlite";
const OBSIDIAN_PROOF_SQLITE_PAYLOAD_SCHEMA_VERSION = 1;

function toPosixPath(value) {
    return String(value).replace(/\\/g, "/");
}

function writeJsonFile(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildFileHashRecord({ cwd, filePath }) {
    const hash = hashFileSync(filePath);
    return {
        path: toPosixPath(path.relative(cwd, filePath)),
        bytes: hash.bytes,
        sha256: hash.sha256,
    };
}

function resolveSqliteOutput({
    cwd,
    outputDir = DEFAULT_OBSIDIAN_PROOF_SQLITE_DIR,
    dbFile = DEFAULT_OBSIDIAN_PROOF_SQLITE_DB_FILE,
} = {}) {
    if (!/^[A-Za-z0-9_.-]+$/.test(dbFile)) {
        throw new Error(`SQLite mirror database filename must be a plain filename: ${dbFile}`);
    }
    if (!dbFile.endsWith(".sqlite") && !dbFile.endsWith(".db")) {
        throw new Error(`SQLite mirror database filename must end in .sqlite or .db: ${dbFile}`);
    }

    const resolvedCwd = path.resolve(cwd || process.cwd());
    const allowedRoots = getDefaultGeneratedPathRoots({ cwd: resolvedCwd });
    const resolvedOutputDir = path.resolve(resolvedCwd, outputDir);
    assertSafeGeneratedPath(resolvedOutputDir, {
        allowedRoots,
        label: "Obsidian proof SQLite output directory",
    });
    const outputDbPath = path.join(resolvedOutputDir, dbFile);
    assertSafeGeneratedPath(outputDbPath, {
        allowedRoots,
        label: "Obsidian proof SQLite database",
    });
    return {
        outputDir: resolvedOutputDir,
        outputDbPath,
    };
}

function buildSqlitePayload({
    ledger,
    cwd,
}) {
    return {
        schemaVersion: OBSIDIAN_PROOF_SQLITE_PAYLOAD_SCHEMA_VERSION,
        sourceOfTruth: "templates/obsidian_proof_ledger/*.jsonl",
        authority: OBSIDIAN_PROOF_LEDGER_AUTHORITY,
        ledgerDir: toPosixPath(path.relative(cwd, ledger.ledgerDir)),
        ledgerFiles: ledger.files.map((file) => toPosixPath(path.relative(cwd, file))),
        inputHashes: {
            ledgerFiles: ledger.files.map((file) => buildFileHashRecord({ cwd, filePath: file })),
        },
        events: ledger.events,
    };
}

function getPythonWriterPath() {
    return path.resolve(__dirname, "..", "..", "scripts", "buildObsidianProofSqlite.py");
}

function getPythonQueryPath() {
    return path.resolve(__dirname, "..", "..", "scripts", "queryObsidianProofSqlite.py");
}

function runPythonScript({
    python,
    scriptPath,
    args,
    label,
}) {
    const result = spawnSync(python.command, [
        ...python.argsPrefix,
        scriptPath,
        ...args,
    ], {
        encoding: "utf8",
        env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
        },
        shell: false,
        windowsHide: true,
    });

    if (result.error) {
        throw new Error(`Failed to run ${label} (${python.command}): ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error([
            `${label} failed with exit code ${result.status}.`,
            result.stderr.trim(),
            result.stdout.trim(),
        ].filter(Boolean).join(" "));
    }

    try {
        return JSON.parse(result.stdout.trim());
    } catch (error) {
        throw new Error(`${label} returned non-JSON output: ${error.message}; output=${result.stdout.trim()}`);
    }
}

function runPythonSqliteWriter({
    python,
    inputJsonPath,
    outputDbPath,
}) {
    return runPythonScript({
        python,
        scriptPath: getPythonWriterPath(),
        label: "Python SQLite writer",
        args: [
            "--input-json",
            inputJsonPath,
            "--output-db",
            outputDbPath,
        ],
    });
}

function runPythonSqliteQuery({
    python,
    outputDbPath,
    deckKind,
    level,
    batchId,
    target,
    limit,
}) {
    const args = [
        "--db",
        outputDbPath,
        "--limit",
        String(limit || 20),
    ];
    if (deckKind) {
        args.push("--deck-kind", deckKind);
    }
    if (level) {
        args.push("--level", String(level));
    }
    if (batchId) {
        args.push("--batch", batchId);
    }
    if (target) {
        args.push("--target", target);
    }

    return runPythonScript({
        python,
        scriptPath: getPythonQueryPath(),
        label: "Python SQLite query",
        args,
    });
}

function resolvePythonRunner(pythonCommand) {
    if (pythonCommand) {
        return {
            command: pythonCommand,
            argsPrefix: [],
            version: null,
        };
    }

    const python = resolvePythonCommand();
    if (!python) {
        throw new Error("Python is required to build the SQLite mirror but was not found.");
    }
    return python;
}

function buildObsidianProofSqliteMirror({
    cwd = process.cwd(),
    ledgerDir,
    outputDir = DEFAULT_OBSIDIAN_PROOF_SQLITE_DIR,
    dbFile = DEFAULT_OBSIDIAN_PROOF_SQLITE_DB_FILE,
    pythonCommand = process.env.PYTHON,
} = {}) {
    const resolvedCwd = path.resolve(cwd);
    const ledger = loadObsidianProofLedger({ cwd: resolvedCwd, ledgerDir });
    const output = resolveSqliteOutput({
        cwd: resolvedCwd,
        outputDir,
        dbFile,
    });

    ensureDir(output.outputDir);
    const payloadPath = path.join(output.outputDir, "obsidian-proof-sqlite-payload.json");
    const payload = buildSqlitePayload({
        ledger,
        cwd: resolvedCwd,
    });
    writeJsonFile(payloadPath, payload);

    const python = resolvePythonRunner(pythonCommand);
    const sqliteSummary = runPythonSqliteWriter({
        python,
        inputJsonPath: payloadPath,
        outputDbPath: output.outputDbPath,
    });

    return {
        passed: true,
        outputDbPath: toPosixPath(path.relative(resolvedCwd, output.outputDbPath)),
        payloadPath: toPosixPath(path.relative(resolvedCwd, payloadPath)),
        ledgerDir: toPosixPath(path.relative(resolvedCwd, ledger.ledgerDir)),
        ledgerFiles: ledger.files.map((file) => toPosixPath(path.relative(resolvedCwd, file))),
        inputHashes: {
            ledgerFiles: ledger.files.map((file) => buildFileHashRecord({ cwd: resolvedCwd, filePath: file })),
        },
        generatedArtifacts: {
            payload: buildFileHashRecord({ cwd: resolvedCwd, filePath: payloadPath }),
            sqlite: buildFileHashRecord({ cwd: resolvedCwd, filePath: output.outputDbPath }),
        },
        proofEvents: ledger.events.length,
        sqlite: {
            ...sqliteSummary,
            outputDb: toPosixPath(path.relative(resolvedCwd, sqliteSummary.outputDb)),
            python: python.command,
            pythonVersion: python.version,
        },
        failures: [],
    };
}

function buildObsidianProofSqliteMirrorReport(options = {}) {
    try {
        return buildObsidianProofSqliteMirror(options);
    } catch (error) {
        return {
            passed: false,
            outputDbPath: null,
            payloadPath: null,
            ledgerDir: options.ledgerDir || null,
            ledgerFiles: [],
            proofEvents: 0,
            sqlite: null,
            failures: [error.message],
        };
    }
}

function queryObsidianProofSqliteMirror({
    deckKind,
    level,
    batchId,
    target,
    limit = 20,
    ...mirrorOptions
} = {}) {
    const mirror = buildObsidianProofSqliteMirror(mirrorOptions);
    const resolvedCwd = path.resolve(mirrorOptions.cwd || process.cwd());
    const python = resolvePythonRunner(mirrorOptions.pythonCommand || process.env.PYTHON);
    const outputDbPath = path.resolve(resolvedCwd, mirror.outputDbPath);
    const query = runPythonSqliteQuery({
        python,
        outputDbPath,
        deckKind,
        level,
        batchId,
        target,
        limit,
    });

    return {
        passed: true,
        mirror,
        query,
        filters: {
            deckKind: deckKind || null,
            level: level || null,
            batchId: batchId || null,
            target: target || null,
            limit,
        },
        failures: [],
    };
}

function queryObsidianProofSqliteMirrorReport(options = {}) {
    try {
        return queryObsidianProofSqliteMirror(options);
    } catch (error) {
        return {
            passed: false,
            mirror: null,
            query: {
                matchedProofEvents: 0,
                rows: [],
                batchCounts: [],
            },
            filters: {},
            failures: [error.message],
        };
    }
}

function formatObsidianProofSqliteMirrorReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Obsidian Proof SQLite Mirror",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Output database: ${report.outputDbPath || "(not written)"}`,
        `Payload: ${report.payloadPath || "(not written)"}`,
        `Ledger proof events: ${report.proofEvents || 0}`,
    ];

    if (report.sqlite) {
        lines.push(
            `SQLite version: ${report.sqlite.sqliteVersion}`,
            `Evidence-check rows: ${report.sqlite.evidenceChecks}`,
            `SQLite sha256: ${report.generatedArtifacts?.sqlite?.sha256 || "(missing)"}`,
            `Payload sha256: ${report.generatedArtifacts?.payload?.sha256 || "(missing)"}`,
            `Tables: ${(report.sqlite.tables || []).join(", ")}`
        );
    }

    lines.push(
        "",
        "Authority boundary:",
        "- SQLite is a generated local mirror for querying and inspection.",
        "- JSONL ledger files remain canonical Obsidian proof.",
        "- The mirror is not Japanese-source evidence, generated TSV authority, APKG authority, NLP certification, or release readiness."
    );

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function formatObsidianProofSqliteQueryReport(report = {}) {
    const query = report.query || {};
    const filters = report.filters || {};
    const lines = [
        "Japanese Kanji Builder Obsidian Proof SQLite Query",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Mirror database: ${report.mirror?.outputDbPath || "(not built)"}`,
        `Matched proof events: ${query.matchedProofEvents || 0}`,
        `Filters: deckKind=${filters.deckKind || "any"}; level=${filters.level || "any"}; batch=${filters.batchId || "any"}; target=${filters.target || "any"}; limit=${filters.limit || 20}`,
    ];

    const rows = Array.isArray(query.rows) ? query.rows : [];
    if (rows.length > 0) {
        lines.push("", "Proof rows:");
        for (const row of rows) {
            lines.push([
                `- ${row.proofId}`,
                `${row.deckKind}:N${row.level}`,
                row.cardReviewed,
                `obsidian=${row.obsidianStandardVersion || "unknown"}`,
                `batch=${row.batchId}`,
                `reviewedAt=${row.reviewedAt}`,
                `reviewer=${row.reviewer}`,
            ].join("; "));
        }
    }

    const batchCounts = Array.isArray(query.batchCounts) ? query.batchCounts : [];
    if (batchCounts.length > 0) {
        lines.push("", "Batch counts:");
        for (const batch of batchCounts) {
            lines.push(`- ${batch.deckKind}:N${batch.level} ${batch.batchId}: ${batch.proofEvents}`);
        }
    }

    lines.push(
        "",
        "Authority boundary:",
        "- Query results come from the generated SQLite mirror.",
        "- JSONL ledger files remain canonical Obsidian proof."
    );

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    DEFAULT_OBSIDIAN_PROOF_SQLITE_DB_FILE,
    DEFAULT_OBSIDIAN_PROOF_SQLITE_DIR,
    OBSIDIAN_PROOF_SQLITE_PAYLOAD_SCHEMA_VERSION,
    buildObsidianProofSqliteMirror,
    buildObsidianProofSqliteMirrorReport,
    buildSqlitePayload,
    formatObsidianProofSqliteQueryReport,
    formatObsidianProofSqliteMirrorReport,
    queryObsidianProofSqliteMirror,
    queryObsidianProofSqliteMirrorReport,
    resolveSqliteOutput,
};
