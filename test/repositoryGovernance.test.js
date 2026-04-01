const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

test("CODEOWNERS covers critical repository governance paths", () => {
    const codeowners = readRepoFile(path.join(".github", "CODEOWNERS"));
    const requiredEntries = [
        "* @cover",
        "/.github/workflows/ @cover",
        "/src/services/ @cover",
        "/scripts/ @cover",
        "/test/ @cover",
        "/README.md @cover",
        "/CONTRIBUTING.md @cover",
        "/package.json @cover",
    ];

    for (const entry of requiredEntries) {
        assert.equal(codeowners.includes(entry), true, `Missing CODEOWNERS entry: ${entry}`);
    }
});

test("branch protection baseline names the required GitHub checks", () => {
    const branchProtection = readRepoFile(path.join("docs", "branch-protection.md"));
    const requiredChecks = [
        "Verify Ubuntu Node 20",
        "Verify Ubuntu Node 22",
        "Smoke ubuntu-latest Node 22",
        "Smoke windows-latest Node 22",
        "Smoke macos-latest Node 22",
        "Release Gate Ubuntu Node 22",
    ];

    for (const check of requiredChecks) {
        assert.equal(branchProtection.includes(`- \`${check}\``), true, `Missing required check in branch protection doc: ${check}`);
    }

    assert.equal(branchProtection.includes("require review from code owners"), true);
    assert.equal(branchProtection.includes("require conversation resolution before merge"), true);
});

test("pull request template calls out release-gate and code-owner expectations", () => {
    const template = readRepoFile(path.join(".github", "PULL_REQUEST_TEMPLATE", "pull_request_template.md"));

    assert.equal(template.includes("`release:gate` run when packaging, CI, or toolchain behavior changed"), true);
    assert.equal(template.includes("CODEOWNERS review requested when touching protected paths"), true);
});
