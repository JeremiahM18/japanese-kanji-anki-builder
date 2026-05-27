const fs = require("node:fs");
const path = require("node:path");

const {
    buildObsidianProofTargetKey,
    loadObsidianProofLedger,
} = require("../datasets/obsidianProofLedger");
const {
    buildCompatibilityEntries,
    getReviewSetRelativePath,
} = require("./obsidianProofCompatibilityViewService");

const OBSIDIAN_PROOF_PROVIDER_MODES = Object.freeze({
    INLINE: "inline",
    LEDGER: "ledger",
    LEDGER_IF_AVAILABLE: "ledger-if-available",
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function toPosixPath(value) {
    return String(value).replace(/\\/g, "/");
}

function normalizeObsidianProofProviderMode(value = OBSIDIAN_PROOF_PROVIDER_MODES.INLINE) {
    const normalized = normalizeText(value);
    if (Object.values(OBSIDIAN_PROOF_PROVIDER_MODES).includes(normalized)) {
        return normalized;
    }
    throw new Error(`Unsupported Obsidian proof provider: ${value}.`);
}

function readJsonArray(filePath) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in review set: ${filePath}`);
    }
    return parsed;
}

function cloneEntries(entries = []) {
    return JSON.parse(JSON.stringify(Array.isArray(entries) ? entries : []));
}

function resolveReviewSetPath({
    cwd = process.cwd(),
    deckKind = "kanji",
    level,
    sourceReviewSetPath,
} = {}) {
    const relativePath = sourceReviewSetPath || getReviewSetRelativePath({ deckKind, level });
    return {
        sourceReviewSetPath: toPosixPath(relativePath),
        absolutePath: path.resolve(cwd, relativePath),
    };
}

function loadScopedLedgerEvents({
    cwd = process.cwd(),
    ledgerDir,
    deckKind = "kanji",
    level,
    sourceReviewSetPath,
} = {}) {
    const ledger = loadObsidianProofLedger({ cwd, ledgerDir });
    const expectedSourceReviewSetPath = toPosixPath(sourceReviewSetPath || getReviewSetRelativePath({ deckKind, level }));
    const events = ledger.events.filter((event) => (
        event.target.deckKind === deckKind
        && Number(event.target.level) === Number(level)
    ));

    for (const event of events) {
        const actualSourceReviewSetPath = toPosixPath(event.ledger.sourceReviewSetPath);
        if (actualSourceReviewSetPath !== expectedSourceReviewSetPath) {
            throw new Error([
                `Obsidian proof provider sourceReviewSetPath mismatch for ${buildObsidianProofTargetKey(event)}`,
                `expected ${expectedSourceReviewSetPath}`,
                `actual ${actualSourceReviewSetPath}`,
            ].join("; "));
        }
    }

    return {
        ledgerDir: ledger.ledgerDir,
        ledgerFiles: ledger.files,
        events,
        sourceReviewSetPath: expectedSourceReviewSetPath,
    };
}

function applyObsidianProofProvider({
    entries = [],
    cwd = process.cwd(),
    ledgerDir,
    deckKind = "kanji",
    level,
    sourceReviewSetPath,
    proofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
} = {}) {
    const mode = normalizeObsidianProofProviderMode(proofProvider);
    const sourcePath = sourceReviewSetPath || getReviewSetRelativePath({ deckKind, level });
    const sourceEntries = cloneEntries(entries);

    if (mode === OBSIDIAN_PROOF_PROVIDER_MODES.INLINE) {
        return {
            entries: sourceEntries,
            proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
            requestedProofProvider: mode,
            summary: {
                deckKind,
                level,
                sourceEntries: sourceEntries.length,
                sourceReviewSetPath: toPosixPath(sourcePath),
                ledgerProofEvents: 0,
                ledgerProofsApplied: 0,
                inlineProofsOmitted: 0,
                entriesWithoutLedgerProof: sourceEntries.length,
            },
        };
    }

    const scopedLedger = loadScopedLedgerEvents({
        cwd,
        ledgerDir,
        deckKind,
        level,
        sourceReviewSetPath: sourcePath,
    });

    if (
        mode === OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE
        && scopedLedger.events.length === 0
    ) {
        return {
            entries: sourceEntries,
            proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
            requestedProofProvider: mode,
            legacyFallback: true,
            summary: {
                deckKind,
                level,
                sourceEntries: sourceEntries.length,
                sourceReviewSetPath: toPosixPath(sourcePath),
                ledgerProofEvents: 0,
                ledgerProofsApplied: 0,
                inlineProofsOmitted: 0,
                entriesWithoutLedgerProof: sourceEntries.length,
            },
        };
    }

    const compatibility = buildCompatibilityEntries({
        entries: sourceEntries,
        events: scopedLedger.events,
        deckKind,
        level,
    });

    return {
        entries: compatibility.entries,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
        requestedProofProvider: mode,
        legacyFallback: false,
        summary: {
            ...compatibility.summary,
            sourceReviewSetPath: scopedLedger.sourceReviewSetPath,
        },
    };
}

function loadReviewSetWithObsidianProof({
    cwd = process.cwd(),
    ledgerDir,
    deckKind = "kanji",
    level,
    sourceReviewSetPath,
    proofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
} = {}) {
    const resolved = resolveReviewSetPath({
        cwd,
        deckKind,
        level,
        sourceReviewSetPath,
    });
    if (!fs.existsSync(resolved.absolutePath)) {
        throw new Error(`Missing platinum ${deckKind} review set at ${resolved.absolutePath}`);
    }

    const entries = readJsonArray(resolved.absolutePath);
    return applyObsidianProofProvider({
        entries,
        cwd,
        ledgerDir,
        deckKind,
        level,
        sourceReviewSetPath: resolved.sourceReviewSetPath,
        proofProvider,
    });
}

module.exports = {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    applyObsidianProofProvider,
    loadReviewSetWithObsidianProof,
    loadScopedLedgerEvents,
    normalizeObsidianProofProviderMode,
    resolveReviewSetPath,
};
