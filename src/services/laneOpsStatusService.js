const childProcess = require("node:child_process");
const path = require("node:path");

const { parseLevelsArgument } = require("./buildPipeline");
const { buildDeckCloseoutStatus } = require("./deckCloseoutStatusService");

const DEFAULT_LEVELS = Object.freeze([5, 4, 3, 2, 1]);
const PROGRAM_LANES = Object.freeze([
    "discover",
    "silver",
    "gold",
    "sapphire",
    "platinum",
    "obsidian",
]);
const SUPPORT_WORK_AREAS = Object.freeze([
    "nlp",
    "source",
    "media",
    "release",
]);
const VALID_SELECTORS = Object.freeze([
    "ops",
    ...PROGRAM_LANES,
    ...SUPPORT_WORK_AREAS,
]);
const SUPPORT_WORK_AREA_LABELS = Object.freeze({
    nlp: "NLP support",
    source: "source governance",
    media: "media/audio support",
    release: "release verification",
});

const TRUE_PROGRAM_LANES_LABEL = "discover -> silver -> gold -> sapphire -> platinum -> obsidian";

const CERTIFICATION_LANES = Object.freeze([
    "silver",
    "gold",
    "sapphire",
    "platinum",
    "obsidian",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeDeckKind(value = "word") {
    const normalized = normalizeText(value).toLowerCase();
    if (["word", "words", "vocab", "vocabulary"].includes(normalized)) {
        return "word";
    }
    if (["kanji", "core-kanji"].includes(normalized)) {
        return "kanji";
    }
    throw new Error(`Unsupported deck kind: ${value}`);
}

function normalizeLane(value = "ops") {
    const normalized = normalizeText(value).toLowerCase();
    const aliases = {
        deck: "silver",
        deckready: "silver",
        deck_ready: "silver",
        ready: "silver",
        structure: "sapphire",
        structural: "sapphire",
        rereview: "obsidian",
        proof: "obsidian",
        proof_ledger: "obsidian",
        language: "obsidian",
        candidate: "discover",
        candidates: "discover",
        discovery: "discover",
        model: "nlp",
        models: "nlp",
        performance: "ops",
        status: "ops",
    };
    const lane = aliases[normalized] || normalized || "ops";
    if (!VALID_SELECTORS.includes(lane)) {
        throw new Error(`Unsupported work selector: ${value}`);
    }
    return lane;
}

function buildScopeMetadata(selector) {
    const isProgramLane = PROGRAM_LANES.includes(selector);
    return {
        selector,
        programLane: isProgramLane ? selector : null,
        workArea: SUPPORT_WORK_AREAS.includes(selector) ? SUPPORT_WORK_AREA_LABELS[selector] : null,
        programLaneOrder: TRUE_PROGRAM_LANES_LABEL,
    };
}

function normalizeLevels(levels = DEFAULT_LEVELS) {
    return parseLevelsArgument(Array.isArray(levels) ? levels.join(",") : levels);
}

function levelList(levels = []) {
    return levels.join(",");
}

function levelLabel(level) {
    return `N${level}`;
}

function commandEntry({ phase, command, writes = "read-only", serial = false, authority = "" }) {
    return { phase, command, writes, serial, authority };
}

function isSapphireBlockedByGold({ lane, level, routing = {} } = {}) {
    return lane === "sapphire" && routing.sapphireBlockedByGoldLevels?.has(Number(level));
}

function buildWordLaneCommands({ lane, levels, routing = {} }) {
    const commands = [];
    for (const level of levels) {
        if (lane === "ops") {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} orientation`,
                    command: `npm run deck:closeout -- --levels=${level}`,
                    authority: "Closeout is orientation only; it is not a certification lane.",
                })
            );
        }
        if (lane === "discover") {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word discovery status`,
                    command: `npm run deck:words:expansion-status -- --levels=${level}`,
                    authority: "Read-only pre-trust discovery posture; does not create Silver rows or certify review tiers.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} word discovery queue`,
                    command: `npm run deck:words:vocab-expansion -- --levels=${level} --limit=80`,
                    authority: "Read-only candidate discovery queue; promotion still starts at Silver and downstream gates remain separate.",
                })
            );
        }
        if (["silver", "nlp", "obsidian", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word generated surface`,
                    command: `npm run deck:words:ready -- --levels=${level}`,
                    writes: "writes shared out/word-build",
                    serial: true,
                    authority: "Mechanical word artifact readiness only; not Gold, Sapphire, Platinum, Obsidian, or release approval.",
                })
            );
        }
        if (["silver", "nlp", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word NLP support`,
                    command: `npm run deck:words:expansion-support -- --levels=${level}`,
                    writes: "writes level-scoped NLP support artifacts under out/",
                    authority: "Review amplification only; cannot approve cards, write tracked templates, or certify Obsidian proof.",
                })
            );
        }
        if (["gold", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word Gold draft queue`,
                    command: `npm run deck:words:gold:scaffold -- --level=${level} --limit=10`,
                    writes: "read-only tracked-template draft helper",
                    authority: "Uses TODO sentinels and writes no tracked templates.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} word Gold gate`,
                    command: `npm run deck:words:review:n${level}`,
                    authority: "Gold protects generated output; it is not Sapphire, Platinum, Obsidian, or release readiness.",
                })
            );
        }
        if (isSapphireBlockedByGold({ lane, level, routing })) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word Gold prerequisite`,
                    command: `npm run deck:words:gold:scaffold -- --level=${level} --limit=10`,
                    writes: "read-only tracked-template draft helper",
                    authority: "Gold is missing for this scope; Sapphire work is blocked until matching Gold review exists.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} word Gold gate`,
                    command: `npm run deck:words:review:n${level}`,
                    authority: "Run the prior-lane Gold gate before any Sapphire structural queue is legal work.",
                })
            );
        } else if (["sapphire", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word Sapphire queue`,
                    command: `npm run deck:words:sapphire:batch -- --level=${level} --limit=8 --queue=missing-current-standard`,
                    authority: "Read-only structural queue; does not create Platinum, Obsidian proof, or release readiness.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} word Sapphire gate`,
                    command: `npm run deck:words:sapphire:n${level}`,
                    authority: "Native word Sapphire structural gate; requires matching passing Gold.",
                })
            );
        }
        if (["platinum", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word Platinum queue`,
                    command: `npm run deck:words:platinum:batch -- --level=${level} --limit=8`,
                    authority: "Defaults to missing current-standard Platinum coverage, not Obsidian proof.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} word Platinum gate`,
                    command: `npm run deck:words:platinum:n${level}`,
                    authority: "Card-surface inspection gate; requires Gold and active current-standard Sapphire.",
                })
            );
        }
        if (["obsidian", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word Obsidian status`,
                    command: `npm run deck:words:obsidian:rereview-status -- --levels=${level}`,
                    authority: "Status queue only; missing proof remains visible backlog.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} word Obsidian batch`,
                    command: `npm run deck:words:platinum:batch -- --level=${level} --limit=8 --queue=substantive-rereview`,
                    authority: "Explicit Obsidian work queue; default Platinum queue is not proof work.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} word Obsidian proof append dry run`,
                    command: "npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl",
                    writes: "dry-run proof validation only",
                    serial: true,
                    authority: "Proof can be appended only after actual card-bound Obsidian rereview.",
                })
            );
        }
        if (["source", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word source adequacy`,
                    command: `npm run deck:words:source-adequacy -- --levels=${level} --governance-strict`,
                    authority: "Source-depth posture does not add Silver rows or certify review tiers.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} word source access`,
                    command: "npm run deck:words:source-access",
                    authority: "Ranks source-access work; does not import evidence or move denominators.",
                })
            );
        }
        if (["media", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} word audio packet`,
                    command: `npm run media:review:word-audio -- --level=${level} --limit=25`,
                    authority: "Scoped packet only; full media completeness still comes from word deck readiness.",
                })
            );
        }
    }
    if (["nlp", "ops"].includes(lane)) {
        commands.push(
            commandEntry({
                phase: "NLP governance",
                command: "npm run nlp:governance-gate",
                authority: "Fail-closed NLP artifact/runtime support gate; it cannot certify cards.",
            })
        );
    }
    if (["release", "ops"].includes(lane)) {
        commands.push(
            commandEntry({
                phase: "release gate",
                command: "npm run release:gate",
                authority: "Smoke-fixture/package contract gate; not public product readiness by itself.",
            })
        );
    }
    return commands;
}

function buildKanjiLaneCommands({ lane, levels, routing = {} }) {
    const commands = [];
    for (const level of levels) {
        if (lane === "ops") {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} orientation`,
                    command: `npm run deck:closeout -- --levels=${level}`,
                    authority: "Closeout is orientation only; it is not a certification lane.",
                })
            );
        }
        if (lane === "discover") {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji discovery deltas`,
                    command: "npm run data:audit:jlpt:source-levels -- --worklist-only --limit=25",
                    authority: "Read-only pre-trust source/candidate posture; does not move kanji or certify review tiers.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} kanji product partition plan`,
                    command: "npm run deck:kanji:partition-plan -- --limit=25",
                    authority: "Read-only discovery/product plan; generated rows still enter trust at Silver.",
                })
            );
        }
        if (["silver", "nlp", "obsidian", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji generated surface`,
                    command: `npm run deck:ready -- --levels=${level}`,
                    writes: "writes shared out/build package roots",
                    serial: true,
                    authority: "Mechanical kanji artifact readiness only; not Gold, Sapphire, Platinum, Obsidian, or release approval.",
                })
            );
        }
        if (["silver", "nlp", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji NLP support`,
                    command: `npm run deck:kanji:nlp-signals -- --levels=${level}`,
                    writes: "writes level-scoped NLP support artifacts under out/",
                    authority: "Review amplification only; cannot approve cards, write tracked templates, or certify Obsidian proof.",
                })
            );
        }
        if (["gold", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji Gold gate`,
                    command: `npm run deck:review:n${level}`,
                    authority: "Gold protects generated output; it is not Sapphire, Platinum, Obsidian, or release readiness.",
                })
            );
        }
        if (isSapphireBlockedByGold({ lane, level, routing })) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji Gold prerequisite`,
                    command: `npm run deck:review:n${level}`,
                    authority: "Gold is missing for this scope; run the prior-lane Gold gate before any Sapphire structural queue is legal work.",
                })
            );
        } else if (["sapphire", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji Sapphire queue`,
                    command: `npm run deck:sapphire:batch -- --level=${level} --limit=12 --queue=missing-current-standard`,
                    authority: "Read-only structural queue; does not create Platinum, Obsidian proof, or release readiness.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} kanji Sapphire gate`,
                    command: `npm run deck:sapphire:n${level}`,
                    authority: "Native core-kanji Sapphire structural gate; requires matching passing Gold.",
                })
            );
        }
        if (["platinum", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji Platinum queue`,
                    command: `npm run deck:platinum:batch -- --level=${level} --limit=12`,
                    authority: "Defaults to missing current-standard Platinum coverage, not Obsidian proof.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} kanji Platinum gate`,
                    command: `npm run deck:platinum:n${level}`,
                    authority: "Card-surface inspection gate; requires Gold and active current-standard Sapphire.",
                })
            );
        }
        if (["obsidian", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji Obsidian status`,
                    command: `npm run deck:kanji:obsidian:rereview-status -- --levels=${level}`,
                    authority: "Status queue only; missing proof remains visible backlog.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} kanji Obsidian batch`,
                    command: `npm run deck:platinum:batch -- --level=${level} --limit=12 --queue=substantive-rereview`,
                    authority: "Explicit Obsidian work queue; default Platinum queue is not proof work.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} kanji Obsidian proof append dry run`,
                    command: "npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl",
                    writes: "dry-run proof validation only",
                    serial: true,
                    authority: "Proof can be appended only after actual card-bound Obsidian rereview.",
                })
            );
        }
        if (["source", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji source audit`,
                    command: "npm run data:audit:jlpt:sources -- --governance-strict --limit=25",
                    authority: "Read-only source transparency; does not move kanji or change readiness.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} kanji source-level deltas`,
                    command: "npm run data:audit:jlpt:source-levels -- --worklist-only --limit=25",
                    authority: "Read-only plan; does not move contracts, generate decks, or change readiness.",
                })
            );
        }
        if (["media", "ops"].includes(lane)) {
            commands.push(
                commandEntry({
                    phase: `${levelLabel(level)} kanji audio packet`,
                    command: `npm run media:review:audio -- --level=${level} --limit=25`,
                    authority: "Scoped packet only; full media completeness still comes from deck readiness and policy audits.",
                }),
                commandEntry({
                    phase: `${levelLabel(level)} kanji stroke-order audit`,
                    command: "npm run data:audit:stroke-order -- --json",
                    authority: "Policy/provenance audit; visual stroke-order review remains Sapphire evidence.",
                })
            );
        }
    }
    if (["nlp", "ops"].includes(lane)) {
        commands.push(
            commandEntry({
                phase: "NLP governance",
                command: "npm run nlp:governance-gate",
                authority: "Fail-closed NLP artifact/runtime support gate; it cannot certify cards.",
            })
        );
    }
    if (["release", "ops"].includes(lane)) {
        commands.push(
            commandEntry({
                phase: "release gate",
                command: "npm run release:gate",
                authority: "Smoke-fixture/package contract gate; not public product readiness by itself.",
            })
        );
    }
    return commands;
}

function buildNextCommands({ deckKind, lane, levels, routing }) {
    return deckKind === "word"
        ? buildWordLaneCommands({ lane, levels, routing })
        : buildKanjiLaneCommands({ lane, levels, routing });
}

function runGitCommand(args, { cwd, execFileSync = childProcess.execFileSync } = {}) {
    try {
        return {
            ok: true,
            command: `git ${args.join(" ")}`,
            stdout: normalizeText(execFileSync("git", args, {
                cwd,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            })),
            error: "",
        };
    } catch (error) {
        return {
            ok: false,
            command: `git ${args.join(" ")}`,
            stdout: normalizeText(error.stdout),
            error: normalizeText(error.stderr || error.message),
        };
    }
}

function parseChangedPath(line) {
    const rawPath = line.slice(3).trim();
    if (rawPath.includes(" -> ")) {
        return rawPath.split(" -> ").pop().trim();
    }
    return rawPath.replace(/^"|"$/g, "");
}

function parseGitStatusChanges(statusText = "") {
    return normalizeText(statusText)
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("## "))
        .map((line) => ({
            status: line.slice(0, 2).trim() || "modified",
            path: parseChangedPath(line),
            raw: line,
        }))
        .filter((change) => change.path);
}

function classifyChangedPath(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const categories = [];

    if (normalized.startsWith(".github/workflows/")) {
        categories.push("ci-release");
    }
    if (["package.json", "package-lock.json"].includes(normalized)) {
        categories.push("package-scripts-or-dependencies");
    }
    if (normalized === "scripts/runNodeTests.js" || normalized.includes("releaseGate") || normalized.includes("ciSmoke")) {
        categories.push("ci-test-feedback");
    }
    if (normalized.startsWith("templates/obsidian_proof_ledger/")) {
        categories.push("proof-ledger");
    }
    if (/^templates\/(golden|sapphire|platinum)_/.test(normalized)) {
        categories.push("review-manifest");
    }
    if (/^templates\/.*source/i.test(normalized) || normalized.includes("jlpt_kanji_source") || normalized.includes("jlpt_word_source")) {
        categories.push("source-governance");
    }
    if (normalized === "templates/performance_memory_audit_matrix.json") {
        categories.push("performance-matrix");
    }
    if (normalized.startsWith("docs/") || ["README.md", "CHANGELOG.md"].includes(normalized)) {
        categories.push("documentation");
    }
    if (normalized.startsWith("src/services/nlp") || normalized.startsWith("scripts/") && /Nlp|nlp/.test(normalized)) {
        categories.push("nlp-support");
    }
    if (normalized.startsWith("src/") || normalized.startsWith("scripts/")) {
        categories.push("runtime-code");
    }
    if (normalized.startsWith("test/")) {
        categories.push("tests");
    }
    if (normalized.startsWith("out/")) {
        categories.push("generated-output");
    }
    if (normalized.includes("media") || normalized.includes("audio") || normalized.includes("voicevox")) {
        categories.push("media-audio");
    }

    if (categories.length === 0) {
        categories.push("uncategorized");
    }

    const highRiskCategories = new Set([
        "ci-release",
        "package-scripts-or-dependencies",
        "proof-ledger",
        "review-manifest",
        "source-governance",
    ]);
    const mediumRiskCategories = new Set([
        "ci-test-feedback",
        "performance-matrix",
        "nlp-support",
        "runtime-code",
        "media-audio",
    ]);
    const risk = categories.some((category) => highRiskCategories.has(category))
        ? "high"
        : categories.some((category) => mediumRiskCategories.has(category))
            ? "medium"
            : "low";

    return {
        path: normalized,
        categories,
        risk,
    };
}

function buildChangedFileRisk(changes = []) {
    const files = changes.map((change) => ({
        ...change,
        ...classifyChangedPath(change.path),
    }));
    const highestRisk = files.some((file) => file.risk === "high")
        ? "high"
        : files.some((file) => file.risk === "medium")
            ? "medium"
            : files.length > 0
                ? "low"
                : "none";
    const categories = [...new Set(files.flatMap((file) => file.categories))].sort();
    return {
        clean: files.length === 0,
        highestRisk,
        categories,
        files,
    };
}

function buildGitState({ rootDir, execFileSync } = {}) {
    const status = runGitCommand(["status", "--short", "--branch", "--untracked-files=all"], {
        cwd: rootDir,
        execFileSync,
    });
    const log = runGitCommand(["log", "-1", "--oneline", "--decorate"], {
        cwd: rootDir,
        execFileSync,
    });
    const branch = runGitCommand(["branch", "--show-current"], {
        cwd: rootDir,
        execFileSync,
    });
    const changes = status.ok ? parseGitStatusChanges(status.stdout) : [];
    return {
        status,
        log,
        branch,
        clean: status.ok && changes.length === 0,
        changes,
        changedFileRisk: buildChangedFileRisk(changes),
    };
}

function extractLaneRows(closeout = {}, { deckKind, levels }) {
    const selectedLevels = new Set(levels.map(Number));
    return (closeout.laneRows || [])
        .filter((row) => row.deckKind === deckKind && selectedLevels.has(Number(row.level)))
        .map((row) => ({
            deckKind: row.deckKind,
            level: row.level,
            levelLabel: row.levelLabel,
            denominator: row.denominator,
            generated: row.generated,
            lanes: row.lanes,
        }));
}

function buildLaneBacklogRow(row, lane) {
    if (!row?.lanes?.[lane]) {
        return null;
    }
    const laneStatus = row.lanes[lane];
    const priorBacklog = [];
    if (lane === "sapphire" && row.lanes.gold?.missing > 0) {
        priorBacklog.push(`Gold missing ${row.lanes.gold.missing}`);
    }
    if (lane === "platinum") {
        if (row.lanes.gold?.missing > 0) {
            priorBacklog.push(`Gold missing ${row.lanes.gold.missing}`);
        }
        if (row.lanes.sapphire?.missing > 0) {
            priorBacklog.push(`Sapphire missing ${row.lanes.sapphire.missing}`);
        }
    }
    return {
        deckKind: row.deckKind,
        level: row.level,
        lane,
        ratio: laneStatus.ratio,
        missing: laneStatus.missing,
        classification: laneStatus.missing > 0 ? "expected-backlog-visible" : "count-complete-run-gate-to-confirm",
        priorBacklog,
    };
}

function buildBacklogPosture(closeout = {}, { deckKind, lane, levels }) {
    const rows = extractLaneRows(closeout, { deckKind, levels });
    const laneNames = lane === "ops"
        ? ["silver", "gold", "sapphire", "platinum"]
        : CERTIFICATION_LANES.includes(lane)
            ? [lane]
            : [];
    const backlogRows = rows.flatMap((row) => laneNames
        .map((laneName) => buildLaneBacklogRow(row, laneName))
        .filter(Boolean));
    const expectedBacklog = backlogRows.filter((row) => row.missing > 0);
    const realBlockers = [];

    for (const row of rows) {
        if (row.generated && row.generated.exists === false) {
            realBlockers.push({
                level: row.level,
                deckKind: row.deckKind,
                reason: `Missing generated export at ${row.generated.path}`,
            });
        }
    }
    for (const row of backlogRows) {
        for (const blocker of row.priorBacklog) {
            realBlockers.push({
                level: row.level,
                deckKind: row.deckKind,
                reason: `${row.lane} cannot be complete while ${blocker}`,
            });
        }
    }

    if (["obsidian", "ops"].includes(lane)) {
        realBlockers.push({
            level: "selected",
            deckKind,
            reason: "Obsidian proof posture must come from the fail-closed Obsidian status/certification commands, not this ops planner.",
        });
    }

    return {
        rows: backlogRows,
        expectedBacklog,
        realBlockers,
        nlpSupport: buildNlpSupportPosture(closeout.nlpSupport),
    };
}

function buildLaneRouting(closeout = {}, { deckKind, lane, levels }) {
    const blocked = new Set();
    if (lane !== "sapphire") {
        return {
            sapphireBlockedByGoldLevels: blocked,
        };
    }
    const rows = extractLaneRows(closeout, { deckKind, levels });
    for (const row of rows) {
        if ((row.lanes?.gold?.missing || 0) > 0) {
            blocked.add(Number(row.level));
        }
    }
    return {
        sapphireBlockedByGoldLevels: blocked,
    };
}

function buildNlpSupportPosture(nlpSupport = null) {
    if (!nlpSupport) {
        return null;
    }
    return {
        passed: Boolean(nlpSupport.passed),
        releaseBoundary: {
            nlpGateCertifiesCards: Boolean(nlpSupport.releaseBoundary?.nlpGateCertifiesCards),
            nlpGateWritesTrackedTemplates: Boolean(nlpSupport.releaseBoundary?.nlpGateWritesTrackedTemplates),
            nlpGateClaimsReleaseReadiness: Boolean(nlpSupport.releaseBoundary?.nlpGateClaimsReleaseReadiness),
        },
        errors: nlpSupport.errors || [],
    };
}

function buildFocusedVerification({ deckKind, lane, levels, routing = {} }) {
    const commands = ["git diff --check"];
    for (const level of levels) {
        if (deckKind === "word") {
            if (lane === "discover") {
                commands.push(`npm run deck:words:expansion-status -- --levels=${level}`);
                commands.push(`npm run deck:words:vocab-expansion -- --levels=${level} --limit=80`);
            }
            if (isSapphireBlockedByGold({ lane, level, routing })) {
                commands.push(`npm run deck:words:review:n${level}`);
                continue;
            }
            if (["silver", "nlp", "ops"].includes(lane)) {
                commands.push(`npm run deck:words:ready -- --levels=${level}`);
                commands.push(`npm run deck:words:completion:n${level}`);
                commands.push(`npm run deck:words:reading-audit:n${level}`);
                commands.push("npm run nlp:governance-gate");
            }
            if (["gold", "ops"].includes(lane)) {
                commands.push(`npm run deck:words:review:n${level}`);
            }
            if (["sapphire", "obsidian", "ops"].includes(lane)) {
                commands.push(`npm run deck:words:sapphire:n${level}`);
            }
            if (["platinum", "ops"].includes(lane)) {
                commands.push(`npm run deck:words:platinum:n${level}`);
            }
            if (lane === "obsidian") {
                commands.push(`npm run deck:words:obsidian:rereview-status -- --levels=${level}`);
            }
        } else {
            if (lane === "discover") {
                commands.push("npm run data:audit:jlpt:source-levels -- --worklist-only --limit=25");
                commands.push("npm run deck:kanji:partition-plan -- --limit=25");
            }
            if (isSapphireBlockedByGold({ lane, level, routing })) {
                commands.push(`npm run deck:review:n${level}`);
                continue;
            }
            if (["silver", "nlp", "ops"].includes(lane)) {
                commands.push(`npm run deck:ready -- --levels=${level}`);
                commands.push("npm run nlp:governance-gate");
            }
            if (["gold", "ops"].includes(lane)) {
                commands.push(`npm run deck:review:n${level}`);
            }
            if (["sapphire", "obsidian", "ops"].includes(lane)) {
                commands.push(`npm run deck:sapphire:n${level}`);
            }
            if (["platinum", "ops"].includes(lane)) {
                commands.push(`npm run deck:platinum:n${level}`);
            }
            if (lane === "obsidian") {
                commands.push(`npm run deck:kanji:obsidian:rereview-status -- --levels=${level}`);
            }
        }
    }
    return [...new Set(commands)];
}

function buildFullMergeGate() {
    return [
        "git diff --check",
        "npm run lint",
        "npm run typecheck",
        "npm test",
        "npm run docs:status-audit",
        "npm run supply-chain:audit",
        "npm run security:advisories",
        "npm run ci:smoke",
        "npm run release:gate",
    ];
}

function buildParallelismPlan({ deckKind, levels }) {
    const selected = levelList(levels);
    return {
        safeNow: [
            {
                activity: `${deckKind} NLP support for distinct single levels`,
                condition: `Use one process per level after the shared deck surface is refreshed; example levels: ${selected}.`,
            },
            {
                activity: "Deck build/package runs with isolated output roots",
                condition: "Use a distinct --run-id or --out-dir per process; default shared roots remain serial.",
            },
            {
                activity: "Read-only status, batch, source, and audit reports",
                condition: "Safe only when no --write flag is used and no timing-budget benchmark is running.",
            },
            {
                activity: "Independent eslint/typecheck/docs checks",
                condition: "Safe during inner-loop verification when they do not race generated-output writers.",
            },
        ],
        mustRemainSerial: [
            "Default npm run deck:words:ready because it writes through shared out/word-build package roots unless --run-id or --out-dir isolates the run.",
            "Default npm run deck:ready, deck:package, deck:apkg, and deck:words:apkg because packaging/output roots and APKG cache are shared unless each process has an isolated output root and no cold-cache cleanup is running.",
            "data:obsidian:proof:append --write, proof reconciliation writes, source-input imports, source merges, and integrity pin writes.",
            "Timing budget benchmarks from the performance matrix; run them standalone on the same machine/runtime/cache mode.",
        ],
        needsArchitectureBeforeParallelism: [
            "Write-lock or atomic cache-store semantics before same-key APKG cache writes can be treated as coordination-safe.",
            "Write-lock or ledgered work-packet ownership for proof/source mutation commands before concurrent writes are safe.",
            "A focused verification planner and test-scope map before local test sharding can be treated as reliable feedback.",
        ],
    };
}

function buildFailClosedRules() {
    return [
        "Do not shrink generated denominators to make a lane pass.",
        "Do not treat Deck Ready, closeout, NLP, source adequacy, or release:gate as card certification.",
        "Do not infer Sapphire from Gold, Platinum from Sapphire, or Obsidian from Platinum/NLP/clean batch output.",
        "Do not hide expected backlog; classify it as visible queue work unless a real blocker is present.",
        "Do not append proof or run source/import writes from this ops command.",
    ];
}

function buildLaneOpsStatus({
    rootDir = process.cwd(),
    deckKind = "word",
    lane = "ops",
    levels = DEFAULT_LEVELS,
    execFileSync = childProcess.execFileSync,
    buildCloseoutStatusFn = buildDeckCloseoutStatus,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const normalizedDeckKind = normalizeDeckKind(deckKind);
    const normalizedLane = normalizeLane(lane);
    const normalizedLevels = normalizeLevels(levels);
    const closeout = buildCloseoutStatusFn({
        rootDir: resolvedRoot,
        levels: normalizedLevels,
        execFileSync,
    });
    const git = buildGitState({ rootDir: resolvedRoot, execFileSync });
    const scope = {
        deckKind: normalizedDeckKind,
        lane: normalizedLane,
        ...buildScopeMetadata(normalizedLane),
        levels: normalizedLevels,
        levelLabel: normalizedLevels.map(levelLabel).join(", "),
    };
    const routing = buildLaneRouting(closeout, scope);

    return {
        generatedAt: new Date().toISOString(),
        rootDir: resolvedRoot,
        scope,
        git,
        backlog: buildBacklogPosture(closeout, scope),
        nextCommands: buildNextCommands({ ...scope, routing }),
        focusedVerification: buildFocusedVerification({ ...scope, routing }),
        fullMergeGate: buildFullMergeGate(),
        parallelism: buildParallelismPlan(scope),
        failClosedRules: buildFailClosedRules(),
        sourceOfTruth: [
            "docs/review-system-forward-contract.md",
            "docs/review-tier-governance.md",
            "docs/obsidian-batch-workflow.md",
            "docs/workflows.md",
            "docs/verification.md",
            "docs/release-process.md",
            "docs/product-exit-criteria.md",
        ],
    };
}

function formatCommandList(commands = []) {
    return commands.map((entry) => {
        if (typeof entry === "string") {
            return `- ${entry}`;
        }
        const suffixes = [];
        if (entry.serial) {
            suffixes.push("serial");
        }
        if (entry.writes && entry.writes !== "read-only") {
            suffixes.push(entry.writes);
        }
        const suffix = suffixes.length > 0 ? ` (${suffixes.join("; ")})` : "";
        return `- ${entry.command}${suffix}\n  ${entry.phase}: ${entry.authority}`;
    });
}

function formatBacklogRows(backlog = {}) {
    if ((backlog.rows || []).length === 0) {
        return ["- No lower-lane count rows selected for this lane; run the listed status/gate commands for live posture."];
    }
    return backlog.rows.map((row) => {
        const prior = row.priorBacklog.length > 0 ? `; prior backlog: ${row.priorBacklog.join(", ")}` : "";
        return `- ${row.deckKind} N${row.level} ${row.lane}: ${row.ratio}; ${row.classification}${prior}`;
    });
}

function formatChangedFileRisk(risk = {}) {
    if (risk.clean) {
        return ["- working tree clean: yes"];
    }
    return [
        `- working tree clean: no`,
        `- highest changed-file risk: ${risk.highestRisk}`,
        `- categories: ${(risk.categories || []).join(", ") || "none"}`,
        ...(risk.files || []).map((file) => `- ${file.raw}: ${file.risk}; ${file.categories.join(", ")}`),
    ];
}

function formatLaneOpsStatus(report = {}) {
    const lines = [
        "Japanese Kanji Builder Ops Status",
        "",
        "Scope:",
        `- deck: ${report.scope?.deckKind}`,
        `- selector: ${report.scope?.selector || report.scope?.lane}`,
        report.scope?.programLane
            ? `- program lane: ${report.scope.programLane}`
            : `- program lane: none; work area: ${report.scope?.workArea || "operations/orientation"}`,
        `- program lane order: ${report.scope?.programLaneOrder || TRUE_PROGRAM_LANES_LABEL}`,
        `- levels: ${report.scope?.levelLabel}`,
        "",
        "Git:",
        `- branch: ${report.git?.branch?.ok ? report.git.branch.stdout : "unknown"}`,
        `- latest commit: ${report.git?.log?.ok ? report.git.log.stdout : "unknown"}`,
        `- status: ${report.git?.status?.ok ? report.git.status.stdout : "unavailable"}`,
        "",
        "Changed-file risk:",
        ...formatChangedFileRisk(report.git?.changedFileRisk || {}),
        "",
        "Backlog posture:",
        ...formatBacklogRows(report.backlog || {}),
        "",
        "Real blockers and hard boundaries:",
        ...((report.backlog?.realBlockers || []).length > 0
            ? report.backlog.realBlockers.map((blocker) => `- ${blocker.deckKind} ${blocker.level}: ${blocker.reason}`)
            : ["- none from selected closeout rows"]),
        "",
        "Next legal commands:",
        ...formatCommandList(report.nextCommands || []),
        "",
        "Focused verification:",
        ...formatCommandList(report.focusedVerification || []),
        "",
        "Full merge gate:",
        ...formatCommandList(report.fullMergeGate || []),
        "",
        "Safe parallelism now:",
        ...((report.parallelism?.safeNow || []).map((entry) => `- ${entry.activity}: ${entry.condition}`)),
        "",
        "Must remain serial:",
        ...((report.parallelism?.mustRemainSerial || []).map((entry) => `- ${entry}`)),
        "",
        "Needs architecture before safe parallelism:",
        ...((report.parallelism?.needsArchitectureBeforeParallelism || []).map((entry) => `- ${entry}`)),
        "",
        "Fail-closed rules:",
        ...((report.failClosedRules || []).map((entry) => `- ${entry}`)),
        "",
        "Sources:",
        ...((report.sourceOfTruth || []).map((entry) => `- ${entry}`)),
    ];

    return `${lines.join("\n")}\n`;
}

module.exports = {
    DEFAULT_LEVELS,
    TRUE_PROGRAM_LANES_LABEL,
    buildBacklogPosture,
    buildChangedFileRisk,
    buildFailClosedRules,
    buildFocusedVerification,
    buildFullMergeGate,
    buildLaneOpsStatus,
    buildNextCommands,
    buildParallelismPlan,
    buildScopeMetadata,
    classifyChangedPath,
    formatLaneOpsStatus,
    normalizeDeckKind,
    normalizeLane,
    parseGitStatusChanges,
};
