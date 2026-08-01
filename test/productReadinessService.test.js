const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    N5_PRODUCT_READINESS_COMMANDS,
    buildProductReadinessPlan,
    buildSpawnOptions,
    formatProductReadinessReport,
    runProductReadinessGate,
} = require("../src/services/productReadinessService");

test("buildProductReadinessPlan defines the N5 automated product checkpoint", () => {
    const plan = buildProductReadinessPlan({ level: 5 });

    assert.equal(plan.scope.type, "n5-product-readiness-checkpoint");
    assert.equal(plan.scope.doesNotValidate.includes("all-level tracked-source kanji TSV certification"), true);
    assert.equal(plan.scope.doesNotValidate.includes(".apkg product artifacts"), true);
    assert.deepEqual(plan.commands.map((command) => command.id), [
        "kanji-contract-audit",
        "word-contract-audit",
        "audio-provenance-audit",
        "n5-tracked-source-word-artifact",
        "n5-tracked-source-kanji-artifact",
        "n5-word-level-placement-audit",
        "n5-kanji-golden-review",
        "n5-word-golden-review",
    ]);
    assert.deepEqual(
        plan.commands.find((command) => command.id === "n5-kanji-golden-review").args,
        [path.join("scripts", "reviewGoldenLevel.js"), "--level=5", "--manifest-scoped"],
    );
});

test("buildProductReadinessPlan rejects unsupported levels", () => {
    assert.throws(() => buildProductReadinessPlan({ level: 4 }), /supports N5 only/);
});

test("runProductReadinessGate passes when all checkpoint commands pass", async () => {
    const calls = [];
    const report = await runProductReadinessGate({
        runCommandFn(command, args, options) {
            calls.push([command, ...args].join(" "));
            assert.equal(options.shell, false);
            return { status: 0, stdout: "ok", stderr: "" };
        },
    });

    assert.equal(report.passed, true);
    assert.equal(report.checks.length, N5_PRODUCT_READINESS_COMMANDS.length);
    assert.equal(N5_PRODUCT_READINESS_COMMANDS.some((command) => command.runInProcess), false);
    assert.equal(calls.some((call) => call.includes("reviewGoldenWordLevel.js")), true);
    assert.equal(calls.some((call) => call.includes("auditJlptKanjiSourceEvidence.js")), false);
    assert.equal(calls.some((call) => call.includes("auditWordLevelAnchors.js")), true);
    assert.equal(calls.some((call) => call.includes("trackedSourceArtifacts.js")), true);
    assert.equal(calls.some((call) => call.includes("--surface=kanji")), true);
});

test("runProductReadinessGate forwards the required N5 kanji Golden scope argument", async () => {
    let goldenKanjiArgs = null;
    const report = await runProductReadinessGate({
        runCommandFn(command, args) {
            if (args[0] === path.join("scripts", "reviewGoldenLevel.js")) {
                goldenKanjiArgs = [...args];
            }
            return { status: 0, stdout: "ok", stderr: "" };
        },
    });

    assert.equal(report.passed, true);
    assert.deepEqual(goldenKanjiArgs, [
        path.join("scripts", "reviewGoldenLevel.js"),
        "--level=5",
        "--manifest-scoped",
    ]);
});

test("buildSpawnOptions avoids shell-specific subprocess failures and supports large audit output", () => {
    const options = buildSpawnOptions("repo");

    assert.equal(options.cwd, "repo");
    assert.equal(options.encoding, "utf8");
    assert.equal(options.shell, false);
    assert.equal(options.maxBuffer >= 20 * 1024 * 1024, true);
});

test("runProductReadinessGate fails when any checkpoint command fails", async () => {
    const report = await runProductReadinessGate({
        runCommandFn(command, args) {
            if (args.some((arg) => String(arg).includes("reviewGoldenWordLevel.js"))) {
                return { status: 1, stdout: "word review failed", stderr: "golden drift" };
            }
            return { status: 0, stdout: "ok", stderr: "" };
        },
    });

    assert.equal(report.passed, false);
    const failed = report.checks.find((check) => check.id === "n5-word-golden-review");
    assert.equal(failed.passed, false);
    assert.match(failed.stderrTail, /golden drift/);
});

test("runProductReadinessGate fails when word placement policy fails", async () => {
    const report = await runProductReadinessGate({
        runCommandFn(command, args) {
            if (args.some((arg) => String(arg).includes("auditWordLevelAnchors.js"))) {
                return { status: 1, stdout: "Word level placement violations: 46", stderr: "" };
            }
            return { status: 0, stdout: "ok", stderr: "" };
        },
    });

    assert.equal(report.passed, false);
    const failed = report.checks.find((check) => check.id === "n5-word-level-placement-audit");
    assert.equal(failed.passed, false);
    assert.match(failed.stdoutTail, /Word level placement violations: 46/);
});

test("formatProductReadinessReport states scope and exclusions", () => {
    const text = formatProductReadinessReport({
        passed: true,
        scope: buildProductReadinessPlan({ level: 5 }).scope,
        checks: [{
            label: "N5 word golden review",
            command: "npm run deck:words:review:n5",
            passed: true,
        }],
    });

    assert.match(text, /N5 Product Readiness Checkpoint/);
    assert.match(text, /Overall result: passing/);
    assert.match(text, /Does not validate:/);
    assert.match(text, /platinum release-quality review/);
    assert.match(text, /all-level tracked-source kanji TSV certification/);
    assert.match(text, /\.apkg product artifacts/);
    assert.match(text, /manual Anki import review/);
    assert.match(text, /mobile, screen-reader, or listening QA/);
    assert.match(text, /Keep the candidate explicitly N5-only/);
    assert.match(text, /PROD-REL-001/);
});
