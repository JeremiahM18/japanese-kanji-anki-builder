const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const ciPolicySchema = z.enum([
    "ci-required",
    "manual-local",
    "smoke-ci",
    "release-ci",
]);

const benchmarkClassSchema = z.enum([
    "timing-budget",
    "memory-sampling",
    "package-contract",
    "diagnostic",
]);

const matrixStatusSchema = z.enum([
    "present",
    "planned",
    "not-applicable",
]);

const budgetSchema = z.object({
    status: matrixStatusSchema,
    profile: z.string().min(1).nullable(),
    metrics: z.array(z.string().min(1)),
    gateCommand: z.string().min(1).nullable(),
}).strict();

const memorySamplingSchema = z.object({
    status: matrixStatusSchema,
    source: z.string().min(1).nullable(),
    scope: z.array(z.string().min(1)),
    metrics: z.array(z.enum([
        "rss",
        "heapTotal",
        "heapUsed",
        "external",
        "arrayBuffers",
    ])),
    notes: z.string().min(1),
}).strict();

const auditLaneSchema = z.object({
    id: z.string().min(1),
    productArea: z.string().min(1),
    benchmarkClass: benchmarkClassSchema,
    command: z.string().min(1),
    packageScript: z.string().min(1),
    ciPolicy: ciPolicySchema,
    workflowCommand: z.string().min(1).nullable(),
    inputBoundary: z.array(z.string().min(1)).min(1),
    outputBoundary: z.array(z.string().min(1)).min(1),
    cacheMode: z.string().min(1),
    timingBudget: budgetSchema,
    memorySampling: memorySamplingSchema,
    releaseBoundary: z.string().min(1),
    nextReviewTrigger: z.array(z.string().min(1)).min(1),
}).strict();

const riskControlsSchema = z.object({
    budgetValueAuthority: z.string().min(1),
    minimumRepeatRunsBeforeBudgetChange: z.number().int().min(2),
    repeatCommandPattern: z.string().min(1),
    memoryThresholdPolicy: z.object({
        status: z.enum([
            "trend-only",
            "hard-limit-active",
        ]),
        hardLimitsActive: z.boolean(),
        promotionCriteria: z.array(z.string().min(1)).min(1),
    }).strict(),
    unresolvedQuestions: z.array(z.string()),
}).strict();

const performanceMemoryAuditMatrixSchema = z.object({
    version: z.literal(1),
    authority: z.object({
        sourceOfTruth: z.literal("tracked-performance-memory-audit-matrix"),
        generatedArtifact: z.literal(false),
        boundary: z.array(z.string().min(1)).min(1),
    }).strict(),
    riskControls: riskControlsSchema,
    lanes: z.array(auditLaneSchema).min(1),
}).strict();

function buildDefaultPerformanceMemoryAuditMatrixPath() {
    return path.resolve(__dirname, "../../templates/performance_memory_audit_matrix.json");
}

function loadPerformanceMemoryAuditMatrix(matrixPath = buildDefaultPerformanceMemoryAuditMatrixPath()) {
    const resolvedPath = path.resolve(matrixPath);
    const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
    const parsed = performanceMemoryAuditMatrixSchema.parse(raw);

    return {
        ...parsed,
        matrixPath: resolvedPath,
    };
}

module.exports = {
    auditLaneSchema,
    buildDefaultPerformanceMemoryAuditMatrixPath,
    loadPerformanceMemoryAuditMatrix,
    performanceMemoryAuditMatrixSchema,
    riskControlsSchema,
};
