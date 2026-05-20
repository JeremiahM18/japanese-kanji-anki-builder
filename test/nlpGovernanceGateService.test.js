const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildNlpGovernanceGateReport,
    captureGateCheck,
    formatNlpGovernanceGateReport,
} = require("../src/services/nlpGovernanceGateService");

function passingReport() {
    return {
        passed: true,
        errors: [],
    };
}

test("captureGateCheck converts thrown checks into failing gate entries", () => {
    const check = captureGateCheck({
        id: "fixture",
        label: "Fixture",
        buildReportFn: () => {
            throw new Error("boom");
        },
    });

    assert.equal(check.passed, false);
    assert.deepEqual(check.errors, ["boom"]);
    assert.equal(check.report, null);
});

test("buildNlpGovernanceGateReport passes only when every NLP check passes", () => {
    const report = buildNlpGovernanceGateReport({
        buildModelReportFn: passingReport,
        buildSuggestionReportFn: passingReport,
        buildReviewPacketReportFn: passingReport,
        buildDraftProposalReportFn: passingReport,
        buildTokenizationReportFn: passingReport,
        buildTokenizationAuditReportFn: passingReport,
        buildEmbeddingReportFn: passingReport,
        buildRuntimeReportFn: passingReport,
    });

    assert.equal(report.passed, true);
    assert.equal(report.checks.length, 8);
    assert.equal(report.releaseBoundary.nlpGateCertifiesCards, false);
    assert.equal(report.releaseBoundary.nlpGateWritesTrackedTemplates, false);
    assert.equal(report.releaseBoundary.nlpGateClaimsReleaseReadiness, false);
});

test("buildNlpGovernanceGateReport fails closed on any NLP check error", () => {
    const report = buildNlpGovernanceGateReport({
        buildModelReportFn: passingReport,
        buildSuggestionReportFn: () => ({
            passed: false,
            errors: ["suggestion artifact invalid"],
        }),
        buildReviewPacketReportFn: passingReport,
        buildDraftProposalReportFn: passingReport,
        buildTokenizationReportFn: passingReport,
        buildTokenizationAuditReportFn: passingReport,
        buildEmbeddingReportFn: passingReport,
        buildRuntimeReportFn: passingReport,
    });

    assert.equal(report.passed, false);
    assert.match(report.errors.join("\n"), /suggestion-artifacts: suggestion artifact invalid/);
});

test("formatNlpGovernanceGateReport renders checks and release boundaries", () => {
    const text = formatNlpGovernanceGateReport({
        passed: false,
        checks: [
            {
                label: "NLP model manifest",
                passed: true,
                errors: [],
            },
            {
                label: "NLP suggestion artifacts",
                passed: false,
                errors: ["bad artifact"],
            },
            {
                label: "NLP tokenization artifacts",
                passed: true,
                errors: [],
            },
            {
                label: "NLP review packets",
                passed: true,
                errors: [],
            },
            {
                label: "NLP draft proposals",
                passed: true,
                errors: [],
            },
            {
                label: "NLP tokenization audit signals",
                passed: true,
                errors: [],
            },
            {
                label: "NLP embedding artifacts",
                passed: true,
                errors: [],
            },
        ],
        errors: ["suggestion-artifacts: bad artifact"],
        releaseBoundary: {
            nlpGateCertifiesCards: false,
            nlpGateWritesTrackedTemplates: false,
            nlpGateClaimsReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    });

    assert.match(text, /NLP Governance Gate/);
    assert.match(text, /NLP suggestion artifacts: failing/);
    assert.match(text, /NLP gate certifies cards: no/);
    assert.match(text, /human promotion required: yes/);
});
