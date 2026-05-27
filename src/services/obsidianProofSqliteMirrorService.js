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
        events: ledger.events,
    };
}

function getPythonWriterPath() {
    return path.resolve(__dirname, "..", "..", "scripts", "buildObsidianProofSqlite.py");
}

function runPythonSqliteWriter({
    python,
    inputJsonPath,
    outputDbPath,
}) {
    const writerPath = getPythonWriterPath();
    const result = spawnSync(python.command, [
        ...python.argsPrefix,
        writerPath,
        "--input-json",
        inputJsonPath,
        "--output-db",
        outputDbPath,
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
        throw new Error(`Failed to run Python SQLite writer (${python.command}): ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error([
            `Python SQLite writer failed with exit code ${result.status}.`,
            result.stderr.trim(),
            result.stdout.trim(),
        ].filter(Boolean).join(" "));
    }

    try {
        return JSON.parse(result.stdout.trim());
    } catch (error) {
        throw new Error(`Python SQLite writer returned non-JSON output: ${error.message}; output=${result.stdout.trim()}`);
    }
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

module.exports = {
    DEFAULT_OBSIDIAN_PROOF_SQLITE_DB_FILE,
    DEFAULT_OBSIDIAN_PROOF_SQLITE_DIR,
    OBSIDIAN_PROOF_SQLITE_PAYLOAD_SCHEMA_VERSION,
    buildObsidianProofSqliteMirror,
    buildObsidianProofSqliteMirrorReport,
    buildSqlitePayload,
    formatObsidianProofSqliteMirrorReport,
    resolveSqliteOutput,
};
