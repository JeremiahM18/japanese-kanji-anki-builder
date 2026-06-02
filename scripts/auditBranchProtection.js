#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const POLICY_PATH = path.join(".github", "branch-protection.main.json");
const CHECK_WORKFLOW_PATHS = Object.freeze([
    path.join(".github", "workflows", "ci.yml"),
    path.join(".github", "workflows", "codeql.yml"),
]);

const DOC_SETTING_PHRASES = Object.freeze({
    requirePullRequestBeforeMerging: "require a pull request before merging",
    requiredApprovingReviewCount: "require at least 1 approval",
    requireCodeOwnerReviews: "require review from code owners",
    dismissStaleApprovals: "dismiss stale approvals when new commits are pushed",
    requireConversationResolution: "require conversation resolution before merge",
    requireStatusChecksBeforeMerging: "require status checks before merging",
    requireBranchesUpToDateBeforeMerging: "require branches to be up to date before merging",
    requireLinearHistory: "require linear history",
    doNotAllowBypassing: "do not allow bypassing required protections",
    allowForcePushes: "block force pushes",
    allowDeletions: "block branch deletion",
});

function readText(cwd, relativePath) {
    return fs.readFileSync(path.join(cwd, relativePath), "utf-8");
}

function readJson(cwd, relativePath) {
    return JSON.parse(readText(cwd, relativePath));
}

function stripYamlValue(value) {
    return String(value).trim().replace(/^["']|["']$/gu, "");
}

function cartesianProduct(entries) {
    return entries.reduce((products, [key, values]) => {
        const next = [];
        for (const product of products) {
            for (const value of values) {
                next.push({ ...product, [key]: value });
            }
        }
        return next;
    }, [{}]);
}

function extractMatrixValues(block) {
    const lines = block.split(/\r?\n/u);
    const matrix = {};
    let matrixIndent = null;
    let currentKey = null;
    let keyIndent = null;

    for (const line of lines) {
        const matrixMatch = line.match(/^(\s*)matrix:\s*$/u);
        if (matrixMatch) {
            matrixIndent = matrixMatch[1].length;
            currentKey = null;
            keyIndent = null;
            continue;
        }

        if (matrixIndent === null) {
            continue;
        }

        const indent = line.match(/^(\s*)/u)?.[1].length || 0;
        if (line.trim() && indent <= matrixIndent) {
            matrixIndent = null;
            currentKey = null;
            keyIndent = null;
            continue;
        }

        const keyMatch = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*$/u);
        if (keyMatch && keyMatch[1].length === matrixIndent + 2) {
            currentKey = keyMatch[2];
            keyIndent = keyMatch[1].length;
            matrix[currentKey] = [];
            continue;
        }

        const valueMatch = line.match(/^(\s*)-\s*(.+?)\s*$/u);
        if (currentKey && valueMatch && valueMatch[1].length === keyIndent + 2) {
            matrix[currentKey].push(stripYamlValue(valueMatch[2]));
            continue;
        }
    }

    return Object.fromEntries(Object.entries(matrix).filter(([, values]) => values.length > 0));
}

function expandJobName(rawName, matrix) {
    const matrixEntries = Object.entries(matrix);
    if (matrixEntries.length === 0) {
        return [rawName];
    }

    return cartesianProduct(matrixEntries).map((values) => rawName.replace(/\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/gu, (match, key) => {
        if (!Object.hasOwn(values, key)) {
            return match;
        }
        return values[key];
    }));
}

function extractWorkflowJobBlocks(workflowText) {
    const lines = workflowText.split(/\r?\n/u);
    const blocks = [];
    let inJobs = false;
    let current = null;

    for (const line of lines) {
        if (!inJobs) {
            inJobs = /^jobs:\s*$/u.test(line);
            continue;
        }

        if (/^\S/u.test(line) && !/^jobs:\s*$/u.test(line)) {
            break;
        }

        const jobMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/u);
        if (jobMatch) {
            if (current) {
                blocks.push(current);
            }
            current = { id: jobMatch[1], lines: [line] };
            continue;
        }

        if (current) {
            current.lines.push(line);
        }
    }

    if (current) {
        blocks.push(current);
    }

    return blocks;
}

function extractCiCheckNames(workflowText) {
    const names = [];
    for (const block of extractWorkflowJobBlocks(workflowText)) {
        const blockText = block.lines.join("\n");
        const nameMatch = blockText.match(/^\s{4}name:\s*(.+?)\s*$/mu);
        if (!nameMatch) {
            continue;
        }
        names.push(...expandJobName(stripYamlValue(nameMatch[1]), extractMatrixValues(blockText)));
    }
    return names;
}

function extractRequiredStatusChecksFromDoc(docText) {
    const start = docText.indexOf("## Required status checks");
    if (start === -1) {
        return [];
    }
    const body = docText.slice(start);
    const nextHeading = body.slice("## Required status checks".length).search(/\n## /u);
    const section = nextHeading === -1
        ? body
        : body.slice(0, "## Required status checks".length + nextHeading);
    return [...section.matchAll(/^- `([^`]+)`/gmu)].map((match) => match[1]);
}

function assertCondition(condition, errors, message) {
    if (!condition) {
        errors.push(message);
    }
}

function assertUnique(values, errors, label) {
    const seen = new Set();
    for (const value of values) {
        assertCondition(!seen.has(value), errors, `${label} contains duplicate value: ${value}`);
        seen.add(value);
    }
}

function buildBranchProtectionAuditReport({ cwd = process.cwd() } = {}) {
    const errors = [];
    const policy = readJson(cwd, POLICY_PATH);
    const branchDoc = readText(cwd, path.join("docs", "branch-protection.md"));
    const workflowTexts = CHECK_WORKFLOW_PATHS.map((workflowPath) => readText(cwd, workflowPath));
    const packageJson = readJson(cwd, "package.json");
    const requiredStatusChecks = policy.requiredStatusChecks || [];
    const documentedStatusChecks = extractRequiredStatusChecksFromDoc(branchDoc);
    const ciCheckNames = workflowTexts.flatMap((workflowText) => extractCiCheckNames(workflowText));

    assertCondition(policy.branch === "main", errors, `${POLICY_PATH} must target main.`);
    assertCondition(
        packageJson.scripts?.["security:branch-protection"] === "node scripts/auditBranchProtection.js",
        errors,
        "package.json must expose npm run security:branch-protection."
    );

    assertUnique(requiredStatusChecks, errors, `${POLICY_PATH} requiredStatusChecks`);
    assertUnique(documentedStatusChecks, errors, "docs/branch-protection.md required status checks");
    assertUnique(ciCheckNames, errors, ".github/workflows required-check job names");

    for (const [settingName, phrase] of Object.entries(DOC_SETTING_PHRASES)) {
        const expectedValue = policy.requiredSettings?.[settingName];
        assertCondition(expectedValue !== undefined, errors, `${POLICY_PATH} missing required setting ${settingName}.`);
        if (expectedValue === true || expectedValue === 1 || expectedValue === false) {
            assertCondition(branchDoc.includes(phrase), errors, `docs/branch-protection.md must document setting: ${phrase}`);
        }
    }

    for (const check of requiredStatusChecks) {
        assertCondition(
            documentedStatusChecks.includes(check),
            errors,
            `docs/branch-protection.md missing required status check from policy: ${check}`
        );
        assertCondition(
            ciCheckNames.includes(check),
            errors,
            `.github/workflows does not define required status check job: ${check}`
        );
    }

    for (const check of documentedStatusChecks) {
        assertCondition(
            requiredStatusChecks.includes(check),
            errors,
            `docs/branch-protection.md lists a status check absent from ${POLICY_PATH}: ${check}`
        );
    }

    return {
        ok: errors.length === 0,
        errors,
        branch: policy.branch,
        requiredSettings: policy.requiredSettings || {},
        requiredStatusChecks,
        documentedStatusChecks,
        ciCheckNames,
    };
}

function formatBranchProtectionAuditReport(report) {
    const lines = [
        "Branch protection audit",
        `Status: ${report.ok ? "pass" : "fail"}`,
        `Branch: ${report.branch}`,
        `Required status checks: ${report.requiredStatusChecks.length}`,
        "Policy checks:",
    ];

    for (const check of report.requiredStatusChecks) {
        lines.push(`- ${check}`);
    }

    if (report.errors.length > 0) {
        lines.push("Errors:");
        for (const error of report.errors) {
            lines.push(`- ${error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

if (require.main === module) {
    const report = buildBranchProtectionAuditReport();
    const text = formatBranchProtectionAuditReport(report);
    if (report.ok) {
        process.stdout.write(text);
    } else {
        process.stderr.write(text);
        process.exitCode = 1;
    }
}

module.exports = {
    buildBranchProtectionAuditReport,
    extractCiCheckNames,
    extractRequiredStatusChecksFromDoc,
    formatBranchProtectionAuditReport,
};
