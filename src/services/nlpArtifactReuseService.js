const fs = require("node:fs");
const path = require("node:path");

function toArtifactInputHash(entry, workspaceRoot) {
    return {
        path: path.relative(workspaceRoot, entry.path).replace(/\\/g, "/"),
        sha256: entry.sha256,
        byteSize: entry.byteSize,
    };
}

function buildArtifactInputHashes(entries, workspaceRoot) {
    return entries.map((entry) => toArtifactInputHash(entry, workspaceRoot));
}

function inputHashesMatch(actual = [], expected = []) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
        return false;
    }
    return expected.every((expectedEntry, index) => {
        const actualEntry = actual[index];
        return actualEntry
            && actualEntry.path === expectedEntry.path
            && actualEntry.sha256 === expectedEntry.sha256
            && actualEntry.byteSize === expectedEntry.byteSize;
    });
}

function parametersMatch(actual = {}, expected = {}) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (actualKeys.length !== expectedKeys.length) {
        return false;
    }
    return expectedKeys.every((key, index) => actualKeys[index] === key && Object.is(actual[key], expected[key]));
}

function modelEvidenceMatches(modelEvidence, model, modelId) {
    return Boolean(modelEvidence)
        && modelEvidence.modelId === modelId
        && modelEvidence.runtimeId === model.runtimeId
        && modelEvidence.modelFamily === model.modelFamily
        && modelEvidence.modelVersion === model.modelVersion
        && modelEvidence.embeddingDimension === model.embeddingConfig.embeddingDimension
        && modelEvidence.pooling === model.embeddingConfig.pooling
        && modelEvidence.normalized === model.embeddingConfig.normalized
        && modelEvidence.distanceMetric === model.embeddingConfig.distanceMetric
        && modelEvidence.inputPolicy?.maxInputCharacters === model.inputPolicy?.maxInputCharacters
        && modelEvidence.inputPolicy?.maxInputTokens === model.inputPolicy?.maxInputTokens
        && modelEvidence.inputPolicy?.overflowPolicy === model.inputPolicy?.overflowPolicy
        && modelEvidence.deterministic?.requiresPinnedModel === true
        && modelEvidence.deterministic?.requiresPinnedRuntime === true
        && modelEvidence.deterministic?.requiresPinnedInputs === true;
}

function tryReadReusableArtifact(outPath, parseArtifact) {
    if (!fs.existsSync(outPath)) {
        return null;
    }
    try {
        return parseArtifact(JSON.parse(fs.readFileSync(outPath, "utf8")));
    } catch {
        return null;
    }
}

function buildReuseResult({ outPath, artifact }) {
    return {
        outPath,
        artifact,
        skipped: true,
        skipReason: "unchanged-inputs",
    };
}

module.exports = {
    buildArtifactInputHashes,
    buildReuseResult,
    inputHashesMatch,
    modelEvidenceMatches,
    parametersMatch,
    tryReadReusableArtifact,
};
