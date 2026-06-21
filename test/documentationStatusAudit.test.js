const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    auditDocumentationStatus,
    auditDocumentationText,
    buildN3WordDocumentationSnapshot,
} = require("../src/services/documentationStatusAuditService");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

function readDocumentationFiles() {
    return Object.fromEntries([
        "README.md",
        "CHANGELOG.md",
        "CLAUDE.md",
        "docs/workflows.md",
        "docs/command-reference.md",
        "docs/documentation-standard.md",
        "docs/employer-overview.md",
        "docs/product-exit-criteria.md",
        "docs/release-qa-checklist.md",
        "docs/release-process.md",
        "docs/system-architecture.md",
        "docs/verification.md",
        "package.json",
    ].map((relativePath) => [relativePath, readRepoFile(relativePath)]));
}

test("documentation status snapshots match tracked N3 word lane counts", () => {
    const report = auditDocumentationStatus({ rootDir: repoRoot });
    const n3WordSnapshot = buildN3WordDocumentationSnapshot({ rootDir: repoRoot });

    assert.equal(report.passed, true, report.failures.join("\n"));
    assert.deepEqual(report.snapshot.gold, n3WordSnapshot.gold);
    assert.deepEqual(report.snapshot.sapphire, n3WordSnapshot.sapphire);
    assert.deepEqual(report.snapshot.platinum, n3WordSnapshot.platinum);
    assert.equal(report.snapshot.product.kanjiDenominator, 2212);
    assert.equal(report.snapshot.product.wordDenominator, 2132);
    assert.equal(report.snapshot.product.kanjiObsidianProof, 982);
    assert.equal(report.snapshot.product.wordObsidianProof, 987);
});

test("documentation status audit catches stale N3 word Gold counts", () => {
    const files = readDocumentationFiles();
    files["README.md"] = files["README.md"].replace("1081/1081", "315/1081").replace("`0` generated rows still missing Gold", "`766` generated rows still missing Gold");
    files["CHANGELOG.md"] = files["CHANGELOG.md"].replace("1081/1081", "315/1081").replace("`0` generated rows still missing", "`766` generated rows still missing");

    const report = auditDocumentationText({
        files,
        n3WordSnapshot: {
            denominator: 1081,
            gold: { ratio: "1081/1081", missing: 0 },
            sapphire: { ratio: "8/1081", missing: 1073 },
            platinum: { ratio: "8/1081", missing: 1073 },
            obsidianProofRecorded: false,
        },
    });

    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("README.md")), true);
    assert.equal(report.failures.some((failure) => failure.includes("CHANGELOG.md")), true);
});

test("documentation status audit catches closeout wording that omits Obsidian", () => {
    const files = readDocumentationFiles();
    files["README.md"] = files["README.md"].replace(
        "lower-lane Silver/Gold/Sapphire/Platinum count matrix",
        "Silver-Gold-Sapphire-Platinum counts",
    );

    const report = auditDocumentationText({
        files,
        n3WordSnapshot: {
            denominator: 1081,
            gold: { ratio: "1081/1081", missing: 0 },
            sapphire: { ratio: "8/1081", missing: 1073 },
            platinum: { ratio: "8/1081", missing: 1073 },
            obsidianProofRecorded: false,
        },
    });

    assert.equal(report.passed, false);
    assert.equal(
        report.failures.some((failure) => failure.includes("must not omit Obsidian")),
        true,
    );
});

test("documentation status audit catches a missing package script", () => {
    const files = readDocumentationFiles();
    files["package.json"] = files["package.json"].replace(
        '    "docs:status-audit": "node scripts/auditDocumentationStatus.js",\n',
        "",
    );

    const report = auditDocumentationText({
        files,
        n3WordSnapshot: {
            denominator: 1081,
            gold: { ratio: "1081/1081", missing: 0 },
            sapphire: { ratio: "8/1081", missing: 1073 },
            platinum: { ratio: "8/1081", missing: 1073 },
            obsidianProofRecorded: false,
        },
    });

    assert.equal(report.passed, false);
    assert.equal(
        report.failures.some((failure) => failure.includes("package.json")),
        true,
    );
});

test("documentation status audit catches undocumented package scripts", () => {
    const files = readDocumentationFiles();
    files["docs/command-reference.md"] = files["docs/command-reference.md"].replace(
        "| `npm run bench:build` | Measure local deck build/package performance for selected levels without applying a timing budget; use the gate variants for budget enforcement |\n",
        "",
    );

    const report = auditDocumentationText({
        files,
        n3WordSnapshot: {
            denominator: 1081,
            gold: { ratio: "1081/1081", missing: 0 },
            sapphire: { ratio: "8/1081", missing: 1073 },
            platinum: { ratio: "8/1081", missing: 1073 },
            obsidianProofRecorded: false,
        },
    });

    assert.equal(report.passed, false);
    assert.equal(
        report.failures.some((failure) => failure.includes("bench:build")),
        true,
    );
});

test("documentation status audit catches stale generated denominator docs", () => {
    const files = readDocumentationFiles();
    files["docs/employer-overview.md"] = files["docs/employer-overview.md"]
        .replace("`2132` word rows", "`1470` word rows")
        .replace("`2132/2132` across N5-N1 | `987/2132`", "`1470/1470` across N5-N1 | `987/1470`");
    files["docs/system-architecture.md"] = files["docs/system-architecture.md"]
        .replace("| Words | 2132 | 987 |", "| Words | 1470 | 987 |");

    const report = auditDocumentationText({
        files,
        n3WordSnapshot: {
            denominator: 1081,
            gold: { ratio: "1081/1081", missing: 0 },
            sapphire: { ratio: "8/1081", missing: 1073 },
            platinum: { ratio: "8/1081", missing: 1073 },
            obsidianProofRecorded: false,
        },
    });

    assert.equal(report.passed, false);
    assert.equal(
        report.failures.some((failure) => failure.includes("1470")),
        true,
    );
});

test("documentation status audit catches Obsidian-decentered completed status wording", () => {
    const files = readDocumentationFiles();
    files["README.md"] = files["README.md"].replace(
        "`287/287` strict word Obsidian-certified",
        "`287` canonical rows. Gold, readiness, tracked-source artifact, native Sapphire structural coverage, Platinum, and strict word Obsidian content certification pass at `287/287`",
    );

    const report = auditDocumentationText({
        files,
        n3WordSnapshot: {
            denominator: 1081,
            gold: { ratio: "1081/1081", missing: 0 },
            sapphire: { ratio: "8/1081", missing: 1073 },
            platinum: { ratio: "8/1081", missing: 1073 },
            obsidianProofRecorded: false,
        },
    });

    assert.equal(report.passed, false);
    assert.equal(
        report.failures.some((failure) => failure.includes("Obsidian-decentered")),
        true,
    );
});
