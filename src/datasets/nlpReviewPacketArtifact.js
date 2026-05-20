const { z } = require("zod");

const NLP_REVIEW_PACKET_AUTHORITY = Object.freeze({
    outputAuthority: "assistive_only",
    promotionPolicy: "human_review_required",
    writesTrackedTemplates: false,
    certifiesCards: false,
    claimsReleaseReadiness: false,
});

const inputHashSchema = z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    byteSize: z.number().int().positive(),
}).strict();

const authoritySchema = z.object({
    outputAuthority: z.literal(NLP_REVIEW_PACKET_AUTHORITY.outputAuthority),
    promotionPolicy: z.literal(NLP_REVIEW_PACKET_AUTHORITY.promotionPolicy),
    writesTrackedTemplates: z.literal(false),
    certifiesCards: z.literal(false),
    claimsReleaseReadiness: z.literal(false),
}).strict();

const targetSchema = z.object({
    deckKind: z.enum(["kanji", "word"]),
    level: z.number().int().min(1).max(5).optional(),
    written: z.string().min(1),
    reading: z.string().min(1).optional(),
}).strict();

const suggestionRefSchema = z.object({
    id: z.string().min(1),
    task: z.string().min(1),
    action: z.string().min(1),
    score: z.number().min(0).max(1).optional(),
    rank: z.number().int().positive().optional(),
    summary: z.string().min(1),
    rationale: z.string().min(1),
    sourceArtifactPath: z.string().min(1),
    evidenceDigest: z.array(z.string().min(1)).min(1),
    limitations: z.array(z.string().min(1)).min(1),
}).strict();

const tokenizationSignalRefSchema = z.object({
    id: z.string().min(1),
    reviewPriority: z.enum(["attention", "routine"]),
    signalKinds: z.array(z.string().min(1)).min(1),
    surface: z.string().min(1),
    tokenSurfaces: z.array(z.string()).default([]),
    normalizedTokenReading: z.string().nullable().optional(),
    normalizedCardReading: z.string().nullable().optional(),
    readingAlignment: z.object({
        comparable: z.boolean(),
        matches: z.boolean(),
    }).strict(),
    sourceArtifactPath: z.string().min(1),
    limitations: z.array(z.string().min(1)).default([]),
}).strict();

const packetSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    target: targetSchema,
    priority: z.enum(["attention", "review", "routine"]),
    summary: z.string().min(1),
    reviewChecklist: z.array(z.string().min(1)).min(1),
    suggestionRefs: z.array(suggestionRefSchema).default([]),
    tokenizationSignalRefs: z.array(tokenizationSignalRefSchema).default([]),
    limitations: z.array(z.string().min(1)).min(1),
    authority: authoritySchema,
}).strict();

const nlpReviewPacketArtifactSchema = z.object({
    version: z.literal(1),
    artifactType: z.literal("nlp_review_packet_batch"),
    generatedAt: z.string().min(1),
    generator: z.object({
        createdBy: z.string().min(1),
        inputHashes: z.array(inputHashSchema).min(1),
    }).strict(),
    scope: z.object({
        deckKind: z.enum(["kanji", "word", "mixed"]),
        levels: z.array(z.number().int().min(1).max(5)).default([]),
        description: z.string().min(1),
    }).strict(),
    authority: authoritySchema,
    counts: z.object({
        packets: z.number().int().nonnegative(),
        suggestions: z.number().int().nonnegative(),
        tokenizationSignals: z.number().int().nonnegative(),
        attentionPackets: z.number().int().nonnegative(),
        reviewPackets: z.number().int().nonnegative(),
        routinePackets: z.number().int().nonnegative(),
    }).strict(),
    packets: z.array(packetSchema),
}).strict();

function parseNlpReviewPacketArtifact(value) {
    const parsed = nlpReviewPacketArtifactSchema.parse(value);
    const seenIds = new Set();

    for (const packet of parsed.packets) {
        if (seenIds.has(packet.id)) {
            throw new Error(`Duplicate NLP review packet id: ${packet.id}.`);
        }
        seenIds.add(packet.id);
        if (packet.target.deckKind === "word" && !packet.target.reading) {
            throw new Error(`NLP word review packet ${packet.id} must bind target.reading.`);
        }
        if (packet.authority.outputAuthority !== NLP_REVIEW_PACKET_AUTHORITY.outputAuthority) {
            throw new Error(`NLP review packet ${packet.id} has invalid authority.`);
        }
    }

    if (parsed.counts.packets !== parsed.packets.length) {
        throw new Error(`NLP review packet count ${parsed.counts.packets} does not match packets length ${parsed.packets.length}.`);
    }
    if (parsed.counts.suggestions !== parsed.packets.reduce((sum, packet) => sum + packet.suggestionRefs.length, 0)) {
        throw new Error("NLP review packet suggestion count does not match packet contents.");
    }
    if (parsed.counts.tokenizationSignals !== parsed.packets.reduce((sum, packet) => sum + packet.tokenizationSignalRefs.length, 0)) {
        throw new Error("NLP review packet tokenization signal count does not match packet contents.");
    }

    return parsed;
}

module.exports = {
    NLP_REVIEW_PACKET_AUTHORITY,
    nlpReviewPacketArtifactSchema,
    parseNlpReviewPacketArtifact,
};
