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
    assert.equal(report.snapshot.product.wordDenominator, 2463);
    assert.equal(report.snapshot.product.kanjiObsidianProof, 982);
    assert.equal(report.snapshot.product.wordLockedDenominator, 1265);
    assert.equal(report.snapshot.product.wordObsidianProof, 1008);
    assert.equal(report.snapshot.product.wordN5Denominator, 546);
    assert.equal(report.snapshot.product.wordN4Denominator, 719);
    assert.equal(report.snapshot.product.wordN5ObsidianProof, 308);
    assert.equal(report.snapshot.product.wordN4ObsidianProof, 700);
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
        "| `npm run bench:build` | Measure local deck build/package performance for selected levels without applying a timing budget; use the gate variants for budget enforcement; add `-- --summary` for compact JSON run/package timing accounting or `-- --keys-only` for report-shape discovery without printing full run payloads |\n",
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
        .replace("`2463` word rows", "`1470` word rows")
        .replace("`2463/2463` across N5-N1 | `1008/2463`", "`1470/1470` across N5-N1 | `987/1470`");
    files["docs/system-architecture.md"] = files["docs/system-architecture.md"]
        .replace("| Words | 2463 | 1008 |", "| Words | 1470 | 987 |");

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
        "`308/546` strict word Obsidian-certified",
        "`308` certified rows. Gold, readiness, tracked-source artifact, native Sapphire structural coverage, Platinum, and strict word Obsidian content certification pass at `308/546`",
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

test("documentation status audit catches word source-depth blocker drift", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"].replace(
        "Source-depth is not a Silver blocker; it is a claim limiter.",
        "Source-depth must pass before free Silver expansion.",
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
        report.failures.some((failure) => failure.includes("claim limiter, not a Silver blocker")),
        true,
    );
});

test("documentation status audit catches word common-pool lane drift", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"].replace(
        "The dictionary common pool is part of the extra expansion lane, not a separate source-depth lane.",
        "The dictionary common pool is separate source-depth work.",
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
        report.failures.some((failure) => failure.includes("dictionary common pool is part of the extra expansion lane")),
        true,
    );
});

test("documentation status audit catches missing word common-pool labels", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"].replace(
        "Dictionary common-pool rows must remain labeled `DICTIONARY COMMON POOL` plus `Source level claim unverified`.",
        "Dictionary common-pool rows need normal review labels.",
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
        report.failures.some((failure) => failure.includes("DICTIONARY COMMON POOL and Source level claim unverified labels")),
        true,
    );
});

test("documentation status audit catches missing word common-pool quality filter doctrine", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"].replace(
        "The default dictionary common-pool view is an editorial shortlist over an audit-visible raw pool, not the raw pool itself.",
        "The dictionary common pool should be reviewed directly.",
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
        report.failures.some((failure) => failure.includes("editorial shortlist over an audit-visible raw pool")),
        true,
    );
});

test("documentation status audit catches missing word common-pool operational queue doctrine", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"]
        .replace(
            "Dictionary common-pool operational queues filter already-reviewed keep, defer, reject, and move rows before the `200`-row cap while keeping their counts audit-visible.",
            "Dictionary common-pool queues can include reviewed and unreviewed rows together.",
        )
        .replace(
            "Use `--queue=silver` to surface kept common-pool rows for later Silver preparation without mixing them into discovery triage",
            "Use one common-pool queue for all review steps",
        );
    files["docs/command-reference.md"] = files["docs/command-reference.md"]
        .replace("`--queue=discovery`", "`--queue=review`")
        .replace("`--queue=all`", "`--queue=history`");

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
        report.failures.some((failure) => failure.includes("filter reviewed history before the 200-row cap")),
        true,
    );
    assert.equal(
        report.failures.some((failure) => failure.includes("common-pool discovery queue command mode")),
        true,
    );
    assert.equal(
        report.failures.some((failure) => failure.includes("common-pool Silver-prep queue mode")),
        true,
    );
    assert.equal(
        report.failures.some((failure) => failure.includes("common-pool all/history queue mode")),
        true,
    );
});

test("documentation status audit catches missing word common-pool learner utility scoring doctrine", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"]
        .replace(
            "Dictionary common-pool editorial queues are ordered by a transparent learner-utility score before the `200`-row cap is applied.",
            "Dictionary common-pool editorial queues are ordered by default sorting.",
        )
        .replace(
            "The score is an ordering signal only, never card approval.",
            "The score approves strong rows.",
        );
    files["docs/command-reference.md"] = files["docs/command-reference.md"].replace(
        "everyday usefulness, concrete/common domain fit, target-kanji reinforcement value, duplicate or near-duplicate safety, specialized/proper-noun penalty signals, exampleability, and pitch/audio/media readiness",
        "general quality signals",
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
        report.failures.some((failure) => failure.includes("learner-utility scoring components")),
        true,
    );
    assert.equal(
        report.failures.some((failure) => failure.includes("ordering only, not card approval")),
        true,
    );
});

test("documentation status audit catches missing word common-pool learner-value bucket doctrine", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"]
        .replace(
            "Learner-value buckets classify common-pool rows as core candidates, family representatives, support-label candidates, same-written ambiguities, redundant family members, domain-narrow rows, or raw audit low-fit rows.",
            "Common-pool rows use a basic bucket.",
        )
        .replace(
            "Redundant family members, domain-narrow rows, and raw audit low-fit rows stay counted in the raw denominator but are audit-only by default, not human review queue work.",
            "All common-pool rows remain review work.",
        );
    files["docs/command-reference.md"] = files["docs/command-reference.md"]
        .replace(
            "Learner-value buckets classify common-pool rows as core candidates, family representatives, support-label candidates, same-written ambiguities, redundant family members, domain-narrow rows, or raw audit low-fit rows.",
            "Common-pool rows use a bucket.",
        )
        .replace(
            "Redundant family members, domain-narrow rows, and raw audit low-fit rows stay counted in the raw denominator but are audit-only by default, not human review queue work.",
            "All common-pool rows are review work.",
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
        report.failures.some((failure) => failure.includes("learner-value bucket names")),
        true,
    );
    assert.equal(
        report.failures.some((failure) => failure.includes("audit-only by default")),
        true,
    );
});

test("documentation status audit catches missing word expansion target doctrine", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"].replace(
        "Expansion targets are useful minimums, not hard caps or approval quotas: N5 ~800, N4 ~1000, N3 ~2250, N2 ~2250, and N1 ~4000 unique governed words.",
        "Expansion targets are flexible.",
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
        report.failures.some((failure) => failure.includes("word expansion target minimums")),
        true,
    );
});

test("documentation status audit catches outside support kanji common-pool drift", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"].replace(
        "Outside-JLPT and higher-level support kanji are label/review needs, not automatic common-pool deprioritization.",
        "Outside-JLPT support kanji should be treated as low-priority common-pool rows.",
    );
    files["docs/command-reference.md"] = files["docs/command-reference.md"].replace(
        "do not automatically deprioritize outside-JLPT or higher-level support kanji",
        "lower outside-JLPT support kanji priority",
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
        report.failures.some((failure) => failure.includes("outside-JLPT/higher-level support kanji")),
        true,
    );
});

test("documentation status audit catches TubeLex frequency-support drift", () => {
    const files = readDocumentationFiles();
    files["docs/workflows.md"] = files["docs/workflows.md"]
        .replace(
            "TubeLex is frequency/usefulness support only; it is not candidate discovery, JLPT level truth, reading proof, meaning proof, pitch proof, or card approval.",
            "TubeLex can approve common words.",
        )
        .replace(
            "Ambiguous TubeLex written/reading matches stay visibly marked and cannot create reading proof.",
            "Ambiguous TubeLex matches can be trusted.",
        )
        .replace(
            "Discovery yield reports strong, good, borderline, and poor frequency/usefulness bands for each 200-row window.",
            "Discovery yield reports a simple score.",
        );
    files["docs/command-reference.md"] = files["docs/command-reference.md"].replace(
        "`npm run data:normalize:words:tubelex`",
        "`npm run data:normalize:words:frequency`",
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
        report.failures.some((failure) => failure.includes("TubeLex is support/ranking evidence only")),
        true,
    );
    assert.equal(
        report.failures.some((failure) => failure.includes("ambiguous TubeLex matches")),
        true,
    );
    assert.equal(
        report.failures.some((failure) => failure.includes("discovery-yield frequency/usefulness bands")),
        true,
    );
    assert.equal(
        report.failures.some((failure) => failure.includes("TubeLex word frequency normalizer")),
        true,
    );
});
