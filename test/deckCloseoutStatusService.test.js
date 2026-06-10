const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDeckCloseoutStatus,
    formatDeckCloseoutStatus,
} = require("../src/services/deckCloseoutStatusService");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, value, "utf8");
}

function evidence(type) {
    return {
        type,
        source: "fixture",
        detail: "fixture detail",
    };
}

function kanjiSapphireEntry(kanji) {
    return {
        kanji,
        status: "sapphire",
        reviewStandard: "kanji-sapphire-v1-evidence-lanes",
        reviewedAt: "2026-06-09",
        reviewer: "fixture",
        sapphireReviewAudit: {},
        sourceEvidence: [evidence("japanese-source")],
        internalChecks: [
            evidence("generated-surface"),
            evidence("golden-regression"),
            evidence("media-audit"),
            evidence("audio-review"),
            evidence("stroke-order-review"),
        ],
        reviewEvidence: [
            evidence("manual-review"),
            evidence("current-standard-review"),
        ],
    };
}

function kanjiPlatinumEntry(kanji) {
    return {
        kanji,
        status: "platinum",
        reviewStandard: "kanji-platinum-v3-evidence-lanes",
        revalidatedAt: "2026-06-09",
        revalidationSummary: [
            "evidence lanes",
            "generated surface",
            "Japanese source evidence",
            "example sentence",
            "notes support surface",
            "audio",
            "stroke-order media",
            "verification limitations",
        ].join("; "),
        sourceEvidence: [evidence("japanese-source")],
        internalChecks: [
            evidence("generated-surface"),
            evidence("golden-regression"),
            evidence("media-audit"),
            evidence("audio-review"),
            evidence("stroke-order-review"),
        ],
        reviewEvidence: [
            evidence("manual-review"),
            evidence("current-standard-review"),
        ],
    };
}

function wordSapphireEntry(word, reading) {
    return {
        word,
        status: "sapphire",
        readingIncludes: [reading],
        reviewStandard: "word-sapphire-v1-evidence-lanes",
        reviewedAt: "2026-06-09",
        revalidatedAt: "2026-06-09",
        reviewer: "fixture",
        revalidationSummary: "structural fixture",
        migrationProvenance: {},
        sourceEvidence: [evidence("japanese-source")],
        internalChecks: [
            evidence("generated-surface"),
            evidence("golden-regression"),
            evidence("level-contract"),
            evidence("media-audit"),
            evidence("audio-review"),
            evidence("pitch-accent-review"),
            evidence("label-review"),
        ],
        reviewEvidence: [
            evidence("example-review"),
            evidence("manual-review"),
            evidence("current-standard-review"),
        ],
    };
}

function wordPlatinumEntry(word, reading) {
    return {
        word,
        status: "platinum",
        readingIncludes: [reading],
        notesIncludes: ["fixture"],
        reviewStandard: "word-platinum-v3-evidence-lanes",
        revalidatedAt: "2026-06-09",
        revalidationSummary: [
            "evidence lanes",
            "generated surface",
            "Japanese source evidence",
            "example sentence",
            "notes support surface",
            "reading breakdown",
            "labels",
            "audio",
            "pitch accent",
            "media provenance",
            "verification limitations",
        ].join("; "),
        reviewEvidence: [
            evidence("example-review"),
            evidence("manual-review"),
            evidence("current-standard-review"),
        ],
    };
}

function createFixtureRepo() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-closeout-"));
    writeJson(path.join(rootDir, "templates", "jlpt_level_contract.json"), {
        kanjiLevels: {
            日: 1,
            月: 1,
        },
    });
    writeJson(path.join(rootDir, "templates", "jlpt_word_level_contract.json"), {
        wordLevels: {
            "日本|にほん": { written: "日本", reading: "にほん", jlpt: 1 },
            "月|つき": { written: "月", reading: "つき", jlpt: 1 },
        },
    });
    writeJson(path.join(rootDir, "templates", "golden_n1_review_set.json"), [
        { kanji: "日" },
        { kanji: "月" },
    ]);
    writeJson(path.join(rootDir, "templates", "sapphire_n1_review_set.json"), [
        kanjiSapphireEntry("日"),
    ]);
    writeJson(path.join(rootDir, "templates", "platinum_n1_review_set.json"), [
        kanjiPlatinumEntry("日"),
    ]);
    writeJson(path.join(rootDir, "templates", "golden_n1_word_review_set.json"), [
        { word: "日本", readingIncludes: ["にほん"] },
    ]);
    writeJson(path.join(rootDir, "templates", "sapphire_n1_word_review_set.json"), [
        wordSapphireEntry("日本", "にほん"),
    ]);
    writeJson(path.join(rootDir, "templates", "platinum_n1_word_review_set.json"), [
        wordPlatinumEntry("日本", "にほん"),
    ]);
    writeText(path.join(rootDir, "out", "build", "exports", "jlpt-n1.tsv"), "Kanji\n日\n月\n");
    writeText(path.join(rootDir, "out", "word-build", "exports", "jlpt-n1-words.tsv"), "Word\tReading\n日本\tにほん\n月\tつき\n");
    writeJson(path.join(rootDir, "package.json"), {});
    writeJson(path.join(rootDir, "package-lock.json"), {});
    return rootDir;
}

function createGitStub({ proofLedgerDirty = false } = {}) {
    return (command, args) => {
        assert.equal(command, "git");
        const key = args.join(" ");
        if (key === "status --short --branch") {
            return "## main...origin/main\n";
        }
        if (key === "log -1 --oneline --decorate") {
            return "abc1234 (HEAD -> main, origin/main) fixture commit\n";
        }
        if (key === "branch -a -vv") {
            return "* main abc1234 [origin/main] fixture commit\n  remotes/origin/main abc1234 fixture commit\n";
        }
        if (key === "ls-remote --heads origin") {
            return "abc1234\trefs/heads/main\n";
        }
        if (key === "status --short -- templates/obsidian_proof_ledger") {
            return proofLedgerDirty ? " M templates/obsidian_proof_ledger/kanji_n1.jsonl\n" : "";
        }
        throw new Error(`unexpected git command: ${key}`);
    };
}

test("buildDeckCloseoutStatus reports lane counts and expected coverage failures without running Obsidian", () => {
    const rootDir = createFixtureRepo();
    try {
        const report = buildDeckCloseoutStatus({
            rootDir,
            levels: [1],
            execFileSync: createGitStub(),
            buildNlpGovernanceGateReportFn: () => ({
                passed: true,
                errors: [],
                releaseBoundary: {
                    nlpGateCertifiesCards: false,
                    nlpGateWritesTrackedTemplates: false,
                    nlpGateClaimsReleaseReadiness: false,
                    promotionRequiresHumanReview: true,
                },
            }),
        });

        const kanjiRow = report.laneRows.find((row) => row.deckKind === "kanji");
        const wordRow = report.laneRows.find((row) => row.deckKind === "word");
        assert.equal(kanjiRow.lanes.silver.ratio, "2/2");
        assert.equal(kanjiRow.lanes.sapphire.ratio, "1/2");
        assert.equal(kanjiRow.lanes.platinum.ratio, "1/2");
        assert.equal(wordRow.lanes.gold.ratio, "1/2");
        assert.equal(wordRow.lanes.platinum.ratio, "1/2");
        assert.equal(report.obsidian.status, "untouched");
        assert.equal(report.obsidian.commandRunsObsidianStatus, false);
        assert.equal(report.obsidian.commandWritesProofLedger, false);
        assert.equal(
            report.expectedGates.some((gate) => (
                gate.command === "npm run deck:platinum:n1"
                && gate.classification === "expected-fail-coverage"
                && gate.missing === 1
            )),
            true
        );
        assert.equal(
            report.expectedGates.some((gate) => (
                gate.command === "npm run deck:review:n1"
                && gate.classification === "count-complete-run-gate-to-confirm"
                && gate.missing === 0
            )),
            true
        );
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test("formatDeckCloseoutStatus includes operating hygiene and Obsidian boundary text", () => {
    const rootDir = createFixtureRepo();
    try {
        const report = buildDeckCloseoutStatus({
            rootDir,
            levels: [1],
            execFileSync: createGitStub({ proofLedgerDirty: true }),
            buildNlpGovernanceGateReportFn: () => ({
                passed: false,
                errors: ["fixture NLP issue"],
                releaseBoundary: {
                    nlpGateCertifiesCards: false,
                    nlpGateWritesTrackedTemplates: false,
                    nlpGateClaimsReleaseReadiness: false,
                    promotionRequiresHumanReview: true,
                },
            }),
        });
        const output = formatDeckCloseoutStatus(report);

        assert.match(output, /Japanese Kanji Builder Closeout Status/);
        assert.match(output, /proof ledger worktree changes: yes/);
        assert.match(output, /this command writes proof ledger events: no/);
        assert.match(output, /npm run lint/);
        assert.match(output, /npm run release:gate/);
        assert.match(output, /Manual Anki import QA is not performed by this command/);
        assert.match(output, /fixture NLP issue/);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
