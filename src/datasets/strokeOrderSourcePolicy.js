const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const releaseStrokeOrderSchema = z.object({
    allowedImageSourceIds: z.array(z.string().min(1)).min(1),
    allowedAnimationSourceIds: z.array(z.string().min(1)).min(1),
    requireSingleImageSourcePerDeck: z.boolean().default(false),
    requireSingleAnimationSourcePerDeck: z.boolean().default(false),
    remoteImageProvidersAllowed: z.boolean().default(false),
    remoteAnimationProvidersAllowed: z.boolean().default(false),
    sourceNotes: z.record(z.string().min(1), z.string().min(1)).default({}),
});

const strokeOrderSourcePolicySchema = z.object({
    version: z.literal(1),
    releaseStrokeOrder: releaseStrokeOrderSchema,
});

function buildDefaultStrokeOrderSourcePolicyPath() {
    return path.resolve(__dirname, "../../templates/stroke_order_source_policy.json");
}

function loadStrokeOrderSourcePolicy(policyPath = buildDefaultStrokeOrderSourcePolicyPath()) {
    const resolvedPath = path.resolve(policyPath);
    const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
    const parsed = strokeOrderSourcePolicySchema.parse(raw);

    return {
        ...parsed,
        policyPath: resolvedPath,
    };
}

module.exports = {
    buildDefaultStrokeOrderSourcePolicyPath,
    loadStrokeOrderSourcePolicy,
    strokeOrderSourcePolicySchema,
};
