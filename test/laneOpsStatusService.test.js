const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/reportLaneOpsStatus");
const {
    buildLaneOpsStatus,
    classifyChangedPath,
    formatLaneOpsStatus,
    parseGitStatusChanges,
} = require("../src/services/laneOpsStatusService");

function laneStatus(count, denominator) {
    const missing = Math.max(0, denominator - count);
    return {
        count,
        denominator,
        missing,
        ratio: `${count}/${denominator}`,
    };
}

function laneRow({ deckKind = "word", level = 5, denominator = 10, silver = 10, gold = 8, sapphire = 6, platinum = 4 } = {}) {
    return {
        deckKind,
        level,
        levelLabel: `N${level}`,
        denominator,
        generated: {
            exists: true,
            count: silver,
            path: `out/${deckKind === "word" ? "word-build" : "build"}/exports/n${level}.tsv`,
        },
        lanes: {
            silver: laneStatus(silver, denominator),
            gold: laneStatus(gold, denominator),
            sapphire: laneStatus(sapphire, denominator),
            platinum: laneStatus(platinum, denominator),
        },
    };
}

function buildCloseoutFixture() {
    return {
        laneRows: [
            laneRow({ deckKind: "word", level: 5 }),
            laneRow({ deckKind: "word", level: 3, denominator: 20, silver: 20, gold: 18, sapphire: 12, platinum: 2 }),
            laneRow({ deckKind: "kanji", level: 5, denominator: 5, silver: 5, gold: 5, sapphire: 5, platinum: 5 }),
        ],
        nlpSupport: {
            passed: true,
            releaseBoundary: {
                nlpGateCertifiesCards: false,
                nlpGateWritesTrackedTemplates: false,
                nlpGateClaimsReleaseReadiness: false,
            },
            errors: [],
        },
    };
}

function createGitStub({ statusText = "## lane-efficiency-architecture\n" } = {}) {
    return (command, args) => {
        assert.equal(command, "git");
        const key = args.join(" ");
        if (key === "status --short --branch --untracked-files=all") {
            return statusText;
        }
        if (key === "log -1 --oneline --decorate") {
            return "abc1234 (HEAD -> lane-efficiency-architecture) fixture commit\n";
        }
        if (key === "branch --show-current") {
            return "lane-efficiency-architecture\n";
        }
        throw new Error(`unexpected git command: ${key}`);
    };
}

test("lane ops status plans word NLP work without certifying cards or parallelizing word ready", () => {
    const report = buildLaneOpsStatus({
        rootDir: process.cwd(),
        deckKind: "word",
        lane: "nlp",
        levels: [5],
        execFileSync: createGitStub(),
        buildCloseoutStatusFn: () => buildCloseoutFixture(),
    });

    const readyCommand = report.nextCommands.find((entry) => entry.command === "npm run deck:words:ready -- --levels=5");
    const supportCommand = report.nextCommands.find((entry) => entry.command === "npm run deck:words:expansion-support -- --levels=5");
    assert.equal(readyCommand.serial, true);
    assert.match(readyCommand.authority, /not Gold, Sapphire, Platinum, Obsidian, or release approval/);
    assert.match(supportCommand.authority, /cannot approve cards/);
    assert.equal(report.scope.programLane, null);
    assert.equal(report.scope.workArea, "NLP support");
    assert.ok(report.focusedVerification.includes("npm run nlp:governance-gate"));
    assert.match(report.parallelism.safeNow[0].condition, /one process per level/);
    assert.ok(report.failClosedRules.some((rule) => /Do not shrink generated denominators/.test(rule)));
    assert.equal(Object.hasOwn(report.backlog.nlpSupport.releaseBoundary, "promotionRequiresHumanReview"), false);
});

test("lane ops status keeps Platinum prior-lane backlog visible", () => {
    const report = buildLaneOpsStatus({
        rootDir: process.cwd(),
        deckKind: "word",
        lane: "platinum",
        levels: [3],
        execFileSync: createGitStub(),
        buildCloseoutStatusFn: () => buildCloseoutFixture(),
    });

    assert.deepEqual(report.backlog.rows.map((row) => row.lane), ["platinum"]);
    assert.equal(report.backlog.rows[0].ratio, "2/20");
    assert.deepEqual(report.backlog.rows[0].priorBacklog, ["Gold missing 2", "Sapphire missing 8"]);
    assert.ok(report.backlog.realBlockers.some((blocker) => /Sapphire missing 8/.test(blocker.reason)));
});

test("lane ops routes blocked Sapphire work back to Gold prerequisite commands", () => {
    const report = buildLaneOpsStatus({
        rootDir: process.cwd(),
        deckKind: "word",
        lane: "sapphire",
        levels: [5],
        execFileSync: createGitStub(),
        buildCloseoutStatusFn: () => buildCloseoutFixture(),
    });

    assert.deepEqual(report.backlog.rows.map((row) => row.lane), ["sapphire"]);
    assert.deepEqual(report.backlog.rows[0].priorBacklog, ["Gold missing 2"]);
    assert.ok(report.backlog.realBlockers.some((blocker) => /sapphire cannot be complete while Gold missing 2/.test(blocker.reason)));
    assert.ok(report.nextCommands.some((entry) => entry.command === "npm run deck:words:gold:scaffold -- --level=5 --limit=10"));
    assert.ok(report.nextCommands.some((entry) => entry.command === "npm run deck:words:review:n5"));
    assert.equal(report.nextCommands.some((entry) => /deck:words:sapphire:batch/.test(entry.command)), false);
    assert.deepEqual(report.focusedVerification, [
        "git diff --check",
        "npm run deck:words:review:n5",
    ]);
});

test("lane ops keeps Sapphire commands when Gold prerequisite is complete", () => {
    const report = buildLaneOpsStatus({
        rootDir: process.cwd(),
        deckKind: "kanji",
        lane: "sapphire",
        levels: [5],
        execFileSync: createGitStub(),
        buildCloseoutStatusFn: () => buildCloseoutFixture(),
    });

    assert.ok(report.nextCommands.some((entry) => entry.command === "npm run deck:sapphire:batch -- --level=5 --limit=12 --queue=missing-current-standard"));
    assert.ok(report.nextCommands.some((entry) => entry.command === "npm run deck:sapphire:n5"));
    assert.deepEqual(report.focusedVerification, [
        "git diff --check",
        "npm run deck:sapphire:n5",
    ]);
});

test("changed-file risk classifies proof, source, CI, and docs paths", () => {
    const statusText = [
        "## lane-efficiency-architecture",
        " M templates/obsidian_proof_ledger/kanji_n3.jsonl",
        " M templates/jlpt_kanji_source_inputs.json",
        " M .github/workflows/ci.yml",
        " M docs/workflows.md",
    ].join("\n");
    const report = buildLaneOpsStatus({
        rootDir: process.cwd(),
        deckKind: "kanji",
        lane: "ops",
        levels: [5],
        execFileSync: createGitStub({ statusText }),
        buildCloseoutStatusFn: () => buildCloseoutFixture(),
    });

    assert.equal(report.git.changedFileRisk.highestRisk, "high");
    assert.ok(report.git.changedFileRisk.categories.includes("proof-ledger"));
    assert.ok(report.git.changedFileRisk.categories.includes("source-governance"));
    assert.ok(report.git.changedFileRisk.categories.includes("ci-release"));
    assert.ok(report.git.changedFileRisk.categories.includes("documentation"));
});

test("lane ops formatter exposes boundaries, serial work, and architecture needs", () => {
    const report = buildLaneOpsStatus({
        rootDir: process.cwd(),
        deckKind: "kanji",
        lane: "obsidian",
        levels: [5],
        execFileSync: createGitStub(),
        buildCloseoutStatusFn: () => buildCloseoutFixture(),
    });
    const formatted = formatLaneOpsStatus(report);

    assert.match(formatted, /Japanese Kanji Builder Ops Status/);
    assert.match(formatted, /program lane: obsidian/);
    assert.match(formatted, /certification lane order: silver -> gold -> sapphire -> platinum -> obsidian/);
    assert.match(formatted, /Obsidian proof posture must come from the fail-closed Obsidian status/);
    assert.match(formatted, /data:obsidian:proof:append --write/);
    assert.match(formatted, /same-key APKG cache writes/);
    assert.match(formatted, /Do not treat Deck Ready, closeout, NLP, source adequacy, or release:gate as card certification/);
});

test("lane ops supports discovery as a separate intake selector", () => {
    const report = buildLaneOpsStatus({
        rootDir: process.cwd(),
        deckKind: "word",
        lane: "discover",
        levels: [5],
        execFileSync: createGitStub(),
        buildCloseoutStatusFn: () => buildCloseoutFixture(),
    });
    const formatted = formatLaneOpsStatus(report);

    assert.equal(report.scope.programLane, null);
    assert.equal(report.scope.workArea, "discovery/intake support");
    assert.equal(report.scope.certificationLaneOrder, "silver -> gold -> sapphire -> platinum -> obsidian");
    assert.equal(report.backlog.rows.length, 0);
    assert.ok(report.nextCommands.some((entry) => entry.command === "npm run deck:words:expansion-status -- --levels=5"));
    assert.ok(report.nextCommands.some((entry) => entry.command === "npm run deck:words:vocab-expansion -- --levels=5 --limit=80"));
    assert.ok(report.focusedVerification.includes("npm run deck:words:expansion-status -- --levels=5"));
    assert.match(formatted, /selector: discover/);
    assert.match(formatted, /program lane: none; work area: discovery\/intake support/);
    assert.doesNotMatch(formatted, /program lane: discover/);
});

test("lane ops helpers parse status lines, classify individual paths, and parse CLI args", () => {
    const changes = parseGitStatusChanges("## main...origin/main\nR  old.txt -> docs/new.md\n?? scripts/runNodeTests.js\n");
    assert.deepEqual(changes.map((change) => change.path), ["docs/new.md", "scripts/runNodeTests.js"]);
    assert.equal(classifyChangedPath("templates/platinum_n5_word_review_set.json").risk, "high");
    assert.equal(classifyChangedPath("src/services/nlpEmbeddingService.js").risk, "medium");

    const options = parseArgs(["--deck=kanji", "--lane=sapphire", "--level=3", "--json"]);
    assert.equal(options.deckKind, "kanji");
    assert.equal(options.lane, "sapphire");
    assert.deepEqual(options.levels, [3]);
    assert.equal(options.json, true);
});
