const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

test("changelog keeps unreleased section and current package version entry", () => {
    const packageJson = JSON.parse(readRepoFile("package.json"));
    const changelog = readRepoFile("CHANGELOG.md");

    assert.equal(changelog.includes("## [Unreleased]"), true);
    assert.equal(changelog.includes(`## [${packageJson.version}] - `), true, `Missing changelog entry for package version ${packageJson.version}`);
});

test("release workflow is tag-driven and publishes release artifacts", () => {
    const workflow = readRepoFile(path.join(".github", "workflows", "release.yml"));

    assert.equal(workflow.includes("tags:"), true);
    assert.equal(workflow.includes('- "v*"'), true);
    assert.equal(workflow.includes("Release Verify Ubuntu Node 22"), true);
    assert.equal(workflow.includes("Release Bundle Ubuntu Node 22"), true);
    assert.equal(workflow.includes("release-artifacts.sha256"), true);
    assert.equal(workflow.includes("docs/release-process.md"), true);
});

test("release process doc aligns tag naming with package version", () => {
    const releaseProcess = readRepoFile(path.join("docs", "release-process.md"));

    assert.equal(releaseProcess.includes("Update `package.json` version intentionally."), true);
    assert.equal(releaseProcess.includes("Create Git tags as `v<package.json version>`"), true);
    assert.equal(releaseProcess.includes("CHANGELOG.md"), true);
});
