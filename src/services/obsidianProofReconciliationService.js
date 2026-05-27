const fs = require("node:fs");
const path = require("node:path");

const {
    buildObsidianProofTargetKey,
    buildRereviewProvenanceFromLedgerEvent,
    loadObsidianProofLedger,
} = require("../datasets/obsidianProofLedger");
const {
    buildEntryTargetKeys,
    getReviewSetRelativePath,
} = require("./obsidianProofCompatibilityViewService");
const {
    getInlineProvenanceNormalizationStats,
    normalizeInlineProvenance,
} = require("./obsidianProofInlineProvenanceService");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function isPlainRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readJsonArray(filePath) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in review set: ${filePath}`);
    }
    return parsed;
}

function stableJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stableJson(value[key])}`
        )).join(",")}}`;
    }
    return JSON.stringify(value);
}

function getInlineProofTargetKey(entry = {}, { deckKind, level }) {
    const provenance = entry.rereviewProvenance;
    if (isPlainRecord(provenance) && normalizeText(provenance.cardReviewed)) {
        return [
            deckKind,
            `n${level}`,
            normalizeText(provenance.cardReviewed),
        ].join(":");
    }

    const [targetKey] = buildEntryTargetKeys(entry, { deckKind, level });
    return targetKey || null;
}

function loadInlineProofsForReviewSet({
    cwd,
    deckKind,
    level,
}) {
    const sourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
    const reviewSetPath = path.join(cwd, sourceReviewSetPath);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing review set for Obsidian proof reconciliation: ${reviewSetPath}`);
    }

    const entries = readJsonArray(reviewSetPath);
    const inlineProofs = [];
    const sourceTargetKeys = new Set();
    const duplicateTargets = new Map();
    const seenTargets = new Map();
    let normalizedSentenceQualityReviews = 0;
    let sanitizedSentenceQualityReviews = 0;

    for (const entry of entries) {
        for (const targetKey of buildEntryTargetKeys(entry, { deckKind, level })) {
            sourceTargetKeys.add(targetKey);
        }
        if (!isPlainRecord(entry.rereviewProvenance)) {
            continue;
        }
        const targetKey = getInlineProofTargetKey(entry, { deckKind, level });
        if (!targetKey) {
            throw new Error(`Inline rereviewProvenance in ${sourceReviewSetPath} is missing a card target.`);
        }
        const cardReviewed = normalizeText(entry.rereviewProvenance.cardReviewed)
            || targetKey.split(":").slice(2).join(":");
        const normalizationStats = getInlineProvenanceNormalizationStats(entry.rereviewProvenance, {
            deckKind,
        });
        const provenance = normalizeInlineProvenance(entry.rereviewProvenance, {
            cardReviewed,
            deckKind,
            entry,
            level,
        });
        if (normalizationStats.normalizedSentenceQualityReview) {
            normalizedSentenceQualityReviews += 1;
        } else if (normalizationStats.sanitizedSentenceQualityReview) {
            sanitizedSentenceQualityReviews += 1;
        }
        const prior = seenTargets.get(targetKey);
        if (prior) {
            duplicateTargets.set(targetKey, [prior, entry]);
        }
        seenTargets.set(targetKey, entry);
        inlineProofs.push({
            targetKey,
            sourceReviewSetPath,
            entry,
            provenance,
        });
    }

    return {
        deckKind,
        level,
        sourceReviewSetPath,
        sourceEntries: entries.length,
        inlineProofs,
        sourceTargetKeys: [...sourceTargetKeys].sort(),
        duplicateInlineTargets: [...duplicateTargets.keys()].sort(),
        normalizedSentenceQualityReviews,
        sanitizedSentenceQualityReviews,
    };
}

function buildLedgerProofRecords(events = []) {
    return events.map((event) => ({
        targetKey: buildObsidianProofTargetKey(event),
        sourceReviewSetPath: event.ledger.sourceReviewSetPath.replace(/\\/g, "/"),
        proofId: event.proofId,
        event,
        provenance: buildRereviewProvenanceFromLedgerEvent(event),
    }));
}

function summarizeScope({
    deckKind,
    level,
    inlineProofs,
    sourceTargetKeys = [],
    ledgerProofs,
    duplicateInlineTargets,
    normalizedSentenceQualityReviews = 0,
    sanitizedSentenceQualityReviews = 0,
}) {
    const inlineByTarget = new Map(inlineProofs.map((proof) => [proof.targetKey, proof]));
    const ledgerByTarget = new Map(ledgerProofs.map((proof) => [proof.targetKey, proof]));
    const sourceTargets = new Set(sourceTargetKeys);
    const inlineTargets = [...inlineByTarget.keys()].sort();
    const ledgerTargets = [...ledgerByTarget.keys()].sort();
    const inlineOnlyTargets = inlineTargets.filter((targetKey) => !ledgerByTarget.has(targetKey));
    const ledgerOnlyTargets = ledgerTargets.filter((targetKey) => !sourceTargets.has(targetKey));
    const canonicalLedgerTargets = ledgerTargets.filter((targetKey) => (
        sourceTargets.has(targetKey) && !inlineByTarget.has(targetKey)
    ));
    const matchedTargets = inlineTargets.filter((targetKey) => ledgerByTarget.has(targetKey));
    const proofMismatches = matchedTargets
        .filter((targetKey) => stableJson(inlineByTarget.get(targetKey).provenance)
            !== stableJson(ledgerByTarget.get(targetKey).provenance))
        .map((targetKey) => ({
            targetKey,
            proofId: ledgerByTarget.get(targetKey).proofId,
        }));

    return {
        deckKind,
        level,
        inlineProofs: inlineProofs.length,
        ledgerProofs: ledgerProofs.length,
        matchedProofs: matchedTargets.length,
        canonicalLedgerProofs: canonicalLedgerTargets.length,
        inlineOnlyProofs: inlineOnlyTargets.length,
        ledgerOnlyProofs: ledgerOnlyTargets.length,
        proofMismatches: proofMismatches.length,
        normalizedSentenceQualityReviews,
        sanitizedSentenceQualityReviews,
        duplicateInlineTargets,
        inlineOnlyTargets,
        ledgerOnlyTargets,
        canonicalLedgerTargets,
        mismatchedTargets: proofMismatches,
        passed: inlineOnlyTargets.length === 0
            && ledgerOnlyTargets.length === 0
            && proofMismatches.length === 0
            && duplicateInlineTargets.length === 0,
    };
}

function buildObsidianProofReconciliation({
    cwd = process.cwd(),
    ledgerDir,
    deckKinds = ["kanji"],
    levels = [3],
    allowIncomplete = false,
} = {}) {
    const resolvedCwd = path.resolve(cwd);
    const ledger = loadObsidianProofLedger({ cwd: resolvedCwd, ledgerDir });
    const ledgerProofs = buildLedgerProofRecords(ledger.events);
    const scopeReports = [];
    const skippedScopes = [];

    for (const deckKind of deckKinds) {
        for (const level of levels) {
            const sourceReviewSetPath = getReviewSetRelativePath({ deckKind, level });
            const sourceScopedLedgerProofs = ledgerProofs.filter((proof) => (
                proof.sourceReviewSetPath === sourceReviewSetPath
            ));
            const reviewSetPath = path.join(resolvedCwd, sourceReviewSetPath);
            if (!fs.existsSync(reviewSetPath)) {
                if (allowIncomplete && sourceScopedLedgerProofs.length === 0) {
                    skippedScopes.push({
                        deckKind,
                        level,
                        sourceReviewSetPath,
                        reason: "missing review set and no scoped ledger proof",
                    });
                    continue;
                }
                throw new Error(`Missing review set for Obsidian proof reconciliation: ${reviewSetPath}`);
            }
            const reviewSet = loadInlineProofsForReviewSet({
                cwd: resolvedCwd,
                deckKind,
                level,
            });
            scopeReports.push({
                ...summarizeScope({
                    deckKind,
                    level,
                    inlineProofs: reviewSet.inlineProofs,
                    sourceTargetKeys: reviewSet.sourceTargetKeys,
                    ledgerProofs: sourceScopedLedgerProofs,
                    duplicateInlineTargets: reviewSet.duplicateInlineTargets,
                    normalizedSentenceQualityReviews: reviewSet.normalizedSentenceQualityReviews,
                    sanitizedSentenceQualityReviews: reviewSet.sanitizedSentenceQualityReviews,
                }),
                sourceReviewSetPath: reviewSet.sourceReviewSetPath,
                sourceEntries: reviewSet.sourceEntries,
            });
        }
    }

    const totals = scopeReports.reduce((acc, report) => ({
        sourceEntries: acc.sourceEntries + report.sourceEntries,
        inlineProofs: acc.inlineProofs + report.inlineProofs,
        ledgerProofs: acc.ledgerProofs + report.ledgerProofs,
        matchedProofs: acc.matchedProofs + report.matchedProofs,
        canonicalLedgerProofs: acc.canonicalLedgerProofs + report.canonicalLedgerProofs,
        inlineOnlyProofs: acc.inlineOnlyProofs + report.inlineOnlyProofs,
        ledgerOnlyProofs: acc.ledgerOnlyProofs + report.ledgerOnlyProofs,
        proofMismatches: acc.proofMismatches + report.proofMismatches,
        normalizedSentenceQualityReviews: acc.normalizedSentenceQualityReviews
            + report.normalizedSentenceQualityReviews,
        sanitizedSentenceQualityReviews: acc.sanitizedSentenceQualityReviews
            + report.sanitizedSentenceQualityReviews,
        duplicateInlineTargets: acc.duplicateInlineTargets + report.duplicateInlineTargets.length,
    }), {
        sourceEntries: 0,
        inlineProofs: 0,
        ledgerProofs: 0,
        matchedProofs: 0,
        canonicalLedgerProofs: 0,
        inlineOnlyProofs: 0,
        ledgerOnlyProofs: 0,
        proofMismatches: 0,
        normalizedSentenceQualityReviews: 0,
        sanitizedSentenceQualityReviews: 0,
        duplicateInlineTargets: 0,
    });

    return {
        passed: scopeReports.every((report) => report.passed),
        ledgerDir: ledger.ledgerDir,
        ledgerFiles: ledger.files,
        totals,
        scopes: scopeReports,
        skippedScopes,
    };
}

function buildObsidianProofReconciliationReport(options = {}) {
    try {
        return buildObsidianProofReconciliation(options);
    } catch (error) {
        return {
            passed: false,
            ledgerDir: options.ledgerDir || null,
            ledgerFiles: [],
            totals: {
                sourceEntries: 0,
                inlineProofs: 0,
                ledgerProofs: 0,
                matchedProofs: 0,
                canonicalLedgerProofs: 0,
                inlineOnlyProofs: 0,
                ledgerOnlyProofs: 0,
                proofMismatches: 0,
                normalizedSentenceQualityReviews: 0,
                sanitizedSentenceQualityReviews: 0,
                duplicateInlineTargets: 0,
            },
            scopes: [],
            skippedScopes: [],
            failures: [error.message],
        };
    }
}

function formatTargetSample(targets = [], limit = 16) {
    if (!Array.isArray(targets) || targets.length === 0) {
        return "none";
    }
    const sample = targets.slice(0, limit).join(", ");
    return targets.length > limit ? `${sample}, ... ${targets.length - limit} more` : sample;
}

function formatObsidianProofReconciliationReport(report = {}) {
    const totals = report.totals || {};
    const lines = [
        "Japanese Kanji Builder Obsidian Proof Reconciliation",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Ledger files: ${(report.ledgerFiles || []).length}`,
        `Source review entries: ${totals.sourceEntries || 0}`,
        `Inline rereviewProvenance proofs: ${totals.inlineProofs || 0}`,
        `Ledger proof events: ${totals.ledgerProofs || 0}`,
        `Inline/ledger matched proofs: ${totals.matchedProofs || 0}`,
        `Canonical ledger proofs bound to source entries: ${totals.canonicalLedgerProofs || 0}`,
        `Inline-only proofs: ${totals.inlineOnlyProofs || 0}`,
        `Ledger-only proofs: ${totals.ledgerOnlyProofs || 0}`,
        `Proof mismatches: ${totals.proofMismatches || 0}`,
        `Inline sentence-quality objects normalized from evidence: ${totals.normalizedSentenceQualityReviews || 0}`,
        `Inline sentence-quality objects sanitized to canonical schema: ${totals.sanitizedSentenceQualityReviews || 0}`,
        `Duplicate inline targets: ${totals.duplicateInlineTargets || 0}`,
        "",
        "Authority boundary:",
        "- Reconciliation binds canonical JSONL ledger proof to tracked review-set entries.",
        "- During transition it also compares any remaining legacy inline proof against canonical ledger proof.",
        "- It does not certify cards, repair proof, change generated exports, or claim release readiness.",
    ];

    for (const scope of report.scopes || []) {
        lines.push(
            "",
            `${scope.deckKind}:N${scope.level}`,
            `- Source: ${scope.sourceReviewSetPath}`,
            `- Source entries: ${scope.sourceEntries}`,
            `- Inline proofs: ${scope.inlineProofs}`,
            `- Ledger proofs: ${scope.ledgerProofs}`,
            `- Inline/ledger matched: ${scope.matchedProofs}`,
            `- Canonical ledger bound to source entries: ${scope.canonicalLedgerProofs}`,
            `- Inline-only: ${scope.inlineOnlyProofs}; sample: ${formatTargetSample(scope.inlineOnlyTargets)}`,
            `- Ledger-only: ${scope.ledgerOnlyProofs}; sample: ${formatTargetSample(scope.ledgerOnlyTargets)}`,
            `- Mismatches: ${scope.proofMismatches}; sample: ${formatTargetSample(scope.mismatchedTargets.map((item) => item.targetKey))}`,
            `- Inline sentence-quality normalized: ${scope.normalizedSentenceQualityReviews}`,
            `- Inline sentence-quality sanitized: ${scope.sanitizedSentenceQualityReviews}`,
            `- Duplicate inline targets: ${scope.duplicateInlineTargets.length}; sample: ${formatTargetSample(scope.duplicateInlineTargets)}`
        );
    }

    if (Array.isArray(report.skippedScopes) && report.skippedScopes.length > 0) {
        lines.push("", "Skipped incomplete scopes:");
        for (const scope of report.skippedScopes) {
            lines.push(`- ${scope.deckKind}:N${scope.level}; source=${scope.sourceReviewSetPath}; reason=${scope.reason}`);
        }
    }

    if (!report.passed && Array.isArray(report.failures)) {
        lines.push("", "Failures:");
        for (const failure of report.failures) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildObsidianProofReconciliation,
    buildObsidianProofReconciliationReport,
    formatObsidianProofReconciliationReport,
    stableJson,
};
