const { z } = require("zod");

const NLP_DRAFT_PROPOSAL_AUTHORITY = Object.freeze({
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
    outputAuthority: z.literal(NLP_DRAFT_PROPOSAL_AUTHORITY.outputAuthority),
    promotionPolicy: z.literal(NLP_DRAFT_PROPOSAL_AUTHORITY.promotionPolicy),
    writesTrackedTemplates: z.literal(false),
    certifiesCards: z.literal(false),
    claimsReleaseReadiness: z.literal(false),
}).strict();

const sourceTypeSchema = z.enum([
    "suggestion",
    "review-packet",
    "tokenization-signal",
    "generated-row",
    "tracked-source",
    "source-manifest",
    "corpus",
    "model-score",
    "runtime",
    "human-note",
]);

const targetSchema = z.object({
    deckKind: z.enum(["kanji", "word"]),
    level: z.number().int().min(1).max(5),
    written: z.string().min(1),
    reading: z.string().min(1).optional(),
}).strict();

const sourceRefSchema = z.object({
    sourceType: sourceTypeSchema,
    sourceId: z.string().min(1),
    path: z.string().min(1).optional(),
    excerpt: z.string().min(1).optional(),
    note: z.string().min(1),
}).strict();

const proposalSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    draftKind: z.enum([
        "word-contract-candidate",
        "example-candidate",
        "sense-fit-review-note",
        "tokenization-review-note",
        "general-review-note",
    ]),
    target: targetSchema,
    priority: z.enum(["attention", "review", "routine"]),
    title: z.string().min(1),
    rationale: z.string().min(1),
    proposedFields: z.record(z.string().min(1), z.string().min(1)).default({}),
    blockers: z.array(z.string().min(1)).min(1),
    promotionChecklist: z.array(z.string().min(1)).min(1),
    sourceRefs: z.array(sourceRefSchema).min(1),
    limitations: z.array(z.string().min(1)).min(1),
    authority: authoritySchema,
}).strict();

const nlpDraftProposalArtifactSchema = z.object({
    version: z.literal(1),
    artifactType: z.literal("nlp_draft_proposal_batch"),
    generatedAt: z.string().min(1),
    generator: z.object({
        modelIds: z.array(z.string().min(1)).default([]),
        runId: z.string().min(1),
        manifestPath: z.string().min(1),
        createdBy: z.string().min(1),
        inputHashes: z.array(inputHashSchema).min(1),
    }).strict(),
    scope: z.object({
        deckKind: z.enum(["kanji", "word", "mixed"]),
        levels: z.array(z.number().int().min(1).max(5)).min(1),
        lane: z.literal("assistive-draft-proposal"),
        description: z.string().min(1),
    }).strict(),
    authority: authoritySchema,
    counts: z.object({
        proposals: z.number().int().nonnegative(),
        proposalsByKind: z.record(z.string().min(1), z.number().int().nonnegative()),
        proposalsByPriority: z.record(z.string().min(1), z.number().int().nonnegative()),
        sourceSuggestions: z.number().int().nonnegative(),
        sourcePackets: z.number().int().nonnegative(),
    }).strict(),
    proposals: z.array(proposalSchema),
}).strict();

function countBy(values, keyFn) {
    const counts = {};
    for (const value of values) {
        const key = keyFn(value);
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

function assertExactCountMap(label, expected = {}, actual = {}) {
    const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
    const actualEntries = Object.entries(actual).sort(([a], [b]) => a.localeCompare(b));
    if (JSON.stringify(expectedEntries) !== JSON.stringify(actualEntries)) {
        throw new Error(`${label} does not match proposal contents.`);
    }
}

function parseNlpDraftProposalArtifact(value) {
    const parsed = nlpDraftProposalArtifactSchema.parse(value);
    const seenIds = new Set();
    const hasModelBackedProposal = parsed.proposals.some((proposal) => proposal.draftKind !== "tokenization-review-note");

    if (hasModelBackedProposal && parsed.generator.modelIds.length === 0) {
        throw new Error("NLP draft proposal artifacts with model-backed proposals must declare generator.modelIds.");
    }

    for (const proposal of parsed.proposals) {
        if (seenIds.has(proposal.id)) {
            throw new Error(`Duplicate NLP draft proposal id: ${proposal.id}.`);
        }
        seenIds.add(proposal.id);
        if (proposal.target.deckKind === "word" && !proposal.target.reading) {
            throw new Error(`NLP word draft proposal ${proposal.id} must bind target.reading.`);
        }
        if (proposal.draftKind === "tokenization-review-note") {
            if (!proposal.sourceRefs.some((sourceRef) => sourceRef.sourceType === "tokenization-signal")) {
                throw new Error(`NLP tokenization draft proposal ${proposal.id} must include a tokenization-signal source ref.`);
            }
        } else if (!proposal.sourceRefs.some((sourceRef) => sourceRef.sourceType === "suggestion")) {
            throw new Error(`NLP model-backed draft proposal ${proposal.id} must include a suggestion source ref.`);
        }
    }

    if (parsed.counts.proposals !== parsed.proposals.length) {
        throw new Error(`NLP draft proposal count ${parsed.counts.proposals} does not match proposals length ${parsed.proposals.length}.`);
    }
    assertExactCountMap(
        "NLP draft proposal kind counts",
        parsed.counts.proposalsByKind,
        countBy(parsed.proposals, (proposal) => proposal.draftKind)
    );
    assertExactCountMap(
        "NLP draft proposal priority counts",
        parsed.counts.proposalsByPriority,
        countBy(parsed.proposals, (proposal) => proposal.priority)
    );

    return parsed;
}

module.exports = {
    NLP_DRAFT_PROPOSAL_AUTHORITY,
    nlpDraftProposalArtifactSchema,
    parseNlpDraftProposalArtifact,
};
