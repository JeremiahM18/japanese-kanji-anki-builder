const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/reportFocusedVerificationPlan");
const {
    buildChangedTestCommands,
    buildFocusedTestCommands,
    buildFocusedVerificationPlan,
    buildRiskCommands,
    formatFocusedVerificationPlan,
} = require("../src/services/focusedVerificationPlanService");

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

test("focused verification planner keeps word NLP focused commands separate from full merge gate", () => {
    const report = buildFocusedVerificationPlan({
        rootDir: process.cwd(),
        deckKind: "word",
        lane: "nlp",
        levels: [5],
        execFileSync: createGitStub(),
    });

    assert.ok(report.laneCommands.includes("npm run deck:words:ready -- --levels=5"));
    assert.ok(report.laneCommands.includes("npm run nlp:governance-gate"));
    assert.ok(report.focusedTests.some((command) => command.includes("test/nlpEmbeddingSmokeGateService.test.js")));
    assert.ok(report.fullMergeGate.includes("npm test"));
    assert.ok(report.boundaries.some((rule) => /inner-loop feedback only/.test(rule)));
    assert.ok(report.boundaries.some((rule) => /never replaces the full merge gate/.test(rule)));
});

test("focused verification planner adds changed-file risk commands without hiding docs and CI risk", () => {
    const statusText = [
        "## lane-efficiency-architecture",
        " M scripts/runNodeTests.js",
        " M docs/verification.md",
        " M .github/workflows/ci.yml",
        " M test/focusedVerificationPlanService.test.js",
    ].join("\n");
    const report = buildFocusedVerificationPlan({
        rootDir: process.cwd(),
        deckKind: "kanji",
        lane: "release",
        levels: [5],
        execFileSync: createGitStub({ statusText }),
    });

    assert.equal(report.git.changedFileRisk.highestRisk, "high");
    assert.ok(report.changedFileCommands.includes("npm run docs:status-audit"));
    assert.ok(report.changedFileCommands.includes("npm run ci:smoke"));
    assert.ok(report.changedFileCommands.some((command) => command.includes("test/runNodeTestsScript.test.js")));
    assert.ok(report.changedFileCommands.includes("node --test test/focusedVerificationPlanService.test.js"));
});

test("focused verification planner formats boundaries and source documents", () => {
    const report = buildFocusedVerificationPlan({
        rootDir: process.cwd(),
        deckKind: "word",
        lane: "obsidian",
        levels: [4],
        execFileSync: createGitStub(),
    });
    const formatted = formatFocusedVerificationPlan(report);

    assert.match(formatted, /Japanese Kanji Builder Focused Verification Plan/);
    assert.match(formatted, /deck: word/);
    assert.match(formatted, /deck:words:obsidian:rereview-status -- --levels=4/);
    assert.match(formatted, /Do not treat Deck Ready, closeout, NLP, source adequacy, release:gate, or this planner as card certification/);
    assert.match(formatted, /docs\/review-system-forward-contract\.md/);
});

test("focused verification planner exposes source scope and validates mapped tests", () => {
    assert.deepEqual(buildFocusedTestCommands({
        deckKind: "word",
        lane: "source",
        rootDir: process.cwd(),
    }), ["npm test -- --scope=source-evidence"]);

    assert.deepEqual(buildRiskCommands({
        categories: ["source-governance", "documentation"],
        changes: [],
        rootDir: process.cwd(),
    }), [
        "npm test -- --scope=source-evidence",
        "npm run docs:status-audit",
    ]);
});

test("focused verification planner builds exact changed-test commands", () => {
    assert.deepEqual(buildChangedTestCommands([
        { path: "test/zeta.test.js" },
        { path: "docs/verification.md" },
        { path: "test/alpha.test.js" },
    ]), ["node --test test/alpha.test.js test/zeta.test.js"]);
});

test("focused verification script parses scope arguments", () => {
    const options = parseArgs(["--deck=kanji", "--lane=sapphire", "--level=3", "--json"]);

    assert.equal(options.deckKind, "kanji");
    assert.equal(options.lane, "sapphire");
    assert.deepEqual(options.levels, [3]);
    assert.equal(options.json, true);
});
