const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { parseArgs } = require("../scripts/reportLaneWorkPacket");
const {
    buildLaneWorkPacket,
    formatLaneWorkPacket,
    mergeVerificationResults,
    resolveLaneWorkPacketPath,
    validateLaneWorkPacket,
} = require("../src/services/laneWorkPacketService");

function buildBatchReport(overrides = {}) {
    return {
        level: 5,
        lane: "sapphire",
        scope: "queue=missing-current-standard limit=2",
        queue: "missing-current-standard",
        summary: {
            generatedRows: 10,
            remainingSapphire: 6,
            selectedCards: 2,
        },
        nextMissingWords: [
            "alpha|a",
            "beta|b",
            "gamma|g",
        ],
        cards: [
            {
                identity: "alpha|a",
                word: "alpha",
                reading: "a",
                reviewStatus: "missing_sapphire",
                hardChecksPassed: true,
                riskFlags: [],
                suggestedReviewStep: "likely sapphire after source check",
            },
            {
                identity: "beta|b",
                word: "beta",
                reading: "b",
                reviewStatus: "missing_sapphire",
                hardChecksPassed: false,
                riskFlags: ["example sentence needs regeneration"],
                suggestedReviewStep: "fix generated surface before sapphire",
            },
        ],
        ...overrides,
    };
}

test("lane work packet records selected batch, queue delta, decisions, and verification classifications", () => {
    const packet = buildLaneWorkPacket({
        deckKind: "word",
        lane: "sapphire",
        levels: [5],
        batchReport: buildBatchReport(),
        decisions: [
            {
                identity: "alpha|a",
                decision: "kept",
                reason: "surface passed focused checks",
                changedFiles: ["templates/sapphire_n5_word_review_set.json"],
            },
        ],
        verificationResults: [
            {
                command: "git diff --check",
                classification: "passed",
                notes: "no whitespace errors",
            },
        ],
        queueAfter: 4,
        runId: "packet-001",
        generatedAt: "2026-06-24T00:00:00.000Z",
    });

    assert.equal(packet.schemaVersion, 1);
    assert.equal(packet.authority.writesProofLedger, false);
    assert.equal(packet.authority.writesSourceEvidence, false);
    assert.equal(packet.authority.certifiesCards, false);
    assert.equal(packet.scope.deckKind, "word");
    assert.equal(packet.scope.lane, "sapphire");
    assert.equal(packet.queueDelta.before, 6);
    assert.equal(packet.queueDelta.after, 4);
    assert.equal(packet.queueDelta.delta, -2);
    assert.equal(packet.queueDelta.processed, 2);
    assert.equal(packet.batch.selectedItems.length, 2);
    assert.equal(packet.decisions[0].decision, "kept");
    assert.equal(packet.decisions[1].decision, "pending");
    assert.equal(packet.verificationCommands.find((entry) => entry.command === "git diff --check").classification, "passed");
    assert.deepEqual(validateLaneWorkPacket(packet), { ok: true, issues: [] });
});

test("lane work packet fails closed on selected-card and decision mismatches", () => {
    assert.throws(() => buildLaneWorkPacket({
        deckKind: "word",
        lane: "sapphire",
        levels: [5],
        batchReport: buildBatchReport({
            summary: {
                generatedRows: 10,
                remainingSapphire: 6,
                selectedCards: 3,
            },
        }),
    }), /Batch selected-card count mismatch/);

    assert.throws(() => buildLaneWorkPacket({
        deckKind: "word",
        lane: "sapphire",
        levels: [5],
        batchReport: buildBatchReport(),
        decisions: [{ identity: "not-selected", decision: "kept" }],
    }), /Decision references identity not in selected batch/);
});

test("lane work packet verification results must match exact expected commands", () => {
    const expected = [
        { phase: "focused-verification", command: "git diff --check", classification: "pending", notes: "" },
    ];

    assert.throws(() => mergeVerificationResults(expected, [
        { command: "npm test", classification: "passed" },
    ]), /command not in expected plan/);

    assert.throws(() => mergeVerificationResults(expected, [
        { command: "git diff --check", classification: "skipped-with-reason" },
    ]), /must include notes/);

    assert.deepEqual(mergeVerificationResults(expected, [
        { command: "git diff --check", classification: "skipped-with-reason", notes: "not applicable to generated packet preview" },
    ])[0], {
        phase: "focused-verification",
        command: "git diff --check",
        classification: "skipped-with-reason",
        notes: "not applicable to generated packet preview",
    });
});

test("lane work packet output paths require safe run ids under generated roots", () => {
    const cwd = process.cwd();
    assert.equal(resolveLaneWorkPacketPath({
        rootDir: cwd,
        runId: "packet-001",
        deckKind: "word",
        lane: "sapphire",
        levels: [5],
    }), path.join(cwd, "out", "lane-work-packets", "packet-001", "word-sapphire-n5.json"));

    assert.throws(() => resolveLaneWorkPacketPath({
        rootDir: cwd,
        outDir: "templates",
        runId: "packet-001",
        deckKind: "word",
        lane: "sapphire",
        levels: [5],
    }), /outside governed generated-output roots/);

    assert.throws(() => resolveLaneWorkPacketPath({
        rootDir: cwd,
        runId: "../bad",
        deckKind: "word",
        lane: "sapphire",
        levels: [5],
    }), /Invalid --run-id/);
});

test("lane work packet formatter and CLI expose generated-only boundaries", () => {
    const packet = buildLaneWorkPacket({
        deckKind: "word",
        lane: "sapphire",
        levels: [5],
        batchReport: buildBatchReport(),
        generatedAt: "2026-06-24T00:00:00.000Z",
    });
    const formatted = formatLaneWorkPacket(packet);

    assert.match(formatted, /Japanese Kanji Builder Lane Work Packet/);
    assert.match(formatted, /does not replace Silver, Gold, Sapphire, Platinum, Obsidian proof/);
    assert.match(formatted, /Do not use this packet as proof/);

    const options = parseArgs([
        "--deck=kanji",
        "--lane=platinum",
        "--level=3",
        "--batch-report=out/batch.json",
        "--queue-before=12",
        "--queue-after=9",
        "--run-id=packet-002",
        "--write",
        "--json",
    ]);
    assert.equal(options.deckKind, "kanji");
    assert.equal(options.lane, "platinum");
    assert.deepEqual(options.levels, [3]);
    assert.equal(options.write, true);
    assert.equal(options.json, true);
    assert.equal(options.queueBefore, 12);
    assert.equal(options.queueAfter, 9);
    assert.deepEqual(options.unknownArgs, []);

    assert.ok(parseArgs(["--deck=word"]).unknownArgs.includes("--batch-report is required when building a lane work packet"));
    assert.ok(parseArgs(["--batch-report=out/batch.json", "--write"]).unknownArgs.includes("--run-id is required with --write to avoid packet output collisions"));
});
