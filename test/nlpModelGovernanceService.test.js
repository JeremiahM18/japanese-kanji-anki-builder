const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildNlpModelGovernanceReport,
    formatNlpModelGovernanceReport,
} = require("../src/services/nlpModelGovernanceService");

test("buildNlpModelGovernanceReport keeps model outputs out of certification authority", () => {
    const report = buildNlpModelGovernanceReport({
        manifestPath: "fixture.json",
        loadManifestFn: () => ({
            manifestPath: "fixture.json",
            policy: {
                authority: "assistive_only",
                promotionPolicy: "human_review_required",
            },
            runtimes: {
                runtimeA: {
                    status: "registered",
                    runtimeType: "javascript",
                    allowedTasks: ["embedding"],
                },
            },
            models: {},
        }),
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.runtimes, 1);
    assert.equal(report.counts.activeModels, 0);
    assert.equal(report.releaseBoundary.modelOutputsAreCertificationEvidence, false);
    assert.equal(report.releaseBoundary.modelOutputsMayWriteTrackedTemplatesDirectly, false);
    assert.equal(report.releaseBoundary.promotionRequiresHumanReview, true);
});

test("formatNlpModelGovernanceReport renders a release boundary summary", () => {
    const text = formatNlpModelGovernanceReport({
        passed: true,
        manifestPath: "templates/nlp_model_manifest.json",
        policy: {
            authority: "assistive_only",
            promotionPolicy: "human_review_required",
        },
        counts: {
            runtimes: 1,
            models: 0,
            activeModels: 0,
            runtimesByStatus: { registered: 1 },
            modelsByStatus: {},
        },
        releaseBoundary: {
            modelOutputsAreCertificationEvidence: false,
            modelOutputsMayWriteTrackedTemplatesDirectly: false,
            promotionRequiresHumanReview: true,
        },
        runtimes: [{
            id: "runtimeA",
            status: "registered",
            runtimeType: "javascript",
            allowedTasks: ["embedding"],
        }],
        models: [],
    });

    assert.match(text, /NLP Model Governance Audit/);
    assert.match(text, /model outputs certify cards: no/);
    assert.match(text, /human promotion required: yes/);
});
