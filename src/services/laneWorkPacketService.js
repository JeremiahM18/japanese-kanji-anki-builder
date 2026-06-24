const path = require("node:path");

const { parseLevelsArgument } = require("./buildPipeline");
const {
    buildFocusedVerification,
    buildFullMergeGate,
    buildNextCommands,
    normalizeDeckKind,
    normalizeLane,
} = require("./laneOpsStatusService");
const { normalizeRunId } = require("./outputIsolationService");
const { assertSafeGeneratedPath } = require("../utils/fs");

const WORK_PACKET_SCHEMA_VERSION = 1;
const DEFAULT_WORK_PACKET_OUT_DIR = path.join("out", "lane-work-packets");

const DECISION_STATUSES = Object.freeze([
    "pending",
    "kept",
    "fixed",
    "deferred",
    "removed",
    "blocked",
    "no-op",
]);

const VERIFICATION_CLASSIFICATIONS = Object.freeze([
    "pending",
    "passed",
    "failed",
    "expected-fail",
    "blocked",
    "skipped-with-reason",
]);

const SOURCE_OF_TRUTH = Object.freeze([
    "docs/review-system-forward-contract.md",
    "docs/review-tier-governance.md",
    "docs/obsidian-batch-workflow.md",
    "docs/workflows.md",
    "docs/verification.md",
    "docs/release-process.md",
    "docs/product-exit-criteria.md",
    "docs/threat-model.md",
]);

const WORK_PACKET_AUTHORITY = Object.freeze({
    kind: "generated-operational-lane-work-packet",
    generatedOnly: true,
    mutatesDeckData: false,
    writesTrackedTemplates: false,
    writesProofLedger: false,
    writesSourceEvidence: false,
    writesReleaseQaEvidence: false,
    certifiesCards: false,
    certifiesReviewTier: false,
    certifiesReleaseReadiness: false,
    automatesCardApproval: false,
    boundaries: Object.freeze([
        "This packet is generated operational evidence only.",
        "It does not replace Silver, Gold, Sapphire, Platinum, Obsidian proof, Deck Ready, source adequacy, release QA, or the full merge gate.",
        "It may record supplied operator decisions, but it cannot approve language quality, source truth, media quality, or card readiness.",
        "Queue deltas must keep expected backlog visible; do not shrink denominators or hide blockers to make a packet look green.",
        "Proof/source/template/release writes remain owned by their governed commands and ledgers.",
    ]),
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeLevels(levels = [5]) {
    return parseLevelsArgument(Array.isArray(levels) ? levels.join(",") : levels);
}

function asNonNegativeInteger(value, label) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${label} must be a non-negative integer.`);
    }
    return parsed;
}

function buildWordIdentity(card = {}) {
    const word = normalizeText(card.word);
    const reading = normalizeText(card.reading);
    return reading ? `${word}|${reading}` : word;
}

function buildSelectedItemIdentity(card = {}, index = 0) {
    return normalizeText(card.identity)
        || buildWordIdentity(card)
        || normalizeText(card.kanji)
        || normalizeText(card.id)
        || `selected-${index + 1}`;
}

function compactSelectedItem(card = {}, index = 0) {
    return {
        index: index + 1,
        identity: buildSelectedItemIdentity(card, index),
        word: normalizeText(card.word) || undefined,
        reading: normalizeText(card.reading) || undefined,
        kanji: normalizeText(card.kanji) || undefined,
        reviewStatus: normalizeText(card.reviewStatus) || "(missing)",
        hardChecksPassed: typeof card.hardChecksPassed === "boolean" ? card.hardChecksPassed : null,
        suggestedReviewStep: normalizeText(card.suggestedReviewStep) || "",
        riskFlags: Array.isArray(card.riskFlags) ? card.riskFlags.map(normalizeText).filter(Boolean) : [],
        rubricResult: normalizeText(card.reviewRubric?.result) || "",
    };
}

function selectedCardsFromBatchReport(batchReport = {}) {
    if (!batchReport || typeof batchReport !== "object" || Array.isArray(batchReport)) {
        throw new Error("Batch report must be a JSON object.");
    }
    const cards = Array.isArray(batchReport.cards) ? batchReport.cards : [];
    const selectedItems = cards.map(compactSelectedItem);
    const declaredSelectedCards = batchReport.summary?.selectedCards;
    if (Number.isInteger(declaredSelectedCards) && declaredSelectedCards !== selectedItems.length) {
        throw new Error(`Batch selected-card count mismatch: summary.selectedCards=${declaredSelectedCards}, cards=${selectedItems.length}.`);
    }
    return selectedItems;
}

function deriveQueueBefore(batchReport = {}, queue = "") {
    const summary = batchReport.summary || {};
    if (queue === "substantive-rereview" && Number.isInteger(summary.remainingSubstantiveRereview)) {
        return summary.remainingSubstantiveRereview;
    }
    if (Number.isInteger(summary.remainingCurrentStandard)) {
        return summary.remainingCurrentStandard;
    }
    if (Number.isInteger(summary.remainingSapphire)) {
        return summary.remainingSapphire;
    }
    if (Number.isInteger(summary.remainingPlatinum)) {
        return summary.remainingPlatinum;
    }
    const queueArrays = [
        batchReport.nextMissingWords,
        batchReport.nextMissingKanji,
        batchReport.nextSubstantiveRereviewWords,
        batchReport.nextSubstantiveRereviewKanji,
    ];
    const firstQueue = queueArrays.find(Array.isArray);
    return firstQueue ? firstQueue.length : null;
}

function buildQueueDelta({
    batchReport = {},
    queue = "",
    queueBefore = null,
    queueAfter = null,
    selectedCount = 0,
} = {}) {
    const before = queueBefore === null || queueBefore === undefined
        ? deriveQueueBefore(batchReport, queue)
        : asNonNegativeInteger(queueBefore, "--queue-before");
    const after = asNonNegativeInteger(queueAfter, "--queue-after");
    const delta = before === null || after === null ? null : after - before;
    const processed = before === null || after === null ? null : before - after;
    const classification = after === null
        ? "after-count-not-recorded"
        : delta > 0
            ? "queue-increased-investigate"
            : "queue-drained-or-stable";

    return {
        queue,
        before,
        after,
        delta,
        processed,
        selectedCount,
        classification,
    };
}

function normalizeDecision(decision = {}) {
    const identity = normalizeText(decision.identity);
    if (!identity) {
        throw new Error("Decision entries must include identity.");
    }
    const status = normalizeText(decision.decision || decision.status || "pending");
    if (!DECISION_STATUSES.includes(status)) {
        throw new Error(`Unsupported decision status for ${identity}: ${status}`);
    }
    return {
        identity,
        decision: status,
        reason: normalizeText(decision.reason),
        changedFiles: Array.isArray(decision.changedFiles)
            ? decision.changedFiles.map(normalizeText).filter(Boolean)
            : [],
        notes: normalizeText(decision.notes),
    };
}

function normalizeDecisionList(decisions = []) {
    if (!decisions) {
        return [];
    }
    if (Array.isArray(decisions)) {
        return decisions.map(normalizeDecision);
    }
    if (Array.isArray(decisions.decisions)) {
        return decisions.decisions.map(normalizeDecision);
    }
    throw new Error("Decisions must be a JSON array or an object with a decisions array.");
}

function mergeDecisionPlaceholders(selectedItems = [], decisions = []) {
    const byIdentity = new Map();
    for (const decision of normalizeDecisionList(decisions)) {
        if (byIdentity.has(decision.identity)) {
            throw new Error(`Duplicate decision identity: ${decision.identity}`);
        }
        byIdentity.set(decision.identity, decision);
    }
    const selectedIdentities = new Set(selectedItems.map((item) => item.identity));
    for (const identity of byIdentity.keys()) {
        if (!selectedIdentities.has(identity)) {
            throw new Error(`Decision references identity not in selected batch: ${identity}`);
        }
    }
    return selectedItems.map((item) => byIdentity.get(item.identity) || {
        identity: item.identity,
        decision: "pending",
        reason: "",
        changedFiles: [],
        notes: "",
    });
}

function buildExpectedVerificationCommands({ deckKind, lane, levels }) {
    const commandRows = [
        ...buildFocusedVerification({ deckKind, lane, levels }).map((command) => ({
            phase: "focused-verification",
            command,
        })),
        ...buildFullMergeGate().map((command) => ({
            phase: "full-merge-gate",
            command,
        })),
    ];
    const seen = new Set();
    return commandRows.filter((entry) => {
        if (!entry.command || seen.has(entry.command)) {
            return false;
        }
        seen.add(entry.command);
        return true;
    }).map((entry) => ({
        ...entry,
        classification: "pending",
        notes: "",
    }));
}

function normalizeVerificationResult(result = {}) {
    const command = normalizeText(result.command);
    if (!command) {
        throw new Error("Verification result entries must include command.");
    }
    const classification = normalizeText(result.classification || result.status || "pending");
    if (!VERIFICATION_CLASSIFICATIONS.includes(classification)) {
        throw new Error(`Unsupported verification classification for ${command}: ${classification}`);
    }
    const notes = normalizeText(result.notes || result.reason);
    if (classification === "skipped-with-reason" && !notes) {
        throw new Error(`Verification command classified skipped-with-reason must include notes: ${command}`);
    }
    return {
        command,
        classification,
        notes,
    };
}

function normalizeVerificationResultList(results = []) {
    if (!results) {
        return [];
    }
    if (Array.isArray(results)) {
        return results.map(normalizeVerificationResult);
    }
    if (Array.isArray(results.commands)) {
        return results.commands.map(normalizeVerificationResult);
    }
    if (Array.isArray(results.verificationCommands)) {
        return results.verificationCommands.map(normalizeVerificationResult);
    }
    throw new Error("Verification results must be a JSON array or an object with commands/verificationCommands.");
}

function mergeVerificationResults(expectedCommands = [], results = []) {
    const expectedByCommand = new Map(expectedCommands.map((entry) => [entry.command, entry]));
    const seen = new Set();
    for (const result of normalizeVerificationResultList(results)) {
        if (seen.has(result.command)) {
            throw new Error(`Duplicate verification result command: ${result.command}`);
        }
        seen.add(result.command);
        if (!expectedByCommand.has(result.command)) {
            throw new Error(`Verification result references command not in expected plan: ${result.command}`);
        }
        expectedByCommand.set(result.command, {
            ...expectedByCommand.get(result.command),
            classification: result.classification,
            notes: result.notes,
        });
    }
    return expectedCommands.map((entry) => expectedByCommand.get(entry.command));
}

function buildScope({
    deckKind = "word",
    lane = "ops",
    levels = [5],
    batchReport = {},
} = {}) {
    const normalizedDeckKind = normalizeDeckKind(deckKind);
    const normalizedLane = normalizeLane(batchReport.lane || lane);
    const normalizedLevels = normalizeLevels(
        Number.isInteger(batchReport.level) ? [batchReport.level] : levels
    );
    const queue = normalizeText(batchReport.queue);
    return {
        deckKind: normalizedDeckKind,
        lane: normalizedLane,
        levels: normalizedLevels,
        levelLabel: normalizedLevels.map((level) => `N${level}`).join(", "),
        queue,
        batchScope: normalizeText(batchReport.scope),
    };
}

function buildLaneWorkPacket({
    rootDir = process.cwd(),
    deckKind = "word",
    lane = "ops",
    levels = [5],
    batchReport,
    decisions = [],
    verificationResults = [],
    queueBefore = null,
    queueAfter = null,
    runId = "",
    generatedAt = new Date().toISOString(),
} = {}) {
    if (!batchReport) {
        throw new Error("A batch report is required to build a lane work packet.");
    }
    const scope = buildScope({ deckKind, lane, levels, batchReport });
    const selectedItems = selectedCardsFromBatchReport(batchReport);
    const verificationCommands = mergeVerificationResults(
        buildExpectedVerificationCommands(scope),
        verificationResults
    );
    const packet = {
        schemaVersion: WORK_PACKET_SCHEMA_VERSION,
        artifactType: "lane-work-packet",
        generatedAt,
        runId: runId ? normalizeRunId(runId) : "",
        rootDir: path.resolve(rootDir),
        authority: WORK_PACKET_AUTHORITY,
        scope,
        batch: {
            summary: batchReport.summary || {},
            reviewRubricSummary: batchReport.reviewRubricSummary || null,
            requestedMissing: batchReport.requestedMissing || [],
            selectedCount: selectedItems.length,
            selectedItems,
        },
        queueDelta: buildQueueDelta({
            batchReport,
            queue: scope.queue,
            queueBefore,
            queueAfter,
            selectedCount: selectedItems.length,
        }),
        decisions: mergeDecisionPlaceholders(selectedItems, decisions),
        nextLegalCommands: buildNextCommands(scope),
        verificationCommands,
        failClosedRules: [
            "Do not use this packet as proof of Silver, Gold, Sapphire, Platinum, Obsidian, source adequacy, release QA, or Deck Ready.",
            "Do not mark verification passed unless the exact command was run for this scope.",
            "Do not classify expected backlog as cleared without a live after-count from the governed queue.",
            "Do not write proof/source/template/release artifacts from this command.",
        ],
        sourceOfTruth: SOURCE_OF_TRUTH,
    };
    const validation = validateLaneWorkPacket(packet);
    if (!validation.ok) {
        throw new Error(`Generated lane work packet failed validation: ${validation.issues.join("; ")}`);
    }
    return packet;
}

function validateAuthority(authority = {}, issues = []) {
    const requiredFalse = [
        "mutatesDeckData",
        "writesTrackedTemplates",
        "writesProofLedger",
        "writesSourceEvidence",
        "writesReleaseQaEvidence",
        "certifiesCards",
        "certifiesReviewTier",
        "certifiesReleaseReadiness",
        "automatesCardApproval",
    ];
    for (const field of requiredFalse) {
        if (authority[field] !== false) {
            issues.push(`authority.${field} must be false`);
        }
    }
    if (authority.generatedOnly !== true) {
        issues.push("authority.generatedOnly must be true");
    }
}

function validateLaneWorkPacket(packet = {}) {
    const issues = [];
    if (packet.schemaVersion !== WORK_PACKET_SCHEMA_VERSION) {
        issues.push(`schemaVersion must be ${WORK_PACKET_SCHEMA_VERSION}`);
    }
    if (packet.artifactType !== "lane-work-packet") {
        issues.push("artifactType must be lane-work-packet");
    }
    validateAuthority(packet.authority || {}, issues);

    const selectedItems = packet.batch?.selectedItems || [];
    if (!Array.isArray(selectedItems)) {
        issues.push("batch.selectedItems must be an array");
    }
    const selectedIdentities = new Set();
    for (const item of Array.isArray(selectedItems) ? selectedItems : []) {
        if (!item.identity) {
            issues.push("batch.selectedItems entries must include identity");
        } else if (selectedIdentities.has(item.identity)) {
            issues.push(`duplicate selected identity: ${item.identity}`);
        } else {
            selectedIdentities.add(item.identity);
        }
    }
    if (Number.isInteger(packet.batch?.selectedCount) && packet.batch.selectedCount !== selectedIdentities.size) {
        issues.push(`batch.selectedCount ${packet.batch.selectedCount} does not match selected items ${selectedIdentities.size}`);
    }
    if (Number.isInteger(packet.batch?.summary?.selectedCards) && packet.batch.summary.selectedCards !== selectedIdentities.size) {
        issues.push(`batch.summary.selectedCards ${packet.batch.summary.selectedCards} does not match selected items ${selectedIdentities.size}`);
    }

    const decisionIdentities = new Set();
    for (const decision of Array.isArray(packet.decisions) ? packet.decisions : []) {
        if (!DECISION_STATUSES.includes(decision.decision)) {
            issues.push(`unsupported decision status for ${decision.identity}: ${decision.decision}`);
        }
        if (!selectedIdentities.has(decision.identity)) {
            issues.push(`decision identity not in selected batch: ${decision.identity}`);
        }
        if (decisionIdentities.has(decision.identity)) {
            issues.push(`duplicate decision identity: ${decision.identity}`);
        }
        decisionIdentities.add(decision.identity);
    }
    if (selectedIdentities.size !== decisionIdentities.size) {
        issues.push(`decisions ${decisionIdentities.size} do not cover selected items ${selectedIdentities.size}`);
    }

    for (const command of Array.isArray(packet.verificationCommands) ? packet.verificationCommands : []) {
        if (!VERIFICATION_CLASSIFICATIONS.includes(command.classification)) {
            issues.push(`unsupported verification classification for ${command.command}: ${command.classification}`);
        }
        if (command.classification === "skipped-with-reason" && !normalizeText(command.notes)) {
            issues.push(`skipped-with-reason command must include notes: ${command.command}`);
        }
    }
    const queueDelta = packet.queueDelta || {};
    if (Number.isInteger(queueDelta.before) && Number.isInteger(queueDelta.after)) {
        const expectedDelta = queueDelta.after - queueDelta.before;
        if (queueDelta.delta !== expectedDelta) {
            issues.push(`queueDelta.delta must equal after-before (${expectedDelta})`);
        }
        if (queueDelta.processed !== queueDelta.before - queueDelta.after) {
            issues.push("queueDelta.processed must equal before-after");
        }
    }

    return {
        ok: issues.length === 0,
        issues,
    };
}

function buildPacketFileName({ deckKind, lane, levels }) {
    const levelSlug = normalizeLevels(levels).map((level) => `n${level}`).join("-");
    return `${normalizeDeckKind(deckKind)}-${normalizeLane(lane)}-${levelSlug}.json`;
}

function resolveLaneWorkPacketPath({
    rootDir = process.cwd(),
    outDir = DEFAULT_WORK_PACKET_OUT_DIR,
    runId,
    deckKind = "word",
    lane = "ops",
    levels = [5],
} = {}) {
    const safeRunId = normalizeRunId(runId);
    const outputDir = assertSafeGeneratedPath(path.resolve(rootDir, outDir, safeRunId), {
        label: "lane work packet output directory",
    });
    return assertSafeGeneratedPath(path.join(outputDir, buildPacketFileName({ deckKind, lane, levels })), {
        label: "lane work packet output file",
    });
}

function formatLaneWorkPacket(packet = {}) {
    const lines = [
        "Japanese Kanji Builder Lane Work Packet",
        "",
        "Scope:",
        `- deck: ${packet.scope?.deckKind}`,
        `- lane: ${packet.scope?.lane}`,
        `- levels: ${packet.scope?.levelLabel}`,
        `- queue: ${packet.scope?.queue || "(none)"}`,
        `- batch scope: ${packet.scope?.batchScope || "(none)"}`,
        `- run id: ${packet.runId || "(not written)"}`,
        "",
        "Authority:",
        ...((packet.authority?.boundaries || []).map((entry) => `- ${entry}`)),
        "",
        "Queue delta:",
        `- before: ${packet.queueDelta?.before ?? "(unknown)"}`,
        `- after: ${packet.queueDelta?.after ?? "(not recorded)"}`,
        `- delta: ${packet.queueDelta?.delta ?? "(not recorded)"}`,
        `- selected: ${packet.queueDelta?.selectedCount ?? 0}`,
        `- classification: ${packet.queueDelta?.classification || "(unknown)"}`,
        "",
        "Selected batch:",
        ...((packet.batch?.selectedItems || []).map((item) => {
            const suffixes = [];
            if (item.hardChecksPassed === false) {
                suffixes.push("hard-checks-fail");
            }
            if (item.riskFlags?.length > 0) {
                suffixes.push(`${item.riskFlags.length} risk flag(s)`);
            }
            const suffix = suffixes.length > 0 ? `; ${suffixes.join("; ")}` : "";
            return `- ${item.identity} [${item.reviewStatus}]${suffix}`;
        })),
        "",
        "Decisions:",
        ...((packet.decisions || []).map((decision) => `- ${decision.identity}: ${decision.decision}${decision.reason ? ` - ${decision.reason}` : ""}`)),
        "",
        "Verification commands:",
        ...((packet.verificationCommands || []).map((entry) => `- [${entry.classification}] ${entry.command}${entry.notes ? ` - ${entry.notes}` : ""}`)),
        "",
        "Fail-closed rules:",
        ...((packet.failClosedRules || []).map((entry) => `- ${entry}`)),
        "",
        "Sources:",
        ...((packet.sourceOfTruth || []).map((entry) => `- ${entry}`)),
    ];
    return `${lines.join("\n")}\n`;
}

function formatLaneWorkPacketValidation({ ok, issues } = {}) {
    const lines = [
        "Japanese Kanji Builder Lane Work Packet Validation",
        "",
        `Status: ${ok ? "pass" : "fail"}`,
        "",
        "Issues:",
        ...((issues || []).length > 0 ? issues.map((issue) => `- ${issue}`) : ["- none"]),
    ];
    return `${lines.join("\n")}\n`;
}

module.exports = {
    DECISION_STATUSES,
    DEFAULT_WORK_PACKET_OUT_DIR,
    VERIFICATION_CLASSIFICATIONS,
    WORK_PACKET_AUTHORITY,
    WORK_PACKET_SCHEMA_VERSION,
    buildLaneWorkPacket,
    buildPacketFileName,
    buildQueueDelta,
    buildSelectedItemIdentity,
    formatLaneWorkPacket,
    formatLaneWorkPacketValidation,
    mergeDecisionPlaceholders,
    mergeVerificationResults,
    resolveLaneWorkPacketPath,
    selectedCardsFromBatchReport,
    validateLaneWorkPacket,
};
