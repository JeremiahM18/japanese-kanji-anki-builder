const { z } = require("zod");

const benchmarkPairSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    label: z.enum(["positive", "negative"]),
    textA: z.string().min(1),
    textB: z.string().min(1),
    rationale: z.string().min(1),
}).strict();

const thresholdSchema = z.object({
    minimumMargin: z.number().positive(),
    requirePositiveMinAboveNegativeMax: z.boolean(),
}).strict();

const nlpEmbeddingBenchmarkSchema = z.object({
    version: z.literal(1),
    benchmarkId: z.string().min(1),
    description: z.string().min(1),
    task: z.literal("embedding"),
    pairs: z.array(benchmarkPairSchema).min(2),
    thresholds: thresholdSchema,
    limitations: z.array(z.string().min(1)).min(1),
}).strict();

function parseNlpEmbeddingBenchmark(value) {
    const parsed = nlpEmbeddingBenchmarkSchema.parse(value);
    const seenIds = new Set();
    const labels = new Set();

    for (const pair of parsed.pairs) {
        if (seenIds.has(pair.id)) {
            throw new Error(`Duplicate NLP embedding benchmark pair id: ${pair.id}.`);
        }
        seenIds.add(pair.id);
        labels.add(pair.label);
    }

    if (!labels.has("positive") || !labels.has("negative")) {
        throw new Error("NLP embedding benchmark must include both positive and negative pairs.");
    }

    return parsed;
}

module.exports = {
    nlpEmbeddingBenchmarkSchema,
    parseNlpEmbeddingBenchmark,
};
