const crypto = require("node:crypto");

const OBSIDIAN_PROOF_CANONICALIZATION = "jkb-json-c14n-v1";
const OBSIDIAN_PROOF_DIGEST_ALGORITHM = "sha256";

const COMMON_TYPED_REVIEW_CHECKS = Object.freeze([
    "liveGeneratedCard",
    "trackedReviewEntry",
    "japaneseSourceEvidence",
    "learnerFacingMeaning",
    "exampleSentence",
    "notesAndSupport",
    "readingStructure",
    "levelAndCoverage",
    "primaryAudioIdentity",
    "managedMediaProvenance",
    "laneSeparation",
    "limitationsReviewed",
]);

const DECK_TYPED_REVIEW_CHECKS = Object.freeze({
    kanji: Object.freeze([
        ...COMMON_TYPED_REVIEW_CHECKS,
        "strokeOrderIdentity",
    ]),
    word: Object.freeze([
        ...COMMON_TYPED_REVIEW_CHECKS,
        "exampleAudioIdentity",
        "pitchAccent",
        "wordDeckProductFit",
    ]),
});

function canonicalizeJson(value, location = "$") {
    if (value === null) {
        return "null";
    }
    if (typeof value === "string" || typeof value === "boolean") {
        return JSON.stringify(value);
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error(`Obsidian proof canonical JSON rejects non-finite number at ${location}.`);
        }
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry, index) => canonicalizeJson(entry, `${location}[${index}]`)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error(`Obsidian proof canonical JSON accepts plain objects only at ${location}.`);
        }
        return `{${Object.keys(value)
            .sort()
            .map((key) => {
                if (value[key] === undefined) {
                    throw new Error(`Obsidian proof canonical JSON rejects undefined at ${location}.${key}.`);
                }
                return `${JSON.stringify(key)}:${canonicalizeJson(value[key], `${location}.${key}`)}`;
            })
            .join(",")}}`;
    }
    throw new Error(`Obsidian proof canonical JSON rejects ${typeof value} at ${location}.`);
}

function sha256Text(value) {
    return crypto.createHash(OBSIDIAN_PROOF_DIGEST_ALGORITHM).update(String(value), "utf8").digest("hex");
}

function sha256Buffer(value) {
    return crypto.createHash(OBSIDIAN_PROOF_DIGEST_ALGORITHM).update(value).digest("hex");
}

function hashCanonicalJson(value) {
    return sha256Text(canonicalizeJson(value));
}

function buildObsidianProofIntegrityPayload(event = {}) {
    const payload = {
        ...event,
        integrity: {
            ...(event.integrity || {}),
        },
    };
    delete payload.integrity.payloadSha256;
    return payload;
}

function hashObsidianProofIntegrityPayload(event = {}) {
    return hashCanonicalJson(buildObsidianProofIntegrityPayload(event));
}

function getRequiredTypedReviewChecks(deckKind) {
    const checks = DECK_TYPED_REVIEW_CHECKS[deckKind];
    if (!checks) {
        throw new Error(`Unsupported Obsidian proof deck kind for typed checks: ${deckKind}.`);
    }
    return checks;
}

function typedReviewChecksPass(checks = {}, deckKind) {
    return getRequiredTypedReviewChecks(deckKind).every((field) => checks?.[field] === true);
}

function verifyObsidianProofIntegrityEnvelope(event = {}) {
    if (event.schemaVersion !== 2 || event.recordType !== "obsidian-proof-event") {
        return {
            passed: false,
            failures: ["record is not a schema-v2 Obsidian proof event"],
        };
    }

    const failures = [];
    const integrity = event.integrity || {};
    if (integrity.canonicalization !== OBSIDIAN_PROOF_CANONICALIZATION) {
        failures.push(`canonicalization must be ${OBSIDIAN_PROOF_CANONICALIZATION}`);
    }
    if (integrity.digestAlgorithm !== OBSIDIAN_PROOF_DIGEST_ALGORITHM) {
        failures.push(`digestAlgorithm must be ${OBSIDIAN_PROOF_DIGEST_ALGORITHM}`);
    }

    const expectedGeneratedCardSha256 = hashCanonicalJson(integrity.generatedCard?.row);
    if (integrity.generatedCard?.rowSha256 !== expectedGeneratedCardSha256) {
        failures.push("generatedCard.rowSha256 does not match the canonical generated-card snapshot");
    }
    const expectedReviewEntrySha256 = hashCanonicalJson(integrity.trackedReviewEntry?.entry);
    if (integrity.trackedReviewEntry?.entrySha256 !== expectedReviewEntrySha256) {
        failures.push("trackedReviewEntry.entrySha256 does not match the canonical tracked review-entry snapshot");
    }
    const expectedPayloadSha256 = hashObsidianProofIntegrityPayload(event);
    if (integrity.payloadSha256 !== expectedPayloadSha256) {
        failures.push("integrity.payloadSha256 does not match the canonical proof payload");
    }
    if (!typedReviewChecksPass(event.proof?.typedChecks, event.target?.deckKind)) {
        failures.push("proof.typedChecks does not affirm every required deck-specific review check");
    }

    return {
        passed: failures.length === 0,
        failures,
        calculated: {
            generatedCardRowSha256: expectedGeneratedCardSha256,
            trackedReviewEntrySha256: expectedReviewEntrySha256,
            payloadSha256: expectedPayloadSha256,
        },
    };
}

function v2RereviewProvenanceMatchesGeneratedRow(entry = {}, generatedRow = {}) {
    const provenance = entry?.rereviewProvenance;
    if (provenance?.schemaVersion !== 2) {
        return true;
    }
    return provenance.integrity?.generatedCard?.rowSha256 === hashCanonicalJson(generatedRow);
}

function v2RereviewProvenanceMatchesTrackedReviewEntry(entry = {}) {
    const provenance = entry?.rereviewProvenance;
    if (provenance?.schemaVersion !== 2) {
        return true;
    }
    const trackedEntry = { ...entry };
    delete trackedEntry.rereviewProvenance;
    return provenance.integrity?.trackedReviewEntry?.entrySha256 === hashCanonicalJson(trackedEntry);
}

function v2TypedReviewProofPasses(entry = {}, deckKind) {
    const provenance = entry?.rereviewProvenance;
    return provenance?.schemaVersion === 2
        && typedReviewChecksPass(provenance.typedChecks, deckKind)
        && v2RereviewProvenanceMatchesTrackedReviewEntry(entry);
}

module.exports = {
    COMMON_TYPED_REVIEW_CHECKS,
    DECK_TYPED_REVIEW_CHECKS,
    OBSIDIAN_PROOF_CANONICALIZATION,
    OBSIDIAN_PROOF_DIGEST_ALGORITHM,
    buildObsidianProofIntegrityPayload,
    canonicalizeJson,
    getRequiredTypedReviewChecks,
    hashCanonicalJson,
    hashObsidianProofIntegrityPayload,
    sha256Buffer,
    sha256Text,
    typedReviewChecksPass,
    v2RereviewProvenanceMatchesGeneratedRow,
    v2RereviewProvenanceMatchesTrackedReviewEntry,
    v2TypedReviewProofPasses,
    verifyObsidianProofIntegrityEnvelope,
};
